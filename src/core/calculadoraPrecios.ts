// ---------------------------------------------------------------------------
// calculadoraPrecios.ts · Arma las filas de la página "Precios": por material, el
// precio base (punto medio P50, con respaldo del grupo / sector) y un precio de OFERTA por cada SEGMENTO de inventario con
// condición (LM / CC / CC+LM / PNC / LM+PNC / CC+PNC / CC+LM+PNC): las condiciones se
// apilan dentro del segmento y cada segmento tiene su propio descuento.
// Puro: la página le pasa los datos ya cargados. Ver `politicaPrecios.ts` para las reglas.
// ---------------------------------------------------------------------------
import { norm, num } from '@/lib/text';
import { esMesValido, mesCanon } from './resumenFac';
import type { ResumenFacRow } from './types';
import { claveMaterial, inicioDeDia, numero, sumarMeses } from './pedidos';
import { MESES_MAX_CORTA_CADUCIDAD } from './inventoryRules';
import type { DetalleLotesCondicion } from './invCondicionLibros';
import {
  calcularPrecioBase, calcularPrecioOferta, combinacionDe, paramsDeSector, percentilPonderado, resolverMargenMin, BANDERA_CC, BANDERA_PNC, MIN_PUNTOS_MATERIAL,
  type Bandera, type Politica, type PrecioBase, type PrecioOferta, type PuntoPrecio, type ReferenciaRazon,
} from './politicaPrecios';

/** Historial de precios facturados de un material: puntos ponderados por volumen y los extremos reales de las líneas. */
export interface HistorialPrecio { puntos: PuntoPrecio[]; min: number; max: number }

/** Resumen_Fac → historial por material (clave normalizada) de los meses indicados. Precio = importe / cantidad; mín/máx de las líneas si la fila los trae. */
export function historialDeFacturacion(rows: readonly ResumenFacRow[], meses: ReadonlySet<string>): Map<string, HistorialPrecio> {
  const out = new Map<string, HistorialPrecio>();
  for (const r of rows) {
    const cant = num(r.cantidadFacturada);
    const imp = num(r.importeFacturado);
    if (!(cant > 0) || !(imp > 0)) continue;
    const mes = mesCanon(r.mesAno);
    if (!esMesValido(mes) || !meses.has(mes)) continue;
    const mat = norm(r.material);
    if (!mat) continue;
    const u = imp / cant;
    const uMin = r.precioMin && r.precioMin > 0 ? r.precioMin : u;
    const uMax = r.precioMax && r.precioMax > 0 ? r.precioMax : u;
    const h = out.get(mat) ?? { puntos: [], min: Infinity, max: 0 };
    h.puntos.push({ valor: u, peso: cant });
    if (uMin < h.min) h.min = uMin;
    if (uMax > h.max) h.max = uMax;
    out.set(mat, h);
  }
  return out;
}

export interface MaterialPrecio {
  material: string;
  texto: string;
  sector: string;
  /** Grupo de artículos (para la referencia de mercado cuando el material casi no se vende y para reglas de margen mínimo). */
  grupo: string;
  costo: number;
  lista06?: number;
}

/** Un lote con existencia y su vencimiento (null = sin fecha). */
export interface LoteSeg { cantidad: number; vence: Date | null; /** Identidad del lote (centro|almacén|lote), para detectar lotes nuevos. */ id?: string }

/** Lo que el archivo y la app dicen de un material para repartirlo en segmentos de inventario. */
export interface EntradaSegmentos {
  /** Lotes de Corta caducidad (calculados en la app: 1032 y/o ≤ 12 meses), sin los de PNC. */
  lotesCc: readonly LoteSeg[];
  /** Lotes del PNC (del archivo) con su caducidad. */
  lotesPnc: readonly LoteSeg[];
  /** Libre real 1030+1031+1060. */
  libreGeneral: number;
  /** Status de Revision del material que el usuario marcó como incluidos (cada uno es una condición del archivo). */
  estados: readonly string[];
}

/** Un segmento de inventario con SU propio precio: las condiciones se apilan dentro del segmento. */
export interface Segmento {
  banderas: Bandera[];
  inventario: number;
  /** Meses de vigencia del lote que vence primero (solo si el segmento incluye CC). */
  mesesCc: number | null;
  /** Lotes (centro|almacén|lote) del segmento; vacío en los de solo Status (existencia general, sin lotes). */
  lotes: string[];
}

const MS_MES = 1000 * 60 * 60 * 24 * 30.44;
const mesesHasta = (f: Date, hoy: Date) => (f.getTime() - hoy.getTime()) / MS_MES;

/**
 * Reparte un material en segmentos de inventario; cada uno recibe su precio:
 *  · stock general (1030+1031+1060) de un material con Status incluidos → esos Status
 *  · lotes de Corta caducidad → CC (+ sus Status)
 *  · lotes PNC con vigencia > 12 m → PNC (+ sus Status); con vigencia ≤ 12 m → CC + PNC (+ sus Status)
 * Los Status vienen solo del archivo (pestaña Revision); sin stock general no hay fila de solo Status.
 */
export function segmentosDeMaterial(e: EntradaSegmentos, hoy: Date = new Date()): Segmento[] {
  const out: Segmento[] = [];
  const lm: Bandera[] = [...e.estados];
  if (lm.length && e.libreGeneral > 0) out.push({ banderas: lm, inventario: e.libreGeneral, mesesCc: null, lotes: [] });

  const limite = sumarMeses(inicioDeDia(hoy), MESES_MAX_CORTA_CADUCIDAD);
  const acumula = (lotes: readonly LoteSeg[], banderas: Bandera[]) => {
    let inv = 0;
    let meses: number | null = null;
    const ids: string[] = [];
    for (const l of lotes) {
      inv += l.cantidad;
      if (l.id) ids.push(l.id);
      if (l.vence) { const m = mesesHasta(l.vence, hoy); meses = meses == null ? m : Math.min(meses, m); }
    }
    if (inv > 0) out.push({ banderas, inventario: inv, mesesCc: banderas.includes(BANDERA_CC) ? meses : null, lotes: [...new Set(ids)].sort() });
  };

  acumula(e.lotesCc.filter((l) => l.cantidad > 0), [BANDERA_CC, ...lm]);
  const pnc = e.lotesPnc.filter((l) => l.cantidad > 0);
  acumula(pnc.filter((l) => l.vence !== null && l.vence.getTime() <= limite.getTime()), [BANDERA_CC, ...lm, BANDERA_PNC]);
  acumula(pnc.filter((l) => l.vence === null || l.vence.getTime() > limite.getTime()), [...lm, BANDERA_PNC]);
  return out;
}

/** Lotes del PNC (detalle de la hoja PNC: columnas "Cantidad" y "Caducidad" dd/mm/aaaa) por material. */
export function lotesPncDeDetalle(detalle: DetalleLotesCondicion | undefined): Map<string, LoteSeg[]> {
  const m = new Map<string, LoteSeg[]>();
  const iCant = detalle?.columnas.indexOf('Cantidad') ?? -1;
  const iCad = detalle?.columnas.indexOf('Caducidad') ?? -1;
  const iCentro = detalle?.columnas.indexOf('Centro') ?? -1;
  const iAlm = detalle?.columnas.indexOf('Almacén') ?? -1;
  const iLote = detalle?.columnas.indexOf('Lote') ?? -1;
  if (!detalle || iCant < 0) return m;
  for (const f of detalle.filas) {
    const cantidad = numero(f.celdas[iCant] ?? '');
    if (!(cantidad > 0)) continue;
    const t = iCad >= 0 ? (f.celdas[iCad] ?? '') : '';
    const g = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    const vence = g ? new Date(Number(g[3]), Number(g[2]) - 1, Number(g[1])) : null;
    const k = claveMaterial(f.material);
    const arr = m.get(k) ?? [];
    const id = iLote >= 0 ? `${f.celdas[iCentro] ?? f.centro}|${iAlm >= 0 ? f.celdas[iAlm] ?? '' : ''}|${f.celdas[iLote] ?? ''}` : undefined;
    arr.push({ cantidad, vence, ...(id ? { id } : {}) });
    m.set(k, arr);
  }
  return m;
}

export interface FilaOferta {
  material: string;
  texto: string;
  sector: string;
  grupo: string;
  costo: number;
  base: PrecioBase;
  /** Banderas aplicadas a esta fila de oferta (su segmento). */
  banderas: Bandera[];
  /** Existencias del segmento. */
  inventario: number;
  /** Meses de vigencia del lote que vence primero (solo si el segmento incluye CC). */
  mesesCc: number | null;
  /** Lotes (centro|almacén|lote) del segmento hoy. */
  lotes: string[];
  oferta: PrecioOferta | null;
}

/** Referencias de mercado por grupo de artículos y por sector: mediana ponderada de precio ÷ costo de todos sus materiales con historial. */
export function referenciasDeMercado(
  universo: readonly MaterialPrecio[],
  historial: ReadonlyMap<string, HistorialPrecio>,
): { grupo: Map<string, number>; sector: Map<string, number> } {
  const porGrupo = new Map<string, PuntoPrecio[]>();
  const porSector = new Map<string, PuntoPrecio[]>();
  for (const m of universo) {
    const h = historial.get(m.material);
    if (!h || !(m.costo > 0)) continue;
    for (const k of [[porGrupo, m.grupo], [porSector, m.sector]] as const) {
      if (!k[1]) continue;
      const arr = k[0].get(k[1]) ?? [];
      for (const p of h.puntos) arr.push({ valor: p.valor / m.costo, peso: p.peso });
      k[0].set(k[1], arr);
    }
  }
  const mediana = (m: Map<string, PuntoPrecio[]>) => new Map([...m].filter(([, pts]) => pts.length >= MIN_PUNTOS_MATERIAL).map(([k, pts]) => [k, percentilPonderado(pts, 0.5)] as const));
  return { grupo: mediana(porGrupo), sector: mediana(porSector) };
}

/** Recalcula la oferta de una fila con un margen mínimo decidido a mano para ese caso (o sin él). */
export function recalcularOferta(f: FilaOferta, pol: Politica, margenMinManual?: number | null): PrecioOferta | null {
  return calcularPrecioOferta({ base: f.base.base, costo: f.costo, sector: f.sector, banderas: f.banderas, mesesCc: f.mesesCc, material: f.material, grupo: f.grupo, margenMinManual }, pol);
}

export function filasCalculadora(
  materiales: readonly MaterialPrecio[],
  historial: ReadonlyMap<string, HistorialPrecio>,
  segmentos: ReadonlyMap<string, readonly Segmento[]>,
  pol: Politica,
  /** Todos los materiales con historial, para las referencias de grupo / sector (por defecto, solo `materiales`). */
  universo: readonly MaterialPrecio[] = materiales,
): FilaOferta[] {
  const refs = referenciasDeMercado(universo, historial);
  const out: FilaOferta[] = [];
  for (const m of materiales) {
    const segs = segmentos.get(m.material);
    if (!segs?.length) continue; // sin segmento con condición no hay nada que acelerar
    const h = historial.get(m.material);
    const rg = refs.grupo.get(m.grupo);
    const rs = refs.sector.get(m.sector);
    const ref: ReferenciaRazon | undefined = rg ? { razon: rg, origen: 'grupo' } : rs ? { razon: rs, origen: 'sector' } : undefined;
    // El margen mínimo del precio base también se puede decidir por material / grupo / sector.
    const params = { ...paramsDeSector(pol, m.sector) };
    const decidido = resolverMargenMin(pol, { material: m.material, grupo: m.grupo, sector: m.sector });
    if (decidido != null) params.margenMin = decidido;
    const base = calcularPrecioBase({ costo: m.costo, precios: h?.puntos ?? [], lista06: m.lista06, minReal: h?.min, maxReal: h?.max, ref }, params);
    for (const sg of segs) {
      const fila: FilaOferta = { material: m.material, texto: m.texto, sector: m.sector, grupo: m.grupo, costo: m.costo, base, banderas: sg.banderas, inventario: sg.inventario, mesesCc: sg.mesesCc, lotes: sg.lotes, oferta: null };
      fila.oferta = recalcularOferta(fila, pol);
      out.push(fila);
    }
  }
  return out;
}

/** Una combinación de condiciones encontrada en los datos, con cuántos materiales/existencias la tienen y el descuento que lleva hoy. */
export interface ResumenCombinacion {
  combinacion: string;
  materiales: number;
  inventario: number;
  /** % del margen que cede, mínimo y máximo entre sus segmentos (varía con la vigencia en las que llevan CC). */
  dtoMin: number;
  dtoMax: number;
  /** ¿Todos sus Status están marcados como incluidos? (CC y PNC siempre entran). */
  entra: boolean;
}

/** Todas las combinaciones que existen en los datos, con TODOS los Status de Revision considerados (incluidos o no), para que el usuario las vea
 * y decida. `entradas`: por material, con sus Status completos. */
export function combinacionesEncontradas(
  entradas: ReadonlyMap<string, EntradaSegmentos & { sector: string }>,
  pol: Politica,
  hoy: Date = new Date(),
): ResumenCombinacion[] {
  const acc = new Map<string, { mats: Set<string>; inv: number; min: number; max: number; entra: boolean }>();
  for (const [mat, e] of entradas) {
    for (const sg of segmentosDeMaterial(e, hoy)) {
      const comb = combinacionDe(sg.banderas);
      if (!comb) continue;
      const dto = calcularPrecioOferta({ base: 100, costo: 1, sector: e.sector, banderas: sg.banderas, mesesCc: sg.mesesCc }, pol)?.pctCede ?? 0;
      const a = acc.get(comb) ?? { mats: new Set<string>(), inv: 0, min: Infinity, max: 0, entra: sg.banderas.every((b) => b === BANDERA_CC || b === BANDERA_PNC || pol.condiciones[b]?.incluida === true) };
      a.mats.add(mat);
      a.inv += sg.inventario;
      a.min = Math.min(a.min, dto);
      a.max = Math.max(a.max, dto);
      acc.set(comb, a);
    }
  }
  return [...acc].map(([combinacion, a]) => ({ combinacion, materiales: a.mats.size, inventario: a.inv, dtoMin: a.min, dtoMax: a.max, entra: a.entra }))
    .sort((x, y) => x.combinacion.split(' + ').length - y.combinacion.split(' + ').length || x.combinacion.localeCompare(y.combinacion, 'es'));
}
