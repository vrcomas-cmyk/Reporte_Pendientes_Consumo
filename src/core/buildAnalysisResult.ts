import {
  mapSugerencia,
  mapResumenSinSugerencia,
  mapConsumo,
  mapResumenFac,
  mapInvConsolidado,
  mapInvDetalle,
} from './mappers';
import { computeKpis, topMateriales, topEjecutivos, monthlyInvoicing, buildHeatmap, detectInconsistencies } from './analysis';
import { buildEnrich } from './enrich';
import { roleOf } from './roleDetection';
import type { CatalogSnapshot, AnalysisResult, AppSettings, SheetRole, DetectedSheet } from './types';

/** Scans a sheet-name → rows map for the first sheet whose header row
 * matches the given role (via `roleOf`). Shared by the xlsx worker (which
 * also uses it for the 4 catalog roles) and `buildAnalysisResult` below. */
export function findSheetByRole(sheets: Record<string, Record<string, unknown>[]>, role: string): Record<string, unknown>[] {
  for (const rows of Object.values(sheets)) {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    if (roleOf(headers) === role) return rows;
  }
  return [];
}

export interface BuildAnalysisResultParams {
  /** Sheet name -> row objects, Spanish-header keyed (same shape whether it
   * came from `XLSX.utils.sheet_to_json` or an Apps Script JSON response). */
  sheets: Record<string, Record<string, unknown>[]>;
  sheetsDetected: DetectedSheet[];
  catalog: CatalogSnapshot | null;
  settings: Pick<AppSettings, 'shortExpiryDays' | 'lowStockThreshold'>;
  fileName: string;
  startedAt: number;
  /** Previous analysis to merge into, when only some roles are being
   * (re)synced this time. Omit for a full rebuild (e.g. the xlsx-upload
   * path), where an unselected role simply ends up empty, same as today. */
  previous?: AnalysisResult | null;
  /** Roles to take from `sheets` this time; omitted = all roles. Any role
   * NOT in this list falls back to `previous`'s data when `previous` is
   * given, instead of being cleared. */
  selectedRoles?: SheetRole[];
}

/**
 * Cross-references daily-report rows against the cached catalog and computes
 * every derived KPI/heatmap/inconsistency surface. Pure and I/O-free — the
 * single source of truth shared by the xlsx worker (`analysisWorker.ts`) and
 * the Google Sheets sync path (`reportSheetsService.ts`), so both produce
 * identically-shaped `AnalysisResult`s from the same kind of row data.
 */
export function buildAnalysisResult(params: BuildAnalysisResultParams): AnalysisResult {
  const { sheets, sheetsDetected, catalog, settings, fileName, startedAt, previous = null, selectedRoles } = params;

  const wantRole = (role: SheetRole): boolean => !selectedRoles || selectedRoles.includes(role);
  const pick = <T>(role: SheetRole, fresh: T[], prevField: T[] | undefined): T[] =>
    wantRole(role) ? fresh : previous ? (prevField ?? []) : fresh;

  const sugerencias = pick('sugerencias', findSheetByRole(sheets, 'sugerencias').map(mapSugerencia), previous?.sugerencias);
  const resumenSinSugerencias = pick(
    'resumenSinSugerencias',
    findSheetByRole(sheets, 'resumenSinSugerencias').map(mapResumenSinSugerencia),
    previous?.resumenSinSugerencias,
  );
  const consumo = pick('reporteConsumo', findSheetByRole(sheets, 'reporteConsumo').map(mapConsumo), previous?.consumo);
  const resumenFac = pick('resumenFac', findSheetByRole(sheets, 'resumenFac').map(mapResumenFac), previous?.resumenFac);
  const inventarioCondicion = pick(
    'inventarioCondicion',
    findSheetByRole(sheets, 'inventarioCondicion').map(mapInvConsolidado),
    previous?.inventarioCondicion,
  );
  const lotesCortaCaducidad = pick(
    'lotesCortaCaducidad',
    findSheetByRole(sheets, 'lotesCortaCaducidad').map(mapInvDetalle),
    previous?.lotesCortaCaducidad,
  );

  // The daily "Inventario por condición" sheet, when present, is the source of
  // truth; otherwise fall back to the catalog's consolidated inventory. All
  // inventory-derived surfaces (KPIs, heatmap, inconsistencies) use the same set.
  const invForAnalysis = inventarioCondicion.length ? inventarioCondicion : catalog?.invConsolidado ?? [];
  const lotesForAnalysis = lotesCortaCaducidad.length ? lotesCortaCaducidad : catalog?.invDetalle ?? [];

  // Memoize derived surfaces: when `previous` exists and none of the input
  // roles that feed a given derived value were re-synced this time, reuse
  // `previous`' already-computed version instead of recomputing. The report-
  // sheets sync (the only caller that passes `previous` + a partial
  // `selectedRoles`) never mutates the catalog mid-call, so any surface whose
  // only inputs are `previous`-sourced roles is safe to keep verbatim. This is
  // the common path for the auto-check effect, which most often only detects
  // a change in `sugerencias` and re-fetches just that tab — keeping KPIs/
  // heatmap/inconsistencies from being recomputed against the same inventory
  // data they already ran on.
  const maybePrev = (role: SheetRole | SheetRole[]) => {
    if (!previous || selectedRoles === undefined) return null;
    const rs = Array.isArray(role) ? role : [role];
    const touched = rs.some((r) => selectedRoles.includes(r));
    return touched ? null : previous;
  };

  // KPIs depend on sugerencias + consumo + inventarioCondicion + lotesCortaCaducidad
  const kpisPrev = maybePrev(['sugerencias', 'reporteConsumo', 'inventarioCondicion', 'lotesCortaCaducidad']);
  const kpis = kpisPrev ? kpisPrev.kpis : computeKpis({
    catalog,
    sugerencias,
    consumo,
    invConsolidado: invForAnalysis,
    lotesCortaCaducidad: lotesForAnalysis,
    settings,
  });

  // topMateriales / topEjecutivos depend only on sugerencias (+ catalog).
  const topPrev = maybePrev('sugerencias');
  const top5Materiales = topPrev ? topPrev.topMateriales : topMateriales(sugerencias, 5);
  const top5Ejecutivos = topPrev ? topPrev.topEjecutivos : topEjecutivos(sugerencias, catalog);

  // monthlyInvoicing depends only on resumenFac.
  const monthlyPrev = maybePrev('resumenFac');
  const monthly = monthlyPrev ? monthlyPrev.monthlyInvoicing : monthlyInvoicing(resumenFac);

  // heatmap depends on invForAnalysis (inventarioCondicion, o si esa hoja no
  // llegó, catalog.invConsolidado). A propósito NO se memoiza contra
  // `previous` como los demás: su único rol de entrada real,
  // `inventarioCondicion`, nunca forma parte de `selectedRoles` en la sync de
  // reportes de Google Sheets (viene de OTRO spreadsheet, el del catálogo),
  // así que `maybePrev('inventarioCondicion')` lo daba por "no tocado" y
  // reusaba `previous.heatmap` PARA SIEMPRE — si el primer análisis se generó
  // antes de sincronizar el catálogo, el mapa de calor quedaba vacío de forma
  // permanente. Es una agregación barata (una pasada sobre el inventario), no
  // justifica el mismo mecanismo de caché que las 4 pestañas pesadas.
  const heatmap = buildHeatmap(invForAnalysis, buildEnrich(catalog));

  // inconsistencies depend on catalog + sugerencias + invForAnalysis.
  const incPrev = maybePrev(['sugerencias', 'inventarioCondicion']);
  const inconsistencies = incPrev
    ? incPrev.inconsistencies
    : detectInconsistencies({ catalog, sugerencias, invConsolidado: invForAnalysis });

  return {
    fileName,
    processedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    rowCount: sugerencias.length,
    sheetsDetected,
    sugerencias,
    resumenSinSugerencias,
    consumo,
    resumenFac,
    inventarioCondicion,
    lotesCortaCaducidad,
    kpis,
    topMateriales: top5Materiales,
    topEjecutivos: top5Ejecutivos,
    monthlyInvoicing: monthly,
    heatmap,
    inconsistencies,
  };
}
