import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRF, mesKey, type Serie } from './resumenFac';
import { buildEnrich } from './enrich';
import { analisisVentas, puenteVentas } from './comercial';
import type { ResumenFacRow } from './types';

const row = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'Uno', destinatario: 'D1', material: 'M1', textoMaterial: 'Mat', mesAno: '08/2026',
  cantidadFacturada: 10, importeFacturado: 100, gpoCte: '', gpoVdor: '', centro: '1001', ...over,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16)); }); // 16-nov-2026: último mes cerrado = octubre
afterEach(() => vi.useRealTimers());

describe('puenteVentas', () => {
  const s = (pares: [string, number, number][]): Serie => pares.map(([mes, cant, imp]) => ({ mes, cant, imp }));
  const R = mesKey('10/2026');

  it('volumen + precio + nuevos + perdidos + otros suman EXACTO actual − base', () => {
    const m = new Map<string, Serie>([
      ['A', s([['06/2026', 100, 1000], ['09/2026', 120, 1500]])], // 10 → 12.5 por pieza, +20 % unidades
      ['B', s([['10/2026', 50, 700]])], // nuevo
      ['C', s([['05/2026', 40, 400]])], // perdido
      ['D', s([['06/2026', -5, -50], ['10/2026', -2, -30]])], // devoluciones en ambas ventanas
    ]);
    const p = puenteVentas(m, () => true, (c) => `Mat ${c}`, R, 'previos');
    expect(p.base).toBe(1000 + 400 - 50);
    expect(p.actual).toBe(1500 + 700 - 30);
    expect(p.volumen + p.precio + p.nuevos + p.perdidos + p.otros).toBeCloseTo(p.actual - p.base, 6);
    expect(p.delta).toBeCloseTo(p.actual - p.base, 6);
    expect(p.volumen).toBeCloseTo(20 * 10, 6); // 20 piezas más × 10 de precio base
    expect(p.precio).toBeCloseTo(1500 - 1000 - 200, 6);
    expect(p.nuevos).toBe(700);
    expect(p.perdidos).toBe(-400);
    expect(p.top[0].code).toBe('B');
  });

  it('base "anio" compara contra los mismos 3 meses del año anterior', () => {
    const m = new Map<string, Serie>([['A', s([['09/2025', 10, 100], ['07/2026', 10, 999], ['09/2026', 10, 150]])]]);
    expect(puenteVentas(m, () => true, () => '', R, 'anio').base).toBe(100);
    expect(puenteVentas(m, () => true, () => '', R, 'previos').base).toBe(999);
  });
});

describe('analisisVentas', () => {
  const enrich = buildEnrich(null);
  const mesesPrevios = ['05/2026', '06/2026', '07/2026'];
  const mesesActuales = ['08/2026', '09/2026', '10/2026'];
  const rows: ResumenFacRow[] = [];
  for (let i = 1; i <= 15; i++) {
    for (const mes of mesesPrevios) rows.push(row({ solicitante: `S${i}`, destinatario: `D${i}`, razonSocial: `Cliente ${i}`, mesAno: mes, importeFacturado: 1000 }));
    for (const mes of mesesActuales) rows.push(row({ solicitante: `S${i}`, destinatario: `D${i}`, razonSocial: `Cliente ${i}`, mesAno: mes, importeFacturado: 100 }));
  }
  const A = analisisVentas(buildRF(rows), [], enrich)!;

  it('el resumen cuenta TODOS los clientes a la baja, no solo el top 12 de la tabla', () => {
    expect(A.caen).toHaveLength(12);
    expect(A.resumen.caen.n).toBe(15);
    expect(A.resumen.caen.delta).toBe(15 * (300 - 3000));
  });

  it('último mes cerrado, trimestre a la fecha (solo meses cerrados) y año a la fecha', () => {
    expect(A.kpi.refLbl).toBe('10/2026');
    // 16-nov: el trimestre en curso (Q4) solo tiene octubre cerrado.
    expect(A.kpi.qMeses).toBe(1);
    expect(A.kpi.qLabel).toBe('Q4 2026');
    expect(A.kpi.qImp).toBe(15 * 100);
    expect(A.kpi.ytdMeses).toBe(10);
    expect(A.kpi.ytdImp).toBe(15 * (3000 + 300));
  });

  it('con datos que llegan solo hasta septiembre, el último mes cerrado es septiembre (no octubre vacío)', () => {
    const viejo = rows.filter((r) => r.mesAno !== '10/2026');
    const B = analisisVentas(buildRF(viejo), [], enrich)!;
    expect(B.kpi.refLbl).toBe('09/2026');
    expect(B.kpi.mesPrevImp).toBe(15 * 100);
  });

  it('base "anio" cambia la comparación de los clientes', () => {
    const anioAnt = [...rows, ...['08/2025', '09/2025', '10/2025'].map((mes) => row({ solicitante: 'S1', destinatario: 'D1', mesAno: mes, importeFacturado: 50 }))];
    const C = analisisVentas(buildRF(anioAnt), [], enrich, { base: 'anio' })!;
    expect(C.baseComparacion).toBe('anio');
    expect(C.puente.base).toBe(150);
  });

  it('el PERIODO elegido (desde/hasta) fija el corte y cuántos meses se comparan', () => {
    // Corte en septiembre, 2 meses (ago–sep) contra los 2 previos (jun–jul).
    const P = analisisVentas(buildRF(rows), [], enrich, { desde: '08/2026', hasta: '09/2026' })!;
    expect(P.kpi.refLbl).toBe('09/2026');
    expect(P.kpi.periodo).toMatchObject({ n: 2, desdeLbl: '08/2026', hastaLbl: '09/2026', actual: 15 * 200, base: 15 * 2000, baseDesdeLbl: '06/2026', baseHastaLbl: '07/2026' });
    expect(P.resumen.caen.delta).toBe(15 * (200 - 2000));
  });

  it('un corte posterior al último mes con datos se recorta a ese mes', () => {
    const P = analisisVentas(buildRF(rows), [], enrich, { hasta: '03/2027' })!;
    expect(P.kpi.refLbl).toBe('10/2026');
  });

  it('filtros en multi-selección: clientes y ejecutivos (elegir entre uno u otro)', () => {
    const solo = analisisVentas(buildRF(rows), [], enrich, { clientes: ['S1', 'S2'] })!;
    expect(solo.resumen.caen.n).toBe(2);
    expect(solo.serieTotal.reduce((t, p) => t + p.imp, 0)).toBe(2 * (3000 + 300));
    const ninguno = analisisVentas(buildRF(rows), [], enrich, { clientes: ['S1'], ejecutivos: ['No existe'] })!;
    expect(ninguno.resumen.caen.n).toBe(0);
  });
});
