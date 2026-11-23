// ---------------------------------------------------------------------------
// ventasPto.ts · Ventas vs presupuesto a partir de `VentasPtoRow` (mes × región × gerencia × gpo. cliente × gpo. vendedor). Puro.
// ---------------------------------------------------------------------------
import type { PtoFila, VentasPtoRow } from './facturacionLibros';
import { norm } from '@/lib/text';
import { esMesValido, mesCanon, mesKey } from './resumenFac';

export type DimPto = 'general' | 'region' | 'gerencia' | 'gpoCte' | 'gpoVdor';

export const ETIQUETA_DIM_PTO: Record<DimPto, string> = {
  general: 'General',
  region: 'Región',
  gerencia: 'Gerencia de ventas',
  gpoCte: 'Gpo. cliente',
  gpoVdor: 'Gpo. vendedor',
};
export const ORDEN_DIM_PTO: readonly DimPto[] = ['general', 'region', 'gerencia', 'gpoCte', 'gpoVdor'];

export interface PuntoPto { mes: string; ventas: number; presupuesto: number }
export interface FilaRankingPto { clave: string; ventas: number; presupuesto: number; /** ventas ÷ presupuesto; null si no hay presupuesto. */ cumplimiento: number | null }

const SIN_DATO = '(sin dato)';
const valorDim = (r: VentasPtoRow, dim: Exclude<DimPto, 'general'>): string => String(r[dim] ?? '').trim() || SIN_DATO;
const enRango = (mes: string, lo: number, hi: number): boolean => {
  const m = mesCanon(mes);
  if (!esMesValido(m)) return false;
  const k = mesKey(m);
  return k >= lo && k <= hi;
};

/** Último mes ('mm/aaaa') con ventas o presupuesto; '' si no hay datos. */
export function ultimoMesPto(rows: readonly VentasPtoRow[]): string {
  let mejor = '';
  let kMejor = -Infinity;
  for (const r of rows) {
    const m = mesCanon(r.mes);
    if (!esMesValido(m)) continue;
    const k = mesKey(m);
    if (k > kMejor) { kMejor = k; mejor = m; }
  }
  return mejor;
}

/** Serie mensual de ventas y presupuesto; con `dim` y `valor` solo lo de esa región / gerencia / grupo. Un mes sin renglones no aparece. */
export function serieMensualPto(rows: readonly VentasPtoRow[], lo: number, hi: number, dim: DimPto = 'general', valor: string | null = null): PuntoPto[] {
  const mapa = new Map<string, PuntoPto>();
  for (const r of rows) {
    if (!enRango(r.mes, lo, hi)) continue;
    if (dim !== 'general' && valor != null && valorDim(r, dim) !== valor) continue;
    const mes = mesCanon(r.mes);
    const p = mapa.get(mes) ?? { mes, ventas: 0, presupuesto: 0 };
    p.ventas += r.ventas;
    p.presupuesto += r.presupuesto;
    mapa.set(mes, p);
  }
  return [...mapa.values()].sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
}

/** Ranking por región / gerencia / gpo. cliente / gpo. vendedor en el rango: ventas, presupuesto y % de cumplimiento. Ordena por presupuesto (y luego ventas). */
export function rankingPto(rows: readonly VentasPtoRow[], dim: Exclude<DimPto, 'general'>, lo: number, hi: number): FilaRankingPto[] {
  const mapa = new Map<string, { ventas: number; presupuesto: number }>();
  for (const r of rows) {
    if (!enRango(r.mes, lo, hi)) continue;
    const k = valorDim(r, dim);
    const a = mapa.get(k) ?? { ventas: 0, presupuesto: 0 };
    a.ventas += r.ventas;
    a.presupuesto += r.presupuesto;
    mapa.set(k, a);
  }
  return [...mapa].map(([clave, a]) => ({ clave, ...a, cumplimiento: a.presupuesto > 0 ? a.ventas / a.presupuesto : null }))
    .sort((x, y) => y.presupuesto - x.presupuesto || y.ventas - x.ventas || x.clave.localeCompare(y.clave));
}

/** Serie general con las VENTAS tomadas de la serie de la gráfica «Facturación mensual» (importe) y el presupuesto de `pto`: así las ventas de las dos
 * gráficas son idénticas (mismos filtros, mismo periodo). `meses` (selección de meses concretos) acota ambas; fuera de `lo..hi` no entra nada. */
export function combinarVentasConPresupuesto(ventas: readonly { mes: string; imp: number }[], pto: readonly PuntoPto[], lo: number, hi: number, meses: ReadonlySet<number> | null = null): PuntoPto[] {
  const dentro = (mes: string): boolean => {
    const m = mesCanon(mes);
    if (!esMesValido(m)) return false;
    const k = mesKey(m);
    return k >= lo && k <= hi && (!meses || meses.has(k));
  };
  const mapa = new Map<string, PuntoPto>();
  const fila = (mes: string): PuntoPto => {
    const m = mesCanon(mes);
    return mapa.get(m) ?? (mapa.set(m, { mes: m, ventas: 0, presupuesto: 0 }), mapa.get(m)!);
  };
  for (const v of ventas) if (dentro(v.mes)) fila(v.mes).ventas += v.imp;
  for (const p of pto) if (dentro(p.mes)) fila(p.mes).presupuesto += p.presupuesto;
  return [...mapa.values()].sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
}

/** Totales del rango (general o de un valor de la dimensión). */
export function totalPto(serie: readonly PuntoPto[]): { ventas: number; presupuesto: number; cumplimiento: number | null } {
  const ventas = serie.reduce((s, p) => s + p.ventas, 0);
  const presupuesto = serie.reduce((s, p) => s + p.presupuesto, 0);
  return { ventas, presupuesto, cumplimiento: presupuesto > 0 ? ventas / presupuesto : null };
}

// ---------------------------------------------------------------------------
// Filtros de la página aplicados al PRESUPUESTO.
// El presupuesto se fija por ejecutivo (gpo. vendedor) × sector/grupo de material × grupo de cliente, así que solo puede respetar los filtros que viven en
// esas dimensiones: Ejecutivo, Grupo cliente, Gerencia / Gerente / Canal / Oficina de ventas (todos salen del gpo. vendedor), Sector y Grupo de artículo.
// Cliente, material, centro, estado, ABC… no existen en el presupuesto: se reportan en `ignorados` para decírselo al usuario.
// ---------------------------------------------------------------------------

/** Mismo contrato que `ActiveFilter` del filtro por columna. */
export interface FiltroActivo { col: string; values: readonly string[] }

/** Cómo se muestra, en los filtros de la página, lo que el presupuesto trae como código (gpo. vendedor, gpo. cliente). */
export interface ResolverPto {
  ejecutivo: (gpoVdor: string) => string;
  grupoCli: (gpoCte: string) => string;
  ventas: (gpoVdor: string) => { gerenciaVentas?: string; gerenteVentas?: string; canalVentas?: string; oficinaVentas?: string };
}

/** Columnas de filtro de la página que el presupuesto sí puede respetar. */
export const COLS_FILTRO_PTO: ReadonlySet<string> = new Set(['ejecutivo', 'grupocli', 'gerenciaVentas', 'gerenteVentas', 'canalVentas', 'oficinaVentas', 'sector', 'grupoart']);

const limpiar = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** El presupuesto trae el sector / grupo recortado ("ALGODÓN Y APLICADORE") y el catálogo el nombre completo: coinciden si son iguales o uno es el inicio del otro (≥ 5 letras). */
export function nombreCoincide(a: string, b: string): boolean {
  const x = limpiar(a);
  const y = limpiar(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
  return corto.length >= 5 && largo.startsWith(corto);
}

interface Contexto { gpoVdor: string; gpoCte: string; sector?: string; grupoMat?: string }

function pasaFiltros(c: Contexto, activos: readonly FiltroActivo[], r: ResolverPto, sectorPasa?: (sector: string) => boolean): boolean {
  for (const f of activos) {
    if (!f.values.length || !COLS_FILTRO_PTO.has(f.col)) continue;
    let ok = true;
    switch (f.col) {
      case 'ejecutivo': ok = f.values.includes(r.ejecutivo(c.gpoVdor)); break;
      case 'grupocli': ok = f.values.includes(r.grupoCli(c.gpoCte)); break;
      case 'gerenciaVentas': ok = f.values.includes(r.ventas(c.gpoVdor).gerenciaVentas || 'Sin dato'); break;
      case 'gerenteVentas': ok = f.values.includes(r.ventas(c.gpoVdor).gerenteVentas || 'Sin dato'); break;
      case 'canalVentas': ok = f.values.includes(r.ventas(c.gpoVdor).canalVentas || 'Sin dato'); break;
      case 'oficinaVentas': ok = f.values.includes(r.ventas(c.gpoVdor).oficinaVentas || 'Sin dato'); break;
      // Las ventas no traen sector/grupo (salen del catálogo por material): ahí el filtro no aplica.
      case 'sector': if (c.sector !== undefined) ok = f.values.some((v) => nombreCoincide(v, c.sector!)); break;
      case 'grupoart': if (c.grupoMat !== undefined) ok = f.values.some((v) => nombreCoincide(v, c.grupoMat!)); break;
    }
    if (!ok) return false;
  }
  return !(sectorPasa && c.sector !== undefined && !sectorPasa(c.sector));
}

/** Presupuesto (detalle) que pasa los filtros activos de la página, más las etiquetas de los filtros que NO se pudieron aplicar. `sectorPasa` es el filtro «Gerente»
 * de la página (sector → gerente). */
export function filtrarPresupuestoDet(
  det: readonly PtoFila[],
  activos: readonly FiltroActivo[],
  r: ResolverPto,
  opciones: { sectorPasa?: (sector: string) => boolean; etiqueta?: (col: string) => string } = {},
): { filas: PtoFila[]; ignorados: string[] } {
  const ignorados = activos.filter((f) => f.values.length && !COLS_FILTRO_PTO.has(f.col)).map((f) => opciones.etiqueta?.(f.col) ?? f.col);
  const filas = det.filter((f) => pasaFiltros({ gpoVdor: f[4], gpoCte: f[3], sector: f[5], grupoMat: f[6] }, activos, r, opciones.sectorPasa));
  return { filas, ignorados };
}

/** Ventas (por región / gerencia / gpo.) que pasan los filtros que SÍ tienen (ejecutivo, grupo cliente, gerencia/canal/oficina de ventas). */
export function filtrarVentasPto(rows: readonly VentasPtoRow[], activos: readonly FiltroActivo[], r: ResolverPto): VentasPtoRow[] {
  return rows.filter((v) => pasaFiltros({ gpoVdor: v.gpoVdor, gpoCte: v.gpoCte }, activos, r));
}

/** Región y gerencia de ventas de cada gpo. vendedor: salen de las ventas y del presupuesto (las filas de Resumen_Fac no las traen). Gana la primera que aparece. */
export function dimensionesPorVendedor(ventas: readonly VentasPtoRow[], pto: readonly PtoFila[]): Map<string, { region: string; gerencia: string }> {
  const m = new Map<string, { region: string; gerencia: string }>();
  for (const v of ventas) if (!m.has(v.gpoVdor)) m.set(v.gpoVdor, { region: v.region, gerencia: v.gerencia });
  for (const f of pto) if (!m.has(f[4])) m.set(f[4], { region: f[1], gerencia: f[2] });
  return m;
}

/** Ventas por mes × gpo. vendedor × gpo. cliente a partir de filas de Resumen_Fac YA filtradas con TODOS los filtros de la página (material, estado, ABC, búsqueda, sector, grupo,
 * gerente…), con la forma que usa `rankingCumplimiento`. Sirve para que las ventas de «Cumplimiento por» sigan los mismos filtros que la gráfica y el resumen: `ventasPto`
 * (el agregado por región / gerencia) no tiene material y solo entiende los filtros de ejecutivo y grupo de cliente. */
export function ventasPtoDesdeRF(rows: readonly FilaVentaRF[], dimensiones: ReadonlyMap<string, { region: string; gerencia: string }>): VentasPtoRow[] {
  const acum = new Map<string, VentasPtoRow>();
  for (const r of rows) {
    const k = `${r.mesAno}¦${r.gpoVdor}¦${r.gpoCte}`;
    const e = acum.get(k);
    if (e) { e.ventas += r.importeFacturado || 0; continue; }
    const d = dimensiones.get(r.gpoVdor);
    acum.set(k, { mes: r.mesAno, region: d?.region ?? '', gerencia: d?.gerencia ?? '', gpoCte: r.gpoCte, gpoVdor: r.gpoVdor, ventas: r.importeFacturado || 0, presupuesto: 0 });
  }
  return [...acum.values()];
}

/** Presupuesto por mes (clave `mesKey`) dentro de `lo..hi` (y de `meses` si hay selección concreta). */
export function ptoPorMes(filas: readonly PtoFila[], lo: number, hi: number, meses: ReadonlySet<number> | null = null): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of filas) {
    const m = mesCanon(f[0]);
    if (!esMesValido(m)) continue;
    const k = mesKey(m);
    if (k < lo || k > hi || (meses && !meses.has(k))) continue;
    out.set(k, (out.get(k) ?? 0) + f[7]);
  }
  return out;
}

/** Ranking del cumplimiento por región / gerencia / gpo. cliente / gpo. vendedor: ventas (de `ventas`) contra presupuesto (de `pto`, ya filtrado). */
export function rankingCumplimiento(ventas: readonly VentasPtoRow[], pto: readonly PtoFila[], dim: Exclude<DimPto, 'general'>, lo: number, hi: number, meses: ReadonlySet<number> | null = null): FilaRankingPto[] {
  const idx = { region: 1, gerencia: 2, gpoCte: 3, gpoVdor: 4 }[dim];
  const mapa = new Map<string, { ventas: number; presupuesto: number }>();
  const dentro = (mes: string): boolean => {
    const m = mesCanon(mes);
    if (!esMesValido(m)) return false;
    const k = mesKey(m);
    return k >= lo && k <= hi && (!meses || meses.has(k));
  };
  const acum = (clave: string) => { const k = clave.trim() || SIN_DATO; const a = mapa.get(k) ?? { ventas: 0, presupuesto: 0 }; mapa.set(k, a); return a; };
  for (const v of ventas) if (dentro(v.mes)) acum(valorDim(v, dim)).ventas += v.ventas;
  for (const f of pto) if (dentro(f[0])) acum(f[idx] as string).presupuesto += f[7];
  return [...mapa].map(([clave, a]) => ({ clave, ...a, cumplimiento: a.presupuesto > 0 ? a.ventas / a.presupuesto : null }))
    .sort((x, y) => y.presupuesto - x.presupuesto || y.ventas - x.ventas || x.clave.localeCompare(y.clave));
}

// ---------------------------------------------------------------------------
// Detalle por COLABORADOR (gpo. vendedor): presupuesto y venta mes a mes, y el desglose de un mes por sector o por grupo de artículo.
// La venta sale de las filas de Resumen_Fac (cada una trae su gpo. vendedor, material y mes), así que es EXACTA y suma lo mismo que `ventasPto` del mismo gpo. vendedor;
// el sector / grupo se obtiene del catálogo por material. El presupuesto ya trae su sector y grupo de material (recortados), que se unen con `nombreCoincide`.
// ---------------------------------------------------------------------------

/** Venta de un colaborador: un mes × material × gpo. cliente (ya sumada). */
export interface VentaColab { mes: string; material: string; gpoCte: string; imp: number }

/** Lo mínimo que se necesita de una fila de Resumen_Fac. */
export interface FilaVentaRF { gpoVdor: string; material: string; mesAno: string; gpoCte: string; importeFacturado: number }

/** Venta agrupada por gpo. vendedor → [mes × material × gpo. cliente]. Una sola pasada sobre las filas; después cada colaborador se consulta sin recorrer nada más. */
export function indexarVentasPorVdor(rows: readonly FilaVentaRF[]): Map<string, VentaColab[]> {
  const porVdor = new Map<string, Map<string, VentaColab>>();
  for (const r of rows) {
    const vdor = norm(r.gpoVdor);
    const mes = mesCanon(r.mesAno);
    if (!vdor || !esMesValido(mes)) continue;
    let m = porVdor.get(vdor);
    if (!m) { m = new Map(); porVdor.set(vdor, m); }
    const material = norm(r.material);
    const gpoCte = norm(r.gpoCte);
    const k = `${mes}|${material}|${gpoCte}`;
    const e = m.get(k);
    if (e) e.imp += r.importeFacturado || 0;
    else m.set(k, { mes, material, gpoCte, imp: r.importeFacturado || 0 });
  }
  const out = new Map<string, VentaColab[]>();
  porVdor.forEach((m, v) => out.set(v, [...m.values()]));
  return out;
}

/** Cómo se muestran en los filtros el sector y el grupo de un material (del catálogo), además de lo que ya resuelve `ResolverPto`. */
export interface ResolverDetalle extends ResolverPto {
  sector: (material: string) => string;
  grupo: (material: string) => string;
}

/** Las ventas del colaborador que pasan los filtros de la página que existen a nivel de fila: Grupo cliente, Sector y Grupo de artículo. */
export function filtrarVentasColab(ventas: readonly VentaColab[], activos: readonly FiltroActivo[], r: ResolverDetalle): VentaColab[] {
  const con = (col: string) => activos.find((f) => f.col === col && f.values.length)?.values;
  const grupocli = con('grupocli'), sector = con('sector'), grupoart = con('grupoart');
  if (!grupocli && !sector && !grupoart) return [...ventas];
  return ventas.filter((v) => {
    if (grupocli && !grupocli.includes(r.grupoCli(v.gpoCte))) return false;
    if (sector && !sector.some((x) => x === (r.sector(v.material) || '(sin sector)'))) return false;
    if (grupoart && !grupoart.some((x) => x === (r.grupo(v.material) || '(sin grupo)'))) return false;
    return true;
  });
}

export interface FilaMesColab { mes: string; ventas: number; presupuesto: number; cumplimiento: number | null }

/** Una fila por mes (dentro de `lo..hi` y de `meses` si hay selección) con la venta y el presupuesto del colaborador. */
export function mesesDeColaborador(ventas: readonly VentaColab[], pto: readonly PtoFila[], lo: number, hi: number, meses: ReadonlySet<number> | null = null): FilaMesColab[] {
  const mapa = new Map<number, FilaMesColab>();
  const fila = (mes: string): FilaMesColab | null => {
    const m = mesCanon(mes);
    if (!esMesValido(m)) return null;
    const k = mesKey(m);
    if (k < lo || k > hi || (meses && !meses.has(k))) return null;
    let f = mapa.get(k);
    if (!f) { f = { mes: m, ventas: 0, presupuesto: 0, cumplimiento: null }; mapa.set(k, f); }
    return f;
  };
  for (const v of ventas) { const f = fila(v.mes); if (f) f.ventas += v.imp; }
  for (const p of pto) { const f = fila(p[0]); if (f) f.presupuesto += p[7]; }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([, f]) => ({ ...f, cumplimiento: f.presupuesto > 0 ? f.ventas / f.presupuesto : null }));
}

/** Mes que se muestra por omisión: el último con venta; si ninguno tiene, el último con presupuesto. */
export function mesPorOmision(filas: readonly FilaMesColab[]): string {
  for (let i = filas.length - 1; i >= 0; i--) if (filas[i].ventas !== 0) return filas[i].mes;
  return filas.length ? filas[filas.length - 1].mes : '';
}

export interface FilaDesglose { clave: string; ventas: number; presupuesto: number; cumplimiento: number | null }

/** Desglose de UN mes del colaborador por sector o por grupo de artículo. El presupuesto trae el nombre recortado: se une al nombre del catálogo con `nombreCoincide`;
 * lo que solo tiene presupuesto o solo tiene venta se conserva en su propia fila (nada se oculta). */
export function desgloseColaborador(ventas: readonly VentaColab[], pto: readonly PtoFila[], mes: string, por: 'sector' | 'grupo', r: ResolverDetalle): FilaDesglose[] {
  const k0 = mesKey(mesCanon(mes));
  const sinDato = por === 'sector' ? '(sin sector)' : '(sin grupo)';
  const mapa = new Map<string, { ventas: number; presupuesto: number }>();
  const acum = (clave: string) => { let a = mapa.get(clave); if (!a) { a = { ventas: 0, presupuesto: 0 }; mapa.set(clave, a); } return a; };
  for (const v of ventas) {
    if (mesKey(mesCanon(v.mes)) !== k0) continue;
    acum((por === 'sector' ? r.sector(v.material) : r.grupo(v.material)) || sinDato).ventas += v.imp;
  }
  const idx = por === 'sector' ? 5 : 6;
  const nombresVenta = [...mapa.keys()];
  for (const p of pto) {
    if (mesKey(mesCanon(p[0])) !== k0) continue;
    const nombre = String(p[idx] ?? '').trim() || sinDato;
    const destino = mapa.has(nombre) ? nombre : nombresVenta.find((n) => nombreCoincide(nombre, n)) ?? nombre;
    acum(destino).presupuesto += p[7];
  }
  return [...mapa].map(([clave, a]) => ({ clave, ...a, cumplimiento: a.presupuesto > 0 ? a.ventas / a.presupuesto : null }))
    .sort((x, y) => y.presupuesto - x.presupuesto || y.ventas - x.ventas || x.clave.localeCompare(y.clave));
}

// ---------------------------------------------------------------------------
// Sección «Cumplimiento por»: vista (Periodo / Mes / Acumulado) y desglose por Sector o Grupo de artículo.
// ---------------------------------------------------------------------------

/** Dimensiones del desglose de cumplimiento: las de la región/gerencia/grupos más Sector y Grupo de artículo (grupo de material). */
export type DimCumplimiento = 'region' | 'gerencia' | 'gpoCte' | 'gpoVdor' | 'sector' | 'grupo';
export const ORDEN_DIM_CUMPL: readonly DimCumplimiento[] = ['region', 'gerencia', 'gpoCte', 'gpoVdor', 'sector', 'grupo'];
export const ETIQUETA_DIM_CUMPL: Record<DimCumplimiento, string> = {
  region: 'Región', gerencia: 'Gerencia de ventas', gpoCte: 'Gpo. cliente', gpoVdor: 'Gpo. vendedor', sector: 'Sector', grupo: 'Grupo de artículo',
};

/** Cómo ver toda la sección: el periodo completo de la página, un solo mes, o el acumulado del año hasta un mes. */
export type ModoCumplimiento = 'periodo' | 'mes' | 'acum';

/** Ventana de meses que usa la sección según el modo. `k` es el mes elegido (escala `mesKey`) en «mes» y «acum»; el acumulado va de enero de ese año hasta `k`, sin salirse
 * de la ventana de la página (`lo`/`hi`) y respetando la selección concreta de meses (`meses`). */
export function rangoCumplimiento(modo: ModoCumplimiento, k: number | null, lo: number, hi: number, meses: ReadonlySet<number> | null): { lo: number; hi: number; meses: ReadonlySet<number> | null } {
  if (modo === 'periodo' || k == null) return { lo, hi, meses };
  if (modo === 'mes') return { lo: k, hi: k, meses: null };
  const ene = Math.floor((k - 1) / 12) * 12 + 1;
  return { lo: Math.max(lo, ene), hi: k, meses };
}

/** Meses (escala `mesKey`, ordenados) de la ventana que tienen venta o presupuesto: los que se pueden elegir. `ventasSerie` es la serie de importe de la gráfica. */
export function mesesDisponibles(ventasSerie: readonly { mes: string; imp: number }[], pto: readonly PtoFila[], lo: number, hi: number, meses: ReadonlySet<number> | null): number[] {
  const ks = new Set<number>();
  const meter = (mes: string, valor: number) => {
    const m = mesCanon(mes);
    if (!valor || !esMesValido(m)) return;
    const k = mesKey(m);
    if (k >= lo && k <= hi && (!meses || meses.has(k))) ks.add(k);
  };
  for (const v of ventasSerie) meter(v.mes, v.imp);
  for (const f of pto) meter(f[0], f[7]);
  return [...ks].sort((a, b) => a - b);
}

/** Mes por omisión: el último con VENTA (un mes futuro solo con presupuesto no es «el mes actual»); si ninguno tiene, el último disponible. */
export function mesElegidoPorOmision(ventasSerie: readonly { mes: string; imp: number }[], disponibles: readonly number[]): number | null {
  const conVenta = new Set<number>();
  for (const v of ventasSerie) { const m = mesCanon(v.mes); if (v.imp && esMesValido(m)) conVenta.add(mesKey(m)); }
  for (let i = disponibles.length - 1; i >= 0; i--) if (conVenta.has(disponibles[i])) return disponibles[i];
  return disponibles.length ? disponibles[disponibles.length - 1] : null;
}

/** Ranking por Sector o por Grupo de artículo: venta (de las filas de Resumen_Fac de TODOS los colaboradores, con los filtros de ejecutivo / grupo cliente / gerencia… que pasan,
 * más sector y grupo si los hay) contra el presupuesto ya filtrado. El presupuesto trae el nombre recortado: se une al del catálogo con `nombreCoincide`; lo que solo tiene
 * uno de los dos lados se conserva en su propia fila. */
export function rankingSectorGrupo(
  indice: ReadonlyMap<string, readonly VentaColab[]>,
  pto: readonly PtoFila[],
  por: 'sector' | 'grupo',
  activos: readonly FiltroActivo[],
  r: ResolverDetalle,
  lo: number,
  hi: number,
  meses: ReadonlySet<number> | null = null,
  sectorPasa?: (sector: string) => boolean,
): FilaRankingPto[] {
  const sinDato = por === 'sector' ? '(sin sector)' : '(sin grupo)';
  const dentro = (mes: string): boolean => {
    const m = mesCanon(mes);
    if (!esMesValido(m)) return false;
    const k = mesKey(m);
    return k >= lo && k <= hi && (!meses || meses.has(k));
  };
  const mapa = new Map<string, { ventas: number; presupuesto: number }>();
  const acum = (clave: string) => { let a = mapa.get(clave); if (!a) { a = { ventas: 0, presupuesto: 0 }; mapa.set(clave, a); } return a; };
  indice.forEach((lista, vdor) => {
    for (const v of lista) {
      if (!dentro(v.mes)) continue;
      const sector = r.sector(v.material) || '(sin sector)';
      const grupo = r.grupo(v.material) || '(sin grupo)';
      if (!pasaFiltros({ gpoVdor: vdor, gpoCte: v.gpoCte, sector, grupoMat: grupo }, activos, r, sectorPasa)) continue;
      acum(por === 'sector' ? sector : grupo).ventas += v.imp;
    }
  });
  const nombresVenta = [...mapa.keys()];
  const idx = por === 'sector' ? 5 : 6;
  for (const f of pto) {
    if (!dentro(f[0])) continue;
    const nombre = String(f[idx] ?? '').trim() || sinDato;
    acum(mapa.has(nombre) ? nombre : nombresVenta.find((n) => nombreCoincide(nombre, n)) ?? nombre).presupuesto += f[7];
  }
  return [...mapa].map(([clave, a]) => ({ clave, ...a, cumplimiento: a.presupuesto > 0 ? a.ventas / a.presupuesto : null }))
    .sort((x, y) => y.presupuesto - x.presupuesto || y.ventas - x.ventas || x.clave.localeCompare(y.clave));
}
