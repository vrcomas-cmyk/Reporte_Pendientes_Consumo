import { beforeEach, describe, expect, it, vi } from 'vitest';

let usuario: { id: string; email: string } | null = { id: 'u1', email: 'a@x.com' };
vi.mock('@/lib/sesionLocal', () => ({ sesionLocal: async () => usuario }));

import { invalidarCache, leerConCache, limpiarCachesSwr, PREFIJO_CACHE } from './cacheSWR';

const TTL = 10_000;
beforeEach(() => { localStorage.clear(); usuario = { id: 'u1', email: 'a@x.com' }; vi.useRealTimers(); });

describe('leerConCache', () => {
  it('la primera vez pide al servidor y guarda; dentro de la vigencia ya no vuelve a pedir', async () => {
    const f = vi.fn(async () => ({ n: 1 }));
    expect(await leerConCache('c', f, { ttlMs: TTL })).toEqual({ n: 1 });
    expect(await leerConCache('c', f, { ttlMs: TTL })).toEqual({ n: 1 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('pasada la vigencia vuelve a pedir y renueva la copia', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValueOnce('viejo').mockResolvedValueOnce('nuevo');
    expect(await leerConCache('c', f, { ttlMs: TTL })).toBe('viejo');
    vi.advanceTimersByTime(TTL + 1);
    expect(await leerConCache('c', f, { ttlMs: TTL })).toBe('nuevo');
    expect(await leerConCache('c', f, { ttlMs: TTL })).toBe('nuevo');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('`forzar` se salta la vigencia', async () => {
    const f = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await leerConCache('c', f, { ttlMs: TTL });
    expect(await leerConCache('c', f, { ttlMs: TTL, forzar: true })).toBe(2);
  });

  it('si el servidor falla devuelve la última copia buena, aunque esté vencida', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValueOnce('bueno').mockRejectedValueOnce(new Error('504'));
    await leerConCache('c', f, { ttlMs: TTL });
    vi.advanceTimersByTime(TTL * 100);
    expect(await leerConCache('c', f, { ttlMs: TTL })).toBe('bueno');
  });

  it('sin copia y con el servidor caído, el error se propaga', async () => {
    await expect(leerConCache('c', async () => { throw new Error('504'); }, { ttlMs: TTL })).rejects.toThrow('504');
  });

  it('lecturas simultáneas de la misma clave comparten UNA sola petición', async () => {
    let resolver!: (v: string) => void;
    const f = vi.fn(() => new Promise<string>((r) => { resolver = r; }));
    const todas = Array.from({ length: 5 }, () => leerConCache('c', f, { ttlMs: TTL }));
    await Promise.resolve(); await Promise.resolve();
    resolver('x');
    expect(await Promise.all(todas)).toEqual(['x', 'x', 'x', 'x', 'x']);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('la copia es por usuario: otro usuario no ve la del anterior', async () => {
    const f = vi.fn().mockResolvedValueOnce('de-u1').mockResolvedValueOnce('de-u2');
    await leerConCache('c', f, { ttlMs: TTL });
    usuario = { id: 'u2', email: 'b@x.com' };
    expect(await leerConCache('c', f, { ttlMs: TTL })).toBe('de-u2');
  });

  it('invalidarCache descarta la copia de esa clave (y solo de esa)', async () => {
    const f = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const g = vi.fn().mockResolvedValue('g');
    await leerConCache('c', f, { ttlMs: TTL }); await leerConCache('otra', g, { ttlMs: TTL });
    await invalidarCache('c');
    expect(await leerConCache('c', f, { ttlMs: TTL })).toBe(2);
    await leerConCache('otra', g, { ttlMs: TTL });
    expect(g).toHaveBeenCalledTimes(1);
  });

  it('limpiarCachesSwr borra todas las copias y respeta lo demás', async () => {
    await leerConCache('c', async () => 1, { ttlMs: TTL });
    localStorage.setItem('otra_clave', 'x');
    limpiarCachesSwr();
    expect(Object.keys(localStorage).filter((k) => k.startsWith(PREFIJO_CACHE))).toHaveLength(0);
    expect(localStorage.getItem('otra_clave')).toBe('x');
  });

  it('sin almacenamiento disponible no rompe: sigue sirviendo del servidor', async () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('lleno'); };
    try { expect(await leerConCache('c', async () => 7, { ttlMs: TTL })).toBe(7); } finally { Storage.prototype.setItem = orig; }
  });
});
