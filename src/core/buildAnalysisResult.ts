import {
  mapSugerencia,
  mapResumenSinSugerencia,
  mapConsumo,
  mapResumenFac,
  mapInvConsolidado,
  mapInvDetalle,
} from './mappers';
import { computeKpis, topMateriales, topEjecutivos, monthlyInvoicing, buildHeatmap, detectInconsistencies } from './analysis';
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
  const kpis = computeKpis({
    catalog,
    sugerencias,
    consumo,
    invConsolidado: invForAnalysis,
    lotesCortaCaducidad: lotesCortaCaducidad.length ? lotesCortaCaducidad : catalog?.invDetalle ?? [],
    settings,
  });
  const top5Materiales = topMateriales(sugerencias, 5);
  const top5Ejecutivos = topEjecutivos(sugerencias, catalog, 5);
  const monthly = monthlyInvoicing(resumenFac);
  const heatmap = buildHeatmap(invForAnalysis);
  const inconsistencies = detectInconsistencies({ catalog, sugerencias, invConsolidado: invForAnalysis });

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
