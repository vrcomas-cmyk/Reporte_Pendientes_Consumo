import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshSession = vi.fn();
const signOut = vi.fn(async (_opciones?: unknown) => ({ error: null }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { refreshSession: (...a: unknown[]) => refreshSession(...a), signOut: (o?: unknown) => signOut(o) } } }));

import { cerrarSesionLocal, esErrorDeSesion, repararSesion } from './sesion';

beforeEach(() => { vi.useFakeTimers(); refreshSession.mockReset(); signOut.mockClear(); localStorage.clear(); });
afterEach(async () => { await vi.advanceTimersByTimeAsync(6000); vi.useRealTimers(); }); // vacía la memoria de 5 s de `repararSesion`

describe('esErrorDeSesion', () => {
  it('reconoce los errores que significan «esta sesión ya no vale»', () => {
    expect(esErrorDeSesion({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(esErrorDeSesion({ code: 'session_not_found', status: 403 })).toBe(true);
    expect(esErrorDeSesion({ name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' })).toBe(true);
    expect(esErrorDeSesion({ status: 401 })).toBe(true);
    expect(esErrorDeSesion({ status: 403 })).toBe(true);
    expect(esErrorDeSesion({ name: 'AuthSessionMissingError', message: 'Auth session missing!' })).toBe(true);
    expect(esErrorDeSesion(new Error('Invalid Refresh Token: Refresh Token Not Found'))).toBe(true);
  });

  it('un corte de red, un timeout o un 5xx NO son un error de sesión (la sesión puede seguir siendo buena)', () => {
    expect(esErrorDeSesion(new DOMException('aborted', 'AbortError'))).toBe(false);
    expect(esErrorDeSesion({ name: 'AuthRetryableFetchError', status: 0 })).toBe(false);
    expect(esErrorDeSesion({ status: 504 })).toBe(false);
    expect(esErrorDeSesion(new TypeError('Failed to fetch'))).toBe(false);
    expect(esErrorDeSesion({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(esErrorDeSesion(null)).toBe(false);
    expect(esErrorDeSesion('x')).toBe(false);
  });
});

describe('cerrarSesionLocal', () => {
  it('cierra solo en este navegador (scope local) y limpia las copias que dependían de la sesión', async () => {
    localStorage.setItem('degasa_allowed_cache_v1', '1'); localStorage.setItem('degasa_perms_cache_v1', '1'); localStorage.setItem('otra', 'x');
    await cerrarSesionLocal();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(localStorage.getItem('degasa_allowed_cache_v1')).toBeNull();
    expect(localStorage.getItem('degasa_perms_cache_v1')).toBeNull();
    expect(localStorage.getItem('otra')).toBe('x');
  });
  it('si signOut falla, igual limpia y no lanza', async () => {
    signOut.mockRejectedValueOnce(new Error('sin red'));
    localStorage.setItem('degasa_perms_cache_v1', '1');
    await expect(cerrarSesionLocal()).resolves.toBeUndefined();
    expect(localStorage.getItem('degasa_perms_cache_v1')).toBeNull();
  });
});

describe('repararSesion', () => {
  it('sesión renovada → ok, sin cerrar nada', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'nuevo' } }, error: null });
    expect(await repararSesion()).toBe('ok');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('el servidor dice que el refresh token ya no existe → cerrada (cierra la sesión local)', async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found', message: 'Invalid Refresh Token' } });
    expect(await repararSesion()).toBe('cerrada');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('timeout o servidor saturado → incierto, NO se cierra la sesión (puede seguir siendo buena)', async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } });
    expect(await repararSesion()).toBe('incierto');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('una excepción de red tampoco cierra la sesión', async () => {
    refreshSession.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    expect(await repararSesion()).toBe('incierto');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('decenas de peticiones fallando a la vez comparten UNA sola renovación', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'n' } }, error: null });
    const r = await Promise.all(Array.from({ length: 30 }, () => repararSesion()));
    expect(r.every((x) => x === 'ok')).toBe(true);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});
