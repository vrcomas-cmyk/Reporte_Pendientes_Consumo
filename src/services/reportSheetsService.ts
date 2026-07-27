import { reportRepository } from '@/repositories';
import { buildFromSheetsInWorker } from '@/services/analysisService';
import type { TabRows } from '@/workers/analysisWorker';
import { getCachedTab, putCachedTab, clearCachedTabs } from '@/repositories/sheetsCache';
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

/** Wire shape from `getTabRows` in the Apps Script — headers sent once, each
 * row as a plain array (`rows: unknown[][]`). We keep that shape ALL the way
 * to the worker (we do NOT zip into `{header: value}` objects on the main
 * thread), because for a ~80k-row "Reporte de Consumo" tab that zip is an
 * O(n) main-thread walk + structured-clone of 80k objects across to the
 * worker. Instead the worker receives the dense arrays and does the zip
 * there, where it neither blocks the UI nor pays the clone cost twice. */
async function fetchReportSheetTab(tab: string, offset?: number): Promise<TabRows> {
  const url = offset && offset > 0
    ? `${requireUrl()}?tab=${encodeURIComponent(tab)}&offset=${offset}`
    : `${requireUrl()}?tab=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la pestaña "${tab}".`);
  const data = await res.json();
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  const { headers, rows, rowCount } = data as TabRows;
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
  return { headers, rows, rowCount };
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
  /** True for the automatic background check (AppShell, on mount/focus) —
   * still saves to IndexedDB (that's what avoids re-syncing constantly) but
   * skips the Supabase history/log rows a user-initiated sync gets, so
   * silent background checks don't pile up `degasa_history`/`degasa_logs`
   * entries no one asked for. */
  silent?: boolean;
  /** Force a full re-fetch of every selected tab, ignoring the dense-rows
   * IndexedDB cache (`sheetsCache`). Use this when the user suspects an
   * edit landed in the middle of an existing row (the delta-sync scheme
   * only catches appends — see docs/apps-script-report-sheets.md §5).
   * Also wipes the cache for the selected roles so the next incremental
   * sync starts fresh from the new rowCount. */
  forceFull?: boolean;
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
  const forceFull = params.forceFull === true;

  if (forceFull) {
    // Full reconcile: wipe the dense-rows cache so the next incremental sync
    // (which might not pass forceFull) starts from the new rowCount baseline.
    await clearCachedTabs().catch(() => {});
  }

  try {
    const tabs = roles.map((role) => REPORT_TABS[role]).filter((t): t is string => !!t);
    emit({ phase: 'detecting', percent: 5, message: `Consultando ${tabs.length} pestaña(s)…` });

    // Delta-sync: for each selected tab, ask the Apps Script only for the rows
    // past the cached rowCount on this device (offset === cached.rows.length).
    // The response includes the current total `rowCount`, which we compare to
    // the offset to detect truncation/replacement (rowCount < offset → the tab
    // shrunk, re-fetch fully) — see docs/apps-script-report-sheets.md §5.
    let done = 0;
    const tabsData = await Promise.all(
      roles.map(async (role, i) => {
        const tab = tabs[i];
        const cached = forceFull ? undefined : await getCachedTab(tab);
        const offset = cached?.rows.length ?? 0;
        let tabRows = await fetchReportSheetTab(tab, offset);

        // If the sheet shrank (rows deleted/replaced) since the last sync, the
        // delta window starting at the old offset is meaningless — re-fetch the
        // whole tab. Also happens when `cached.rowCount` lagged behind reality.
        if (offset > 0 && typeof tabRows.rowCount === 'number' && tabRows.rowCount < offset) {
          tabRows = await fetchReportSheetTab(tab, 0);
        }

        const merged: TabRows = {
          headers: tabRows.headers,
          rows: offset > 0 ? [...(cached?.rows ?? []), ...tabRows.rows] : tabRows.rows,
          rowCount: typeof tabRows.rowCount === 'number' ? tabRows.rowCount : (offset + tabRows.rows.length),
        };

        // Persist the fresh full tab back to the dense-rows cache (so the next
        // incremental sync continues from this offset). Failure here is
        // non-fatal — at worst the next sync re-fetches the whole tab.
        await putCachedTab({
          tab,
          headers: merged.headers,
          rows: merged.rows,
          rowCount: merged.rowCount ?? merged.rows.length,
          syncedAt: new Date().toISOString(),
        }).catch(() => {});

        done += 1;
        emit({
          phase: 'parsing',
          percent: Math.round(10 + (70 * done) / tabs.length),
          message: `${ROLE_LABEL[role]} (${done} de ${tabs.length})`,
        });
        return merged;
      }),
    );

    // For roles NOT in `roles` (the user only ticked a subset), fall back to
    // the dense-rows cache if it has them — so buildAnalysisResult always sees
    // the full set and the memoized-derivatives path can skip recomputation
    // for untouched roles. If a role isn't cached yet either, it comes back
    // empty the same way a non-loaded sheet would.
    const sheets: Record<string, TabRows> = {};
    const sheetsDetected: DetectedSheet[] = [];
    tabs.forEach((tab, i) => {
      sheets[tab] = tabsData[i];
      sheetsDetected.push({ name: tab, role: roles[i], rowCount: tabsData[i].rows.length, headers: tabsData[i].headers, loaded: true });
    });

    // Fill in unselected roles from the cache (delta state persists across
    // partial syncs). This mirrors what `buildAnalysisResult`'s `pick()` does
    // with `previous.<role>` for the object-mapped arrays — but here we feed
    // the dense source so the worker can process them too. Without this, the
    // memoization short-circuit would still recompute because the input sheet
    // for that role would be missing.
    if (!forceFull && params.selectedRoles && params.selectedRoles.length) {
      for (const role of REPORT_SHEET_ROLES) {
        if (roles.includes(role)) continue;
        const tab = REPORT_TABS[role];
        if (!tab || sheets[tab]) continue;
        const cached = await getCachedTab(tab);
        if (cached) {
          sheets[tab] = { headers: cached.headers, rows: cached.rows, rowCount: cached.rowCount };
          sheetsDetected.push({ name: tab, role, rowCount: cached.rows.length, headers: cached.headers, loaded: true });
        }
      }
    }

    emit({ phase: 'crossing', percent: 85, message: 'Cruzando reporte contra catálogo…' });
    emit({ phase: 'kpis', percent: 92, message: 'Calculando KPIs…' });
    // Runs the cross-reference + KPI computation in the Web Worker (same one
    // the xlsx-upload path uses) instead of the main thread, so a large
    // "Reporte de Consumo" tab doesn't stall the UI while it's crunched.
    const result = await buildFromSheetsInWorker({
      sheets,
      sheetsDetected,
      catalog: params.catalog,
      settings: params.settings,
      fileName: 'Google Sheets · sincronización',
      startedAt: start,
      previous: params.previous,
      selectedRoles: roles,
    }).promise;

    await reportRepository.saveAnalysis(result);
    if (!params.silent) {
      reportRepository.addHistory({
        fileName: result.fileName,
        processedAt: result.processedAt,
        durationMs: result.durationMs,
        rowCount: result.rowCount,
        kpis: result.kpis,
      }).catch(() => {});
      void logInfo('report-sheets-sync', `${roles.join(', ')}: ${result.rowCount} sugerencias`);
    }

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
