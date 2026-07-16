import type {
  CatalogSnapshot,
  Sugerencia,
  ConsumoRow,
  ResumenFacRow,
  InvConsolidadoRow,
  InvDetalleRow,
  DashboardKpis,
  TopMaterial,
  TopEjecutivo,
  MonthlyInvoicing,
  HeatmapCell,
  Inconsistency,
  AppSettings,
} from './types';

/**
 * The daily report's "Inventario por condicion" sheet carries no price
 * column; fall back to the catalog's InvConsolidado price for that material
 * when the crossed row's own price is missing/zero. Returns new row objects
 * (with precioOferta/importeInventario filled in) for rows that needed the
 * fallback; rows that already have a price are returned unchanged.
 *
 * Shared by the Dashboard KPI (computeKpis) and any view that renders
 * InvConsolidadoRow rows directly (e.g. Inventario por Condición), so both
 * surfaces resolve price identically.
 */
export function applyCatalogPriceFallback(
  rows: InvConsolidadoRow[],
  catalog: CatalogSnapshot | null,
): InvConsolidadoRow[] {
  if (!catalog) return rows;
  const catalogPriceByMaterial = new Map<string, number>();
  for (const r of catalog.invConsolidado) {
    if (r.precioOferta > 0) catalogPriceByMaterial.set(r.material, r.precioOferta);
  }
  return rows.map((r) => {
    if (r.precioOferta > 0) return r;
    const price = catalogPriceByMaterial.get(r.material) ?? 0;
    if (price <= 0) return r;
    return { ...r, precioOferta: price, importeInventario: price * r.invSuma };
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

  const today = new Date();
  const thresholdMs = settings.shortExpiryDays * 86400 * 1000;
  const productosCortaCaducidad = lotesCortaCaducidad.filter((l) => {
    if (!l.fechaCaducidad) return false;
    const d = new Date(l.fechaCaducidad);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() - today.getTime() <= thresholdMs;
  }).length;

  const productosLentoMovimiento = consumo.filter(
    (c) => c.consumoPromedioMensual > 0 && c.consumoPromedioMensual < settings.lowStockThreshold,
  ).length;

  const inventarioTotal = invConsolidado.reduce((acc, r) => acc + r.invSuma, 0);
  const invConsolidadoConPrecio = applyCatalogPriceFallback(invConsolidado, catalog);
  const valorEconomico = invConsolidadoConPrecio.reduce((acc, r) => acc + r.precioOferta * r.invSuma, 0);

  return {
    materialesAnalizados,
    ejecutivosCount,
    productosSinConsumo,
    productosCortaCaducidad,
    productosLentoMovimiento,
    inventarioTotal,
    valorEconomico,
  };
}

export function topMateriales(sugerencias: Sugerencia[], n = 5): TopMaterial[] {
  const byMat = new Map<string, TopMaterial>();
  for (const s of sugerencias) {
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

export function topEjecutivos(sugerencias: Sugerencia[], catalog: CatalogSnapshot | null, n = 5): TopEjecutivo[] {
  // Suggestions carry "Gpo. Cte." (client group); the catalog's Ejecutivos
  // sheet maps a "Gpo Cte" to an Ejecutivo. We join on that key.
  const gpoToEjecutivo = new Map<string, string>();
  if (catalog) {
    for (const e of catalog.ejecutivos) {
      if (e.gpoCte) gpoToEjecutivo.set(e.gpoCte, e.ejecutivo);
    }
  }
  const byEjec = new Map<string, TopEjecutivo>();
  for (const s of sugerencias) {
    const ejecutivo = gpoToEjecutivo.get(s.gpoCte) || s.gpoVdor || 'Sin asignar';
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

/** Simple heatmap: rows = sector, cols = center, value = summed inventory. */
export function buildHeatmap(invConsolidado: InvConsolidadoRow[]): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();
  for (const r of invConsolidado) {
    const rowKey = r.sector || 'Sin sector';
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
  for (const s of sugerencias) {
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
