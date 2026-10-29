import { describe, it, expect } from 'vitest';
import { preciosPorCondicion, normCode, buildEnrich, etiquetaEjecutivoZona, zonaTresDigitos } from './enrich';
import { crearPreciosAutorizados } from './precioAutorizado';
import type { CatalogSnapshot, InvConsolidadoRow } from './types';

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

describe('gerencia de marca', () => {
  const catalog = {
    id: 'current', fileName: '', loadedAt: '',
    ejecutivos: [], materiales: [], invConsolidado: [], invDetalle: [],
    gerenciaMarca: [
      { gerente: 'Ana', sector: 'Suturas' },
      { gerente: 'Ana', sector: 'Curación' },
      { gerente: 'Beto', sector: 'Diagnóstico' },
    ],
  } as CatalogSnapshot;
  const e = buildEnrich(catalog);

  it('lista gerentes ordenados y sus sectores', () => {
    expect(e.gerentes).toEqual(['Ana', 'Beto']);
    expect(e.sectoresDeGerente('Ana')).toEqual(['Curación', 'Suturas']);
  });
  it('compara sin acentos ni mayúsculas', () => {
    expect(e.sectorDeGerente('SUTURAS', 'Ana')).toBe(true);
    expect(e.sectorDeGerente('curacion', 'Ana')).toBe(true);
    expect(e.sectorDeGerente('Suturas', 'Beto')).toBe(false);
  });
  it('sin gerente pasa todo; catálogo sin pestaña no rompe', () => {
    expect(e.sectorDeGerente('X', '')).toBe(true);
    expect(buildEnrich({ ...catalog, gerenciaMarca: undefined }).gerentes).toEqual([]);
  });
});

describe('ejecutivos por zona (filtro)', () => {
  it('zona a 3 dígitos', () => {
    expect(zonaTresDigitos('0')).toBe('000');
    expect(zonaTresDigitos('2')).toBe('002');
    expect(zonaTresDigitos('101')).toBe('101');
    expect(zonaTresDigitos('2.0')).toBe('002');
    expect(zonaTresDigitos('NORTE')).toBe('NORTE');
  });
  it('las vacantes salen con su zona; los demás con su nombre', () => {
    expect(etiquetaEjecutivoZona('Vacante Norte', '0').etiqueta).toBe('000 · Vacante Norte');
    expect(etiquetaEjecutivoZona('VACANTE', 2).etiqueta).toBe('002 · VACANTE');
    expect(etiquetaEjecutivoZona('Ana Pérez', '101')).toMatchObject({ etiqueta: 'Ana Pérez', vacante: false });
  });
  it('ejecutivoNombre (usado en todas las pantallas) muestra la zona de las vacantes y el nombre de los demás', () => {
    const ej = (zona: string, ejecutivo: string, codOfVtas = '') => ({ zona, ejecutivo, codOfVtas });
    const catalog = { ejecutivos: [ej('2', 'VACANTE', 'OF2'), ej('101', 'Ana Pérez'), ej('0', 'Vacante Norte')], materiales: [], invConsolidado: [], gerenciaMarca: [] } as unknown as CatalogSnapshot;
    const e = buildEnrich(catalog);
    expect(e.ejecutivoNombre('2')).toBe('002 · VACANTE');
    expect(e.ejecutivoNombre('OF2')).toBe('002 · VACANTE'); // también por oficina de ventas
    expect(e.ejecutivoNombre('0')).toBe('000 · Vacante Norte');
    expect(e.ejecutivoNombre('101')).toBe('Ana Pérez');
    expect(e.ejecutivoNombre('999')).toBe('');
  });
  it('conserva el orden del catálogo (sin ordenar), una entrada por zona, y resuelve zona u oficina de ventas', () => {
    const ej = (zona: string, ejecutivo: string, codOfVtas = '') => ({ zona, ejecutivo, codOfVtas });
    const catalog = { ejecutivos: [ej('101', 'Zeta'), ej('0', 'Vacante A'), ej('2', 'Ana', 'OF9'), ej('2', 'Ana (dup)')], materiales: [], invConsolidado: [], gerenciaMarca: [] } as unknown as CatalogSnapshot;
    const e = buildEnrich(catalog);
    expect(e.ejecutivosZona.map((z) => z.zona)).toEqual(['101', '0', '2']);
    expect(e.ejecutivosZona.map((z) => z.etiqueta)).toEqual(['Zeta', '000 · Vacante A', 'Ana']);
    expect(e.zonaDeEjecutivo('002')).toBe('2');
    expect(e.zonaDeEjecutivo('OF9')).toBe('2');
    expect(e.zonaDeEjecutivo('999')).toBe('');
  });
});

describe('preciosPorCondicion · precios autorizados (módulo Precios)', () => {
  const rows = [mkRow({ material: '100', condicion: 'Corta caducidad', precioOferta: 90, invSuma: 5 })];
  const auth = (entradas: { combinacion: string; precio: number }[], incluidos: string[] = []) =>
    crearPreciosAutorizados(entradas.map((e) => ({ material: '100', ...e })), () => incluidos);
  it('sin autorizados conserva el precio de la hoja', () => {
    expect(preciosPorCondicion('100', rows, [])[0].precio).toBe(90);
  });
  it('el autorizado sustituye al de la hoja para esa condición', () => {
    const out = preciosPorCondicion('100', rows, [], auth([{ combinacion: 'CC', precio: 72.5 }]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ condicion: 'Corta caducidad', precio: 72.5, inv: 5 });
  });
  it('usa las condiciones de Precios: un material con Status incluido cobra «CC + Lento mov» en su corta caducidad', () => {
    const a = auth([{ combinacion: 'CC + Lento mov', precio: 60 }], ['Lento mov']);
    const out = preciosPorCondicion('100', rows, [], a);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ condicion: 'Corta caducidad', precio: 60, inv: 5 });
  });
  it('una condición autorizada que la hoja no trae se agrega sin inventario', () => {
    const out = preciosPorCondicion('100', rows, [], auth([{ combinacion: 'CC', precio: 72.5 }, { combinacion: 'PNC', precio: 30 }]));
    expect(out.map((r) => r.condicion).sort()).toEqual(['Corta caducidad', 'PNC']);
    expect(out.find((r) => r.condicion === 'PNC')).toMatchObject({ precio: 30, inv: 0 });
  });
});

describe('preciosPorCondicion · solo autorizados (sin revolver con el precio viejo de la hoja)', () => {
  const rows = [
    mkRow({ material: '100', condicion: 'Corta caducidad', precioOferta: 90, invSuma: 5 }),
    mkRow({ material: '100', condicion: 'PNC', precioOferta: 90, invSuma: 2 }),
  ];
  const aut = crearPreciosAutorizados([{ material: '100', combinacion: 'CC', precio: 10 }], () => []);
  it('cada condición toma SU precio autorizado; la que no está autorizada queda en 0 aunque la hoja traiga precio', () => {
    const out = preciosPorCondicion('100', rows, [], aut, true);
    expect(out.find((r) => r.condicion === 'Corta caducidad')).toMatchObject({ precio: 10, inv: 5 });
    expect(out.find((r) => r.condicion === 'PNC')).toMatchObject({ precio: 0, inv: 2 });
  });
  it('sin la opción conserva el comportamiento anterior (precio de la hoja)', () => {
    expect(preciosPorCondicion('100', rows, [], aut).find((r) => r.condicion === 'PNC')!.precio).toBe(90);
  });
});

describe('correosDeZona', () => {
  it('junta los correos de las filas repetidas de una zona sin duplicar y descarta los inválidos', () => {
    const ej = (o: object) => ({ zona: '002', codOfVtas: 'A1', ejecutivo: 'Heber', correoElectronico: '', ...o });
    const e = buildEnrich({
      ejecutivos: [ej({ correoElectronico: 'Heber@x.com' }), ej({ correoElectronico: 'heber@x.com; otro@x.com' }), ej({ correoElectronico: 'no es correo' }), ej({ zona: '5', codOfVtas: 'B2', ejecutivo: 'Ana' })],
      materiales: [], invConsolidado: [], invDetalle: [], gerenciaMarca: [],
    } as unknown as CatalogSnapshot);
    expect(e.correosDeZona('2')).toEqual(['Heber@x.com', 'otro@x.com']);
    expect(e.correosDeZona('A1')).toEqual(['Heber@x.com', 'otro@x.com']); // por código de oficina de ventas también
    expect(e.correosDeZona('5')).toEqual([]);
  });
});

describe('ejecutivoAtributos', () => {
  it('da gerencia, gerente, canal y oficina de ventas de la zona a la que pertenece un Gpo. Vdor. (por zona o por código de oficina)', () => {
    const catalog = { ejecutivos: [{ zona: '101', codOfVtas: 'A01', ejecutivo: 'Ana', gerenciaVentas: 'Norte', gerenteVentas: 'Luis', canalVentas: 'Privado', oficinaVentas: 'Monterrey', correoElectronico: '' }], materiales: [], invConsolidado: [], invDetalle: [], gerenciaMarca: [] } as never;
    const e = buildEnrich(catalog);
    expect(e.ejecutivoAtributos('101')).toEqual({ gerenciaVentas: 'Norte', gerenteVentas: 'Luis', canalVentas: 'Privado', oficinaVentas: 'Monterrey' });
    expect(e.ejecutivoAtributos('A01').gerenteVentas).toBe('Luis');
    expect(e.ejecutivoAtributos('999')).toEqual({ gerenciaVentas: '', gerenteVentas: '', canalVentas: '', oficinaVentas: '' });
  });
});
