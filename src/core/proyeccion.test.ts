import { describe, it, expect } from 'vitest';
import { proyectarMesCorriente, fraccionMes, diasDelMes } from './proyeccion';

const dia = (d: number) => new Date(2026, 9, d); // octubre 2026 (31 días)

describe('proyectarMesCorriente', () => {
  const cerrados = [100, 200, 300]; // tendencia = 200

  it('sin meses cerrados no proyecta', () => {
    expect(proyectarMesCorriente([], 50, dia(10))).toBeNull();
  });

  it('inicio de mes (sin facturación aún) se apoya en la tendencia, no cae a 0', () => {
    const p = proyectarMesCorriente(cerrados, 0, dia(1))!;
    expect(p.tendencia).toBe(200);
    expect(p.proyectado).toBeGreaterThan(190);
    expect(p.proyectado).toBeLessThanOrEqual(200);
  });

  it('a mitad de mes suma lo facturado más lo que falta a ritmo de tendencia', () => {
    const p = proyectarMesCorriente(cerrados, 80, dia(16))!; // 15/31 transcurrido
    expect(p.fraccion).toBeCloseTo(15 / 31, 6);
    expect(p.proyectado).toBeCloseTo(80 + (1 - 15 / 31) * 200, 6);
  });

  it('el último día converge al acumulado + (poco)', () => {
    const p = proyectarMesCorriente(cerrados, 190, dia(31))!;
    expect(p.fraccion).toBe(30 / 31);
    expect(p.proyectado).toBeCloseTo(190 + 200 / 31, 6);
  });

  it('nunca proyecta menos que lo ya facturado', () => {
    expect(proyectarMesCorriente([0, 0, 0], 500, dia(5))!.proyectado).toBe(500);
    expect(proyectarMesCorriente(cerrados, 999, dia(5))!.proyectado).toBeGreaterThanOrEqual(999);
  });

  it('con menos de 3 meses cerrados usa los que haya', () => {
    expect(proyectarMesCorriente([120], 0, dia(1))!.tendencia).toBe(120);
  });

  it('solo toma los últimos 3 meses cerrados como tendencia', () => {
    expect(proyectarMesCorriente([1000, 100, 200, 300], 0, dia(10))!.tendencia).toBe(200);
  });
});

describe('fraccionMes / diasDelMes', () => {
  it('día 1 cuenta como 1 día transcurrido (mínimo)', () => {
    expect(fraccionMes(dia(1))).toBeCloseTo(1 / 31, 6);
    expect(fraccionMes(dia(2))).toBeCloseTo(1 / 31, 6);
  });
  it('febrero bisiesto y no bisiesto', () => {
    expect(diasDelMes(new Date(2024, 1, 10))).toBe(29);
    expect(diasDelMes(new Date(2026, 1, 10))).toBe(28);
  });
});
