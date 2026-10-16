import { describe, it, expect } from 'vitest';
import { crearLimitador } from './limitador';

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
