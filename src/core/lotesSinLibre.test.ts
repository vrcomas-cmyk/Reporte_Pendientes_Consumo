import { describe, it, expect } from 'vitest';
import { clasificarLote, lotesSinLibre, type LoteCondicion } from './invCondicionLibros';

const hoy = new Date(2026, 10, 5);
const lote = (o: Partial<LoteCondicion>): LoteCondicion => ({
  material: 'M1', textoBreve: 't', centro: '1001', almacen: '1030', lote: 'L', fechaCaducidad: null, fecha: null, libre: 0, transito: 0, bloqueado: 0, motivo: null, ...o,
});

describe('lotesSinLibre', () => {
  it('incluye lotes en 1032 o ≤12 meses con libre < 1, que clasificarLote descarta', () => {
    const l1032 = lote({ almacen: '1032', libre: 0, bloqueado: 5 });
    const lVig = lote({ lote: 'V', fecha: new Date(2027, 2, 1), fechaCaducidad: '2027-03-01' });
    expect(clasificarLote(l1032, hoy)).toBeNull();
    const r = lotesSinLibre([l1032, lVig], hoy);
    expect(r.map((x) => x.lote)).toEqual(['L', 'V']);
    expect(r.every((x) => x.cantidadDisp === 0)).toBe(true);
  });
  it('excluye los que ya cuentan (libre ≥ 1) y los que no cumplen la regla', () => {
    const cuenta = lote({ almacen: '1032', libre: 10, motivo: 'ALMACEN_1032' });
    const lejano = lote({ lote: 'X', fecha: new Date(2029, 0, 1), fechaCaducidad: '2029-01-01' });
    expect(lotesSinLibre([cuenta, lejano], hoy)).toEqual([]);
  });
});

describe('clasificarLote con la columna «Meses» de la hoja', () => {
  const base = { libre: 5, almacen: '1030', fecha: null as Date | null };
  it('un lote sin fecha con Meses = 0 es corta caducidad (como lo cuenta la hoja)', () => {
    expect(clasificarLote({ ...base, meses: 0 }, hoy)).toBe('VIGENCIA');
  });
  it('Meses = 12 cuenta aunque la fecha pase unos días del año calendario', () => {
    expect(clasificarLote({ ...base, fecha: new Date(2027, 10, 8), meses: 12 }, hoy)).toBe('VIGENCIA');
    expect(clasificarLote({ ...base, fecha: new Date(2027, 10, 8) }, hoy)).toBeNull();
  });
  it('Meses > 12 fuera del 1032 no cuenta; en el 1032 sí', () => {
    expect(clasificarLote({ ...base, meses: 13 }, hoy)).toBeNull();
    expect(clasificarLote({ ...base, almacen: '1032', meses: 13 }, hoy)).toBe('ALMACEN_1032');
  });
  it('sin la columna Meses se usa la fecha, como antes', () => {
    expect(clasificarLote({ ...base, fecha: new Date(2027, 2, 1) }, hoy)).toBe('VIGENCIA');
    expect(clasificarLote({ ...base }, hoy)).toBeNull();
  });
});
