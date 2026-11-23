import { describe, expect, it, vi } from 'vitest';
import { CacheUsuarios, expDeJwt, motivoDeErrorAuth, validarSesion } from '../../supabase/functions/datos/usuarioCache';
import * as copiaEnvios from '../../supabase/functions/envios/usuarioCache';
import * as copiaDatos from '../../supabase/functions/datos/usuarioCache';

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (exp?: number) => `${b64({ alg: 'HS256' })}.${b64(exp === undefined ? {} : { exp })}.firma`;

describe('expDeJwt', () => {
  it('lee el exp (segundos) y devuelve null si no se puede', () => {
    expect(expDeJwt(jwt(1_800_000_000))).toBe(1_800_000_000);
    expect(expDeJwt(jwt())).toBeNull();
    expect(expDeJwt('basura')).toBeNull();
    expect(expDeJwt('a.%%%.c')).toBeNull();
  });
});

describe('motivoDeErrorAuth', () => {
  it('4xx = token inválido; sin respuesta, 429 y 5xx = Auth no disponible', () => {
    expect(motivoDeErrorAuth({ status: 401 })).toBe('invalido');
    expect(motivoDeErrorAuth({ status: 403 })).toBe('invalido');
    expect(motivoDeErrorAuth({ status: 400 })).toBe('invalido');
    expect(motivoDeErrorAuth({ status: 429 })).toBe('no-disponible');
    expect(motivoDeErrorAuth({ status: 500 })).toBe('no-disponible');
    expect(motivoDeErrorAuth({ status: 504 })).toBe('no-disponible');
    expect(motivoDeErrorAuth({ status: 0 })).toBe('no-disponible');
    expect(motivoDeErrorAuth({})).toBe('no-disponible');
    expect(motivoDeErrorAuth(null)).toBe('no-disponible');
  });
});

describe('CacheUsuarios', () => {
  it('recuerda el token hasta el TTL y luego lo olvida', () => {
    let t = 1_000;
    const c = new CacheUsuarios(60_000, 10, () => t);
    c.set('tok', 'a@x.com', null);
    expect(c.get('tok')).toBe('a@x.com');
    t += 59_999;
    expect(c.get('tok')).toBe('a@x.com');
    t += 2;
    expect(c.get('tok')).toBeNull();
  });

  it('nunca recuerda más allá del exp del token, y un token ya vencido no se guarda', () => {
    let t = 1_000_000;
    const c = new CacheUsuarios(60_000, 10, () => t);
    c.set('corto', 'a@x.com', (t + 5_000) / 1000);
    t += 5_001;
    expect(c.get('corto')).toBeNull();
    c.set('vencido', 'a@x.com', (t - 1) / 1000);
    expect(c.tamano).toBe(0);
  });

  it('respeta el tope de entradas', () => {
    const c = new CacheUsuarios(60_000, 3, () => 1);
    for (const k of ['a', 'b', 'c', 'd']) c.set(k, `${k}@x.com`, null);
    expect(c.tamano).toBe(3);
    expect(c.get('a')).toBeNull();
    expect(c.get('d')).toBe('d@x.com');
  });
});

describe('validarSesion', () => {
  const ok = (email: string) => vi.fn(async () => ({ email, error: null }));

  it('un acierto de caché no vuelve a llamar a Auth (el punto: decenas de peticiones = 1 llamada)', async () => {
    const cache = new CacheUsuarios();
    const auth = ok('A@X.com');
    const t = jwt(Math.floor(Date.now() / 1000) + 3600);
    const r1 = await validarSesion(t, cache, auth);
    const r2 = await validarSesion(t, cache, auth);
    expect(r1).toEqual({ ok: true, email: 'a@x.com' });
    expect(r2).toEqual({ ok: true, email: 'a@x.com' });
    expect(auth).toHaveBeenCalledTimes(1);
  });

  it('token inválido (4xx) → invalido, y no se recuerda', async () => {
    const cache = new CacheUsuarios();
    const auth = vi.fn(async () => ({ email: null, error: { status: 401 } }));
    expect(await validarSesion('t', cache, auth)).toEqual({ ok: false, motivo: 'invalido' });
    expect(cache.tamano).toBe(0);
  });

  it('Auth caído (5xx, 521 sin status, o excepción de red) → no-disponible, y no se recuerda', async () => {
    const cache = new CacheUsuarios();
    expect(await validarSesion('t', cache, async () => ({ email: null, error: { status: 504 } }))).toEqual({ ok: false, motivo: 'no-disponible' });
    expect(await validarSesion('t', cache, async () => ({ email: null, error: {} }))).toEqual({ ok: false, motivo: 'no-disponible' });
    expect(await validarSesion('t', cache, async () => { throw new Error('fetch failed'); })).toEqual({ ok: false, motivo: 'no-disponible' });
    expect(cache.tamano).toBe(0);
  });

  it('sin token, o sin correo en la respuesta → invalido (sin llamar a Auth si no hay token)', async () => {
    const cache = new CacheUsuarios();
    const auth = vi.fn(async () => ({ email: null, error: null }));
    expect(await validarSesion('', cache, auth)).toEqual({ ok: false, motivo: 'invalido' });
    expect(auth).not.toHaveBeenCalled();
    expect(await validarSesion('t', cache, auth)).toEqual({ ok: false, motivo: 'invalido' });
  });
});

describe('las dos copias del archivo son idénticas', () => {
  it('datos/usuarioCache.ts y envios/usuarioCache.ts exportan lo mismo (si cambias uno, cambia el otro)', () => {
    expect(Object.keys(copiaEnvios).sort()).toEqual(Object.keys(copiaDatos).sort());
    expect(copiaEnvios.expDeJwt.toString()).toBe(copiaDatos.expDeJwt.toString());
    expect(copiaEnvios.validarSesion.toString()).toBe(copiaDatos.validarSesion.toString());
    expect(copiaEnvios.CacheUsuarios.toString()).toBe(copiaDatos.CacheUsuarios.toString());
  });
});
