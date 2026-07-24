import { describe, it, expect } from 'vitest';
import { preciosPorCondicion, normCode } from './enrich';
import type { InvConsolidadoRow } from './types';

const mkRow = (over: Partial<InvConsolidadoRow>): InvConsolidadoRow => ({
  sector: '',
  grupo: '',
  condicion: 'Normal',
  material: '100',
  textoBreve: '',
  disponible31_30: 0,
  disponible31_32: 0,
  invByCenter: {},
  transitoByCenter: {},
  invSuma: 0,
  precioOferta: 0,
  importeInventario: 0,
  ...over,
});

describe('preciosPorCondicion', () => {
  const catalogRows: InvConsolidadoRow[] = [
    mkRow({ material: '100', condicion: 'Normal', precioOferta: 10, invSuma: 5 }),
    mkRow({ material: '100', condicion: 'Corta caducidad', precioOferta: 8, invSuma: 3 }),
    mkRow({ material: '100', condicion: 'Normal', precioOferta: 10, invSuma: 2 }),
    mkRow({ material: '999', condicion: 'Normal', precioOferta: 99 }),
  ];
  const invCondicionRows: InvConsolidadoRow[] = [
    mkRow({ material: '100', condicion: 'Normal', precioOferta: 7 }),
  ];

  it('prefers the catalog price when the material exists in InvConsolidadoCatalog', () => {
    const out = preciosPorCondicion('100', catalogRows, invCondicionRows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ condicion: 'Normal', precio: 10, inv: 7 });
    expect(out[1]).toMatchObject({ condicion: 'Corta caducidad', precio: 8, inv: 3 });
  });

  it('uses catalog rows when the material exists in the catalog (999 case)', () => {
    // catalogRows already has one row for '999' at precio 99. The matcher
    // `invConsolidadoCatalog.some(r => material==='999') ` returns true, so it
    // picks catalogRows, not invCondicionRows.
    const out = preciosPorCondicion('999', catalogRows, invCondicionRows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ condicion: 'Normal', precio: 99 });
  });

  it('falls back when catalog has no rows for the material but invCondicion does', () => {
    const emptyCatalog: InvConsolidadoRow[] = [];
    const richInvCondicion: InvConsolidadoRow[] = [
      mkRow({ material: '100', condicion: 'Oferta', precioOferta: 4, invSuma: 1 }),
    ];
    const out = preciosPorCondicion('100', emptyCatalog, richInvCondicion);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ condicion: 'Oferta', precio: 4, inv: 1 });
  });

  it('sorts results highest price first', () => {
    const rows: InvConsolidadoRow[] = [
      mkRow({ material: 'A', condicion: 'X', precioOferta: 5 }),
      mkRow({ material: 'A', condicion: 'Y', precioOferta: 50 }),
      mkRow({ material: 'A', condicion: 'Z', precioOferta: 20 }),
    ];
    const out = preciosPorCondicion('A', rows, []);
    expect(out.map((o) => o.precio)).toEqual([50, 20, 5]);
  });

  it('collapses duplicate (condicion, precio) pairs by summing invSuma', () => {
    const rows: InvConsolidadoRow[] = [
      mkRow({ material: 'A', condicion: 'X', precioOferta: 5, invSuma: 1 }),
      mkRow({ material: 'A', condicion: 'X', precioOferta: 5, invSuma: 2 }),
    ];
    const out = preciosPorCondicion('A', rows, []);
    expect(out).toEqual([{ condicion: 'X', precio: 5, inv: 3 }]);
  });

  it('returns (sin condición) when condicion is blank', () => {
    const rows: InvConsolidadoRow[] = [
      mkRow({ material: 'A', condicion: '', precioOferta: 5 }),
    ];
    const out = preciosPorCondicion('A', rows, []);
    expect(out[0].condicion).toBe('(sin condicion)');
  });

  it('handles an unknown material gracefully', () => {
    expect(preciosPorCondicion('UNKNOWN', catalogRows, [])).toEqual([]);
  });
});

describe('normCode', () => {
  it('strips trailing .0', () => {
    expect(normCode('20.0')).toBe('20');
    expect(normCode('602.0')).toBe('602');
  });

  it('strips leading zeros on numeric codes', () => {
    expect(normCode('000')).toBe('0');
    expect(normCode('001')).toBe('1');
    expect(normCode('017')).toBe('17');
  });

  it('returns non-numeric codes untouched but trimmed', () => {
    expect(normCode('  Material-X ')).toBe('Material-X');
  });

  it('handles null/undefined', () => {
    expect(normCode(null)).toBe('');
    expect(normCode(undefined)).toBe('');
  });

  it('preserves negative numeric codes', () => {
    expect(normCode('-007')).toBe('-7');
  });
});
