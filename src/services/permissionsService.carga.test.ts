import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simula la cadena de supabase-js que usa la carga de permisos. `falla` = el servidor no responde; `cuelga` = nunca contesta.
const estado = {
  falla: false,
  cuelga: false,
  codigoError: undefined as string | undefined,
  rol: { id: 'r1', name: 'Ventas', is_admin: false },
  filas: [{ subject_type: 'role', subject_id: 'r1', module_key: 'inventario', scope: 'module', item_key: '', allowed: true }],
};
const respuesta = <T,>(data: T) => (estado.cuelga ? new Promise<never>(() => {}) : Promise.resolve(estado.falla ? { data: null, error: { message: estado.codigoError ? 'JWT expired' : 'timeout', ...(estado.codigoError ? { code: estado.codigoError } : {}) } } : { data, error: null }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        or: () => respuesta(estado.filas),
        maybeSingle: () => respuesta({ role_id: estado.rol.id, degasa_roles: estado.rol, zonas_manual: null, datos_override: null }),
      };
      return b;
    },
  },
}));

import { borrarCachePermisos, guardarCachePermisos, leerCachePermisos, loadEffectivePermissions } from './permissionsService';
import { computeEffectivePermissions } from '@/core/permissions';

const SIN_ESPERA = { esperas: [] as number[], frescoMs: 0 };

beforeEach(() => {
  estado.falla = false; estado.cuelga = false; estado.codigoError = undefined;
  estado.rol = { id: 'r1', name: 'Ventas', is_admin: false };
  localStorage.clear();
});

describe('loadEffectivePermissions · resiliencia', () => {
  it('lectura buena: origen servidor y deja copia', async () => {
    const r = await loadEffectivePermissions('a@x.com', SIN_ESPERA);
    expect(r.origen).toBe('servidor');
    expect(r.perms.allowedModules?.has('inventario')).toBe(true);
    expect(leerCachePermisos('a@x.com')?.allowedModules?.has('inventario')).toBe(true);
  });

  it('el servidor falla y hay copia del mismo usuario: entra con la copia (modo degradado)', async () => {
    await loadEffectivePermissions('a@x.com', SIN_ESPERA);
    estado.falla = true;
    const r = await loadEffectivePermissions('A@x.com', SIN_ESPERA);
    expect(r.origen).toBe('cache');
    expect(r.perms.allowedModules?.has('inventario')).toBe(true);
  });

  it('el servidor falla y NO hay copia: error, sin ningún módulo (fail-closed, no se concede admin)', async () => {
    estado.falla = true;
    const r = await loadEffectivePermissions('a@x.com', SIN_ESPERA);
    expect(r.origen).toBe('error');
    expect(r.perms.isAdmin).toBe(false);
    expect(r.perms.allowedModules?.size).toBe(0);
  });

  it('la copia de OTRO usuario no se usa', async () => {
    await loadEffectivePermissions('a@x.com', SIN_ESPERA);
    estado.falla = true;
    expect((await loadEffectivePermissions('b@x.com', SIN_ESPERA)).origen).toBe('error');
  });

  it('una copia con más de 7 días no se usa', async () => {
    guardarCachePermisos('a@x.com', computeEffectivePermissions({ id: 'r1', name: 'V', isAdmin: true }, []));
    const raw = JSON.parse(localStorage.getItem('degasa_perms_cache_v1')!);
    localStorage.setItem('degasa_perms_cache_v1', JSON.stringify({ ...raw, ts: Date.now() - 8 * 24 * 3600 * 1000 }));
    estado.falla = true;
    expect((await loadEffectivePermissions('a@x.com', SIN_ESPERA)).origen).toBe('error');
  });

  it('con copia y el servidor colgado, no hace esperar: usa la copia al vencer el plazo', async () => {
    await loadEffectivePermissions('a@x.com', SIN_ESPERA);
    estado.cuelga = true;
    const r = await loadEffectivePermissions('a@x.com', { plazoMs: 20, frescoMs: 0 });
    expect(r.origen).toBe('cache');
  });

  it('reintenta antes de rendirse: falla la primera lectura y la segunda sale bien', async () => {
    estado.falla = true;
    const p = loadEffectivePermissions('a@x.com', { esperas: [5], frescoMs: 0 });
    setTimeout(() => { estado.falla = false; }, 2);
    expect((await p).origen).toBe('servidor');
  });

  it('borrarCachePermisos elimina la copia', async () => {
    await loadEffectivePermissions('a@x.com', SIN_ESPERA);
    borrarCachePermisos();
    expect(leerCachePermisos('a@x.com')).toBeNull();
  });

  it('el servidor rechaza el token (JWT vencido): origen «sesion», sin reintentos y sin usar la copia local', async () => {
    await loadEffectivePermissions('a@x.com', SIN_ESPERA); // deja copia
    estado.falla = true; estado.codigoError = 'PGRST301';
    const t0 = Date.now();
    const r = await loadEffectivePermissions('a@x.com', { esperas: [5000, 5000], frescoMs: 0 });
    expect(r.origen).toBe('sesion');
    expect(r.perms.allowedModules?.size).toBe(0); // fail-closed: la copia no se concede con un token inválido
    expect(Date.now() - t0).toBeLessThan(1000); // no esperó el backoff
  });

  it('la verificación sin copia tiene un tope TOTAL: con el servidor colgado devuelve error en el plazo, no en minutos', async () => {
    estado.cuelga = true;
    const t0 = Date.now();
    const r = await loadEffectivePermissions('a@x.com', { esperas: [5, 5, 5], plazoMs: 60, frescoMs: 0 });
    expect(r.origen).toBe('error');
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('con una copia reciente (< 5 min) NO consulta al servidor: la usa tal cual', async () => {
    await loadEffectivePermissions('a@x.com', SIN_ESPERA); // la deja guardada
    estado.cuelga = true; // si consultara, se colgaría
    const r = await loadEffectivePermissions('a@x.com');
    expect(r.origen).toBe('reciente');
    expect(r.perms.allowedModules?.has('inventario')).toBe(true);
  });

  it('una copia más vieja que la frescura sí consulta (y renueva la copia)', async () => {
    await loadEffectivePermissions('a@x.com', SIN_ESPERA);
    const raw = JSON.parse(localStorage.getItem('degasa_perms_cache_v1')!);
    localStorage.setItem('degasa_perms_cache_v1', JSON.stringify({ ...raw, ts: Date.now() - 6 * 60_000 }));
    expect((await loadEffectivePermissions('a@x.com', { esperas: [] })).origen).toBe('servidor');
  });
});
