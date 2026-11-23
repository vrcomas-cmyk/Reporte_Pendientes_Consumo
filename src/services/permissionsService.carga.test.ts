import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simula la cadena de supabase-js que usa la carga de permisos. `falla` = el servidor no responde; `cuelga` = nunca contesta.
const estado = {
  falla: false,
  cuelga: false,
  rol: { id: 'r1', name: 'Ventas', is_admin: false },
  filas: [{ subject_type: 'role', subject_id: 'r1', module_key: 'inventario', scope: 'module', item_key: '', allowed: true }],
};
const respuesta = <T,>(data: T) => (estado.cuelga ? new Promise<never>(() => {}) : Promise.resolve(estado.falla ? { data: null, error: { message: 'timeout' } } : { data, error: null }));
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

const SIN_ESPERA = { esperas: [] as number[] };

beforeEach(() => {
  estado.falla = false; estado.cuelga = false;
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
    const r = await loadEffectivePermissions('a@x.com', { plazoMs: 20 });
    expect(r.origen).toBe('cache');
  });

  it('reintenta antes de rendirse: falla la primera lectura y la segunda sale bien', async () => {
    estado.falla = true;
    const p = loadEffectivePermissions('a@x.com', { esperas: [5] });
    setTimeout(() => { estado.falla = false; }, 2);
    expect((await p).origen).toBe('servidor');
  });

  it('borrarCachePermisos elimina la copia', async () => {
    await loadEffectivePermissions('a@x.com', SIN_ESPERA);
    borrarCachePermisos();
    expect(leerCachePermisos('a@x.com')).toBeNull();
  });
});
