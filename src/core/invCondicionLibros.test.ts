import { describe, it, expect } from 'vitest';
import { clasificarLote, condicionesDeMaterial, contextoOfertables, filasInvCondicion, indiceRevision, ofertablesDeMaterial, textoOfertable, lotesBloqueados, lotesDeCondicion, indiceSustitutos, opcionesDeOferta, parsearLotes } from './invCondicionLibros';
import { detectarOrdenFechas, formatearFecha, indexarHoja, parsearFechaSheet, type HojaCruda, type LibroClave } from './pedidos';

// "Hoy" fijo: 8/oct/2026 → el límite de 12 meses es el 8/oct/2027.
const HOY = new Date(2026, 9, 8);

function hoja(libro: LibroClave, nombre: string, matriz: string[][]) {
  const [columnas = [], ...rows] = matriz;
  return indexarHoja({ libro, hoja: nombre, nombreLibro: 'L', ultimaModificacion: '', columnas, rows, sincronizadoEn: '' } satisfies HojaCruda);
}

const COLS_LOTES = ['Centro', 'Almacén', 'Material', 'Texto breve de material', 'Lote', 'FeCaduc/FePreferCons', 'Libre utilización', 'Trans./Trasl.', 'Bloqueado'];
const lotesHoja = hoja('condicion', 'Corta caducidad', [
  COLS_LOTES,
  ['1001', '1030', '100950', 'CINTA', 'A', '4/8/2027', '4', '1', '0'],   // 1030 con 6 m → VIGENCIA
  ['1001', '1032', '100950', 'CINTA', 'B', '4/8/2029', '9', '0', '0'],   // 1032 con 30 m → ALMACEN_1032
  ['1004', '1032', '100950', 'CINTA', 'C', '1/8/2027', '2', '0', '0'],   // 1032 con 3 m → AMBOS
  ['1001', '1030', '100950', 'CINTA', 'D', '4/8/2029', '7', '0', '0'],   // 1030 con 30 m → NO es CC
  ['1001', '1031', '100950', 'CINTA', 'E', '1/8/2027', '0', '0', '2'],   // Libre 0 y bloqueado 2 → no CC, se conserva
  ['1031', '1060', '100950', 'CINTA', 'F', '1/8/2027', '5', '0', '0'],   // 1060 con 3 m, centro 1031 → VIGENCIA
  ['1001', '1032', '100950', 'CINTA', 'G', '4/8/2029', '0.5', '0', '0'], // 1032 pero Libre < 1 → NO
]);

describe('clasificarLote', () => {
  it('Libre ≥ 1 y (1032 y/o ≤ 12 meses calendario)', () => {
    const f = (y: number, m: number, d: number) => new Date(y, m - 1, d);
    expect(clasificarLote({ libre: 4, almacen: '1030', fecha: f(2027, 4, 8) }, HOY)).toBe('VIGENCIA');
    expect(clasificarLote({ libre: 4, almacen: '1032', fecha: f(2029, 4, 8) }, HOY)).toBe('ALMACEN_1032');
    expect(clasificarLote({ libre: 4, almacen: '1032', fecha: f(2027, 1, 8) }, HOY)).toBe('AMBOS');
    expect(clasificarLote({ libre: 4, almacen: '1030', fecha: f(2029, 4, 8) }, HOY)).toBeNull();
  });

  it('el límite son 12 meses CALENDARIO (el último día cuenta, el siguiente no)', () => {
    expect(clasificarLote({ libre: 1, almacen: '1030', fecha: new Date(2027, 9, 8) }, HOY)).toBe('VIGENCIA');
    expect(clasificarLote({ libre: 1, almacen: '1030', fecha: new Date(2027, 9, 9) }, HOY)).toBeNull();
  });

  it('sin Libre ≥ 1 no es corta caducidad aunque esté en 1032 o venza pronto', () => {
    expect(clasificarLote({ libre: 0, almacen: '1032', fecha: new Date(2026, 11, 1) }, HOY)).toBeNull();
    expect(clasificarLote({ libre: 0.9, almacen: '1032', fecha: null }, HOY)).toBeNull();
  });

  it('un lote sin fecha en 1032 es corta caducidad solo por almacén', () => {
    expect(clasificarLote({ libre: 3, almacen: '1032', fecha: null }, HOY)).toBe('ALMACEN_1032');
    expect(clasificarLote({ libre: 3, almacen: '1030', fecha: null }, HOY)).toBeNull();
  });
});

describe('lotes de la hoja', () => {
  const lotes = parsearLotes(lotesHoja, HOY);

  it('no se descarta ningún lote y cada uno trae su clasificación', () => {
    expect(lotes).toHaveLength(7);
    expect(Object.fromEntries(lotes.map((l) => [l.lote, l.motivo]))).toEqual({ A: 'VIGENCIA', B: 'ALMACEN_1032', C: 'AMBOS', D: null, E: null, F: 'VIGENCIA', G: null });
  });

  it('los lotes con Libre 0 y Bloqueado ≥ 1 se conservan aparte', () => {
    expect(lotesBloqueados(lotes).map((l) => l.lote)).toEqual(['E']);
  });

  it('InvDetalleRow solo con los de corta caducidad, fecha ISO y cantidad = Libre', () => {
    const det = lotesDeCondicion(lotes);
    expect(det.map((d) => d.lote)).toEqual(['A', 'B', 'C', 'F']);
    expect(det[0]).toMatchObject({ material: '100950', centro: '1001', almacen: '1030', fechaCaducidad: '2027-04-08', cantidadDisp: 4 });
  });
});

describe('filasInvCondicion', () => {
  const dispo = hoja('disponibilidad', 'Sheet1', [
    ['Centro', 'Almacén', 'Material', 'Libre Utilización', 'Cant. en Tránsito', 'Entrega a cliente'],
    ['1001', '1030', '100950', '10', '2', '3'],   // 7
    ['1001', '1031', '100950', '2', '1', '5'],    // 0 (piso)
    ['1001', '1060', '100950', '4', '0', '0'],    // 4
    ['1001', '1032', '100950', '99', '0', '0'],   // 1032: NO suma a Revision
    ['1031', '1030', '100950', '40', '0', '0'],
    ['1004', '1030', '100900', '8', '0', '0'],    // inventario del sustituto
  ]);
  const revision = hoja('condicion', 'Revision', [
    ['Material ', 'Texto breve de material', 'Status'],
    ['100950', 'CINTA', 'Revision Liz'],
    ['', '', 'Urgente'],
    ['', '', 'Calidad'],
    ['502000', 'TELA', ''],
  ]);
  const sustituto = hoja('condicion', 'Sustituto', [
    ['Material', 'Material sustituto', 'Texto Material', 'Texto material sustituto'],
    ['555', '100900', 'ORIGINAL', 'CINTA BLIS'],
  ]);
  const pnc = hoja('condicion', 'PNC', [
    ['Motivo', 'Centro', 'Almacén', 'Material', 'Texto breve de material', 'Cantidad Inicial', 'Lote', 'UM', 'Caducidad', 'UBICACIÓN', 'Descontar', 'Cantidad', 'Condicion'],
    ['', '1018', '1038', '1321340', 'GUANTE', '9', 'TS1', 'CA', '12/31/2027', 'A1', '', '2', 'EMPAQUE DAÑADO'],
    ['', '1018', '1038', '1321340', 'GUANTE', '9', 'TS2', 'CA', '6/30/2028', '', '', '3', 'EMPAQUE DAÑADO'],
    ['', '1004', '1038', '1321340', 'GUANTE', '9', 'TS3', 'CA', '', '', '', '1', 'OTRO'],
    ['', '1031', '1015', '9990001', 'JERINGA', '9', 'TS8', 'CA', '', '', '', '4', 'EMPAQUE DAÑADO'],
    ['', '1031', '1038', '9990001', 'JERINGA', '9', 'TS9', 'CA', '', '', '', '6', 'EMPAQUE DAÑADO'],
    ['', '1017', '1099', '9990001', 'JERINGA', '9', 'TS7', 'CA', '', '', '', '3', 'EMPAQUE DAÑADO'],
  ]);
  const { filas, lotes, detalle, sustituciones, invRevision } = filasInvCondicion([dispo, lotesHoja, revision, sustituto, pnc], { hoy: HOY });
  const fila = (cond: string, mat: string) => filas.find((f) => f.condicion === cond && f.material === mat);

  it('Revision: UNA fila por material con sus N status juntos', () => {
    const r = filas.filter((f) => f.material === '100950' && f.condicion !== 'Corta caducidad');
    expect(r).toHaveLength(1);
    expect(r[0]?.condicion).toBe('Revision Liz/Urgente/Calidad');
    expect(fila('(sin status)', '502000')).toBeDefined();
  });

  it('Revision: inventario = Libre real de 1030+1031+1060 por centro (el 1032 no cuenta) y tránsito', () => {
    const r = fila('Revision Liz/Urgente/Calidad', '100950')!;
    expect(r.invByCenter['1001']).toBe(7 + 0 + 4);
    expect(r.transitoByCenter['1001']).toBe(2 + 1);
    expect(r.disponible31_30).toBe(40); // Libre real en el centro 1031 almacén 1030
  });

  it('el mismo material tiene OTRA fila de Corta caducidad con la suma de sus lotes por centro, esté en el almacén que esté', () => {
    const c = fila('Corta caducidad', '100950')!;
    expect(c.invByCenter['1001']).toBe(4 + 9); // A (1030) + B (1032); D, E y G no cuentan
    expect(c.invByCenter['1004']).toBe(2);
    expect(c.transitoByCenter['1001']).toBe(1);
    expect(c.disponible31_30).toBe(0);
    expect(c.disponible31_32).toBe(5); // lote F en el centro 1031
    expect(c.textoBreve).toBe('CINTA');
  });

  it('Sustituto ya NO es una fila: es una relación con el inventario del sustituto', () => {
    expect(filas.some((f) => f.condicion.startsWith('Sustituto'))).toBe(false);
    expect(sustituciones).toHaveLength(1);
    expect(sustituciones[0]).toMatchObject({ material: '555', sustituto: '100900', textoSustituto: 'CINTA BLIS' });
    expect(sustituciones[0]?.invByCenter['1004']).toBe(8);
  });

  it('opcionesDeOferta: una opción por material, con sus condiciones juntas', () => {
    const o = opcionesDeOferta('555', filas, sustituciones);
    expect(o.map((x) => [x.material, x.tipo])).toEqual([['100900', 'Sustituto']]);
    expect(o[0]?.invSuma).toBe(8);
    // bilateral: buscando por el "Material sustituto" regresa el "Material"
    expect(opcionesDeOferta('100900', filas, sustituciones).map((x) => [x.material, x.tipo])).toEqual([['555', 'Sustituto']]);
    const o2 = opcionesDeOferta('100950', filas, sustituciones);
    expect(o2).toHaveLength(1);
    expect(o2[0]?.tipo).toBe('Corta caducidad/Revision Liz/Urgente/Calidad');
    expect(o2[0]?.tieneCortaCaducidad).toBe(true);
    expect(o2[0]?.invSuma).toBe(51); // Revision: 7+0+4 del 1001 + 40 del centro 1031 (todos los centros); sin los lotes de corta caducidad
    expect(o2[0]?.fuentes.find((f) => f.tipo === 'Corta caducidad')?.invSuma).toBe(4 + 9 + 2 + 5); // lotes A,B,C,F (incluye el centro 1031)
  });

  it('PNC: inventario = Cantidad de la hoja por centro y la condición va APARTE del material y su descripción', () => {
    const p = fila('PNC', '1321340')!;
    expect(p.invByCenter['1018']).toBe(5);
    expect(p.invByCenter['1004']).toBe(1);
    expect(p.textoBreve).toBe('GUANTE'); // sin el motivo pegado
    expect(p.detalle).toBe('EMPAQUE DAÑADO, OTRO');
    expect(fila('Corta caducidad', '100950')?.detalle).toBeUndefined();
  });

  it('PNC: toma la Cantidad de la hoja en CUALQUIER almacén y lo del centro 1031 se suma a Disp 31·32', () => {
    const p = fila('PNC', '9990001')!;
    expect(p.invByCenter['1017']).toBe(3); // almacén 1099: sin reglas de almacén
    expect(p.disponible31_32).toBe(10); // 1031: 4 (alm 1015) + 6 (alm 1038)
    expect(p.disponible31_30).toBe(0);
    expect(p.invTotal).toBe(13); // todos los centros
  });

  it('PNC: sus lotes traen las columnas de la hoja en orden (Caducidad en dd/mm/aaaa) y se filtran por material y centro', () => {
    const d = detalle['PNC']!;
    expect(d.columnas).toEqual(['Centro', 'Almacén', 'Material', 'Texto breve de material', 'Cantidad Inicial', 'Lote', 'UM', 'Caducidad', 'UBICACIÓN', 'Descontar', 'Cantidad', 'Condicion']);
    const deCentro = d.filas.filter((f) => f.material === '1321340' && f.centro === '1018');
    expect(deCentro).toHaveLength(2);
    expect(deCentro[0]?.celdas).toEqual(['1018', '1038', '1321340', 'GUANTE', '9', 'TS1', 'CA', '31/12/2027', 'A1', '', '2', 'EMPAQUE DAÑADO']);
    expect(detalle['Corta caducidad']).toBeUndefined(); // los lotes de corta caducidad ya van por `lotesDeCondicion`
  });

  it('condicionesDeMaterial: una fila por lote/centro/condición (CC, Revision con el centro 1031, PNC con su condición, Sustituto)', () => {
    const det = (m: string) => condicionesDeMaterial(m, { filas, lotes: lotesDeCondicion(lotes), detalle, sustituciones, invRevision });
    const a = det('100950');
    const cc = a.filter((f) => f.condicion === 'Corta caducidad');
    expect(cc.map((f) => [f.centro, f.almacen, f.lote, f.caducidad, f.cantidad])).toEqual([
      ['1001', '1030', 'A', '2027-04-08', 4], ['1001', '1032', 'B', '2029-04-08', 9], ['1004', '1032', 'C', '2027-01-08', 2], ['1031', '1060', 'F', '2027-01-08', 5],
    ]);
    const rev = a.filter((f) => f.condicion === 'Revision Liz/Urgente/Calidad');
    expect(rev.map((f) => [f.centro, f.almacen, f.cantidad])).toEqual([['1001', '1030', 7], ['1001', '1060', 4], ['1031', '1030', 40]]);
    const p = det('1321340');
    expect(p.map((f) => [f.condicion, f.centro, f.almacen, f.lote, f.caducidad, f.cantidad, f.detalle])).toEqual([
      ['PNC', '1004', '1038', 'TS3', '', 1, 'OTRO'],
      ['PNC', '1018', '1038', 'TS1', '2027-12-31', 2, 'EMPAQUE DAÑADO'],
      ['PNC', '1018', '1038', 'TS2', '2028-06-30', 3, 'EMPAQUE DAÑADO'],
    ]);
    expect(det('100900')).toMatchObject([{ condicion: 'Sustituto', relacionado: { material: '555', texto: 'ORIGINAL' } }]);
    expect(det('555')).toMatchObject([{ condicion: 'Sustituto', cantidad: 8, relacionado: { material: '100900', texto: 'CINTA BLIS' } }]);
  });

  it('devuelve también todos los lotes (con los bloqueados) y precio/importe desde las funciones del catálogo', () => {
    expect(lotes).toHaveLength(7);
    const conPrecio = filasInvCondicion([dispo, lotesHoja], { hoy: HOY, precioDe: () => 10, sectorDe: () => 'GASAS' }).filas[0]!;
    expect(conPrecio).toMatchObject({ sector: 'GASAS', precioOferta: 10, importeInventario: 10 * conPrecio.invSuma });
  });

  it('sin la hoja de lotes ni Disponibilidad no truena', () => {
    expect(filasInvCondicion([revision], { hoy: HOY }).filas.every((f) => f.invSuma === 0)).toBe(true);
    expect(filasInvCondicion([], { hoy: HOY }).filas).toEqual([]);
  });
});

describe('indiceSustitutos (relación simétrica por pares)', () => {
  const s = (material: string, sustituto: string) => ({ material, textoMaterial: 'T' + material, sustituto, textoSustituto: 'T' + sustituto, invByCenter: {}, transitoByCenter: {}, invTotal: 1, invByCenterMaterial: {}, invTotalMaterial: 2 });
  const ids = (i: ReturnType<typeof indiceSustitutos>, m: string) => (i.get(m) ?? []).map((r) => r.material).sort();

  it('A=B y C=A → A:{B,C}, B:{A}, C:{A}; B y C no son sustitutos entre sí', () => {
    const i = indiceSustitutos([s('A', 'B'), s('C', 'A')]);
    expect(ids(i, 'A')).toEqual(['B', 'C']);
    expect(ids(i, 'B')).toEqual(['A']);
    expect(ids(i, 'C')).toEqual(['A']);
  });

  it('da igual el orden de los renglones, que el par venga repetido o invertido, y se ignora la auto-relación', () => {
    const i = indiceSustitutos([s('A', 'B'), s('B', 'A'), s('A', 'B'), s('5', '5')]);
    expect(ids(i, 'A')).toEqual(['B']);
    expect(ids(i, 'B')).toEqual(['A']);
    expect(i.get('5')).toBeUndefined();
  });

  it('el caso 324090: 324010=324090 y 324090=324092', () => {
    const i = indiceSustitutos([s('324010', '324090'), s('324090', '324092')]);
    expect(ids(i, '324090')).toEqual(['324010', '324092']);
    expect(ids(i, '324010')).toEqual(['324090']);
    expect(ids(i, '324092')).toEqual(['324090']);
  });

  it('con el encabezado de "Material sustituto" en blanco igual lee la relación', () => {
    const h = hoja('condicion', 'Sustituto', [['Material', 'Texto Material', '', 'Texto material sustituto'], ['324010', 'A', '324090', 'B'], ['324090', 'B', '324092', 'C']]);
    const r = filasInvCondicion([h], { hoy: HOY });
    expect(r.sustituciones.map((x) => [x.material, x.sustituto])).toEqual([['324010', '324090'], ['324090', '324092']]);
  });
});

describe('formato de fechas por columna', () => {
  it('detectarOrdenFechas: gana la evidencia inequívoca; sin evidencia o empate → mes/día/año', () => {
    expect(detectarOrdenFechas(['15/03/2029', '2/9/2029', '30/1/2028'])).toBe('dmy');
    expect(detectarOrdenFechas(['03/15/2029', '2/9/2029'])).toBe('mdy');
    expect(detectarOrdenFechas(['2/9/2029', '', 'N/A'])).toBe('mdy');
    expect(detectarOrdenFechas(['15/03/2029', '03/15/2029'])).toBe('mdy');
    expect(detectarOrdenFechas(['12/31/2027', '12/31/2027', '31/12/2027'])).toBe('mdy'); // PNC: mezclado, gana la mayoría
  });

  it('parsearFechaSheet: respeta el orden de la columna y un número > 12 siempre es el día', () => {
    expect(formatearFecha(parsearFechaSheet('2/9/2029', 'dmy'))).toBe('02/09/2029'); // 2 de septiembre
    expect(formatearFecha(parsearFechaSheet('2/9/2029', 'mdy'))).toBe('09/02/2029'); // 9 de febrero
    expect(formatearFecha(parsearFechaSheet('31/12/2027', 'mdy'))).toBe('31/12/2027');
    expect(formatearFecha(parsearFechaSheet('12/31/2027', 'dmy'))).toBe('31/12/2027');
  });

  it('Corta caducidad en dd/mm/aaaa: las fechas con día ≤ 12 se leen en ese orden (2/9/2029 = 2 de septiembre)', () => {
    const h = hoja('condicion', 'Corta caducidad', [
      COLS_LOTES,
      ['1001', '1030', '777', 'X', 'A', '15/11/2026', '4', '0', '0'], // inequívoca: dd/mm → fija el orden de la columna
      ['1001', '1030', '777', 'X', 'B', '2/9/2029', '4', '0', '0'],   // 2 de septiembre de 2029 (no 9 de febrero)
    ]);
    const l = parsearLotes(h, HOY);
    expect(formatearFecha(l.find((x) => x.lote === 'B')?.fecha ?? null)).toBe('02/09/2029');
    expect(l.find((x) => x.lote === 'B')?.motivo).toBeNull(); // > 12 meses: no es corta caducidad
  });
});

describe('indiceRevision', () => {
  it('solo los materiales con condición Revision (status unidos con "/"); Corta caducidad y PNC no cuentan', () => {
    const filas = [
      { material: '100', condicion: 'Corta caducidad' },
      { material: '100', condicion: 'Liz/Lento mov' },
      { material: '200', condicion: 'Corta caducidad' },
      { material: '300', condicion: 'PNC' },
    ] as unknown as Parameters<typeof indiceRevision>[0];
    const r = indiceRevision(filas);
    expect(r.get('100')).toBe('Liz/Lento mov');
    expect(r.has('200')).toBe(false);
    expect(r.has('300')).toBe(false);
  });
});

describe('ofertablesDeMaterial', () => {
  const lote = (material: string, centro: string, cantidadDisp: number) => ({ material, textoBreve: '', centro, almacen: '1030', lote: 'L', fechaCaducidad: null, cantidadDisp }) as unknown as Parameters<typeof contextoOfertables>[0][number];
  const sust = (material: string, sustituto: string, invTotal: number) => ({ material, sustituto, textoMaterial: '', textoSustituto: '', invTotal, invTotalMaterial: 0 }) as unknown as Parameters<typeof contextoOfertables>[2][number];
  const todos = () => true;

  it('lotes de corta caducidad: los de existencia 0 no cuentan y el filtro de centros los quita', () => {
    const ctx = contextoOfertables([lote('1', '1031', 5), lote('1', '1017', 3), lote('1', '1031', 0)], new Map(), []);
    expect(ofertablesDeMaterial('1', ctx, todos).corta).toEqual({ n: 2, cantidad: 8 });
    expect(ofertablesDeMaterial('1', ctx, (c) => c === '1031').corta).toEqual({ n: 1, cantidad: 5 });
    expect(ofertablesDeMaterial('1', ctx, () => false).tiene).toBe(false);
  });
  it('Revisión sin lotes ya es ofertable y no se mezcla con corta caducidad', () => {
    const ctx = contextoOfertables([], new Map([['2', 'Liz/Lento mov']]), []);
    const o = ofertablesDeMaterial('2', ctx, todos);
    expect(o).toMatchObject({ tiene: true, revision: 'Liz/Lento mov', corta: { n: 0 } });
    expect(textoOfertable(o)).toBe('Revisión: Liz/Lento mov');
  });
  it('sustituto: cuenta solo con inventario, en ambos sentidos', () => {
    const ctx = contextoOfertables([], new Map(), [sust('3', '4', 10), sust('5', '6', 0)]);
    expect(ofertablesDeMaterial('3', ctx, todos).sustitutos).toBe(1);
    expect(ofertablesDeMaterial('5', ctx, todos).tiene).toBe(false);
  });
  it('PNC: lotes con existencia, por centro (respeta el filtro de centros)', () => {
    const detalle = { columnas: ['Almacén', 'Lote', 'Caducidad', 'Cantidad', 'Condicion'], filas: [
      { material: '7', centro: '1031', celdas: ['1030', 'A', '', '4', 'PNC'] },
      { material: '7', centro: '1017', celdas: ['1030', 'B', '', '6', 'PNC'] },
      { material: '7', centro: '1031', celdas: ['1030', 'C', '', '0', 'PNC'] },
    ] };
    const ctx = contextoOfertables([], new Map(), [], detalle);
    expect(ofertablesDeMaterial('7', ctx, todos).pnc).toEqual({ n: 2, cantidad: 10 });
    expect(ofertablesDeMaterial('7', ctx, (c) => c === '1031').pnc).toEqual({ n: 1, cantidad: 4 });
    expect(ofertablesDeMaterial('7', ctx, () => false).tiene).toBe(false);
    expect(textoOfertable(ofertablesDeMaterial('7', ctx, todos))).toBe('PNC (2 lotes)');
  });
  it('material sin nada: no es ofertable', () => {
    expect(ofertablesDeMaterial('9', contextoOfertables([], new Map(), []), todos).tiene).toBe(false);
  });
});
