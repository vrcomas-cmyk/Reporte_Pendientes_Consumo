// ---------------------------------------------------------------------------
// incremento.ts · Análisis de impacto comercial/financiero de un incremento
// de costos de proveedor (Sheet "Incremento de costos": Código, Costo
// Anterior/Nuevo por pieza y por caja) cruzado contra Resumen_Fac, catálogo
// de Materiales, ABC, inventario valorizado y pedidos pendientes.
//
// A diferencia de `abc.ts`/`comercial.ts`, la ventana de análisis NO es fija
// (no está anclada a `mesAnterior(hoyMes())`) — la elige el usuario en la UI
// (`PeriodoAnalisis`), porque el rango útil de historia cambia con cada
// incremento de proveedor. Toda magnitud "12M" de este módulo es en realidad
// "del periodo elegido"; se anualiza explícitamente (`*Anualizado`) solo
// donde hace falta comparar periodos de distinta longitud.
// ---------------------------------------------------------------------------
import { mesKey, type RFIndex, type Serie } from './resumenFac';
import { buildAnalisisPredicates, type AnalisisFilters } from './comercial';
import { normCode, type EnrichIndex } from './enrich';
import type { AbcClass, AbcResult } from './abc';
import type { BOItem } from './buildBO';
import type { RSSIndex } from './resumenSin';
import type { Material, IncrementoCostoRow } from './types';
import { norm, num } from '@/lib/text';

// ---- periodo -----------------------------------------------------------

export interface PeriodoAnalisis {
  desde: string; // "MM/AAAA"
  hasta: string; // "MM/AAAA"
  kIni: number;
  kFin: number;
  /** Meses completos en el rango (inclusive) — divisor de toda anualización. */
  meses: number;
}

export function buildPeriodo(desde: string, hasta: string): PeriodoAnalisis {
  const kIni = mesKey(desde);
  const kFin = mesKey(hasta);
  const meses = kIni && kFin && kFin >= kIni ? kFin - kIni + 1 : 0;
  return { desde, hasta, kIni, kFin, meses };
}

function sumPeriodo(serie: Serie, periodo: PeriodoAnalisis): { cant: number; imp: number } {
  let cant = 0;
  let imp = 0;
  for (const p of serie || []) {
    const k = mesKey(p.mes);
    if (k >= periodo.kIni && k <= periodo.kFin) {
      cant += p.cant;
      imp += p.imp;
    }
  }
  return { cant, imp };
}

// ---- tolerancias / umbrales --------------------------------------------

/** Tolerancia para marcar `caja-inconsistente`: si `costoAnteriorPieza ×
 * piezasUmvPorCaja` difiere del `Costo Anterior Caja` reportado en más de
 * este %, casi siempre es un error de captura o una caja con distinto
 * contenido al del catálogo — se marca para revisión manual, no se corrige
 * en automático. */
export const CAJA_TOLERANCIA = 0.05;

/** Umbrales de la clasificación 🟢 alta / 🟡 media / 🔴 baja rentabilidad
 * (ver punto 22 del análisis): margen NUEVO por debajo de `bajaMargen` es
 * rojo; por arriba de `altaMargen` y en clase ABC A/B es verde; el resto,
 * media. `⭐ estratégica` es una marca manual (no derivada), ver
 * `ImpactoSku.estrategico`. */
export const RENTABILIDAD_UMBRAL = { altaMargen: 0.25, bajaMargen: 0.10 } as const;

// ---- SKU -----------------------------------------------------------------

export type ImpactoFlag =
  | 'sin-venta-en-periodo'
  | 'costo-anterior-cero'
  | 'margen-negativo-nuevo'
  | 'caja-inconsistente'
  | 'sin-catalogo'
  | 'sin-precio-lista06';

export interface ImpactoSku {
  material: string;
  descripcion: string;
  sector: string;
  grupoArticulo: string;

  costoAnteriorPieza: number;
  costoNuevoPieza: number;
  costoAnteriorCaja: number;
  costoNuevoCaja: number;
  /** `costoNuevoPieza - costoAnteriorPieza`. */
  deltaAbs: number;
  /** `deltaAbs / costoAnteriorPieza` — 0 cuando el costo anterior es 0 (ver flag `costo-anterior-cero`). */
  deltaPct: number;

  /** Piezas/importe REALMENTE facturados dentro del periodo elegido (Resumen_Fac,
   * no "12 meses" fijo) — volumen histórico real, usado para dimensionar el
   * impacto en piezas/$ y para el peso de cada SKU en los promedios
   * ponderados. NO es la base de margen/utilidad (ver `precioLista06`). */
  cantidadPeriodo: number;
  importePeriodo: number;
  /** `importePeriodo / cantidadPeriodo` — precio neto históricamente cobrado.
   * Informativo (brecha vs. lista), NO es la base de margen/utilidad. */
  precioNeto: number;
  cantidadMensualProm: number;
  /** `cantidadMensualProm × 12` — para comparar impacto entre periodos de distinta longitud. */
  cantidadAnualizada: number;

  /** Precio de lista del catálogo (Material.lista02) — solo informativo. */
  precioLista: number;
  /** Precio de lista del catálogo (Material.lista06) — es la base de
   * comparación de venta/margen/utilidad/precio-requerido de todo este
   * módulo (decisión del negocio: comparar costo contra LISTA 06, no contra
   * el precio neto histórico). 0 cuando el material no está en catálogo o no
   * tiene LISTA 06 capturada — ver flag `sin-precio-lista06`. */
  precioLista06: number;
  /** `precioLista06 × cantidadPeriodo` — venta valorizada a LISTA 06 (no la
   * venta real facturada); denominador correcto para agregar margen % entre
   * SKUs de forma ponderada. */
  ventaListaPeriodo: number;
  /** `precioNeto / precioLista06 - 1` — qué tanto el neto históricamente
   * cobrado se desvía de LISTA 06 (0 si falta cualquiera de los dos). */
  brechaListaNeto: number;

  /** Margen sobre LISTA 06 con el costo anterior/nuevo — ver `precioLista06`. */
  margenActPct: number;
  margenNuePct: number;
  utilidadAct: number;
  utilidadNue: number;

  /** `deltaAbs × cantidadPeriodo` — lo que realmente representa el periodo elegido. */
  impactoPeriodo: number;
  /** `deltaAbs × cantidadAnualizada` — comparable entre SKUs/periodos de distinta longitud. */
  impactoAnualizado: number;

  /** Precio de venta necesario para sostener `margenActPct` con el costo nuevo. */
  precioRequerido: number;
  incrementoRequeridoPct: number;

  invPiezas: number;
  invImporte: number;
  /** Meses de inventario actual a la venta mensual promedio del periodo. */
  coberturaMeses: number;
  /** Utilidad temporal por inventario ya comprado al costo anterior. */
  colchonInventario: number;

  pedidoPendientePiezas: number;
  pedidoPendienteImporte: number;
  /** Venta ya pactada (pedidos pendientes) al costo anterior — riesgo si el precio no se ajustó. */
  riesgoPedidosPendientes: number;

  clase: AbcClass | undefined;
  /** Marca manual (no derivada) — reservado para un futuro toggle persistido
   * desde la UI; siempre `false` en este cálculo puro. */
  estrategico: boolean;

  flags: ImpactoFlag[];
}

// ---- agregados -------------------------------------------------------------

export interface ResumenImpacto {
  nSkus: number;
  ventaPeriodo: number;
  piezasPeriodo: number;
  /** Incremento % promedio ponderado por volumen (`Σ deltaPct×cant / Σ cant`), no el simple. */
  incrementoPromedioPonderado: number;
  impactoPeriodo: number;
  impactoAnualizado: number;
  margenActPct: number;
  margenNuePct: number;
  /** % que representa la venta de estos SKUs sobre la venta total del portafolio en el mismo periodo. */
  shareVentaPortafolio: number;
}

export interface GrupoImpacto {
  key: string;
  label: string;
  ventaPeriodo: number;
  piezasPeriodo: number;
  impactoPeriodo: number;
  nSkus: number;
}

export interface ClienteImpacto {
  key: string;
  razon: string;
  ejecutivo: string;
  /** Grupo de cliente (mismo eje que `comercial.ts`'s `grupoDe`) — se
   * muestra debajo del ejecutivo en la tabla de Clientes. */
  grupo: string;
  ventaPeriodo: number;
  piezasPeriodo: number;
  impactoPeriodo: number;
}

export interface Concentracion {
  top5: number;
  top10: number;
  total: number;
  nClientes: number;
}

export type RentabilidadClase = 'alta' | 'media' | 'baja' | 'estrategica';
export interface RentabilidadResumen {
  alta: number;
  media: number;
  baja: number;
  estrategica: number;
}

export interface IncrementoResult {
  periodo: PeriodoAnalisis;
  skus: ImpactoSku[];
  resumen: ResumenImpacto;
  porSector: GrupoImpacto[];
  porGrupoArticulo: GrupoImpacto[];
  porEjecutivo: GrupoImpacto[];
  /** Impacto agrupado por canal — el "Grupo de cliente" ya capturado en el
   * catálogo (Ejecutivos), reutilizado como eje de canal (gobierno,
   * hospitales, distribuidores, etc.) sin inventar un catálogo nuevo. */
  porCanal: GrupoImpacto[];
  clientes: ClienteImpacto[];
  concCliente: Concentracion;
  /** Un punto por mes del periodo (huecos rellenados con 0) — listo para `EvolChart`. */
  serieImpactoMensual: Serie;
  rentabilidadResumen: RentabilidadResumen;
  rentabilidadPorSku: Map<string, RentabilidadClase>;
}

const EMPTY_RESUMEN = (): ResumenImpacto => ({
  nSkus: 0, ventaPeriodo: 0, piezasPeriodo: 0, incrementoPromedioPonderado: 0,
  impactoPeriodo: 0, impactoAnualizado: 0, margenActPct: 0, margenNuePct: 0, shareVentaPortafolio: 0,
});

function emptyResult(periodo: PeriodoAnalisis): IncrementoResult {
  return {
    periodo, skus: [], resumen: EMPTY_RESUMEN(),
    porSector: [], porGrupoArticulo: [], porEjecutivo: [], porCanal: [], clientes: [],
    concCliente: { top5: 0, top10: 0, total: 0, nClientes: 0 },
    serieImpactoMensual: [], rentabilidadResumen: { alta: 0, media: 0, baja: 0, estrategica: 0 },
    rentabilidadPorSku: new Map(),
  };
}

export interface IncrementoContext {
  rf: RFIndex | null;
  enrich: EnrichIndex;
  abc: AbcResult;
  materiales: Material[];
  /** Inventario tomado del reporte "Inventario" (Resumen Sin Sugerencias) —
   * `RSSMaterial.sumaInv`, la misma cifra que muestra `/resumen-sin`. NO se
   * usa `InvConsolidado`/`Inventario por condición` aquí (decisión del
   * negocio: este módulo debe cuadrar con el reporte de Inventario). */
  rss: RSSIndex | null;
  bo: BOItem[];
}

function clasificarRentabilidad(sku: ImpactoSku): RentabilidadClase {
  if (sku.estrategico) return 'estrategica';
  if (sku.margenNuePct < RENTABILIDAD_UMBRAL.bajaMargen) return 'baja';
  if (sku.margenNuePct >= RENTABILIDAD_UMBRAL.altaMargen && (sku.clase === 'A' || sku.clase === 'B')) return 'alta';
  return 'media';
}

function groupBy(skus: ImpactoSku[], keyFn: (s: ImpactoSku) => string): GrupoImpacto[] {
  const map = new Map<string, GrupoImpacto>();
  for (const s of skus) {
    const key = keyFn(s) || '(sin dato)';
    let g = map.get(key);
    if (!g) {
      g = { key, label: key, ventaPeriodo: 0, piezasPeriodo: 0, impactoPeriodo: 0, nSkus: 0 };
      map.set(key, g);
    }
    g.ventaPeriodo += s.importePeriodo;
    g.piezasPeriodo += s.cantidadPeriodo;
    g.impactoPeriodo += s.impactoPeriodo;
    g.nSkus += 1;
  }
  return [...map.values()].sort((a, b) => Math.abs(b.impactoPeriodo) - Math.abs(a.impactoPeriodo));
}

/** Agrupa clientes (ya cruzados con ejecutivo/grupo en `buildClientes`) por
 * el eje que indique `keyFn` (ejecutivo, canal, ...) — `nSkus` aquí cuenta
 * clientes distintos, no SKUs (el eje de `GrupoImpacto` es genérico; el
 * label de la UI aclara cuál es cuál). */
function groupClientesPor(clientes: ClienteImpacto[], keyFn: (c: ClienteImpacto) => string, sinDatoLabel: string): GrupoImpacto[] {
  const map = new Map<string, GrupoImpacto>();
  for (const c of clientes) {
    const key = keyFn(c) || sinDatoLabel;
    let g = map.get(key);
    if (!g) {
      g = { key, label: key, ventaPeriodo: 0, piezasPeriodo: 0, impactoPeriodo: 0, nSkus: 0 };
      map.set(key, g);
    }
    g.ventaPeriodo += c.ventaPeriodo;
    g.piezasPeriodo += c.piezasPeriodo;
    g.impactoPeriodo += c.impactoPeriodo;
    g.nSkus += 1;
  }
  return [...map.values()].sort((a, b) => Math.abs(b.impactoPeriodo) - Math.abs(a.impactoPeriodo));
}

/** Cliente (solicitante) → venta/impacto dentro del periodo, para los SKUs
 * afectados. Escanea `rf.rows` una vez (no hay índice precomputado
 * material×cliente×periodo) — aceptable porque solo corre al abrir/():cambiar
 * el módulo, no en cada render. */
function buildClientes(
  skus: ImpactoSku[],
  rf: RFIndex | null,
  enrich: EnrichIndex,
  periodo: PeriodoAnalisis,
  clientePasa: (c: string) => boolean,
): ClienteImpacto[] {
  if (!rf) return [];
  const deltaByMat = new Map(skus.map((s) => [s.material, s.deltaAbs]));
  const acc = new Map<string, { razon: string; venta: number; piezas: number; impacto: number }>();
  for (const r of rf.rows) {
    const m = normCode(r.material);
    const delta = deltaByMat.get(m);
    if (delta === undefined) continue;
    const k = mesKey(norm(r.mesAno));
    if (k < periodo.kIni || k > periodo.kFin) continue;
    const s = norm(r.solicitante);
    if (!s || !clientePasa(s)) continue;
    let o = acc.get(s);
    if (!o) {
      o = { razon: norm(r.razonSocial), venta: 0, piezas: 0, impacto: 0 };
      acc.set(s, o);
    }
    const cant = num(r.cantidadFacturada);
    o.venta += num(r.importeFacturado);
    o.piezas += cant;
    o.impacto += delta * cant;
  }
  const out: ClienteImpacto[] = [];
  acc.forEach((o, key) => {
    out.push({
      key, razon: o.razon || rf.solicRazon.get(key) || key,
      ejecutivo: enrich.ejecutivoNombre(rf.solicGpoV.get(key) || '') || '',
      grupo: enrich.grupoCliente(rf.solicGpoC.get(key) || '') || rf.solicGpoC.get(key) || '',
      ventaPeriodo: o.venta, piezasPeriodo: o.piezas, impactoPeriodo: o.impacto,
    });
  });
  return out.sort((a, b) => Math.abs(b.impactoPeriodo) - Math.abs(a.impactoPeriodo));
}

function buildConcentracion(clientes: ClienteImpacto[]): Concentracion {
  const ordered = [...clientes].sort((a, b) => Math.abs(b.impactoPeriodo) - Math.abs(a.impactoPeriodo));
  const total = ordered.reduce((a, c) => a + Math.abs(c.impactoPeriodo), 0);
  const share = (n: number) => (total ? ordered.slice(0, n).reduce((a, c) => a + Math.abs(c.impactoPeriodo), 0) / total : 0);
  return { top5: share(5), top10: share(10), total, nClientes: ordered.length };
}

/** Impacto $ y piezas facturadas por mes del periodo, sumado sobre todos los
 * SKUs afectados — para el `EvolChart` del Resumen Ejecutivo. Rellena los
 * meses sin factura con 0 (no los omite), para no sugerir estacionalidad
 * falsa por huecos de datos. */
function buildSerieImpactoMensual(skus: ImpactoSku[], rf: RFIndex | null, periodo: PeriodoAnalisis): Serie {
  const out: Serie = [];
  if (!periodo.meses) return out;
  const deltaByMat = new Map(skus.map((s) => [s.material, s.deltaAbs]));
  const porMes = new Map<number, { cant: number; imp: number }>();
  if (rf) {
    for (const [material, delta] of deltaByMat) {
      const serie = rf.mat.get(material) || [];
      for (const p of serie) {
        const k = mesKey(p.mes);
        if (k < periodo.kIni || k > periodo.kFin) continue;
        const cur = porMes.get(k) || { cant: 0, imp: 0 };
        cur.cant += p.cant;
        cur.imp += delta * p.cant;
        porMes.set(k, cur);
      }
    }
  }
  for (let k = periodo.kIni; k <= periodo.kFin; k++) {
    const yy = Math.floor((k - 1) / 12);
    const mm = ((k - 1) % 12) + 1;
    const mes = String(mm).padStart(2, '0') + '/' + yy;
    const v = porMes.get(k) || { cant: 0, imp: 0 };
    out.push({ mes, cant: v.cant, imp: v.imp });
  }
  return out;
}

/**
 * Motor principal — puro, sin I/O. Cruza el Sheet de incremento de costos
 * contra Resumen_Fac (venta real dentro de `periodo`), el catálogo (costo
 * de referencia, piezas por caja, precio de lista), ABC, inventario
 * valorizado y pedidos pendientes.
 */
export function buildIncrementoImpacto(
  rows: IncrementoCostoRow[],
  ctx: IncrementoContext,
  periodo: PeriodoAnalisis,
  filters?: AnalisisFilters,
): IncrementoResult {
  if (!rows.length || !periodo.meses) return emptyResult(periodo);

  const { rf, enrich, abc, materiales, rss, bo } = ctx;

  const matCat = new Map<string, Material>();
  for (const m of materiales) {
    const k = normCode(m.material);
    if (k && !matCat.has(k)) matCat.set(k, m);
  }

  // Inventario desde el reporte "Inventario" (Resumen Sin Sugerencias) —
  // `RSSMaterial.sumaInv` ya es el total del material (no hay que sumarlo por
  // centro, `buildRSS` lo toma una sola vez de la hoja). Reindexado por
  // `normCode` (RSS indexa por `norm` crudo) para cruzar igual que el resto
  // de este módulo con "017"/"17" como el mismo material.
  const invByMat = new Map<string, number>();
  if (rss) {
    rss.mats.forEach((mo) => {
      const k = normCode(mo.material);
      if (!k) return;
      invByMat.set(k, (invByMat.get(k) || 0) + mo.sumaInv);
    });
  }

  const boByMat = new Map<string, { piezas: number; importe: number }>();
  for (const it of bo) {
    const k = normCode(it.bo.materialBase);
    if (!k) continue;
    const cur = boByMat.get(k) || { piezas: 0, importe: 0 };
    const cant = num(it.bo.cantidadPendiente);
    cur.piezas += cant;
    cur.importe += cant * num(it.bo.precio);
    boByMat.set(k, cur);
  }

  const { matPasa, clientePasa } = rf
    ? buildAnalisisPredicates(rf, enrich, filters)
    : { matPasa: () => true, clientePasa: () => true };

  const skus: ImpactoSku[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const k = normCode(row.material);
    if (!k || seen.has(k) || !matPasa(k)) continue;
    seen.add(k);

    const cat = matCat.get(k);
    const flags: ImpactoFlag[] = [];
    if (!cat) flags.push('sin-catalogo');

    const serie = rf ? rf.mat.get(k) || [] : [];
    const { cant: cantidadPeriodo, imp: importePeriodo } = sumPeriodo(serie, periodo);
    if (!cantidadPeriodo) flags.push('sin-venta-en-periodo');
    const precioNeto = cantidadPeriodo > 0 ? importePeriodo / cantidadPeriodo : 0;

    const deltaAbs = row.costoNuevoPieza - row.costoAnteriorPieza;
    const deltaPct = row.costoAnteriorPieza > 0 ? deltaAbs / row.costoAnteriorPieza : 0;
    if (!(row.costoAnteriorPieza > 0)) flags.push('costo-anterior-cero');

    const cantidadMensualProm = cantidadPeriodo / periodo.meses;
    const cantidadAnualizada = cantidadMensualProm * 12;

    const precioLista = cat?.lista02 ?? 0;
    const precioLista06 = cat?.lista06 ?? 0;
    if (cat && !(precioLista06 > 0)) flags.push('sin-precio-lista06');
    const ventaListaPeriodo = precioLista06 * cantidadPeriodo;
    const brechaListaNeto = precioLista06 > 0 && precioNeto > 0 ? precioNeto / precioLista06 - 1 : 0;

    // Base de margen/utilidad/precio-requerido: LISTA 06 del catálogo, NO el
    // precio neto histórico (decisión del negocio) — ver doc de `precioLista06`.
    const margenActPct = precioLista06 > 0 ? (precioLista06 - row.costoAnteriorPieza) / precioLista06 : 0;
    const margenNuePct = precioLista06 > 0 ? (precioLista06 - row.costoNuevoPieza) / precioLista06 : 0;
    if (precioLista06 > 0 && margenNuePct < 0) flags.push('margen-negativo-nuevo');

    const utilidadAct = (precioLista06 - row.costoAnteriorPieza) * cantidadPeriodo;
    const utilidadNue = (precioLista06 - row.costoNuevoPieza) * cantidadPeriodo;

    const impactoPeriodo = deltaAbs * cantidadPeriodo;
    const impactoAnualizado = deltaAbs * cantidadAnualizada;

    const precioRequerido = precioLista06 > 0 && margenActPct < 1 ? row.costoNuevoPieza / (1 - margenActPct) : 0;
    const incrementoRequeridoPct = precioLista06 > 0 && precioRequerido > 0 ? precioRequerido / precioLista06 - 1 : 0;

    const invPiezas = invByMat.get(k) || 0;
    const coberturaMeses = cantidadMensualProm > 0 ? invPiezas / cantidadMensualProm : 0;
    const colchonInventario = invPiezas * deltaAbs;
    // Valor del inventario a costo anterior — RSS no trae un $ de inventario
    // propio (a diferencia de InvConsolidado), así que se valoriza aquí.
    const invImporte = invPiezas * row.costoAnteriorPieza;

    const pend = boByMat.get(k) || { piezas: 0, importe: 0 };
    const riesgoPedidosPendientes = pend.piezas * deltaAbs;

    if (cat && cat.piezasUmvPorCaja > 0 && row.costoAnteriorPieza > 0 && row.costoAnteriorCaja > 0) {
      const esperado = row.costoAnteriorPieza * cat.piezasUmvPorCaja;
      if (Math.abs(esperado - row.costoAnteriorCaja) / row.costoAnteriorCaja > CAJA_TOLERANCIA) flags.push('caja-inconsistente');
    }

    skus.push({
      material: k,
      descripcion: row.descripcion || cat?.textoBreve || rf?.matTexto.get(k) || '',
      sector: row.sector || cat?.descrSector || '',
      grupoArticulo: row.grupoArticulo || cat?.descrGrupoArt || '',
      costoAnteriorPieza: row.costoAnteriorPieza, costoNuevoPieza: row.costoNuevoPieza,
      costoAnteriorCaja: row.costoAnteriorCaja, costoNuevoCaja: row.costoNuevoCaja,
      deltaAbs, deltaPct,
      cantidadPeriodo, importePeriodo, precioNeto, cantidadMensualProm, cantidadAnualizada,
      precioLista, precioLista06, ventaListaPeriodo, brechaListaNeto,
      margenActPct, margenNuePct, utilidadAct, utilidadNue,
      impactoPeriodo, impactoAnualizado,
      precioRequerido, incrementoRequeridoPct,
      invPiezas, invImporte, coberturaMeses, colchonInventario,
      pedidoPendientePiezas: pend.piezas, pedidoPendienteImporte: pend.importe, riesgoPedidosPendientes,
      clase: abc.classByMaterial.get(k),
      estrategico: false,
      flags,
    });
  }

  if (!skus.length) return emptyResult(periodo);

  // Orden canónico: mayor impacto financiero absoluto primero — es el orden
  // que ve cualquier consumidor de `impacto.skus` que no aplique su propio
  // sort (tabla de SKU antes de tocar un encabezado, pestañas de
  // Rentabilidad/Inventario/Pedidos, y las hojas del Excel exportado).
  skus.sort((a, b) => Math.abs(b.impactoPeriodo) - Math.abs(a.impactoPeriodo));

  const ventaPeriodo = skus.reduce((a, s) => a + s.importePeriodo, 0);
  const ventaListaPeriodoTotal = skus.reduce((a, s) => a + s.ventaListaPeriodo, 0);
  const piezasPeriodo = skus.reduce((a, s) => a + s.cantidadPeriodo, 0);
  const impactoPeriodo = skus.reduce((a, s) => a + s.impactoPeriodo, 0);
  const impactoAnualizado = skus.reduce((a, s) => a + s.impactoAnualizado, 0);
  const utilidadAct = skus.reduce((a, s) => a + s.utilidadAct, 0);
  const utilidadNue = skus.reduce((a, s) => a + s.utilidadNue, 0);
  const incrementoPromedioPonderado = piezasPeriodo > 0
    ? skus.reduce((a, s) => a + s.deltaPct * s.cantidadPeriodo, 0) / piezasPeriodo
    : 0;

  let ventaTotalPortafolio = 0;
  if (rf) {
    rf.mat.forEach((serie, m) => {
      if (!matPasa(m)) return;
      ventaTotalPortafolio += sumPeriodo(serie, periodo).imp;
    });
  }

  const resumen: ResumenImpacto = {
    nSkus: skus.length, ventaPeriodo, piezasPeriodo, incrementoPromedioPonderado,
    impactoPeriodo, impactoAnualizado,
    // Denominador = venta valorizada a LISTA 06 (misma base que margenActPct/
    // margenNuePct por SKU), no la venta real facturada — mezclar bases
    // distorsionaría el margen agregado.
    margenActPct: ventaListaPeriodoTotal > 0 ? utilidadAct / ventaListaPeriodoTotal : 0,
    margenNuePct: ventaListaPeriodoTotal > 0 ? utilidadNue / ventaListaPeriodoTotal : 0,
    shareVentaPortafolio: ventaTotalPortafolio > 0 ? ventaPeriodo / ventaTotalPortafolio : 0,
  };

  const clientes = buildClientes(skus, rf, enrich, periodo, clientePasa);
  const concCliente = buildConcentracion(clientes);
  const porEjecutivo = groupClientesPor(clientes, (c) => c.ejecutivo, '(sin ejecutivo)');
  const porCanal = groupClientesPor(clientes, (c) => c.grupo, '(sin canal)');

  const rentabilidadPorSku = new Map<string, RentabilidadClase>();
  const rentabilidadResumen: RentabilidadResumen = { alta: 0, media: 0, baja: 0, estrategica: 0 };
  for (const s of skus) {
    const clase = clasificarRentabilidad(s);
    rentabilidadPorSku.set(s.material, clase);
    rentabilidadResumen[clase] += 1;
  }

  return {
    periodo, skus, resumen,
    porSector: groupBy(skus, (s) => s.sector),
    porGrupoArticulo: groupBy(skus, (s) => s.grupoArticulo),
    porEjecutivo, porCanal,
    clientes, concCliente,
    serieImpactoMensual: buildSerieImpactoMensual(skus, rf, periodo),
    rentabilidadResumen, rentabilidadPorSku,
  };
}

// ---- escenarios ------------------------------------------------------------

export interface EscenarioInput {
  trasladoPct: number;
  perdidaVolPct: number;
}
export interface Escenario extends EscenarioInput {
  utilidad: number;
  deltaUtilidadVsActual: number;
}

// Misma base de precio que margenActPct/margenNuePct por SKU: LISTA 06, no
// el precio neto histórico — ver doc de `ImpactoSku.precioLista06`.
function utilidadActual(skus: ImpactoSku[]): number {
  return skus.reduce((a, s) => a + s.utilidadAct, 0);
}
function utilidadEscenario(skus: ImpactoSku[], trasladoPct: number, perdidaVolPct: number): number {
  const base = skus.reduce(
    (a, s) => a + (s.precioLista06 * (1 + trasladoPct) - s.costoNuevoPieza) * s.cantidadPeriodo,
    0,
  );
  return base * (1 - perdidaVolPct);
}

/** Matriz de sensibilidad traslado×pérdida de volumen — responde "qué pasa
 * si trasladamos X% y perdemos Y% de volumen", comparado contra la utilidad
 * actual (antes del incremento). */
export function buildEscenarios(skus: ImpactoSku[], grid: EscenarioInput[]): Escenario[] {
  const actual = utilidadActual(skus);
  return grid.map(({ trasladoPct, perdidaVolPct }) => {
    const utilidad = utilidadEscenario(skus, trasladoPct, perdidaVolPct);
    return { trasladoPct, perdidaVolPct, utilidad, deltaUtilidadVsActual: utilidad - actual };
  });
}

/** Redondea a 4 decimales (0.01%) antes de deduplicar — dos traslados que
 * deberían ser "el mismo" (p.ej. el promedio ponderado cae en 0.0300000004
 * por aritmética de punto flotante) no deben aparecer como dos filas
 * idénticas en la UI ("Escenarios de traslado" mostraba el mismo 3%/5% dos
 * veces antes de este fix). */
export const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** Grid por defecto: traslado 0/3/5%/incremento-promedio × pérdida de volumen
 * 0/5/10/15/20%, ambos ejes ascendentes y sin duplicados — `trasladoPromedioPct`
 * es `resumen.incrementoPromedioPonderado` y puede coincidir con 0/3/5% o caer
 * entre medio, así que no basta con concatenar: hay que redondear, deduplicar
 * Y ordenar (el valor calculado no necesariamente es mayor que 5%). */
export function defaultEscenarioGrid(trasladoPromedioPct: number): EscenarioInput[] {
  const traslados = [...new Set([0, 0.03, 0.05, trasladoPromedioPct].map((t) => round4(Math.max(0, t))))].sort((a, b) => a - b);
  const perdidas = [0, 0.05, 0.1, 0.15, 0.2];
  const out: EscenarioInput[] = [];
  for (const t of traslados) for (const v of perdidas) out.push({ trasladoPct: t, perdidaVolPct: v });
  return out;
}

/**
 * Máxima fracción de volumen (0-1) que se puede perder al trasladar
 * `trasladoPct` sin quedar por debajo de la utilidad actual — el "punto de
 * equilibrio" del punto 11 del análisis. `utilidadEscenario` es lineal en
 * `v` (factor `(1-v)` aplicado al total), así que se resuelve en forma
 * cerrada en vez de iterar un grid.
 */
export function puntoEquilibrio(skus: ImpactoSku[], trasladoPct: number): number {
  const actual = utilidadActual(skus);
  const base = utilidadEscenario(skus, trasladoPct, 0); // v=0 -> utilidad íntegra del escenario
  if (base <= 0) return 0; // ya pierde dinero sin perder ni un cliente
  if (actual <= 0) return 1; // cualquier volumen restante ya mejora la situación actual
  return Math.max(0, Math.min(1, 1 - actual / base));
}
