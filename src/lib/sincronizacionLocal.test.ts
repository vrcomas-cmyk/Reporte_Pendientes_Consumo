import { beforeEach, describe, expect, it, vi } from 'vitest';

let usuario: { id: string; email: string } | null = { id: 'u1', email: 'a@x.com' };
vi.mock('@/lib/sesionLocal', () => ({ sesionLocal: async () => usuario }));

import { leerLocalSiReciente } from './sincronizacionLocal';

const TTL = 5 * 60_000;
const contar = (v: number[]) => v.length;
beforeEach(() => { localStorage.clear(); usuario = { id: 'u1', email: 'a@x.com' }; vi.useRealTimers(); });

describe('leerLocalSiReciente', () => {
  it('la primera vez va al servidor y anota la marca; la siguiente (reciente) lee lo local sin red', async () => {
    const red = vi.fn(async () => [1, 2, 3]);
    const local = vi.fn(async () => [1, 2, 3]);
    expect(await leerLocalSiReciente('x', { ttlMs: TTL, local, red, contar })).toEqual([1, 2, 3]);
    expect(local).not.toHaveBeenCalled();
    expect(await leerLocalSiReciente('x', { ttlMs: TTL, local, red, contar })).toEqual([1, 2, 3]);
    expect(red).toHaveBeenCalledTimes(1);
    expect(local).toHaveBeenCalledTimes(1);
  });

  it('pasada la vigencia vuelve al servidor', async () => {
    vi.useFakeTimers();
    const red = vi.fn(async () => [1]);
    const local = vi.fn(async () => [1]);
    await leerLocalSiReciente('x', { ttlMs: TTL, local, red, contar });
    vi.advanceTimersByTime(TTL + 1);
    await leerLocalSiReciente('x', { ttlMs: TTL, local, red, contar });
    expect(red).toHaveBeenCalledTimes(2);
  });

  it('si el espejo local trae otra cantidad que la anotada (p. ej. IndexedDB borrada) va al servidor, no muestra vacío', async () => {
    const red = vi.fn(async () => [1, 2, 3]);
    await leerLocalSiReciente('x', { ttlMs: TTL, local: async () => [1, 2, 3], red, contar });
    expect(await leerLocalSiReciente('x', { ttlMs: TTL, local: async () => [], red, contar })).toEqual([1, 2, 3]);
    expect(red).toHaveBeenCalledTimes(2);
  });

  it('si leer lo local falla, va al servidor', async () => {
    const red = vi.fn(async () => [9]);
    await leerLocalSiReciente('x', { ttlMs: TTL, local: async () => [9], red, contar });
    expect(await leerLocalSiReciente('x', { ttlMs: TTL, local: async () => { throw new Error('idb'); }, red, contar })).toEqual([9]);
    expect(red).toHaveBeenCalledTimes(2);
  });

  it('si el servidor falla no anota la marca (la siguiente vez sí lo intenta de nuevo)', async () => {
    await expect(leerLocalSiReciente('x', { ttlMs: TTL, local: async () => [], red: async () => { throw new Error('504'); }, contar })).rejects.toThrow('504');
    const red = vi.fn(async () => [1]);
    await leerLocalSiReciente('x', { ttlMs: TTL, local: async () => [1], red, contar });
    expect(red).toHaveBeenCalledTimes(1);
  });

  it('la marca es por usuario y por clave', async () => {
    const red = vi.fn(async () => [1]);
    await leerLocalSiReciente('x', { ttlMs: TTL, local: async () => [1], red, contar });
    usuario = { id: 'u2', email: 'b@x.com' };
    await leerLocalSiReciente('x', { ttlMs: TTL, local: async () => [1], red, contar });
    await leerLocalSiReciente('y', { ttlMs: TTL, local: async () => [1], red, contar });
    expect(red).toHaveBeenCalledTimes(3);
  });

  it('la clave de la marca contiene «sync» para que el cierre de sesión la borre', async () => {
    await leerLocalSiReciente('x', { ttlMs: TTL, local: async () => [], red: async () => [], contar });
    expect(Object.keys(localStorage).every((k) => /sync/i.test(k))).toBe(true);
  });
});
