import { reportRepository } from '@/repositories';
import { buildFromSheetsInWorker } from '@/services/analysisService';
import type { TabRows } from '@/workers/analysisWorker';
import { getCachedTab, putCachedTab, clearCachedTabs } from '@/repositories/sheetsCache';
import { logInfo, logWarn } from '@/lib/logError';
import { ROLE_LABEL } from '@/core/roleDetection';
import { useReportSheetsSyncStore } from '@/store/reportSheetsSyncStore';
import { getConnector, CONNECTOR_KEYS } from '@/services/connectorsService';
import type { AnalysisResult, AppSettings, CatalogSnapshot, DetectedSheet, ProcessingProgress, SheetRole } from '@/core/types';

/** Google Apps Script endpoint for the daily-report spreadsheet
 * (`1OULGx8ZWdSR1w9JIPrccW3ci_-MZeQ5DckNjo2pSk_c`) — a DIFFERENT spreadsheet
 * from the catalog's `VITE_APPSCRIPT_URL`, so it gets its own env var and
 * `doGet` deployment. See docs/apps-script-report-sheets.md. Resolved from
 * the admin-editable `degasa_connectors` row first, falling back to the
 * build-time env var. */
const REPORT_SHEETS_URL_ENV = import.meta.env.VITE_REPORT_SHEETS_URL as string | undefined;

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

/** "Todas las Sugerencias", "Resumen Sin Sugerencias" y "Resumen_Fac" son
 * salida de fórmulas vivas (QUERY/FILTER): un registro puede desaparecer de
 * la pestaña (ya se cubrió, ya no aplica) mientras el `rowCount` total se
 * mantiene igual o crece porque entran registros nuevos al mismo tiempo. El
 * esquema delta de abajo solo detecta "la hoja se encogió" (rowCount menor
 * al offset) — un rowCount igual/mayor con registros distintos por dentro
 * pasa inadvertido y el registro eliminado queda viviendo en el caché para
 * siempre. Por eso estas tres siempre se traen completas, sin caché delta. */
const ALWAYS_FULL_REFRESH_ROLES = new Set<SheetRole>(['sugerencias', 'resumenSinSugerencias', 'resumenFac']);

/** "Reporte de Consumo" sí es mayormente append-only (~80k filas, crece por
 * abajo) pero las filas más recientes pueden actualizarse in-place (el
 * consumo de los últimos días cambia de valor sin que se agreguen o quiten
 * filas). Re-pedir esta ventana de filas "recientes" en cada sync — en vez
 * de asumir que todo lo previo al offset sigue vigente — corrige esos
 * valores sin pagar el costo de re-descargar las 80k filas completas. */
const CONSUMO_REFRESH_WINDOW = 15_000;

async function requireUrl(): Promise<string> {
  const url = await getConnector(CONNECTOR_KEYS.reportSheetsUrl, REPORT_SHEETS_URL_ENV);
  if (!url) {
    throw new Error('Falta configurar el conector "Apps Script · Reporte diario" (Admin) o VITE_REPORT_SHEETS_URL.');
  }
  return url;
}

/** Cheap check: the Drive `modifiedTime` of the whole spreadsheet, no row
 * reading involved — what "revisar al abrir/enfocar" polls before deciding
 * whether a full tab fetch is worth it. */
export async function fetchReportSheetsMeta(): Promise<{ modifiedTime: string }> {
  const res = await fetch(`${await requireUrl()}?meta=1`);
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
async function fetchReportSheetTab(tab: string, offset?: number, limit?: number): Promise<TabRows> {
  const base = await requireUrl();
  const params = new URLSearchParams({ tab });
  if (offset && offset > 0) params.set('offset', String(offset));
  if (limit && limit > 0) params.set('limit', String(limit));
  const url = `${base}?${params.toString()}`;
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

/** Rows per Apps Script request once a tab needs more than one page (i.e. the
 * first-ever sync, or after "Sincronización completa"). The Apps Script
 * `doGet` already accepts `?limit=` (see docs/apps-script-report-sheets.md)
 * but the client used to always omit it and ask for "everything from offset
 * to the end" in a single call — for the ~80k-row "Reporte de Consumo" tab
 * that's one huge `getValues()` + `JSON.stringify()` inside a single Apps
 * Script execution, which is slow and risks hitting Apps Script's execution
 * time limit outright (the "no está siendo funcional" symptom). Paginating
 * client-side turns that into several smaller, faster executions instead —
 * and if an older deployment ignores `limit` and returns everything anyway,
 * the loop below still terminates correctly on the first page (offset
 * advances by however many rows actually came back). */
const TAB_PAGE_SIZE = 20_000;

/** Fetches every row of a tab starting at `offset`, in pages of
 * `TAB_PAGE_SIZE`, calling `onPage` after each page lands so the caller can
 * report finer-grained progress than "waiting on the whole tab" for the
 * large ones. Returns the same `{ headers, rows, rowCount }` shape as a
 * single `fetchReportSheetTab` call would, with `rows` being everything
 * collected across all pages. */
async function fetchReportSheetTabPaginated(
  tab: string,
  offset: number,
  onPage?: (rowsSoFar: number, rowCount: number | undefined) => void,
): Promise<TabRows> {
  let cursor = offset;
  let headers: string[] = [];
  const rows: unknown[][] = [];
  let rowCount: number | undefined;

  for (;;) {
    const page = await fetchReportSheetTab(tab, cursor, TAB_PAGE_SIZE);
    headers = page.headers;
    rowCount = page.rowCount;
    rows.push(...page.rows);
    onPage?.(rows.length, rowCount);

    if (page.rows.length === 0) break; // nothing more, or an unpaginated deployment already returned everything on page 1
    cursor += page.rows.length;
    if (typeof rowCount === 'number' && cursor - offset >= rowCount - offset) break; // caught up to the reported total
    if (page.rows.length < TAB_PAGE_SIZE) break; // short page with no rowCount to check against — nothing left
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
  /** Optional callback fired with a fresh `AnalysisResult` as SOON as each
   * individual tab finishes fetching + crossing, instead of only once at the
   * very end. Lets the UI apply (e.g. `setActiveAnalysis`) each tab's data as
   * it lands — so "Todas las Sugerencias" shows up the moment it's ready
   * instead of the user staring at nothing while "Reporte de Consumo" (often
   * the slowest, ~80k rows) is still loading. The final return value of
   * `syncReportSheets` is still the complete, all-tabs result. */
  onPartialResult?: (r: AnalysisResult) => void;
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
    //
    // Fetched in PARALLEL (not one at a time) so the total wait is however
    // long the slowest tab takes, not the sum of all four — but each tab's
    // data is still crossed and handed to the UI (`onPartialResult`) the
    // moment THAT tab lands, whichever one finishes first, instead of waiting
    // for every tab before showing anything. `partialChain` serializes those
    // progressive builds (each one waits for the previous to finish) so two
    // tabs landing close together don't kick off overlapping worker builds.
    let done = 0;
    const tabsData: TabRows[] = new Array(roles.length);
    const sheets: Record<string, TabRows> = {};
    const sheetsDetected: DetectedSheet[] = [];
    const arrivedRoles: SheetRole[] = [];
    // One tab failing (e.g. a renamed/missing sheet tab → HTTP 404) must never
    // sink the other tabs that already landed fine — each tab is isolated in
    // its own try/catch below, and a failed role is simply excluded from
    // `selectedRoles` on the final build so `buildAnalysisResult.pick()` falls
    // back to `previous`'s data for it instead of overwriting with empty rows.
    const failedRoles: { role: SheetRole; message: string }[] = [];
    let partialChain = Promise.resolve();

    async function processTab(role: SheetRole, tab: string, index: number): Promise<void> {
      try {
        await processTabInner(role, tab, index);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        failedRoles.push({ role, message });
        done += 1;
        emit({
          phase: 'parsing',
          percent: Math.round(10 + (60 * done) / tabs.length),
          message: `${ROLE_LABEL[role]}: error (${message}) — se conservan los datos anteriores`,
        });
      }
    }

    async function processTabInner(role: SheetRole, tab: string, index: number): Promise<void> {
      const alwaysFull = ALWAYS_FULL_REFRESH_ROLES.has(role);
      const cached = forceFull || alwaysFull ? undefined : await getCachedTab(tab);
      const priorRows = cached?.rows ?? [];
      const refreshWindow = role === 'reporteConsumo' ? CONSUMO_REFRESH_WINDOW : 0;
      // For "Reporte de Consumo", re-fetch the trailing `refreshWindow` rows
      // (they'll be replaced below, not just appended to) instead of trusting
      // that everything before the last-known length is still accurate.
      const offset = Math.max(0, priorRows.length - refreshWindow);

      // Per-PAGE progress (not just per-tab): a cold "Reporte de Consumo"
      // sync (~80k rows, no cache yet) used to sit at the same percent for
      // however long that one giant request took. Now it's several smaller
      // requests, so report fractional progress within this tab's slot too.
      const reportPage = (rowsSoFar: number, rowCount: number | undefined) => {
        const remaining = typeof rowCount === 'number' ? Math.max(1, rowCount - offset) : null;
        const tabFrac = remaining ? Math.min(1, rowsSoFar / remaining) : 0;
        emit({
          phase: 'parsing',
          percent: Math.round(10 + (60 * (done + tabFrac)) / tabs.length),
          message: remaining && remaining > TAB_PAGE_SIZE
            ? `${ROLE_LABEL[role]}: ${rowsSoFar.toLocaleString('es-MX')} de ${remaining.toLocaleString('es-MX')} filas…`
            : `${ROLE_LABEL[role]} (${done} de ${tabs.length})`,
        });
      };

      let tabRows = await fetchReportSheetTabPaginated(tab, offset, reportPage);

      // If the sheet shrank (rows deleted/replaced) since the last sync, the
      // delta window starting at the old offset is meaningless — re-fetch the
      // whole tab. Also happens when `cached.rowCount` lagged behind reality.
      if (offset > 0 && typeof tabRows.rowCount === 'number' && tabRows.rowCount < offset) {
        tabRows = await fetchReportSheetTabPaginated(tab, 0, reportPage);
      }

      // Rows from `offset` onward are REPLACED by the fresh fetch (not
      // appended after) — that's what lets the refresh window above correct
      // in-place edits, and what makes a shrink-triggered `offset = 0`
      // refetch above fully replace the tab instead of duplicating it.
      const combinedRows = offset > 0 ? [...priorRows.slice(0, offset), ...tabRows.rows] : tabRows.rows;
      // Defensive dedup: "Todas las Sugerencias"/"Reporte de Consumo" are the
      // output of live formulas (QUERY/FILTER) that can reorder rows when new
      // data lands in the middle of the sheet, not just at the end. When that
      // happens the offset-based delta window drifts and a row that's already
      // in `cached.rows` gets re-fetched and appended a second time, silently
      // inflating every KPI/total downstream on each subsequent sync. Collapse
      // exact-duplicate rows (same values in the same order) before persisting,
      // keeping the first occurrence.
      const dedupSeen = new Set<string>();
      const dedupedRows = combinedRows.filter((row) => {
        const key = JSON.stringify(row);
        if (dedupSeen.has(key)) return false;
        dedupSeen.add(key);
        return true;
      });
      const merged: TabRows = {
        headers: tabRows.headers,
        rows: dedupedRows,
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

      tabsData[index] = merged;
      sheets[tab] = merged;
      sheetsDetected.push({ name: tab, role, rowCount: merged.rows.length, headers: merged.headers, loaded: true });
      arrivedRoles.push(role);

      done += 1;
      emit({
        phase: 'parsing',
        percent: Math.round(10 + (60 * done) / tabs.length),
        message: `${ROLE_LABEL[role]} (${done} de ${tabs.length})`,
      });

      if (params.onPartialResult) {
        // Snapshot what's arrived so far BEFORE chaining — `sheets`/
        // `sheetsDetected`/`arrivedRoles` keep mutating as other tabs land
        // concurrently, so the build must close over a copy, not the live
        // arrays. Build+cross just this snapshot, still deferring to
        // `previous` for every role not yet arrived — same fallback rule
        // `buildAnalysisResult.pick()` uses for a partial sync. Errors here
        // must never abort the sync itself (other tabs still need to land),
        // so they're swallowed — the final full build below is what actually
        // matters for correctness.
        const sheetsSnapshot = { ...sheets };
        const sheetsDetectedSnapshot = [...sheetsDetected];
        const arrivedSnapshot = [...arrivedRoles];
        partialChain = partialChain.then(async () => {
          try {
            const partial = await buildFromSheetsInWorker({
              sheets: sheetsSnapshot,
              sheetsDetected: sheetsDetectedSnapshot,
              catalog: params.catalog,
              settings: params.settings,
              fileName: 'Google Sheets · sincronización',
              startedAt: start,
              previous: params.previous,
              selectedRoles: arrivedSnapshot,
            }).promise;
            params.onPartialResult!(partial);
          } catch {
            // ignore — the next tab's partial (or the final result) will catch up
          }
        });
      }
    }

    await Promise.all(roles.map((role, i) => processTab(role, tabs[i], i)));
    await partialChain;

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
    // Only roles that actually arrived go in `selectedRoles` — a failed tab
    // must NOT appear here, or `pick()` would treat it as "selected but
    // empty" and overwrite good `previous` data with zero rows.
    const succeededRoles = roles.filter((r) => arrivedRoles.includes(r));
    const result = await buildFromSheetsInWorker({
      sheets,
      sheetsDetected,
      catalog: params.catalog,
      settings: params.settings,
      fileName: 'Google Sheets · sincronización',
      startedAt: start,
      previous: params.previous,
      selectedRoles: succeededRoles,
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
    if (failedRoles.length) {
      void logWarn('report-sheets-sync-partial', failedRoles.map((f) => `${f.role}: ${f.message}`).join(' | '));
    }

    // A partial failure isn't fatal — the tabs that did land are still
    // applied (return `result` normally, no throw), but surface which
    // pestaña(s) failed and kept their previous data, same banner slot a
    // full-sync error uses.
    const warning = failedRoles.length
      ? `No se pudo sincronizar: ${failedRoles.map((f) => `${ROLE_LABEL[f.role]} (${f.message})`).join('; ')}. Se conservan los datos anteriores para esa(s) pestaña(s).`
      : undefined;
    emit({ phase: 'done', percent: 100, message: warning ? 'Sincronización completada con errores.' : 'Sincronización completada.' });
    sync.finish(warning);
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
  const url = await getConnector(CONNECTOR_KEYS.reportSheetsUrl, REPORT_SHEETS_URL_ENV);
  if (!url) return { changed: false };

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
