import { reportRepository } from '@/repositories';
import { buildAnalysisResult } from '@/core/buildAnalysisResult';
import { logInfo } from '@/lib/logError';
import { ROLE_LABEL } from '@/core/roleDetection';
import { useReportSheetsSyncStore } from '@/store/reportSheetsSyncStore';
import type { AnalysisResult, AppSettings, CatalogSnapshot, DetectedSheet, ProcessingProgress, SheetRole } from '@/core/types';

/** Google Apps Script endpoint for the daily-report spreadsheet
 * (`1OULGx8ZWdSR1w9JIPrccW3ci_-MZeQ5DckNjo2pSk_c`) — a DIFFERENT spreadsheet
 * from the catalog's `VITE_APPSCRIPT_URL`, so it gets its own env var and
 * `doGet` deployment. See docs/apps-script-report-sheets.md. */
const REPORT_SHEETS_URL = import.meta.env.VITE_REPORT_SHEETS_URL as string | undefined;

/** The 4 report tabs this sync covers, by their literal Sheet tab name (not
 * the `ROLE_LABEL` display text — the Apps Script `?tab=` param must match
 * the actual tab name). `inventarioCondicion`/`lotesCortaCaducidad` aren't
 * part of this spreadsheet and are never touched by this sync. */
const REPORT_TABS: Partial<Record<SheetRole, string>> = {
  sugerencias: 'Todas las Sugerencias',
  resumenSinSugerencias: 'Resumen Sin Sugerencias',
  reporteConsumo: 'Reporte de Consumo',
  resumenFac: 'Resumen_Fac',
};
export const REPORT_SHEET_ROLES = Object.keys(REPORT_TABS) as SheetRole[];

function requireUrl(): string {
  if (!REPORT_SHEETS_URL) {
    throw new Error('Falta configurar VITE_REPORT_SHEETS_URL. Ver docs/apps-script-report-sheets.md.');
  }
  return REPORT_SHEETS_URL;
}

/** Cheap check: the Drive `modifiedTime` of the whole spreadsheet, no row
 * reading involved — what "revisar al abrir/enfocar" polls before deciding
 * whether a full tab fetch is worth it. */
export async function fetchReportSheetsMeta(): Promise<{ modifiedTime: string }> {
  const res = await fetch(`${requireUrl()}?meta=1`);
  if (!res.ok) throw new Error(`HTTP ${res.status} al consultar el estado del Sheet de reportes.`);
  const data = await res.json();
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  return data as { modifiedTime: string };
}

/** Wire shape from `getTabRows` in the Apps Script: headers sent once, each
 * row as a plain array — NOT one object per row. For a ~80k-row sheet like
 * "Reporte de Consumo", repeating every header string on every row would
 * inflate the JSON several times over and slow down the script's own
 * `JSON.stringify`, the transfer, and the browser's `JSON.parse`. Zipping
 * headers+row back into `{header: value}` objects here is cheap by
 * comparison, and keeps `buildAnalysisResult`'s input contract unchanged
 * (same shape the xlsx worker already produces). */
interface TabResponse {
  headers: string[];
  rows: unknown[][];
}

async function fetchReportSheetTab(tab: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${requireUrl()}?tab=${encodeURIComponent(tab)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la pestaña "${tab}".`);
  const data = await res.json();
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  const { headers, rows } = data as TabResponse;
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    // NEVER silently treat an unrecognized shape as "no rows" — that's how a
    // stale Apps Script deployment (still on the old array-of-objects format,
    // or any other unexpected response) quietly overwrites good data with
    // zeros instead of failing the sync and keeping the old data. Throwing
    // here is what makes "old data stays until sync succeeds" actually true.
    throw new Error(
      `Formato de respuesta inesperado en la pestaña "${tab}" — ¿el Apps Script tiene desplegada la última versión? (ver docs/apps-script-report-sheets.md)`,
    );
  }
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

export interface SyncReportSheetsParams {
  catalog: CatalogSnapshot | null;
  settings: Pick<AppSettings, 'shortExpiryDays' | 'lowStockThreshold'>;
  /** The currently active analysis, if any — roles NOT in `selectedRoles`
   * keep their data from here instead of being cleared. */
  previous: AnalysisResult | null;
  /** Which of the 4 tabs to (re)sync this time. Omit for all 4. */
  selectedRoles?: SheetRole[];
  /** Optional progress callback — same `ProcessingProgress` shape the
   * manual xlsx flow reports, so the UI can reuse the same `Progress` bar.
   * The auto-check path (AppShell) omits this since it runs silently. */
  onProgress?: (p: ProcessingProgress) => void;
}

// Module-level guard: at most one Sheets sync in flight at a time, shared
// across every caller (the manual button, the auto-check-on-focus effect —
// see AppShell.tsx). Without this, a focus-triggered auto-sync and a manual
// click racing each other would fire two concurrent Apps Script fetches and
// two `reportRepository.saveAnalysis`/`addHistory` writes that could land out
// of order. A caller that shows up while one is already running just joins
// it (gets the same result once it lands, plus its own progress callback
// called alongside everyone else's) instead of starting a second one.
let inFlight: Promise<AnalysisResult> | null = null;
const progressListeners = new Set<(p: ProcessingProgress) => void>();

/** Fetches the selected report tabs from the Google Sheet, merges them into
 * `previous` (any unselected role keeps its old data), persists the result
 * exactly like a manual xlsx analysis would, and returns it. Old data
 * (`useDataStore.activeAnalysis`) is left completely alone for the whole
 * duration — this function doesn't touch `useDataStore` itself, so whatever
 * page is open keeps showing it until the caller (UI or the auto-check
 * effect) applies the fresh result on success, same convention as
 * `loadCatalogFromFile`/`runAnalysis`. Progress and in-flight status are
 * mirrored into `useReportSheetsSyncStore` so any page can show "sincronizando…"
 * regardless of which component actually triggered it. */
export async function syncReportSheets(params: SyncReportSheetsParams): Promise<AnalysisResult> {
  if (params.onProgress) progressListeners.add(params.onProgress);
  if (inFlight) return inFlight;

  const sync = useReportSheetsSyncStore.getState();
  sync.start();
  inFlight = runSync(params).finally(() => {
    inFlight = null;
    progressListeners.clear();
  });
  return inFlight;
}

async function runSync(params: SyncReportSheetsParams): Promise<AnalysisResult> {
  const sync = useReportSheetsSyncStore.getState();
  const emit = (p: ProcessingProgress) => {
    sync.setProgress(p);
    progressListeners.forEach((fn) => fn(p));
  };

  const roles = params.selectedRoles && params.selectedRoles.length ? params.selectedRoles : REPORT_SHEET_ROLES;
  const start = Date.now();

  try {
    const tabs = roles.map((role) => REPORT_TABS[role]).filter((t): t is string => !!t);
    emit({ phase: 'detecting', percent: 5, message: `Consultando ${tabs.length} pestaña(s)…` });

    // Fetched in parallel (fastest — total time ~ the slowest tab, not the
    // sum), but each still reports its own completion as it lands so the UI
    // can show real "N de M" progress instead of a single opaque wait.
    let done = 0;
    const rowsPerTab = await Promise.all(
      roles.map(async (role, i) => {
        const rows = await fetchReportSheetTab(tabs[i]);
        done += 1;
        emit({
          phase: 'parsing',
          percent: Math.round(10 + (70 * done) / tabs.length),
          message: `${ROLE_LABEL[role]} (${done} de ${tabs.length})`,
        });
        return rows;
      }),
    );

    const sheets: Record<string, Record<string, unknown>[]> = {};
    const sheetsDetected: DetectedSheet[] = [];
    tabs.forEach((tab, i) => {
      const rows = rowsPerTab[i];
      sheets[tab] = rows;
      sheetsDetected.push({ name: tab, role: roles[i], rowCount: rows.length, headers: rows.length ? Object.keys(rows[0]) : [], loaded: true });
    });

    emit({ phase: 'crossing', percent: 85, message: 'Cruzando reporte contra catálogo…' });
    emit({ phase: 'kpis', percent: 92, message: 'Calculando KPIs…' });
    const result = buildAnalysisResult({
      sheets,
      sheetsDetected,
      catalog: params.catalog,
      settings: params.settings,
      fileName: 'Google Sheets · sincronización',
      startedAt: start,
      previous: params.previous,
      selectedRoles: roles,
    });

    await reportRepository.saveAnalysis(result);
    reportRepository.addHistory({
      fileName: result.fileName,
      processedAt: result.processedAt,
      durationMs: result.durationMs,
      rowCount: result.rowCount,
      kpis: result.kpis,
    }).catch(() => {});
    void logInfo('report-sheets-sync', `${roles.join(', ')}: ${result.rowCount} sugerencias`);

    emit({ phase: 'done', percent: 100, message: 'Sincronización completada.' });
    sync.finish();
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    sync.finish(message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Change detection: "revisar al abrir/enfocar" without hammering Apps Script.
// Stored client-side (this is per-device, not data worth a Dexie migration —
// same reasoning as the localStorage helpers in InventarioPage.tsx).
// ---------------------------------------------------------------------------

const SYNC_META_KEY = 'report-sheets-sync-meta';
const CHECK_THROTTLE_MS = 60_000;

interface SyncMeta {
  modifiedTime?: string;
  checkedAt?: string;
}

function readSyncMeta(): SyncMeta {
  try {
    return JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeSyncMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore — worst case we just re-check next time
  }
}

/** Called on mount and on window focus/visibility regain. Cheap-checks the
 * spreadsheet's Drive `modifiedTime`; if it changed since the last check,
 * runs a full sync (all 4 tabs) and returns the new result. Throttled to at
 * most once a minute so rapid focus/blur toggling doesn't spam Apps Script. */
export async function checkForReportSheetsUpdate(
  params: Omit<SyncReportSheetsParams, 'selectedRoles'>,
): Promise<{ changed: boolean; result?: AnalysisResult }> {
  if (!REPORT_SHEETS_URL) return { changed: false };

  const meta = readSyncMeta();
  if (meta.checkedAt && Date.now() - new Date(meta.checkedAt).getTime() < CHECK_THROTTLE_MS) {
    return { changed: false };
  }

  const { modifiedTime } = await fetchReportSheetsMeta();
  if (meta.modifiedTime === modifiedTime) {
    writeSyncMeta({ modifiedTime, checkedAt: new Date().toISOString() });
    return { changed: false };
  }

  const result = await syncReportSheets(params);
  writeSyncMeta({ modifiedTime, checkedAt: new Date().toISOString() });
  return { changed: true, result };
}
