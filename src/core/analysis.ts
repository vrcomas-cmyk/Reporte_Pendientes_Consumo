import type {
  CatalogSnapshot,
  Sugerencia,
  ConsumoRow,
  ResumenFacRow,
  InvConsolidadoRow,
  InvDetalleRow,
  DashboardKpis,
  BloqueadoMotivo,
  TopMaterial,
  TopEjecutivo,
  MonthlyInvoicing,
  HeatmapCell,
  Inconsistency,
  AppSettings,
} from './types';
import { normCode, buildEnrich, type EnrichIndex } from './enrich';
import { evaluarCortaCaducidad } from './inventoryRules';
import { sinFuente } from './buildBO';

/** Normalizes a "Condición" value for matching between the daily report and
 *  the catalog (trim, deaccent, uppercase). */
const condKey = (c: string): string =>
  (c ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/**
 * The daily report's "Inventario por condicion" sheet carries no price
 * column; fall back to the catalog's InvConsolidado price for that material
 * when the crossed row's own price is missing/zero. Returns new row objects
 * (with precioOferta/importeInventario filled in) for rows that needed the
 * fallback; rows that already have a price are returned unchanged.
 *
 * `disponible31_30`/`disponible31_32` are ALWAYS overridden from the
 * catalog's InvConsolidado (never merged from the daily report), even when
 * the daily report's own value is present — the daily "Inventario por
 * Condición" sheet and the catalog "InvConsolidado" sheet are two different
 * reports with independent sync schedules, and these two columns are
 * expected to read literal from InvConsolidado (ver conversación con el
 * usuario 2026-09-02: "Debe de tomar solo los valores del reporte
 * InvConsolidado").
 *
 * A material can exist under several condiciones (e.g. distinct expiry
 * bands), each with its own "Precio Oferta"/"Disponible 1031-1030"/
 * "Disponible 1031-1032" in InvConsolidado, so both are keyed by
 * material+condición first; only when a row's exact condición isn't in the
 * catalog do we fall back to any value known for that material.
 *
 * Shared by the Dashboard KPI (computeKpis) and any view that renders
 * InvConsolidadoRow rows directly (e.g. Inventario por Condición), so both
 * surfaces resolve these fields identically.
 */
export function applyCatalogPriceFallback(
  rows: InvConsolidadoRow[],
  catalog: CatalogSnapshot | null,
): InvConsolidadoRow[] {
  if (!catalog) return rows;

  // Precio oferta / disponibles vienen del catálogo InvConsolidado (synced
  // from AppScript). Match first by material+condición so a material con
  // varias condiciones toma el valor de cada una; fall back a un valor a
  // nivel material (el primero > 0) cuando la condición exacta no está en el
  // catálogo. Keys use normCode (matches buildEnrich().matPrecioOferta:
  // leading zeros / trailing ".0" collapse).
  const priceByMatCond = new Map<string, number>();
  const priceByMat = new Map<string, number>();
  const disp3130ByMatCond = new Map<string, number>();
  const disp3130ByMat = new Map<string, number>();
  const disp3132ByMatCond = new Map<string, number>();
  const disp3132ByMat = new Map<string, number>();

  for (const r of catalog.invConsolidado) {
    const mk = normCode(r.material);
    const ck = `${mk}|${condKey(r.condicion)}`;
    if (r.precioOferta > 0) {
      if (!priceByMatCond.has(ck)) priceByMatCond.set(ck, r.precioOferta);
      if (!priceByMat.has(mk)) priceByMat.set(mk, r.precioOferta);
    }
    if (r.disponible31_30) {
      if (!disp3130ByMatCond.has(ck)) disp3130ByMatCond.set(ck, r.disponible31_30);
      if (!disp3130ByMat.has(mk)) disp3130ByMat.set(mk, r.disponible31_30);
    }
    if (r.disponible31_32) {
      if (!disp3132ByMatCond.has(ck)) disp3132ByMatCond.set(ck, r.disponible31_32);
      if (!disp3132ByMat.has(mk)) disp3132ByMat.set(mk, r.disponible31_32);
    }
  }

  return rows.map((r) => {
    const mk = normCode(r.material);
    const ck = `${mk}|${condKey(r.condicion)}`;
    const disponible31_30 = disp3130ByMatCond.get(ck) ?? disp3130ByMat.get(mk) ?? 0;
    const disponible31_32 = disp3132ByMatCond.get(ck) ?? disp3132ByMat.get(mk) ?? 0;
    const price = r.precioOferta > 0 ? r.precioOferta : (priceByMatCond.get(ck) ?? priceByMat.get(mk) ?? 0);

    if (price === r.precioOferta && disponible31_30 === r.disponible31_30 && disponible31_32 === r.disponible31_32) {
      return r;
    }

    return {
      ...r,
      precioOferta: price,
      importeInventario: price * r.invSuma,
      disponible31_30,
      disponible31_32,
    };
  });
}

/**
 * Crosses the daily report against the cached catalog and computes every
 * dashboard-facing aggregate. Pure function — no I/O — so it can run either
 * inside the web worker or in tests.
 */
export function computeKpis(params: {
  catalog: CatalogSnapshot | null;
  sugerencias: Sugerencia[];
  consumo: ConsumoRow[];
  invConsolidado: InvConsolidadoRow[];
  lotesCortaCaducidad: InvDetalleRow[];
  settings: Pick<AppSettings, 'shortExpiryDays' | 'lowStockThreshold'>;
}): DashboardKpis {
  const { catalog, sugerencias, consumo, invConsolidado, lotesCortaCaducidad, settings } = params;

  const materialesAnalizados = new Set(sugerencias.map((s) => s.materialBase || s.materialSolicitado)).size;
  // An ejecutivo can appear once per Canal Ventas in the sync sheet, so count
  // distinct ejecutivo identities (not distinct ejecutivo+canal rows).
  const ejecutivosCount = catalog
    ? new Set(catalog.ejecutivos.map((e) => (e.ejecutivo || '').trim().toUpperCase()).filter(Boolean)).size
    : 0;

  const productosSinConsumo = consumo.filter((c) => c.consumoActual <= 0 && c.consumoPromedioMensual <= 0).length;

  // RN-INV-001: <=12 meses O almacén 1032 — regla fija, no usa
  // settings.shortExpiryDays (legado, ver inventoryRules.ts).
  const today = new Date();
  const productosCortaCaducidad = lotesCortaCaducidad.filter(
    (l) => evaluarCortaCaducidad(l.fechaCaducidad, l.almacen, today).esCortaCaducidad,
  ).length;

  const productosLentoMovimiento = consumo.filter(
    (c) => c.consumoPromedioMensual > 0 && c.consumoPromedioMensual < settings.lowStockThreshold,
  ).length;

  const inventarioTotal = invConsolidado.reduce((acc, r) => acc + r.invSuma, 0);
  const invConsolidadoConPrecio = applyCatalogPriceFallback(invConsolidado, catalog);
  const valorEconomico = invConsolidadoConPrecio.reduce((acc, r) => acc + r.precioOferta * r.invSuma, 0);

  const { count: bloqueadosCount, importeTotal: bloqueadosImportePendiente, porMotivo: bloqueadosPorMotivo } =
    computeBloqueados(sugerencias);

  return {
    materialesAnalizados,
    ejecutivosCount,
    productosSinConsumo,
    productosCortaCaducidad,
    productosLentoMovimiento,
    inventarioTotal,
    valorEconomico,
    bloqueadosImportePendiente,
    bloqueadosCount,
    bloqueadosPorMotivo,
  };
}

/** Groups pending-amount by the real `bloqueado` reason on the sheet
 * ("Detenido", "Crédito", "Detenido por ambos", …) instead of collapsing it
 * to a yes/no flag — "cuánto dinero está detenido y por qué" is the question
 * a bare count/boolean can't answer. Sorted by importe descending. */
export function computeBloqueados(sugerencias: Sugerencia[]): { count: number; importeTotal: number; porMotivo: BloqueadoMotivo[] } {
  const byMotivo = new Map<string, BloqueadoMotivo>();
  let count = 0;
  let importeTotal = 0;
  // Las filas con fuente son abasto alterno sugerido, no demanda adicional —
  // sumarlas también multiplicaría el importe bloqueado por 1+N fuentes.
  for (const s of sugerencias.filter(sinFuente)) {
    const motivo = (s.bloqueado || '').trim();
    if (!motivo) continue;
    const imp = s.cantidadPendiente * s.precio;
    count += 1;
    importeTotal += imp;
    const cur = byMotivo.get(motivo) ?? { motivo, count: 0, importePendiente: 0 };
    cur.count += 1;
    cur.importePendiente += imp;
    byMotivo.set(motivo, cur);
  }
  const porMotivo = [...byMotivo.values()].sort((a, b) => b.importePendiente - a.importePendiente);
  return { count, importeTotal, porMotivo };
}

export function topMateriales(sugerencias: Sugerencia[], n = 5): TopMaterial[] {
  const byMat = new Map<string, TopMaterial>();
  // Ver comentario de `computeBloqueados`: excluir filas con fuente para no
  // multiplicar pendiente/importe por cada fuente alterna del mismo pedido.
  for (const s of sugerencias.filter(sinFuente)) {
    const key = s.materialBase || s.materialSolicitado;
    if (!key) continue;
    const cur = byMat.get(key) ?? {
      material: key,
      descripcion: s.descripcionSolicitada,
      cantidadPendiente: 0,
      importePendiente: 0,
    };
    cur.cantidadPendiente += s.cantidadPendiente;
    cur.importePendiente += s.cantidadPendiente * s.precio;
    byMat.set(key, cur);
  }
  return [...byMat.values()].sort((a, b) => b.importePendiente - a.importePendiente).slice(0, n);
}

/** `n` caps the result (e.g. for a "top 5" chart) — pass `Infinity` (or omit
 * and slice yourself) to get every catalog executive, including those with
 * zero pending amount, instead of only whoever happens to have sugerencias. */
export function topEjecutivos(sugerencias: Sugerencia[], catalog: CatalogSnapshot | null, n: number = Infinity): TopEjecutivo[] {
  // Resuelve el ejecutivo con el MISMO índice que usa el resto de la app
  // (Consumo/Sugerencias vía consumoEnrich().ejec() -> enrich.ejecutivoNombre(gpoVdor)) —
  // antes esta función reconstruía su propio join a mano, con dos bugs que
  // dejaban ejecutivos reales en 0: (1) los mapas usaban last-write-wins en
  // vez del first-wins de `buildEnrich` (el último ejecutivo del catálogo con
  // una clave repetida se quedaba con todo el importe), y (2) priorizaba
  // `gpoCte` (grupo *cliente*) sobre `gpoVdor` (grupo *vendedor*, el campo
  // correcto para identificar al ejecutivo).
  const enrich = buildEnrich(catalog);
  const byEjec = new Map<string, TopEjecutivo>();
  if (catalog) {
    for (const e of catalog.ejecutivos) {
      const nombre = (e.ejecutivo || '').trim();
      if (!nombre) continue;
      // Seed every real catalog executive at 0 up front, so one with no
      // sugerencias this cycle still shows up (at 0) instead of silently
      // disappearing from the list — no venta isn't the same as "doesn't exist".
      if (!byEjec.has(nombre)) byEjec.set(nombre, { ejecutivo: nombre, cantidadPendiente: 0, importePendiente: 0, pedidos: 0 });
    }
  }
  // Ver comentario de `computeBloqueados`: excluir filas con fuente para no
  // multiplicar pendiente/importe/conteo de pedidos por cada fuente alterna.
  for (const s of sugerencias.filter(sinFuente)) {
    // Never fall back to the raw gpoVdor code as a pseudo-name — an
    // unmatched code isn't a distinct executive, it's a join miss, and
    // showing it as one inflates the list with duplicates of names that
    // just didn't match. Bucket those under "Sin asignar" instead.
    const ejecutivo = enrich.ejecutivoNombre(s.gpoVdor) || 'Sin asignar';
    const cur = byEjec.get(ejecutivo) ?? { ejecutivo, cantidadPendiente: 0, importePendiente: 0, pedidos: 0 };
    cur.cantidadPendiente += s.cantidadPendiente;
    cur.importePendiente += s.cantidadPendiente * s.precio;
    cur.pedidos += 1;
    byEjec.set(ejecutivo, cur);
  }
  return [...byEjec.values()].sort((a, b) => b.importePendiente - a.importePendiente).slice(0, n);
}

export function monthlyInvoicing(rows: ResumenFacRow[]): MonthlyInvoicing[] {
  const byMonth = new Map<string, MonthlyInvoicing>();
  for (const r of rows) {
    if (!r.mesAno) continue;
    const cur = byMonth.get(r.mesAno) ?? { mes: r.mesAno, importe: 0, cantidad: 0 };
    cur.importe += r.importeFacturado;
    cur.cantidad += r.cantidadFacturada;
    byMonth.set(r.mesAno, cur);
  }
  return [...byMonth.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Simple heatmap: rows = sector, cols = center, value = summed inventory.
 * `enrich` es opcional — cuando viene, resuelve el sector por material igual
 * que InventarioPage (`enrich.matSector(material) || r.sector`), para el caso
 * en que la hoja de inventario diario no trae columna "Sector" propia. */
export function buildHeatmap(invConsolidado: InvConsolidadoRow[], enrich?: EnrichIndex): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();
  for (const r of invConsolidado) {
    const rowKey = (enrich && enrich.matSector(r.material)) || r.sector || 'Sin sector';
    for (const [center, qty] of Object.entries(r.invByCenter)) {
      const key = `${rowKey}::${center}`;
      const cur = cells.get(key) ?? { rowKey, colKey: center, value: 0 };
      cur.value += qty;
      cells.set(key, cur);
    }
  }
  return [...cells.values()];
}

/** Cross-checks the daily report against the catalog and flags anomalies:
 * materials/executives referenced in the report but missing from the
 * catalog, negative inventories, zero prices on active suggestions. */
export function detectInconsistencies(params: {
  catalog: CatalogSnapshot | null;
  sugerencias: Sugerencia[];
  invConsolidado: InvConsolidadoRow[];
}): Inconsistency[] {
  const { catalog, sugerencias, invConsolidado } = params;
  const out: Inconsistency[] = [];
  if (!catalog) return out;

  const knownMaterials = new Set(catalog.materiales.map((m) => m.material));
  const knownGpoCte = new Set(catalog.ejecutivos.map((e) => e.gpoCte));

  const seenMat = new Set<string>();
  const seenGpo = new Set<string>();
  // Ver comentario de `computeBloqueados`: sin este filtro, el check de
  // "precio-cero" empujaría un hallazgo por cada fuente alterna del mismo
  // pedido, duplicando el mismo pedido varias veces en la lista.
  for (const s of sugerencias.filter(sinFuente)) {
    const mat = s.materialBase || s.materialSolicitado;
    if (mat && !knownMaterials.has(mat) && !seenMat.has(mat)) {
      seenMat.add(mat);
      out.push({ type: 'material-sin-catalogo', material: mat, detail: `Material ${mat} no existe en el catálogo sincronizado.` });
    }
    if (s.gpoCte && !knownGpoCte.has(s.gpoCte) && !seenGpo.has(s.gpoCte)) {
      seenGpo.add(s.gpoCte);
      out.push({ type: 'ejecutivo-sin-catalogo', ejecutivo: s.gpoCte, detail: `Grupo cliente ${s.gpoCte} sin ejecutivo asignado en el catálogo.` });
    }
    if (s.cantidadPendiente > 0 && s.precio === 0) {
      out.push({ type: 'precio-cero', material: mat, detail: `Sugerencia de ${mat} con cantidad pendiente pero precio $0.` });
    }
  }
  for (const r of invConsolidado) {
    if (r.invSuma < 0) {
      out.push({ type: 'inventario-negativo', material: r.material, detail: `Inventario negativo (${r.invSuma}) para ${r.material}.` });
    }
  }
  return out.slice(0, 200); // cap for UI sanity
}

// Future improvement: swap the in-worker JS aggregation above for DuckDB-WASM
// / Apache Arrow columnar processing once row counts grow beyond what
// SheetJS + plain arrays can comfortably handle in a single worker pass.
