import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/datosProxy', () => ({
  esUrlProxy: (u: string) => u.startsWith('https://proxy.test/'),
  cabecerasProxy: async () => ({ Authorization: 'Bearer t' }),
}));

import { fetchWithTimeout } from './fetchWithTimeout';

const PROXY = 'https://proxy.test/datos/x?a=1';
const OTRA = 'https://apps.script.test/exec';
const ESPERAS = [1, 1];
const resp = (status: number) => new Response('{}', { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchWithTimeout · reintentos al proxy de datos', () => {
  it('reintenta un 503 (Auth no disponible) y devuelve la respuesta buena', async () => {
    fetchMock.mockResolvedValueOnce(resp(503)).mockResolvedValueOnce(resp(503)).mockResolvedValueOnce(resp(200));
    const r = await fetchWithTimeout(PROXY, {}, 1000, ESPERAS);
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('tras agotar los reintentos devuelve el último 503 (el llamador decide qué hacer)', async () => {
    fetchMock.mockResolvedValue(resp(503));
    const r = await fetchWithTimeout(PROXY, {}, 1000, ESPERAS);
    expect(r.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('NO reintenta un 401 ni un 403: son un «no» real', async () => {
    for (const status of [401, 403, 404]) {
      fetchMock.mockClear().mockResolvedValue(resp(status));
      expect((await fetchWithTimeout(PROXY, {}, 1000, ESPERAS)).status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('reintenta un corte de red y luego tiene éxito', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(resp(200));
    expect((await fetchWithTimeout(PROXY, {}, 1000, ESPERAS)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si la red sigue caída, lanza el mensaje de siempre sobre la función `datos`', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchWithTimeout(PROXY, {}, 1000, ESPERAS)).rejects.toThrow(/función de datos de Supabase/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('un POST al proxy no se reintenta', async () => {
    fetchMock.mockResolvedValue(resp(503));
    expect((await fetchWithTimeout(PROXY, { method: 'POST' }, 1000, ESPERAS)).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('las URLs que no son del proxy no se reintentan ni se tocan', async () => {
    fetchMock.mockResolvedValue(resp(503));
    expect((await fetchWithTimeout(OTRA, {}, 1000, ESPERAS)).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchWithTimeout(OTRA, {}, 1000, ESPERAS)).rejects.toThrow(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('el proxy lleva la sesión del usuario', async () => {
    fetchMock.mockResolvedValue(resp(200));
    await fetchWithTimeout(PROXY, { headers: { 'X-Otro': '1' } }, 1000, ESPERAS);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({ 'X-Otro': '1', Authorization: 'Bearer t' });
  });
});
