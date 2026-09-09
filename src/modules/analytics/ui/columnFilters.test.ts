import { describe, it, expect } from 'vitest';
import { passesFilters, normalizeFilters, type FilterColumn, type ActiveFilter } from './ColumnFilterBar';
import { encode, decode } from '@/hooks/useUrlFilters';

interface Row { ejecutivo: string; centros: string[] }
const columns: FilterColumn<Row>[] = [
  { key: 'ejecutivo', label: 'Ejecutivo', get: (r) => r.ejecutivo },
  { key: 'centro', label: 'Centro', getMany: (r) => r.centros },
];

describe('passesFilters', () => {
  it('sin filtros activos, todo pasa', () => {
    expect(passesFilters<Row>({ ejecutivo: 'ANA', centros: ['C1'] }, columns, [])).toBe(true);
  });

  it('una columna agregada sin valores no restringe (queda "todos")', () => {
    const active: ActiveFilter[] = [{ col: 'ejecutivo', values: [] }];
    expect(passesFilters<Row>({ ejecutivo: 'ANA', centros: ['C1'] }, columns, active)).toBe(true);
    expect(passesFilters<Row>({ ejecutivo: 'CARLOS', centros: ['C1'] }, columns, active)).toBe(true);
  });

  it('OR dentro de la misma columna', () => {
    const active: ActiveFilter[] = [{ col: 'ejecutivo', values: ['ANA', 'CARLOS'] }];
    expect(passesFilters<Row>({ ejecutivo: 'ANA', centros: [] }, columns, active)).toBe(true);
    expect(passesFilters<Row>({ ejecutivo: 'CARLOS', centros: [] }, columns, active)).toBe(true);
    expect(passesFilters<Row>({ ejecutivo: 'LUIS', centros: [] }, columns, active)).toBe(false);
  });

  it('AND entre columnas distintas', () => {
    const active: ActiveFilter[] = [{ col: 'ejecutivo', values: ['ANA'] }, { col: 'centro', values: ['C1'] }];
    expect(passesFilters<Row>({ ejecutivo: 'ANA', centros: ['C1', 'C2'] }, columns, active)).toBe(true);
    expect(passesFilters<Row>({ ejecutivo: 'ANA', centros: ['C2'] }, columns, active)).toBe(false);
    expect(passesFilters<Row>({ ejecutivo: 'CARLOS', centros: ['C1'] }, columns, active)).toBe(false);
  });

  it('getMany: la fila pasa si alguno de sus valores coincide', () => {
    const active: ActiveFilter[] = [{ col: 'centro', values: ['C2'] }];
    expect(passesFilters<Row>({ ejecutivo: 'ANA', centros: ['C1', 'C2'] }, columns, active)).toBe(true);
    expect(passesFilters<Row>({ ejecutivo: 'ANA', centros: ['C1'] }, columns, active)).toBe(false);
  });

  it('columna desconocida (ej. un deep link viejo) se ignora, no descarta filas', () => {
    const active: ActiveFilter[] = [{ col: 'inexistente', values: ['X'] }];
    expect(passesFilters<Row>({ ejecutivo: 'ANA', centros: [] }, columns, active)).toBe(true);
  });
});

describe('normalizeFilters', () => {
  it('formato nuevo pasa igual', () => {
    const raw = [{ col: 'ejecutivo', values: ['ANA', 'CARLOS'] }];
    expect(normalizeFilters(raw)).toEqual(raw);
  });

  it('formato legado {col, value} se convierte a {col, values: [value]}', () => {
    const raw = [{ col: 'ejecutivo', value: 'ANA' }];
    expect(normalizeFilters(raw)).toEqual([{ col: 'ejecutivo', values: ['ANA'] }]);
  });

  it('fusiona entradas repetidas de la misma columna (legado o no) preservando el orden de primera aparición', () => {
    const raw = [
      { col: 'ejecutivo', value: 'ANA' },
      { col: 'centro', value: 'C1' },
      { col: 'ejecutivo', value: 'CARLOS' },
    ];
    expect(normalizeFilters(raw)).toEqual([
      { col: 'ejecutivo', values: ['ANA', 'CARLOS'] },
      { col: 'centro', values: ['C1'] },
    ]);
  });

  it('deduplica valores repetidos dentro de la misma columna', () => {
    const raw = [{ col: 'ejecutivo', values: ['ANA', 'ANA', 'CARLOS'] }];
    expect(normalizeFilters(raw)).toEqual([{ col: 'ejecutivo', values: ['ANA', 'CARLOS'] }]);
  });

  it('un campo agregado sin valores se conserva (no desaparece)', () => {
    const raw = [{ col: 'ejecutivo', values: [] }];
    expect(normalizeFilters(raw)).toEqual([{ col: 'ejecutivo', values: [] }]);
  });

  it('descarta entradas sin col o basura, sin tronar', () => {
    expect(normalizeFilters(null)).toEqual([]);
    expect(normalizeFilters(undefined)).toEqual([]);
    expect(normalizeFilters([{ value: 'ANA' }, 'x', 42, { col: '' }])).toEqual([]);
  });

  it('es idempotente', () => {
    const once = normalizeFilters([{ col: 'ejecutivo', value: 'ANA' }, { col: 'ejecutivo', value: 'CARLOS' }]);
    expect(normalizeFilters(once)).toEqual(once);
  });
});

describe('encode/decode (?f= en la URL)', () => {
  it('round-trip con varias columnas y valores', () => {
    const filters: ActiveFilter[] = [
      { col: 'ejecutivo', values: ['ANA', 'CARLOS'] },
      { col: 'sector', values: ['Industrial'] },
    ];
    expect(decode(encode(filters))).toEqual(filters);
  });

  it('round-trip de una columna agregada sin valores', () => {
    const filters: ActiveFilter[] = [{ col: 'ejecutivo', values: [] }];
    expect(decode(encode(filters))).toEqual(filters);
  });

  it('escapa comas dentro de un valor', () => {
    const filters: ActiveFilter[] = [{ col: 'cliente', values: ['Acme, S.A.'] }];
    expect(decode(encode(filters))).toEqual(filters);
  });

  it('decode tolera y fusiona el formato legado (misma columna repetida)', () => {
    const raw = 'ejecutivo:ANA|ejecutivo:CARLOS';
    expect(decode(raw)).toEqual([{ col: 'ejecutivo', values: ['ANA', 'CARLOS'] }]);
  });

  it('decode de cadena vacía devuelve []', () => {
    expect(decode('')).toEqual([]);
  });
});
