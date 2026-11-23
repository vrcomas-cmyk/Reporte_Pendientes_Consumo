import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColaLogs, type EntradaLog } from './colaLogs';

const log = (n: number): EntradaLog => ({ at: `t${n}`, level: 'info', event: `e${n}` });
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('ColaLogs', () => {
  it('junta los logs y los envía en UN solo lote al pasar el intervalo', async () => {
    const enviar = vi.fn(async (_lote: EntradaLog[]) => undefined);
    const c = new ColaLogs(enviar, { intervaloMs: 30_000 });
    for (let i = 0; i < 10; i++) c.agregar(log(i));
    expect(enviar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toHaveLength(10);
    expect(c.pendientes).toBe(0);
  });

  it('al juntarse un lote completo envía de inmediato', async () => {
    const enviar = vi.fn(async () => undefined);
    const c = new ColaLogs(enviar, { maxLote: 5 });
    for (let i = 0; i < 5; i++) c.agregar(log(i));
    await vi.advanceTimersByTimeAsync(0);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('si el envío falla conserva los logs y reintenta con espera creciente', async () => {
    const enviar = vi.fn().mockRejectedValueOnce(new Error('504')).mockRejectedValueOnce(new Error('504')).mockResolvedValue(undefined);
    const c = new ColaLogs(enviar, { intervaloMs: 1000 });
    c.agregar(log(1));
    await vi.advanceTimersByTimeAsync(1000);       // 1.er intento (falla)
    expect(c.pendientes).toBe(1);
    await vi.advanceTimersByTimeAsync(1999);       // aún no: la espera creció a 2 s
    expect(enviar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);          // 2.º intento (falla)
    expect(enviar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);       // 3.º (4 s): ya funciona
    expect(enviar).toHaveBeenCalledTimes(3);
    expect(c.pendientes).toBe(0);
  });

  it('el tope de la cola descarta los logs más viejos', () => {
    const c = new ColaLogs(vi.fn(async () => undefined), { maxCola: 3, maxLote: 100 });
    for (let i = 0; i < 6; i++) c.agregar(log(i));
    expect(c.pendientes).toBe(3);
  });

  it('el tope de espera no deja crecer el retraso sin límite', async () => {
    const enviar = vi.fn().mockRejectedValue(new Error('504'));
    const c = new ColaLogs(enviar, { intervaloMs: 1000, maxEsperaMs: 4000 });
    c.agregar(log(1));
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 4000 + 4000);
    expect(enviar.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it('vaciar() manual (al cerrar la pestaña) envía ya lo pendiente y nunca lanza', async () => {
    const enviar = vi.fn().mockRejectedValue(new Error('sin red'));
    const c = new ColaLogs(enviar);
    c.agregar(log(1));
    await expect(c.vaciar()).resolves.toBeUndefined();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(c.pendientes).toBe(1);
  });

  it('un envío en curso no se duplica si se pide vaciar dos veces', async () => {
    let fin!: () => void;
    const enviar = vi.fn(() => new Promise<void>((r) => { fin = r; }));
    const c = new ColaLogs(enviar);
    c.agregar(log(1));
    const a = c.vaciar(); const b = c.vaciar();
    fin(); await Promise.all([a, b]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});
