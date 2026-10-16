// ---------------------------------------------------------------------------
// comodatoTablero.ts · Lógica pura del tablero "Comodato (libros)": port de js/ (state.js, utils/domain.js, charts.js, comparativo.js) del proyecto
// Comodato_vs_Fac_Medivac. Trabaja sobre las tres vistas que devuelve el SQL: v_seguimiento_360 (filas), v_direccion_tendencia (serie mensual)
// y v_bolsas_resumen. Sin React ni DOM.
// ---------------------------------------------------------------------------

/** Nombres de columna de `v_seguimiento_360` (tal cual los entrega el SQL). */
export const F = {
  cliente: 'cliente', razon: 'razon_social', mat: 'material_comodato', desc: 'descripcion_comodato',
  cant: 'cantidad_comodato', inv: 'inversion_comodato', bolsas: 'bolsas_facturadas',
  fact: 'facturacion_total', margen: 'margen_total', bpc: 'bolsas_por_canister', mpc: 'margen_por_canister',
  ultFact: 'ultima_factura', ticket: 'ticket_prom_mensual', margenMes: 'margen_prom_mensual',
  roi: 'roi', dias: 'dias_sin_compra', tend: 'tendencia', status: 'status_actividad',
  rentable: 'rentable', recup: 'recuperable', accion: 'accion_sugerida',
  zona: 'Zona', ejec: 'Ejecutivo', grupo: 'Grupo de cliente',
  umFact: 'Ultimo mes de facturación', umFactCant: 'Cantidad ultimo mes de facturación', umFactImp: 'Importe facturación ultimo mes',
  pmFact: 'Penultimo mes de facturación', pmFactCant: 'Cantidad penultimo mes de facturación', pmFactImp: 'Importe facturación Penultimo mes',
  mesesFact: 'Cada cuantos meses se le factura',
  umComod: 'Ultima fecha de entrega de comodato', umComodCant: 'Cantidad ultima comodato',
  pmComod: 'Penultima fecha de entrega de comodato', pmComodCant: 'Cantidad penultima comodato',
  diasComod: 'Cada cuantos días se le entrega comodato', mesesComod: 'Cada cuantos meses se le entrega comodato',
  impMesAct: 'importe_mes_actual',
} as const;

export type Fila = Record<string, unknown>;

/** Un punto de `v_direccion_tendencia` ya normalizado: `periodo` = "aaaa-mm". */
export interface PuntoSerie {
  cliente: string;
  codigo_equipo: string;
  periodo: string;
  piezas_netas_mes: number;
  bolsas_mes: number;
  importe_mes: number;
  margen_mes: number;
}

// ---- utilidades de formato / lectura ---------------------------------------------------------------------------------------------------

export const num = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const x = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(x) ? 0 : x;
};
export const txt = (v: unknown): string => (v == null ? '' : String(v));

/** "aaaa-mm-dd" de lo que devuelva DuckDB para una fecha: Date, milisegundos (o días) desde 1970, o texto ISO / dd/mm/aaaa. */
export function diaISO(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    const ms = Math.abs(v) < 1e7 ? v * 86_400_000 : v; // días desde 1970 (DATE) o milisegundos (TIMESTAMP)
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}
/** "aaaa-mm" de una fecha de DuckDB (ver `diaISO`). */
export const mesISO = (v: unknown): string => diaISO(v).slice(0, 7);

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** "aaaa-mm" → "Ene 26". */
export function lblMes(p: string): string {
  const [y, mo] = p.split('-');
  return `${MESES_CORTOS[+(mo ?? 1) - 1] ?? ''} ${(y ?? '').slice(2)}`;
}
export const lblMesLargo = (y: number, m: number): string => `${MESES_LARGOS[m] ?? ''} ${y}`;

/** Zona a 3 dígitos ("2" → "002"). */
export function fmtZona(v: unknown): string {
  if (v == null || v === '') return '';
  const t = String(v).trim();
  return /^\d+$/.test(t) ? t.padStart(3, '0') : t;
}

// ---- reglas de negocio (utils/domain.js) ------------------------------------------------------------------------------------------------

/** Placa y tubos de vacío: complementos del carro y del canister. */
export const COMPLEMENTO_COD: readonly string[] = ['1331060', '1331160', '1331180', '1331200'];
export const esComplemento = (d: Fila): boolean => COMPLEMENTO_COD.includes(txt(d[F.mat]));
export const esCarrito = (d: Fila): boolean => !esComplemento(d) && (d[F.status] === 'Complementario' || txt(d[F.desc]).toUpperCase().includes('CARRO'));
export type TipoEquipo = 'Canister' | 'Carrito' | 'Complemento';
export const tipoEq = (d: Fila): TipoEquipo => (esComplemento(d) ? 'Complemento' : esCarrito(d) ? 'Carrito' : 'Canister');

/** Factura de bolsas SIN comodato asignado (la bandera viene del SQL; sin ella, cantidad 0 y facturación > 0). */
export function sinComodato(d: Fila): boolean {
  const f = d['Sin comodato asignado'];
  if (f != null && String(f).trim() !== '') return ['sí', 'si'].includes(String(f).trim().toLowerCase());
  return num(d[F.cant]) === 0 && num(d[F.fact]) > 0;
}
export const esCom = (d: Fila): boolean => !sinComodato(d);
/** Canister CON comodato y sin venta. */
export const sinFacturar = (d: Fila): boolean => !esCarrito(d) && !esComplemento(d) && !sinComodato(d) && num(d[F.fact]) === 0;
export const nCom = (rs: readonly Fila[]): number => rs.filter(esCom).length;
export const sumCant = (rs: readonly Fila[]): number => rs.reduce((a, d) => a + num(d[F.cant]), 0);

// ---- filtros (state.js) -----------------------------------------------------------------------------------------------------------------

export interface Filtros {
  cliente: string; q: string; status: string; tend: string; rent: string; equipo: string; recup: string; tipo: string;
  comod: '' | 'con' | 'sin'; ejec: string; zona: string; grupo: string; pDesde: string; pHasta: string;
}
export const FILTROS_VACIOS: Filtros = {
  cliente: '', q: '', status: '', tend: '', rent: '', equipo: '', recup: '', tipo: '', comod: '', ejec: '', zona: '', grupo: '', pDesde: '', pHasta: '',
};

export function aplicarFiltros(rows: readonly Fila[], f: Filtros): Fila[] {
  const q = f.q.toLowerCase();
  return rows.filter((d) => {
    if (f.cliente && d[F.razon] !== f.cliente) return false;
    if (q && !(`${txt(d[F.razon])} ${txt(d[F.cliente])}`.toLowerCase().includes(q))) return false;
    if (f.status && d[F.status] !== f.status) return false;
    if (f.tend && d[F.tend] !== f.tend) return false;
    if (f.rent && d[F.rentable] !== f.rent) return false;
    if (f.equipo && d[F.desc] !== f.equipo) return false;
    if (f.recup && d[F.recup] !== f.recup) return false;
    if (f.tipo && tipoEq(d) !== f.tipo) return false;
    if (f.ejec && d[F.ejec] !== f.ejec) return false;
    if (f.zona && fmtZona(d[F.zona]) !== f.zona) return false;
    if (f.grupo && d[F.grupo] !== f.grupo) return false;
    if (f.comod === 'con' && sinComodato(d)) return false;
    if (f.comod === 'sin' && !sinComodato(d)) return false;
    return true;
  });
}

export function mesesSerie(serie: readonly PuntoSerie[]): string[] {
  return [...new Set(serie.map((r) => r.periodo).filter((p) => /^\d{4}-\d{2}$/.test(p)))].sort();
}

/** Con un periodo elegido, recalcula facturación, bolsas, margen, piezas, ROI y por-canister de cada fila SOLO con los meses del periodo
 * (y descarta las filas sin movimiento en él). Sin periodo devuelve las filas tal cual. */
export function aplicarPeriodo(dataAll: readonly Fila[], serie: readonly PuntoSerie[], pDesde: string, pHasta: string): Fila[] {
  if (!pDesde && !pHasta) return [...dataAll];
  const lo = pDesde || '0000-00';
  const hi = pHasta || '9999-99';
  const agg = new Map<string, { fac: number; bol: number; mar: number; pz: number }>();
  for (const r of serie) {
    if (r.periodo < lo || r.periodo > hi) continue;
    const k = `${r.cliente}|${r.codigo_equipo}`;
    const a = agg.get(k) ?? { fac: 0, bol: 0, mar: 0, pz: 0 };
    a.fac += r.importe_mes; a.bol += r.bolsas_mes; a.mar += r.margen_mes; a.pz += r.piezas_netas_mes;
    agg.set(k, a);
  }
  const out: Fila[] = [];
  for (const d of dataAll) {
    const a = agg.get(`${txt(d[F.cliente])}|${txt(d[F.mat])}`);
    if (!a) continue;
    const inv = num(d[F.inv]);
    const cant = num(d[F.cant]);
    out.push({ ...d, [F.fact]: a.fac, [F.bolsas]: a.bol, [F.margen]: a.mar, [F.cant]: a.pz, [F.roi]: inv ? a.mar / inv : 0, [F.bpc]: cant ? a.bol / cant : 0, [F.mpc]: cant ? a.mar / cant : 0 });
  }
  return out;
}

export function ordenarFilas(rows: readonly Fila[], sort: string, dir: 1 | -1): Fila[] {
  return [...rows].sort((a, b) => {
    const x = a[sort];
    const y = b[sort];
    const nx = parseFloat(String(x).replace(/[^0-9.\-]/g, ''));
    const ny = parseFloat(String(y).replace(/[^0-9.\-]/g, ''));
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && /[0-9]/.test(String(x)) && /[0-9]/.test(String(y))) return (nx - ny) * dir;
    return txt(x).localeCompare(txt(y), 'es') * dir;
  });
}
export function contarPor(rows: readonly Fila[], k: string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of rows) { const v = txt(d[k]) || '—'; m[v] = (m[v] ?? 0) + 1; }
  return m;
}
export function sumarPor(rows: readonly Fila[], k: string, kv: string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of rows) { const g = txt(d[k]) || '—'; m[g] = (m[g] ?? 0) + num(d[kv]); }
  return m;
}
export function valoresUnicos(rows: readonly Fila[], k: string): string[] {
  return [...new Set(rows.map((d) => d[k]).filter((v) => v != null && v !== '').map(String))].sort();
}

// ---- serie mensual (charts.js / comparativo.js) -----------------------------------------------------------------------------------------

export type MetricaSerie = 'importe' | 'bolsas';

/** Claves cliente|equipo (y clientes) de las filas filtradas, para acotar la serie a lo que el usuario está viendo. */
export interface AlcanceSerie { claves: Set<string>; clientes: Set<string> }
export function alcanceDe(filtradas: readonly Fila[]): AlcanceSerie {
  return { claves: new Set(filtradas.map((d) => `${txt(d[F.cliente])}|${txt(d[F.mat])}`)), clientes: new Set(filtradas.map((d) => txt(d[F.cliente]))) };
}
const enAlcance = (r: PuntoSerie, a: AlcanceSerie): boolean => (r.codigo_equipo !== '' ? a.claves.has(`${r.cliente}|${r.codigo_equipo}`) : a.clientes.has(r.cliente));

export interface SerieMensual { labels: string[]; fac: number[]; com: number[] }
/** Facturación (importe o bolsas) y piezas de comodato por mes. `alcance` = respetar los filtros del tablero (solo en la vista General). */
export function serieAgg(serie: readonly PuntoSerie[], o: { cliCod?: string; equipoCod?: string; metric: MetricaSerie; alcance?: AlcanceSerie | null; pDesde?: string; pHasta?: string }): SerieMensual {
  const m = new Map<string, { fac: number; com: number }>();
  for (const r of serie) {
    if (o.cliCod && r.cliente !== o.cliCod) continue;
    if (o.equipoCod && r.codigo_equipo !== o.equipoCod) continue;
    if (o.alcance && !enAlcance(r, o.alcance)) continue;
    if (!/^\d{4}-\d{2}$/.test(r.periodo)) continue;
    if ((o.pDesde && r.periodo < o.pDesde) || (o.pHasta && r.periodo > o.pHasta)) continue;
    const a = m.get(r.periodo) ?? { fac: 0, com: 0 };
    a.fac += o.metric === 'bolsas' ? r.bolsas_mes : r.importe_mes;
    a.com += r.piezas_netas_mes;
    m.set(r.periodo, a);
  }
  const labels = [...m.keys()].sort();
  return { labels, fac: labels.map((l) => m.get(l)!.fac), com: labels.map((l) => m.get(l)!.com) };
}

export interface SumaPeriodos { fac: number; mar: number; bol: number; pz: number; clientes: Set<string> }
/** Suma importe / margen / bolsas / piezas de los periodos "aaaa-mm" dados, dentro del alcance de los filtros. */
export function sumPeriods(serie: readonly PuntoSerie[], periodos: readonly string[], alcance: AlcanceSerie | null): SumaPeriodos {
  const set = new Set(periodos);
  const out: SumaPeriodos = { fac: 0, mar: 0, bol: 0, pz: 0, clientes: new Set() };
  for (const r of serie) {
    if (!set.has(r.periodo) || (alcance && !enAlcance(r, alcance))) continue;
    if (r.importe_mes > 0 || r.bolsas_mes > 0) out.clientes.add(r.cliente);
    out.fac += r.importe_mes; out.mar += r.margen_mes; out.bol += r.bolsas_mes; out.pz += r.piezas_netas_mes;
  }
  return out;
}

const mesActual = (hoy: Date): string => `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
/** Meses de la serie que ya terminaron (sin el mes calendario en curso, aunque ya tenga datos parciales). */
export const mesesCompletos = (serie: readonly PuntoSerie[], hoy: Date = new Date()): string[] => mesesSerie(serie).filter((m) => m < mesActual(hoy));

export interface Tendencia3 { last3: string[]; prev3: string[]; cur: SumaPeriodos; prev: SumaPeriodos }
/** Últimos 3 meses completos contra los 3 anteriores. */
export function trend3vs3(serie: readonly PuntoSerie[], alcance: AlcanceSerie | null, hoy: Date = new Date()): Tendencia3 | null {
  const meses = mesesCompletos(serie, hoy);
  if (meses.length < 1) return null;
  const last3 = meses.slice(-3);
  const prev3 = meses.slice(-6, -3);
  return { last3, prev3, cur: sumPeriods(serie, last3, alcance), prev: sumPeriods(serie, prev3, alcance) };
}

const ym = (y: number, m: number): string => `${y}-${String(m + 1).padStart(2, '0')}`;
export interface InfoPeriodo { curPeriods: string[]; yoyPeriods: string[]; label: string; yoyLabel: string; sub: string }
/** Periodo (mes o trimestre) `offset` periodos atrás de hoy y el mismo periodo del año anterior. */
export function periodInfo(kind: 'mes' | 'trimestre', offset: number, hoy: Date = new Date()): InfoPeriodo {
  if (kind === 'trimestre') {
    const totalQ = hoy.getFullYear() * 4 + Math.floor(hoy.getMonth() / 3) - offset;
    const y = Math.floor(totalQ / 4);
    const q = totalQ - y * 4;
    const cur = [0, 1, 2].map((i) => ym(y, q * 3 + i));
    return { curPeriods: cur, yoyPeriods: [0, 1, 2].map((i) => ym(y - 1, q * 3 + i)), label: `T${q + 1} ${y}`, yoyLabel: `T${q + 1} ${y - 1}`, sub: `${lblMes(cur[0]!)} – ${lblMes(cur[2]!)}` };
  }
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - offset, 1);
  const y = d.getFullYear();
  const m = d.getMonth();
  return { curPeriods: [ym(y, m)], yoyPeriods: [ym(y - 1, m)], label: lblMesLargo(y, m), yoyLabel: lblMesLargo(y - 1, m), sub: '' };
}

export type TonoDelta = 'up' | 'down' | 'flat';
/** Variación de `act` contra `prev` para mostrar ("▲ +12%", "▲ nuevo", "▼ −100%"). */
export function deltaPct(act: unknown, prev: unknown): { texto: string; tono: TonoDelta } {
  const a = num(act);
  const p = num(prev);
  if (p === 0 && a === 0) return { texto: '—', tono: 'flat' };
  if (p === 0 && a > 0) return { texto: '▲ nuevo', tono: 'up' };
  if (a === 0 && p > 0) return { texto: '▼ −100%', tono: 'down' };
  const pc = Math.round(((a - p) / p) * 100);
  const tono: TonoDelta = pc > 4 ? 'up' : pc < -4 ? 'down' : 'flat';
  return { texto: `${pc > 4 ? '▲' : pc < -4 ? '▼' : '–'} ${pc > 0 ? '+' : ''}${pc}%`, tono };
}

// ---- gerencial ------------------------------------------------------------------------------------------------------------------------

/** Frecuencia de facturación (meses entre pedidos-mes) en cubetas. El SQL deja 0 cuando hay un solo mes con venta (no hay "entre qué y qué" medir). */
export function cubetaFrecuencia(v: unknown, tieneVenta = true): string {
  const n = num(v);
  if (n <= 0) return tieneVenta ? 'Un solo mes con venta' : 'Sin compras';
  if (n <= 1) return 'Mensual';
  if (n <= 2) return '1–2m';
  if (n <= 3) return '2–3m';
  if (n <= 6) return '3–6m';
  return '+6m';
}
export const ORDEN_FRECUENCIA = ['Mensual', '1–2m', '2–3m', '3–6m', '+6m', 'Un solo mes con venta', 'Sin compras'];

// ---- entrada ---------------------------------------------------------------------------------------------------------------------------

/** Normaliza lo que devuelve DuckDB: fechas a texto ISO y la serie a números. */
export function normalizarSeguimiento(rows: readonly Fila[]): Fila[] {
  return rows.map((r) => ({ ...r, [F.ultFact]: diaISO(r[F.ultFact]) }));
}
export function normalizarSerie(rows: readonly Fila[]): PuntoSerie[] {
  return rows.map((r) => ({
    cliente: txt(r.cliente),
    codigo_equipo: txt(r.codigo_equipo),
    periodo: mesISO(r.periodo),
    piezas_netas_mes: num(r.piezas_netas_mes),
    bolsas_mes: num(r.bolsas_mes),
    importe_mes: num(r.importe_mes),
    margen_mes: num(r.margen_mes),
  }));
}

// ---- periodos a comparar (A vs B) -----------------------------------------------------------------------------------------------------

const idxMes = (p: string): number => { const [y, m] = p.split('-'); return Number(y) * 12 + Number(m) - 1; };
const mesDeIdx = (i: number): string => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/** Todos los meses "aaaa-mm" entre dos (inclusive, calendario completo). Si desde > hasta se invierten. */
export function mesesEntre(desde: string, hasta: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) return [];
  const a = idxMes(desde);
  const b = idxMes(hasta);
  const out: string[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(mesDeIdx(i));
  return out;
}
/** Mismos meses desplazados `n` meses (−12 = un año antes). */
export const desplazarMeses = (periodos: readonly string[], n: number): string[] => periodos.map((p) => mesDeIdx(idxMes(p) + n));

/** Periodo A = el que se filtra en el tablero (o toda la serie si no hay filtro); B = el periodo anterior de igual duración o el mismo periodo del año anterior. */
export function comparacionDeFiltro(modoB: 'previo' | 'anio', pDesde: string, pHasta: string, meses: readonly string[]): { a: string[]; b: string[] } {
  const desde = pDesde || meses[0] || '';
  const hasta = pHasta || meses[meses.length - 1] || '';
  const a = mesesEntre(desde, hasta);
  return { a, b: modoB === 'anio' ? desplazarMeses(a, -12) : desplazarMeses(a, -a.length) };
}

export type KindAtajo = 'mes' | 'trimestre' | 'anio';
/** Atajo de periodo: el mes, trimestre o año (el año en curso va "a la fecha") desplazado `offset` unidades hacia atrás, contra el mismo periodo del año anterior o el periodo inmediato anterior. */
export function periodoAtajo(kind: KindAtajo, offset: number, modoB: 'previo' | 'anio', hoy: Date = new Date()): { a: string[]; b: string[]; label: string } {
  let a: string[];
  let label: string;
  if (kind === 'anio') {
    const y = hoy.getFullYear() - offset;
    const hasta = offset === 0 ? hoy.getMonth() + 1 : 12;
    a = Array.from({ length: hasta }, (_, i) => ym(y, i));
    label = offset === 0 ? `${y} (a la fecha)` : String(y);
  } else {
    const info = periodInfo(kind, offset, hoy);
    a = info.curPeriods;
    label = info.label;
  }
  const paso = kind === 'mes' ? 1 : kind === 'trimestre' ? 3 : 12;
  return { a, b: desplazarMeses(a, modoB === 'anio' ? -12 : -paso), label };
}
