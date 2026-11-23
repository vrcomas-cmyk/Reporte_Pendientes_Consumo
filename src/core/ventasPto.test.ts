import { describe, it, expect } from 'vitest';
import { dimensionesPorVendedor, ventasPtoDesdeRF, mesesDisponibles, mesElegidoPorOmision, rangoCumplimiento, rankingSectorGrupo, desgloseColaborador, filtrarVentasColab, indexarVentasPorVdor, mesesDeColaborador, mesPorOmision, type ResolverDetalle, combinarVentasConPresupuesto, filtrarPresupuestoDet, filtrarVentasPto, nombreCoincide, ptoPorMes, rankingCumplimiento, rankingPto, serieMensualPto, totalPto, ultimoMesPto } from './ventasPto';
import { mesKey } from './resumenFac';
import type { PtoFila, VentasPtoRow } from './facturacionLibros';

const r = (mes: string, region: string, gpoVdor: string, ventas: number, presupuesto: number): VentasPtoRow => ({ mes, region, gerencia: 'G-' + region, gpoCte: '15', gpoVdor, ventas, presupuesto });
const rows = [
  r('06/2026', 'NORTE', '24', 100, 120), r('07/2026', 'NORTE', '24', 150, 120), r('07/2026', 'NORTE', '30', 50, 80),
  r('07/2026', 'SUR', '40', 300, 250), r('07/2026', '', '41', 10, 0),
];
const lo = mesKey('06/2026'), hi = mesKey('07/2026');

describe('ventas vs presupuesto', () => {
  it('serie general: suma por mes y ordena', () => {
    expect(serieMensualPto(rows, lo, hi)).toEqual([
      { mes: '06/2026', ventas: 100, presupuesto: 120 },
      { mes: '07/2026', ventas: 510, presupuesto: 450 },
    ]);
  });
  it('serie filtrada por una región', () => {
    expect(serieMensualPto(rows, lo, hi, 'region', 'NORTE')).toEqual([
      { mes: '06/2026', ventas: 100, presupuesto: 120 },
      { mes: '07/2026', ventas: 200, presupuesto: 200 },
    ]);
  });
  it('respeta el rango de meses', () => {
    expect(serieMensualPto(rows, mesKey('07/2026'), mesKey('07/2026'))).toHaveLength(1);
  });
  it('ranking por dimensión: cumplimiento, orden por presupuesto y "(sin dato)" para vacíos', () => {
    const rk = rankingPto(rows, 'region', lo, hi);
    expect(rk.map((x) => x.clave)).toEqual(['NORTE', 'SUR', '(sin dato)']);
    expect(rk[0]).toMatchObject({ ventas: 300, presupuesto: 320 });
    expect(rk[0].cumplimiento).toBeCloseTo(300 / 320);
    expect(rk[2].cumplimiento).toBeNull(); // sin presupuesto
  });
  it('ranking por gpo. vendedor', () => {
    expect(rankingPto(rows, 'gpoVdor', lo, hi).map((x) => x.clave)).toEqual(['40', '24', '30', '41']);
  });
  it('totales y último mes', () => {
    const t = totalPto(serieMensualPto(rows, lo, hi));
    expect(t.ventas).toBe(610);
    expect(t.cumplimiento).toBeCloseTo(610 / 570);
    expect(ultimoMesPto(rows)).toBe('07/2026');
    expect(ultimoMesPto([])).toBe('');
  });
  it('combinarVentasConPresupuesto: las ventas salen de la serie de importe (no de ventasPto) y el presupuesto de ventasPto', () => {
    const pto = serieMensualPto(rows, lo, hi);
    const importe = [{ mes: '06/2026', imp: 111 }, { mes: '07/2026', imp: 222 }, { mes: '12/2026', imp: 5 }];
    const out = combinarVentasConPresupuesto(importe, pto, lo, mesKey('12/2026'));
    expect(out).toEqual([
      { mes: '06/2026', ventas: 111, presupuesto: 120 },
      { mes: '07/2026', ventas: 222, presupuesto: 450 },
      { mes: '12/2026', ventas: 5, presupuesto: 0 },
    ]);
  });
  it('combinarVentasConPresupuesto respeta la selección de meses', () => {
    const out = combinarVentasConPresupuesto([{ mes: '06/2026', imp: 1 }, { mes: '07/2026', imp: 2 }], serieMensualPto(rows, lo, hi), lo, hi, new Set([mesKey('07/2026')]));
    expect(out.map((p) => p.mes)).toEqual(['07/2026']);
  });
});

describe('filtros de la página sobre el presupuesto', () => {
  const det: PtoFila[] = [
    ['07/2026', 'NORTE', 'G1', '15', '24', 'ALGODÓN Y APLICADORE', 'ALGODON PLISADO', 100],
    ['07/2026', 'NORTE', 'G1', '15', '30', 'GASAS', 'GASA SIMPLE', 200],
    ['08/2026', 'SUR', 'G2', '19', '40', 'ALGODÓN Y APLICADORE', 'PADS', 300],
  ];
  const resolver = {
    ejecutivo: (c: string) => ({ '24': 'Ana', '30': 'Beto', '40': 'Carla' } as Record<string, string>)[c] ?? '',
    grupoCli: (c: string) => ({ '15': 'DISTRIBUIDOR', '19': 'HOSPITALES' } as Record<string, string>)[c] ?? c,
    ventas: (c: string) => (c === '40' ? { gerenciaVentas: 'GV SUR' } : { gerenciaVentas: 'GV NORTE' }),
  };
  const act = (col: string, ...values: string[]) => ({ col, values });

  it('sin filtros devuelve todo', () => {
    expect(filtrarPresupuestoDet(det, [], resolver).filas).toHaveLength(3);
  });
  it('filtra por ejecutivo, grupo cliente y gerencia de ventas (los 3 salen del código)', () => {
    expect(filtrarPresupuestoDet(det, [act('ejecutivo', 'Ana')], resolver).filas.map((f) => f[7])).toEqual([100]);
    expect(filtrarPresupuestoDet(det, [act('grupocli', 'HOSPITALES')], resolver).filas.map((f) => f[7])).toEqual([300]);
    expect(filtrarPresupuestoDet(det, [act('gerenciaVentas', 'GV NORTE')], resolver).filas.map((f) => f[7])).toEqual([100, 200]);
  });
  it('sector tolera el nombre recortado del presupuesto', () => {
    expect(filtrarPresupuestoDet(det, [act('sector', 'ALGODÓN Y APLICADORES')], resolver).filas.map((f) => f[7])).toEqual([100, 300]);
    expect(nombreCoincide('ALGODON Y APLICADORES', 'algodón y aplicadore')).toBe(true);
    expect(nombreCoincide('GASAS', 'GASA')).toBe(false); // demasiado corto para tratarlo como prefijo
  });
  it('los filtros combinados se acumulan (AND)', () => {
    expect(filtrarPresupuestoDet(det, [act('ejecutivo', 'Ana', 'Carla'), act('grupocli', 'HOSPITALES')], resolver).filas.map((f) => f[7])).toEqual([300]);
  });
  it('los filtros que el presupuesto no tiene (material, cliente, estado) se reportan y no filtran', () => {
    const r = filtrarPresupuestoDet(det, [act('material', '511010'), act('estado', 'riesgo')], resolver, { etiqueta: (c) => ({ material: 'Material', estado: 'Estado' } as Record<string, string>)[c] ?? c });
    expect(r.filas).toHaveLength(3);
    expect(r.ignorados).toEqual(['Material', 'Estado']);
  });
  it('el filtro Gerente de la página (sector → gerente) se aplica al sector del presupuesto', () => {
    expect(filtrarPresupuestoDet(det, [], resolver, { sectorPasa: (s) => s.startsWith('GASAS') }).filas.map((f) => f[7])).toEqual([200]);
  });
  it('ptoPorMes respeta rango y selección de meses', () => {
    const m = ptoPorMes(det, mesKey('07/2026'), mesKey('08/2026'));
    expect(m.get(mesKey('07/2026'))).toBe(300);
    expect(m.get(mesKey('08/2026'))).toBe(300);
    expect([...ptoPorMes(det, mesKey('07/2026'), mesKey('08/2026'), new Set([mesKey('08/2026')])).keys()]).toEqual([mesKey('08/2026')]);
  });
  it('filtrarVentasPto usa solo ejecutivo / grupo cliente / gerencia; sector y material no aplican a las ventas', () => {
    const v: VentasPtoRow[] = [
      { mes: '07/2026', region: 'NORTE', gerencia: 'G1', gpoCte: '15', gpoVdor: '24', ventas: 10, presupuesto: 0 },
      { mes: '07/2026', region: 'SUR', gerencia: 'G2', gpoCte: '19', gpoVdor: '40', ventas: 20, presupuesto: 0 },
    ];
    expect(filtrarVentasPto(v, [act('ejecutivo', 'Carla')], resolver)).toHaveLength(1);
    expect(filtrarVentasPto(v, [act('sector', 'GASAS')], resolver)).toHaveLength(2);
  });
  it('rankingCumplimiento junta ventas y presupuesto por dimensión', () => {
    const v: VentasPtoRow[] = [{ mes: '07/2026', region: 'NORTE', gerencia: 'G1', gpoCte: '15', gpoVdor: '24', ventas: 150, presupuesto: 0 }];
    const rk = rankingCumplimiento(v, det, 'region', mesKey('07/2026'), mesKey('08/2026'));
    expect(rk.map((x) => x.clave)).toEqual(['NORTE', 'SUR']);
    expect(rk.find((x) => x.clave === 'NORTE')).toMatchObject({ ventas: 150, presupuesto: 300 });
    expect(rk.find((x) => x.clave === 'NORTE')?.cumplimiento).toBeCloseTo(0.5);
  });
});

describe('detalle por colaborador', () => {
  const rf = (gpoVdor: string, mesAno: string, material: string, importeFacturado: number, gpoCte = '15') => ({ gpoVdor, mesAno, material, gpoCte, importeFacturado });
  const sectorDe: Record<string, string> = { M1: 'ALGODÓN Y APLICADORES', M2: 'GASAS', M3: '' };
  const grupoDe: Record<string, string> = { M1: 'ALGODON PLISADO', M2: 'GASA SIMPLE', M3: '' };
  const resolver: ResolverDetalle = {
    ejecutivo: (c) => ({ '24': 'Ana' } as Record<string, string>)[c] ?? '',
    grupoCli: (c) => ({ '15': 'DISTRIBUIDOR', '19': 'HOSPITALES' } as Record<string, string>)[c] ?? c,
    ventas: () => ({}),
    sector: (m) => sectorDe[m] ?? '',
    grupo: (m) => grupoDe[m] ?? '',
  };
  const filas = [
    rf('24', '07/2026', 'M1', 100), rf('24', '07/2026', 'M1', 50), rf('24', '07/2026', 'M2', 200, '19'), rf('24', '08/2026', 'M1', 70), rf('24', '08/2026', 'M3', 30),
    rf('30', '07/2026', 'M1', 999), rf('', '07/2026', 'M1', 5),
  ];
  const idx = indexarVentasPorVdor(filas);
  const pto: PtoFila[] = [
    ['07/2026', 'N', 'G', '15', '24', 'ALGODÓN Y APLICADORE', 'ALGODON PLISADO', 400],
    ['07/2026', 'N', 'G', '19', '24', 'GASAS', 'GASA SIMPLE', 250],
    ['07/2026', 'N', 'G', '15', '24', 'CURACION', 'APOSITOS', 80],
    ['08/2026', 'N', 'G', '15', '24', 'ALGODÓN Y APLICADORE', 'ALGODON PLISADO', 300],
  ];

  it('indexa la venta por gpo. vendedor, suma lo repetido y descarta filas sin vendedor o con mes inválido', () => {
    expect([...idx.keys()].sort()).toEqual(['24', '30']);
    const v24 = idx.get('24')!;
    expect(v24.filter((v) => v.mes === '07/2026' && v.material === 'M1')).toEqual([{ mes: '07/2026', material: 'M1', gpoCte: '15', imp: 150 }]);
  });

  it('la venta de un colaborador suma EXACTO lo mismo que sus filas de Resumen_Fac (misma data que la gráfica)', () => {
    const total = idx.get('24')!.reduce((s, v) => s + v.imp, 0);
    expect(total).toBe(100 + 50 + 200 + 70 + 30);
  });

  it('lista de meses: venta y presupuesto por mes, con % de cumplimiento', () => {
    const m = mesesDeColaborador(idx.get('24')!, pto, mesKey('07/2026'), mesKey('08/2026'));
    expect(m.map((x) => [x.mes, x.ventas, x.presupuesto])).toEqual([['07/2026', 350, 730], ['08/2026', 100, 300]]);
    expect(m[0].cumplimiento).toBeCloseTo(350 / 730);
    expect(mesPorOmision(m)).toBe('08/2026');
    expect(mesesDeColaborador(idx.get('24')!, pto, mesKey('08/2026'), mesKey('08/2026')).map((x) => x.mes)).toEqual(['08/2026']);
  });

  it('desglose por sector: une el nombre recortado del presupuesto con el del catálogo y conserva solo-presupuesto / sin sector', () => {
    const d = desgloseColaborador(idx.get('24')!, pto, '07/2026', 'sector', resolver);
    const por = Object.fromEntries(d.map((x) => [x.clave, [x.ventas, x.presupuesto]]));
    expect(por['ALGODÓN Y APLICADORES']).toEqual([150, 400]); // «ALGODÓN Y APLICADORE» (presupuesto) se unió con el nombre completo
    expect(por.GASAS).toEqual([200, 250]);
    expect(por.CURACION).toEqual([0, 80]); // solo presupuesto: no se oculta
    expect(d[0].clave).toBe('ALGODÓN Y APLICADORES'); // ordenado por presupuesto
    const ago = desgloseColaborador(idx.get('24')!, pto, '08/2026', 'sector', resolver);
    expect(ago.find((x) => x.clave === '(sin sector)')).toMatchObject({ ventas: 30, presupuesto: 0 });
  });

  it('desglose por grupo de artículo', () => {
    const d = desgloseColaborador(idx.get('24')!, pto, '07/2026', 'grupo', resolver);
    expect(d.find((x) => x.clave === 'GASA SIMPLE')).toMatchObject({ ventas: 200, presupuesto: 250 });
  });

  it('los filtros de la página (grupo cliente, sector) acotan la venta del colaborador', () => {
    const solo = (col: string, ...values: string[]) => [{ col, values }];
    const hosp = filtrarVentasColab(idx.get('24')!, solo('grupocli', 'HOSPITALES'), resolver);
    expect(hosp.reduce((s, v) => s + v.imp, 0)).toBe(200);
    const gasas = filtrarVentasColab(idx.get('24')!, solo('sector', 'GASAS'), resolver);
    expect(gasas.every((v) => v.material === 'M2')).toBe(true);
    expect(filtrarVentasColab(idx.get('24')!, solo('material', 'M1'), resolver)).toHaveLength(idx.get('24')!.length); // material no aplica a este detalle
  });
});

describe('vista de «Cumplimiento por»: periodo / mes / acumulado', () => {
  const k = mesKey;
  it('periodo = la ventana de la página; mes = un solo mes; acumulado = enero de ese año hasta el mes elegido', () => {
    expect(rangoCumplimiento('periodo', k('08/2026'), k('01/2025'), k('12/2026'), null)).toEqual({ lo: k('01/2025'), hi: k('12/2026'), meses: null });
    expect(rangoCumplimiento('mes', k('08/2026'), k('01/2025'), k('12/2026'), null)).toEqual({ lo: k('08/2026'), hi: k('08/2026'), meses: null });
    expect(rangoCumplimiento('acum', k('08/2026'), k('01/2025'), k('12/2026'), null)).toEqual({ lo: k('01/2026'), hi: k('08/2026'), meses: null });
  });
  it('el acumulado no se sale de la ventana de la página y respeta la selección de meses', () => {
    const sel = new Set([k('03/2026'), k('05/2026')]);
    expect(rangoCumplimiento('acum', k('08/2026'), k('04/2026'), k('12/2026'), sel)).toEqual({ lo: k('04/2026'), hi: k('08/2026'), meses: sel });
  });
  it('sin mes elegido cae al periodo completo', () => {
    expect(rangoCumplimiento('mes', null, 10, 20, null)).toEqual({ lo: 10, hi: 20, meses: null });
  });
  it('meses disponibles: solo los que tienen venta o presupuesto; el de omisión es el último CON VENTA', () => {
    const serie = [{ mes: '06/2026', imp: 100 }, { mes: '07/2026', imp: 0 }, { mes: '08/2026', imp: 50 }];
    const pto: PtoFila[] = [['12/2026', 'N', 'G', '15', '24', 'S', 'GM', 500], ['07/2026', 'N', 'G', '15', '24', 'S', 'GM', 80]];
    const disp = mesesDisponibles(serie, pto, k('01/2026'), k('12/2026'), null);
    expect(disp).toEqual([k('06/2026'), k('07/2026'), k('08/2026'), k('12/2026')]);
    expect(mesElegidoPorOmision(serie, disp)).toBe(k('08/2026')); // diciembre solo tiene presupuesto: no es «el mes actual»
    expect(mesElegidoPorOmision([], [])).toBeNull();
  });
});

describe('cumplimiento por sector / grupo de artículo', () => {
  const resolver: ResolverDetalle = {
    ejecutivo: (c) => ({ '24': 'Ana', '30': 'Beto' } as Record<string, string>)[c] ?? '',
    grupoCli: (c) => c,
    ventas: () => ({}),
    sector: (m) => ({ M1: 'ALGODÓN Y APLICADORES', M2: 'GASAS' } as Record<string, string>)[m] ?? '',
    grupo: (m) => ({ M1: 'ALGODON PLISADO', M2: 'GASA SIMPLE' } as Record<string, string>)[m] ?? '',
  };
  const filas = [
    { gpoVdor: '24', mesAno: '07/2026', material: 'M1', gpoCte: '15', importeFacturado: 100 },
    { gpoVdor: '30', mesAno: '07/2026', material: 'M1', gpoCte: '15', importeFacturado: 50 },
    { gpoVdor: '30', mesAno: '07/2026', material: 'M2', gpoCte: '15', importeFacturado: 200 },
    { gpoVdor: '24', mesAno: '09/2026', material: 'M2', gpoCte: '15', importeFacturado: 999 },
  ];
  const indice = indexarVentasPorVdor(filas);
  const pto: PtoFila[] = [
    ['07/2026', 'N', 'G', '15', '24', 'ALGODÓN Y APLICADORE', 'ALGODON PLISADO', 400],
    ['07/2026', 'N', 'G', '15', '30', 'GASAS', 'GASA SIMPLE', 250],
    ['07/2026', 'N', 'G', '15', '30', 'CURACION', 'APOSITOS', 80],
  ];
  const lo = mesKey('07/2026'), hi = mesKey('07/2026');

  it('por sector: junta la venta de todos los colaboradores y une el nombre recortado del presupuesto', () => {
    const r = rankingSectorGrupo(indice, pto, 'sector', [], resolver, lo, hi);
    const por = Object.fromEntries(r.map((x) => [x.clave, [x.ventas, x.presupuesto]]));
    expect(por['ALGODÓN Y APLICADORES']).toEqual([150, 400]);
    expect(por.GASAS).toEqual([200, 250]);
    expect(por.CURACION).toEqual([0, 80]); // solo presupuesto
    expect(r[0].clave).toBe('ALGODÓN Y APLICADORES');
  });
  it('por grupo de artículo', () => {
    const r = rankingSectorGrupo(indice, pto, 'grupo', [], resolver, lo, hi);
    expect(r.find((x) => x.clave === 'GASA SIMPLE')).toMatchObject({ ventas: 200, presupuesto: 250 });
  });
  it('respeta la ventana (el mes de septiembre queda fuera) y los filtros de ejecutivo de la página', () => {
    const solo24 = rankingSectorGrupo(indice, [], 'sector', [{ col: 'ejecutivo', values: ['Ana'] }], resolver, lo, hi);
    expect(solo24).toEqual([{ clave: 'ALGODÓN Y APLICADORES', ventas: 100, presupuesto: 0, cumplimiento: null }]);
    const todoSep = rankingSectorGrupo(indice, [], 'sector', [], resolver, mesKey('09/2026'), mesKey('09/2026'));
    expect(todoSep[0]).toMatchObject({ clave: 'GASAS', ventas: 999 });
  });
  it('el filtro Gerente de marca (sectorPasa) acota la venta', () => {
    const r = rankingSectorGrupo(indice, [], 'sector', [], resolver, lo, hi, null, (s) => s === 'GASAS');
    expect(r.map((x) => x.clave)).toEqual(['GASAS']);
  });
});

describe('«Cumplimiento por»: ventas desde las filas filtradas de Resumen_Fac', () => {
  const rf = (mesAno: string, gpoVdor: string, gpoCte: string, importeFacturado: number, material = 'M1') => ({ mesAno, gpoVdor, gpoCte, importeFacturado, material });
  const pto: PtoFila[] = [['07/2026', 'SUR', 'G-SUR', '15', '40', 'SECTOR', 'GRUPO', 250]];
  const dims = dimensionesPorVendedor(rows, pto);

  it('las dimensiones de cada vendedor salen de las ventas y, si faltan, del presupuesto (gana la primera)', () => {
    expect(dims.get('24')).toEqual({ region: 'NORTE', gerencia: 'G-NORTE' });
    expect(dims.get('40')).toEqual({ region: 'SUR', gerencia: 'G-SUR' });
    expect(dimensionesPorVendedor([], pto).get('40')).toEqual({ region: 'SUR', gerencia: 'G-SUR' });
  });

  it('suma por mes × vendedor × grupo de cliente y pone región y gerencia del vendedor', () => {
    const out = ventasPtoDesdeRF([rf('07/2026', '24', '15', 100), rf('07/2026', '24', '15', 40, 'M2'), rf('07/2026', '24', '16', 5), rf('06/2026', '24', '15', 7)], dims);
    expect(out).toHaveLength(3);
    expect(out.find((x) => x.mes === '07/2026' && x.gpoCte === '15')).toMatchObject({ gpoVdor: '24', region: 'NORTE', gerencia: 'G-NORTE', ventas: 140, presupuesto: 0 });
  });

  it('un vendedor sin región conocida queda con región vacía (el ranking lo pone en «Sin dato»)', () => {
    const [x] = ventasPtoDesdeRF([rf('07/2026', '99', '15', 10)], dims);
    expect(x).toMatchObject({ region: '', gerencia: '' });
  });

  it('con menos filas (un filtro) el ranking baja; con todas coincide con el agregado de siempre', () => {
    const todas = [rf('07/2026', '24', '15', 150), rf('07/2026', '30', '15', 50), rf('07/2026', '40', '15', 300)];
    const rk = (filas: ReturnType<typeof rf>[]) => rankingCumplimiento(ventasPtoDesdeRF(filas, dims), rows.filter((x) => x.mes === '07/2026').map((x): PtoFila => [x.mes, x.region, x.gerencia, x.gpoCte, x.gpoVdor, '', '', x.presupuesto]), 'region', lo, hi);
    const norte = (l: ReturnType<typeof rk>) => l.find((x) => x.clave === 'NORTE')!;
    expect(norte(rk(todas)).ventas).toBe(200);
    expect(norte(rk(todas.filter((x) => x.gpoVdor !== '30'))).ventas).toBe(150); // p. ej. un filtro de material que deja fuera lo del vendedor 30
    expect(rk(todas).find((x) => x.clave === 'SUR')!.ventas).toBe(300);
  });
});
