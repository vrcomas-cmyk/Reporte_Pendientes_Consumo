import { describe, it, expect } from 'vitest';
import { promedioAcotado } from './promedioAcotado';

describe('promedioAcotado', () => {
  it('un pico enorme se limita al tope y baja el promedio', () => {
    // 11 meses de ~100 y uno de 1000
    const v = [100, 110, 90, 105, 95, 100, 98, 102, 99, 101, 100, 1000];
    const r = promedioAcotado(v);
    expect(r.normal).toBeCloseTo(v.reduce((s, x) => s + x, 0) / 12, 6);
    expect(r.acotados).toBe(1); // solo el 1000: el 110 es variación normal y NO se recorta con Q3 + 3 × IQR
    expect(r.tope).not.toBeNull();
    expect(r.promedio).toBeLessThan(r.normal);
    expect(r.promedio).toBeLessThan(150);
  });
  it('sin picos el promedio acotado es igual al normal', () => {
    const v = [100, 102, 98, 101, 99, 100];
    const r = promedioAcotado(v);
    expect(r.acotados).toBe(0);
    expect(r.tope).toBeNull();
    expect(r.promedio).toBeCloseTo(r.normal, 9);
  });
  it('los meses en 0 cuentan en el promedio pero no fijan el tope', () => {
    const v = [0, 0, 0, 0, 100, 100, 100, 100];
    const r = promedioAcotado(v);
    expect(r.normal).toBe(50);
    expect(r.promedio).toBe(50);
  });
  it('con menos de 4 meses con venta no acota nada', () => {
    const r = promedioAcotado([0, 0, 0, 500, 10, 10]);
    expect(r.acotados).toBe(0);
    expect(r.promedio).toBe(r.normal);
  });
  it('lista vacía', () => {
    expect(promedioAcotado([])).toEqual({ promedio: 0, normal: 0, tope: null, acotados: 0 });
  });
});
