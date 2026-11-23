import { describe, it, expect } from 'vitest';
import { crearLimitador, crearLimitadorAdaptativo } from './limitador';

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('crearLimitador', () => {
  it('nunca corre más de `max` tareas a la vez y las termina todas', async () => {
    const limitar = crearLimitador(3);
    let activas = 0;
    let pico = 0;
    const resultados = await Promise.all(Array.from({ length: 10 }, (_, i) => limitar(async () => {
      activas++;
      pico = Math.max(pico, activas);
      await esperar(5);
      activas--;
      return i;
    })));
    expect(pico).toBe(3);
    expect(resultados).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('una tarea que falla libera su lugar y no frena a las demás', async () => {
    const limitar = crearLimitador(1);
    const falla = limitar(async () => { throw new Error('x'); });
    const bien = limitar(async () => 'ok');
    await expect(falla).rejects.toThrow('x');
    await expect(bien).resolves.toBe('ok');
  });

  it('reparte los lugares por turnos entre dos descargas (FIFO)', async () => {
    const limitar = crearLimitador(1);
    const orden: string[] = [];
    const corre = (nombre: string, n: number) => (async () => {
      for (let i = 0; i < n; i++) await limitar(async () => { orden.push(`${nombre}${i}`); await esperar(1); });
    })();
    await Promise.all([corre('A', 3), corre('B', 3)]);
    expect(orden).toEqual(['A0', 'B0', 'A1', 'B1', 'A2', 'B2']);
  });
});


describe('crearLimitadorAdaptativo', () => {
  const tarea = (ok: boolean) => () => (ok ? Promise.resolve('ok') : Promise.reject(new Error('503')));
  const intentar = (p: Promise<unknown>) => p.catch(() => undefined);

  it('arranca en `inicial` y respeta ese tope de tareas simultáneas', async () => {
    const lim = crearLimitadorAdaptativo({ inicial: 2, max: 4, min: 1 });
    let activas = 0, pico = 0;
    const t = () => new Promise<void>((r) => { activas++; pico = Math.max(pico, activas); setTimeout(() => { activas--; r(); }, 5); });
    await Promise.all(Array.from({ length: 8 }, () => lim(t)));
    expect(pico).toBeLessThanOrEqual(2);
  });

  it('un fallo baja el tope a la mitad (con piso en `min`)', async () => {
    const lim = crearLimitadorAdaptativo({ inicial: 6, max: 6, min: 2 });
    await intentar(lim(tarea(false)));
    expect(lim.tope).toBe(3);
    await intentar(lim(tarea(false)));
    expect(lim.tope).toBe(2);
    await intentar(lim(tarea(false)));
    expect(lim.tope).toBe(2);
  });

  it('tras varios éxitos seguidos sube de uno en uno, sin pasar de `max`', async () => {
    const lim = crearLimitadorAdaptativo({ inicial: 2, max: 4, min: 1, exitosParaSubir: 3 });
    for (let i = 0; i < 3; i++) await lim(tarea(true));
    expect(lim.tope).toBe(3);
    for (let i = 0; i < 30; i++) await lim(tarea(true));
    expect(lim.tope).toBe(4);
  });

  it('un fallo reinicia la racha de éxitos', async () => {
    const lim = crearLimitadorAdaptativo({ inicial: 4, max: 6, min: 1, exitosParaSubir: 3 });
    await lim(tarea(true)); await lim(tarea(true));
    await intentar(lim(tarea(false)));
    expect(lim.tope).toBe(2);
    await lim(tarea(true)); await lim(tarea(true));
    expect(lim.tope).toBe(2); // dos éxitos tras el fallo no bastan (hacen falta 3 seguidos)
  });

  it('el resultado y el error de cada tarea llegan a quien la pidió', async () => {
    const lim = crearLimitadorAdaptativo({ inicial: 2, max: 2, min: 1 });
    await expect(lim(async () => 42)).resolves.toBe(42);
    await expect(lim(tarea(false))).rejects.toThrow('503');
  });

  it('un tope mayor al llegar éxitos deja avanzar la cola (no se queda detenida)', async () => {
    const lim = crearLimitadorAdaptativo({ inicial: 1, max: 3, min: 1, exitosParaSubir: 1 });
    const r = await Promise.all(Array.from({ length: 6 }, (_, i) => lim(async () => i)));
    expect(r).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
