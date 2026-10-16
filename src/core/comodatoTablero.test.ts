import { describe, expect, it } from 'vitest';
import {
  F, FILTROS_VACIOS, alcanceDe, comparacionDeFiltro, desplazarMeses, mesesEntre, periodoAtajo, aplicarFiltros, aplicarPeriodo, cubetaFrecuencia, deltaPct, diaISO, esCarrito, esComplemento, mesISO, normalizarSerie,
  periodInfo, serieAgg, sinComodato, sinFacturar, sumPeriods, tipoEq, trend3vs3, type Fila, type PuntoSerie,
} from './comodatoTablero';

const fila = (over: Fila): Fila => ({
  cliente: '100', razon_social: 'Cliente A', material_comodato: '1331100', descripcion_comodato: '65652-611 CANISTER 1000 CC PI', cantidad_comodato: 2,
  inversion_comodato: 1000, facturacion_total: 5000, margen_total: 2000, status_actividad: 'Activo', tendencia: 'Estable', rentable: 'Rentable',
  'Sin comodato asignado': 'No', Zona: '2', ...over,
});
const punto = (cliente: string, equipo: string, periodo: string, imp: number, bol = 0, mar = 0, pz = 0): PuntoSerie => ({
  cliente, codigo_equipo: equipo, periodo, importe_mes: imp, bolsas_mes: bol, margen_mes: mar, piezas_netas_mes: pz,
});

describe('fechas de DuckDB', () => {
  it('Date, milisegundos, días desde 1970 y texto', () => {
    expect(diaISO(new Date(Date.UTC(2026, 8, 18)))).toBe('2026-09-18');
    expect(diaISO(Date.UTC(2026, 8, 18))).toBe('2026-09-18');
    expect(diaISO(Date.UTC(2026, 8, 18) / 86_400_000)).toBe('2026-09-18');
    expect(diaISO('2026-09-18 00:00:00')).toBe('2026-09-18');
    expect(diaISO('18/09/2026')).toBe('2026-09-18');
    expect(diaISO(null)).toBe('');
    expect(mesISO('2026-09-18')).toBe('2026-09');
  });
});

describe('reglas de negocio', () => {
  it('placa y tubos son complementos; carro es carrito; el resto canister', () => {
    expect(esComplemento(fila({ material_comodato: '1331060' }))).toBe(true);
    expect(tipoEq(fila({ material_comodato: '1331160' }))).toBe('Complemento');
    expect(esCarrito(fila({ material_comodato: '1331070', descripcion_comodato: '65652-928 CARRO PARA 2 CANISTERS', status_actividad: 'Complementario' }))).toBe(true);
    expect(tipoEq(fila({}))).toBe('Canister');
  });
  it('sin comodato: usa la bandera del SQL y, sin ella, cantidad 0 con facturación', () => {
    expect(sinComodato(fila({ 'Sin comodato asignado': 'Sí' }))).toBe(true);
    expect(sinComodato(fila({ 'Sin comodato asignado': 'No' }))).toBe(false);
    expect(sinComodato({ cantidad_comodato: 0, facturacion_total: 10 })).toBe(true);
  });
  it('sin facturar: canister CON comodato y sin venta', () => {
    expect(sinFacturar(fila({ facturacion_total: 0 }))).toBe(true);
    expect(sinFacturar(fila({ facturacion_total: 0, 'Sin comodato asignado': 'Sí' }))).toBe(false);
    expect(sinFacturar(fila({ facturacion_total: 0, material_comodato: '1331060' }))).toBe(false);
  });
});

describe('filtros y periodo', () => {
  const rows = [fila({}), fila({ cliente: '200', razon_social: 'Cliente B', status_actividad: 'Inactivo', Zona: '101' })];
  it('filtra por status, zona (a 3 dígitos) y búsqueda', () => {
    expect(aplicarFiltros(rows, { ...FILTROS_VACIOS, status: 'Inactivo' })).toHaveLength(1);
    expect(aplicarFiltros(rows, { ...FILTROS_VACIOS, zona: '002' })).toHaveLength(1);
    expect(aplicarFiltros(rows, { ...FILTROS_VACIOS, q: 'cliente b' })[0]!.cliente).toBe('200');
  });
  it('con periodo recalcula facturación, margen, ROI y piezas solo con esos meses, y descarta las filas sin movimiento', () => {
    const serie = [punto('100', '1331100', '2026-01', 100, 10, 40, 1), punto('100', '1331100', '2026-02', 300, 30, 120, 1)];
    const r = aplicarPeriodo(rows, serie, '2026-02', '2026-02');
    expect(r).toHaveLength(1);
    expect(r[0]![F.fact]).toBe(300);
    expect(r[0]![F.margen]).toBe(120);
    expect(r[0]![F.roi]).toBeCloseTo(0.12);
    expect(r[0]![F.cant]).toBe(1);
    expect(aplicarPeriodo(rows, serie, '', '')).toHaveLength(2);
  });
});

describe('serie mensual', () => {
  const serie = [
    punto('100', '1331100', '2026-01', 100, 10, 40, 1), punto('100', '1331100', '2026-02', 200, 20, 80, 0),
    punto('200', '1331120', '2026-02', 50, 5, 20, 1), punto('100', '', '2026-03', 30, 3, 10, 0),
  ];
  it('agrupa por mes; respeta cliente, equipo, periodo y el alcance de los filtros', () => {
    expect(serieAgg(serie, { metric: 'importe' }).fac).toEqual([100, 250, 30]);
    expect(serieAgg(serie, { metric: 'bolsas', cliCod: '100' }).fac).toEqual([10, 20, 3]);
    expect(serieAgg(serie, { metric: 'importe', equipoCod: '1331120' }).labels).toEqual(['2026-02']);
    expect(serieAgg(serie, { metric: 'importe', pDesde: '2026-02' }).labels).toEqual(['2026-02', '2026-03']);
    const alcance = alcanceDe([fila({})]); // solo cliente 100 con 1331100 (y los puntos sin equipo del cliente 100)
    expect(serieAgg(serie, { metric: 'importe', alcance }).fac).toEqual([100, 200, 30]);
  });
  it('sumPeriods suma varios meses y cuenta clientes con actividad', () => {
    const s = sumPeriods(serie, ['2026-02'], alcanceDe([fila({}), fila({ cliente: '200', material_comodato: '1331120' })]));
    expect(s.fac).toBe(250);
    expect(s.clientes.size).toBe(2);
  });
  it('trend3vs3 excluye el mes en curso', () => {
    const s = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((p, i) => punto('100', '1331100', p, (i + 1) * 100));
    const t = trend3vs3(s, alcanceDe([fila({})]), new Date(2026, 5, 10))!; // hoy = junio: junio no cuenta
    expect(t.last3).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(t.prev3).toEqual(['2026-01', '2026-02']);
    expect(t.cur.fac).toBe(300 + 400 + 500);
  });
  it('normalizarSerie lee periodos de DuckDB', () => {
    const r = normalizarSerie([{ cliente: 100, codigo_equipo: '1331100', periodo: Date.UTC(2026, 8, 1), importe_mes: '12.5' }]);
    expect(r[0]).toMatchObject({ cliente: '100', periodo: '2026-09', importe_mes: 12.5, bolsas_mes: 0 });
  });
});

describe('comparativos', () => {
  it('periodInfo: mes y trimestre contra el mismo periodo del año anterior', () => {
    const hoy = new Date(2026, 4, 15); // mayo 2026
    expect(periodInfo('mes', 0, hoy)).toMatchObject({ curPeriods: ['2026-05'], yoyPeriods: ['2025-05'], label: 'Mayo 2026' });
    expect(periodInfo('mes', 5, hoy).curPeriods).toEqual(['2025-12']);
    expect(periodInfo('trimestre', 0, hoy)).toMatchObject({ curPeriods: ['2026-04', '2026-05', '2026-06'], yoyPeriods: ['2025-04', '2025-05', '2025-06'], label: 'T2 2026' });
    expect(periodInfo('trimestre', 1, hoy).label).toBe('T1 2026');
  });
  it('deltaPct', () => {
    expect(deltaPct(150, 100)).toEqual({ texto: '▲ +50%', tono: 'up' });
    expect(deltaPct(0, 100)).toEqual({ texto: '▼ −100%', tono: 'down' });
    expect(deltaPct(10, 0)).toEqual({ texto: '▲ nuevo', tono: 'up' });
    expect(deltaPct(0, 0).tono).toBe('flat');
    expect(deltaPct(101, 100).tono).toBe('flat');
  });
  it('cubetaFrecuencia', () => {
    expect([0, 1, 1.5, 2.5, 5, 9].map((n) => cubetaFrecuencia(n))).toEqual(['Un solo mes con venta', 'Mensual', '1–2m', '2–3m', '3–6m', '+6m']);
    expect(cubetaFrecuencia(0, false)).toBe('Sin compras');
  });
});

describe('periodos A vs B', () => {
  it('mesesEntre y desplazarMeses cruzan el cambio de año', () => {
    expect(mesesEntre('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(mesesEntre('2026-02', '2025-11')).toHaveLength(4);
    expect(desplazarMeses(['2026-01', '2026-02'], -12)).toEqual(['2025-01', '2025-02']);
    expect(desplazarMeses(['2026-01', '2026-02'], -2)).toEqual(['2025-11', '2025-12']);
  });
  it('comparacionDeFiltro: anterior de igual duración, año anterior y sin filtro', () => {
    const meses = ['2025-01', '2025-02', '2026-01', '2026-02', '2026-03'];
    expect(comparacionDeFiltro('previo', '2026-02', '2026-03', meses)).toEqual({ a: ['2026-02', '2026-03'], b: ['2025-12', '2026-01'] });
    expect(comparacionDeFiltro('anio', '2026-02', '2026-03', meses).b).toEqual(['2025-02', '2025-03']);
    expect(comparacionDeFiltro('anio', '', '', meses).a[0]).toBe('2025-01');
  });
});

describe('periodoAtajo', () => {
  const hoy = new Date(2026, 9, 15); // 15-oct-2026
  it('mes y trimestre', () => {
    expect(periodoAtajo('mes', 1, 'anio', hoy)).toMatchObject({ a: ['2026-09'], b: ['2025-09'] });
    expect(periodoAtajo('mes', 0, 'previo', hoy).b).toEqual(['2026-09']);
    expect(periodoAtajo('trimestre', 2, 'previo', hoy)).toMatchObject({ a: ['2026-04', '2026-05', '2026-06'], b: ['2026-01', '2026-02', '2026-03'] });
  });
  it('año: el actual va a la fecha y se compara con los mismos meses del anterior', () => {
    const r = periodoAtajo('anio', 0, 'previo', hoy);
    expect(r.a).toHaveLength(10);
    expect(r.b[0]).toBe('2025-01');
    expect(r.b).toHaveLength(10);
    expect(periodoAtajo('anio', 1, 'previo', hoy).a).toHaveLength(12);
  });
});
