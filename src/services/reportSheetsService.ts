import { reportRepository } from '@/repositories';
import { buildFromSheetsInWorker } from '@/services/analysisService';
import type { TabRows } from '@/workers/analysisWorker';
import { getCachedTab, putCachedTab, clearCachedTabs } from '@/repositories/sheetsCache';
import { fetchSnapshotManifest, fetchTabSnapshot, type SnapshotManifest } from '@/services/reportSnapshotService';
import { logInfo, logWarn } from '@/lib/logError';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
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

/** Orden de prioridad de negocio (CLAUDE.md / pedido del usuario, 2026-08-07):
 * Pedidos (sugerencias) → Inventario (resumenSinSugerencias) → Consumo →
 * Resumen_Fac SIEMPRE al final por ser la pestaña más pesada. `runSync`
 * reordena `roles` por esta lista y las descarga en dos olas: todo lo que no
 * sea `resumenFac` en paralelo primero (conserva la ventaja de pintar cada
 * pestaña en cuanto llega vía `onPartialResult`), y `resumenFac` arranca
 * hasta que esa ola termina — así lo prioritario aparece primero sin que el
 * tiempo total de sync se vuelva la suma de las 4 pestañas.
 * Todo reporte nuevo que se agregue a `REPORT_TABS` debe entrar aquí ANTES de
 * `resumenFac` — ver docs/apps-script-report-sheets.md §Prioridad de carga. */
const ROLE_PRIORITY: SheetRole[] = ['sugerencias', 'resumenSinSugerencias', 'reporteConsumo', 'resumenFac'];

function byPriority(roles: SheetRole[]): SheetRole[] {
  return [...roles].sort((a, b) => {
    const ia = ROLE_PRIORITY.indexOf(a);
    const ib = ROLE_PRIORITY.indexOf(b);
    return (ia === -1 ? ROLE_PRIORITY.length : ia) - (ib === -1 ? ROLE_PRIORITY.length : ib);
  });
}

/** Pedido del usuario (2026-08-14): "Todas las Sugerencias"/"Resumen Sin
 * Sugerencias" (y, aparte de esta tubería, InvDetalle/InvConsolidado del
 * catálogo) deben verse al instante — siguen por Apps Script en vivo. Pero
 * "Reporte de Consumo" y "Resumen_Fac" toleran sincronizarse una vez al día
 * por la noche: para esas dos, `processTabInner` intenta PRIMERO el snapshot
 * nocturno (ver `reportSnapshotService.ts` + `docs/apps-script-report-sheets.md`
 * §8) antes de caer a la descarga en vivo — que sigue existiendo íntegra,
 * como respaldo automático y como override manual ("Actualizar en vivo" en
 * Carga, `SyncReportSheetsParams.liveOverride`). El equipo apagado durante la
 * noche no importa: el snapshot lo genera un disparador de tiempo en la nube
 * de Google, no el navegador del usuario — al abrir en la mañana solo se
 * compara el manifiesto (~1 KB) contra la versión ya en caché. */
export const SNAPSHOT_ROLES: SheetRole[] = ['reporteConsumo', 'resumenFac'];

/** Un snapshot más viejo que esto se considera obsoleto (el disparador
 * nocturno falló, o nunca corrió) y se ignora en favor de la vía en vivo —
 * mejor una espera larga ocasional que datos de ayer sin que nadie lo note.
 * 30h da margen a que el disparador de las 3 a.m. corra tarde un día sin
 * disparar el fallback de inmediato. */
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 60 * 1000;

/** Respaldo cuando NI el snapshot ni la vía en vivo completa de "Resumen_Fac"
 * funcionan (pedido del usuario, 2026-08-17, tras un 404 a media descarga con
 * ~488k filas): si ya hay una copia previa en `sheetsCache` (de una sync
 * completa o de un snapshot anteriores), pedir SOLO el mes corriente —
 * columna "Mes y año", formato "MM/AAAA" (ver `mesKey` en `core/resumenFac.ts`
 * y `mapResumenFac` en `core/mappers.ts`) — y fusionarlo sobre esa copia en
 * vez de repetir la descarga completa. Con ~488k filas repartidas en ~12
 * meses eso son unas ~40k filas por request, muy por debajo del límite de
 * tiempo de respuesta que causaba el 404. Los meses viejos, que ya no
 * cambian, se quedan tal cual estaban en caché — solo el mes en curso se
 * refresca. NO reintroduce el esquema delta de §5 (que fallaba porque los
 * cambios no se concentran en ninguna posición de la hoja): esto filtra por
 * VALOR de una columna de fecha real, no por posición/offset. */
const RESUMEN_FAC_MONTH_COL = 'Mes y año';

function currentMonthValue(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${mm}/${now.getFullYear()}`;
}

/** Las 4 pestañas son salida de fórmulas vivas (QUERY/FILTER) o de valores
 * que se actualizan in-place: un registro puede desaparecer o cambiar de
 * valor sin que el `rowCount` total baje — entran otros al mismo tiempo. Se
 * intentó un esquema delta (pedir solo lo nuevo desde el último offset, con
 * una ventana de "filas recientes" para Reporte de Consumo) pero medido
 * contra snapshots reales del reporte, los cambios en Consumo NO se
 * concentran en la cola: comparando dos sync consecutivas, solo ~22% de los
 * cambios caían en las últimas 15,000 filas y el decil con MÁS cambios era
 * el primero, no el último. Cualquier ventana parcial deja datos viejos sin
 * detectar. Por eso las 4 pestañas siempre se traen completas, sin caché
 * delta — ver `processTabInner` (offset siempre 0) y
 * docs/apps-script-report-sheets.md §5. El caché (`sheetsCache`) se conserva
 * solo para rellenar roles NO seleccionados en una sync parcial. */

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
  const res = await fetchWithTimeout(`${await requireUrl()}?meta=1`, {}, 10_000);
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
/** Reintentos ante fallas transitorias del lado de Google — visto en la
 * práctica en "Resumen_Fac": pestañas grandes cuyo cómputo en Apps Script
 * (`getRange().getValues()`) se acerca al límite de tiempo de respuesta de un
 * Web App, y el frontend de Google corta la conexión devolviendo un HTTP 404
 * genérico (no el `{error: ...}` propio del script) en vez de la respuesta.
 * Es transitorio: reintentar la MISMA página (offset/limit) suele bastar, sin
 * necesidad de reiniciar todo el tab. Backoff exponencial con jitter — desde
 * que las páginas se piden en paralelo (`PAGE_FETCH_CONCURRENCY`), un backoff
 * lineal fijo hace que varias páginas que fallaron a la vez reintenten
 * exactamente al mismo tiempo, lo que vuelve a saturar Apps Script justo
 * cuando se le está dando margen para recuperarse. */
const TAB_FETCH_RETRIES = 3;
const TAB_FETCH_RETRY_BASE_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
  const exp = TAB_FETCH_RETRY_BASE_MS * 2 ** (attempt - 1);
  const jitter = Math.random() * TAB_FETCH_RETRY_BASE_MS;
  return exp + jitter;
}

/** Shared retry wrapper — both a normal paginated fetch and the filtered
 * (recent-month) fetch below hit the same flaky Apps Script Web App, so they
 * share the same backoff. `label` is just what shows up in the warning log. */
async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= TAB_FETCH_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < TAB_FETCH_RETRIES) {
        const delay = backoffDelay(attempt);
        logWarn(`Reintentando ${label} (intento ${attempt + 1}/${TAB_FETCH_RETRIES}, espera ${Math.round(delay)}ms): ${e instanceof Error ? e.message : String(e)}`);
        await sleep(delay);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchReportSheetTab(tab: string, offset?: number, limit?: number): Promise<TabRows> {
  return withRetries(`pestaña "${tab}" offset=${offset ?? 0}`, () => fetchReportSheetTabOnce(tab, offset, limit));
}

function assertTabRowsShape(tab: string, data: unknown): TabRows {
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  const { headers, rows, rowCount } = (data ?? {}) as TabRows;
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

async function fetchReportSheetTabOnce(tab: string, offset?: number, limit?: number): Promise<TabRows> {
  const base = await requireUrl();
  const params = new URLSearchParams({ tab });
  if (offset && offset > 0) params.set('offset', String(offset));
  if (limit && limit > 0) params.set('limit', String(limit));
  const url = `${base}?${params.toString()}`;
  const res = await fetchWithTimeout(url, {}, 30_000);
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la pestaña "${tab}".`);
  return assertTabRowsShape(tab, await res.json());
}

/** Pide solo los renglones de `tab` donde `filterCol` (encabezado exacto)
 * vale `filterVal` — el `doGet` filtra server-side con una fórmula QUERY
 * nativa de Sheets en vez de leer toda la hoja del lado de Apps Script (ver
 * `getTabRowsFiltered` en docs/apps-script-report-sheets.md §9). Usado hoy
 * solo para "Resumen_Fac" (columna "Mes y año" = mes corriente), pero el
 * parámetro es genérico por si otra pestaña grande lo necesita después. */
async function fetchReportSheetTabFilteredOnce(tab: string, filterCol: string, filterVal: string): Promise<TabRows> {
  const base = await requireUrl();
  const params = new URLSearchParams({ tab, filterCol, filterVal });
  const url = `${base}?${params.toString()}`;
  const res = await fetchWithTimeout(url, {}, 45_000);
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer "${tab}" filtrada por ${filterCol}="${filterVal}".`);
  return assertTabRowsShape(tab, await res.json());
}

async function fetchReportSheetTabFiltered(tab: string, filterCol: string, filterVal: string): Promise<TabRows> {
  return withRetries(`pestaña "${tab}" filtrada (${filterCol}="${filterVal}")`, () => fetchReportSheetTabFilteredOnce(tab, filterCol, filterVal));
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

/** "Resumen_Fac" venía dando HTTP 404 intermitentes al pedirla completa (ver
 * `fetchReportSheetTab` arriba) — Apps Script tardaba demasiado en responder
 * y Google cortaba la conexión. Sin fórmulas de por medio, el costo es
 * puramente de tamaño de página: una página más chica reduce el tiempo de
 * `getRange().getValues()` por request y lo aleja del límite de respuesta del
 * Web App. */
const RESUMEN_FAC_TAB_PAGE_SIZE = 5_000;

function pageSizeFor(tab: string): number {
  return tab === REPORT_TABS.resumenFac ? RESUMEN_FAC_TAB_PAGE_SIZE : TAB_PAGE_SIZE;
}

/** Cheap equality key for a dense row (array of primitives) — a ``-joined
 * string is collision-safe for these rows (spreadsheet cells never contain a
 * SOH control character) and avoids JSON.stringify's per-value quoting/escaping
 * cost at Resumen_Fac's row counts. See the dedup comment in `processTabInner`. */
function dedupKey(row: unknown[]): string {
  return row.join('');
}

/** How many pages of the SAME tab can be in flight at once. The first page is
 * always fetched alone (it's what reveals `rowCount`, which is what turns the
 * rest into a known list of offsets); once known, the remaining pages fan out
 * with this much concurrency instead of the old one-at-a-time `for(;;)` loop.
 * That's what took "Resumen_Fac" (~488k rows / ~98 pages of 5k) from ~98
 * sequential round-trips to Apps Script down to ~25 concurrent batches — each
 * page still costs Apps Script the same `getRange().getValues()`, but the
 * WAIT for all of them shrinks by roughly this factor. Kept modest (not, say,
 * 10) because Apps Script Web Apps have their own per-script concurrent
 * execution ceiling — too much parallelism just trades "slow" for "more 429s
 * and 404s", which defeats the point. */
const PAGE_FETCH_CONCURRENCY = 4;

/** Thrown by `fetchReportSheetTabPaginated` when some pages landed but at
 * least one exhausted its retries — carries whatever DID land so the caller
 * can still cache it instead of discarding a tab that was 95% downloaded.
 * `rows` is in page order (gaps from failed pages are simply absent, not
 * padded), so it under-represents the tab but never corrupts row order for
 * what it does contain. */
export class PartialTabFetchError extends Error {
  tab: string;
  partial: TabRows;
  pagesOk: number;
  pagesTotal: number;

  constructor(tab: string, partial: TabRows, pagesOk: number, pagesTotal: number, cause: unknown) {
    super(`Pestaña "${tab}": ${pagesOk}/${pagesTotal} páginas descargadas antes de fallar — ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'PartialTabFetchError';
    this.tab = tab;
    this.partial = partial;
    this.pagesOk = pagesOk;
    this.pagesTotal = pagesTotal;
  }
}

/** Fetches every row of a tab starting at `offset`, in pages of
 * `pageSizeFor(tab)`, calling `onPage` after each page lands so the caller
 * can report finer-grained progress than "waiting on the whole tab" for the
 * large ones. Returns the same `{ headers, rows, rowCount }` shape as a
 * single `fetchReportSheetTab` call would, with `rows` being everything
 * collected across all pages, IN ORDER (page N's rows always precede page
 * N+1's in the result, even though pages complete out of order under
 * concurrency).
 *
 * If a page ultimately fails (after `fetchReportSheetTab`'s own per-page
 * retries), the pages still in flight are allowed to finish — no point
 * discarding work already underway — and then `PartialTabFetchError` is
 * thrown carrying whatever succeeded, so the caller can persist that partial
 * coverage to `sheetsCache` instead of losing it outright (see
 * `processTabInner`'s catch below). */
async function fetchReportSheetTabPaginated(
  tab: string,
  offset: number,
  onPage?: (rowsSoFar: number, rowCount: number | undefined) => void,
): Promise<TabRows> {
  const pageSize = pageSizeFor(tab);

  // First page alone: it's what reveals rowCount (or, for an unpaginated/old
  // deployment, the whole tab in one shot — the two early-exit checks below
  // still apply to it like any other page).
  const first = await fetchReportSheetTab(tab, offset, pageSize);
  const headers = first.headers;
  const rowCount = first.rowCount;
  const pageRows: unknown[][][] = [first.rows];
  let rowsSoFar = first.rows.length;
  onPage?.(rowsSoFar, rowCount);

  const doneAlready =
    first.rows.length === 0 || // nothing more, or an unpaginated deployment already returned everything on page 1
    (typeof rowCount === 'number' && offset + first.rows.length >= rowCount) || // caught up to the reported total
    first.rows.length < pageSize; // short page with no rowCount to check against — nothing left

  if (!doneAlready && typeof rowCount === 'number') {
    // Remaining offsets are now fully known upfront — fan them out with
    // bounded concurrency instead of discovering them one `for(;;)` step at a
    // time. `pageRows[i]` reserves this page's slot so results land in order
    // regardless of completion order.
    const offsets: number[] = [];
    for (let o = offset + first.rows.length; o < rowCount; o += pageSize) offsets.push(o);
    for (let i = 0; i < offsets.length; i++) pageRows.push([]);

    let pagesOk = 1;
    let firstError: unknown = null;
    let nextIdx = 0;
    const worker = async () => {
      for (;;) {
        const i = nextIdx++;
        if (i >= offsets.length || firstError) return;
        try {
          const page = await fetchReportSheetTab(tab, offsets[i], pageSize);
          pageRows[i + 1] = page.rows;
          pagesOk += 1;
          rowsSoFar += page.rows.length;
          onPage?.(rowsSoFar, rowCount);
        } catch (e) {
          firstError = e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PAGE_FETCH_CONCURRENCY, offsets.length) }, worker));

    if (firstError) {
      const rows = pageRows.flat();
      throw new PartialTabFetchError(tab, { headers, rows, rowCount }, pagesOk, offsets.length + 1, firstError);
    }
  } else if (!doneAlready) {
    // No rowCount to plan offsets against (old deployment) — fall back to the
    // original sequential walk, one page revealing the next.
    let cursor = offset + first.rows.length;
    for (;;) {
      const page = await fetchReportSheetTab(tab, cursor, pageSize);
      pageRows.push(page.rows);
      rowsSoFar += page.rows.length;
      onPage?.(rowsSoFar, page.rowCount);
      if (page.rows.length === 0 || page.rows.length < pageSize) break;
      cursor += page.rows.length;
    }
  }

  return { headers, rows: pageRows.flat(), rowCount };
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
  /** Historical flag from when this sync had a delta mode — every tab is now
   * always fetched in full (see docs/apps-script-report-sheets.md §5), so
   * this no longer changes what gets fetched. Kept only because it still
   * wipes the dense-rows IndexedDB cache (`sheetsCache`), which is otherwise
   * used to fill in roles the caller didn't select this time. */
  forceFull?: boolean;
  /** Roles that must skip the nightly snapshot and go straight to live Apps
   * Script even if a fresh-enough snapshot is available — the "Actualizar en
   * vivo" override in Carga for `SNAPSHOT_ROLES` (Consumo/Resumen_Fac), for
   * when a user needs this-instant data mid-day instead of waiting for
   * tonight's snapshot. No effect on roles outside `SNAPSHOT_ROLES`, which
   * never use the snapshot path to begin with. */
  liveOverride?: SheetRole[];
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

  const roles = byPriority(params.selectedRoles && params.selectedRoles.length ? params.selectedRoles : REPORT_SHEET_ROLES);
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

    // Every selected tab is fetched in FULL (offset 0) — see the comment on
    // "Las 4 pestañas..." above and docs/apps-script-report-sheets.md §5 for
    // why the old delta scheme was dropped.
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

    // Fetched at most once per sync (both SNAPSHOT_ROLES share it), and only
    // if at least one of them will actually consult it — a sync that only
    // selected `sugerencias`/`resumenSinSugerencias`, or one where the user
    // hit "Actualizar en vivo" for both heavy tabs, shouldn't pay for a
    // manifest round-trip it will never use.
    let manifestPromise: Promise<SnapshotManifest | null> | null = null;
    function getManifestOnce(): Promise<SnapshotManifest | null> {
      if (!manifestPromise) manifestPromise = fetchSnapshotManifest();
      return manifestPromise;
    }

    /** Tries the nightly snapshot for a `SNAPSHOT_ROLES` tab; returns `null`
     * (never throws) if there's no snapshot, it's stale, or it's overridden
     * — any of which means "fall back to the live Apps Script path below". */
    async function tryFetchFromSnapshot(role: SheetRole, tab: string): Promise<TabRows | null> {
      if (!SNAPSHOT_ROLES.includes(role) || params.liveOverride?.includes(role)) return null;
      const manifest = await getManifestOnce();
      const entry = manifest?.tabs.find((t) => t.tab === tab);
      if (!entry) return null;
      const age = Date.now() - new Date(entry.generatedAt).getTime();
      if (!(age >= 0) || age > SNAPSHOT_MAX_AGE_MS) return null;
      try {
        return await fetchTabSnapshot(entry);
      } catch (e) {
        logWarn(`Snapshot de "${tab}" falló, se usará la vía en vivo: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    }

    /** Respaldo para "Resumen_Fac" cuando no hay snapshot (o falló): si ya
     * hay una copia previa en `sheetsCache` (de una sync completa, un
     * snapshot, o incluso una sync PARCIAL guardada por
     * `PartialTabFetchError` más abajo), pide solo el mes corriente vía
     * `fetchReportSheetTabFiltered` y lo fusiona sobre esa copia — ver el
     * comentario de `RESUMEN_FAC_MONTH_COL` arriba. Devuelve `null` (nunca
     * lanza) si no hay nada que fusionar o si el filtro mismo falla, lo que
     * hace que `processTabInner` caiga a la descarga completa de siempre. */
    async function tryFetchRecentMonthMerged(role: SheetRole, tab: string): Promise<TabRows | null> {
      if (role !== 'resumenFac') return null;
      const cached = await getCachedTab(tab);
      if (!cached || !cached.rows.length) return null;
      const monthColIdx = cached.headers.indexOf(RESUMEN_FAC_MONTH_COL);
      if (monthColIdx === -1) return null;

      const monthVal = currentMonthValue();
      let fresh: TabRows;
      try {
        fresh = await fetchReportSheetTabFiltered(tab, RESUMEN_FAC_MONTH_COL, monthVal);
      } catch (e) {
        logWarn(`Mes corriente de "${tab}" falló, se intentará la descarga completa: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
      const keptRows = cached.rows.filter((r) => String(r[monthColIdx] ?? '').trim() !== monthVal);
      logInfo('report-sheets-sync-recent-month', `${tab}: ${fresh.rows.length} filas de ${monthVal} + ${keptRows.length} históricas en caché`);
      return { headers: cached.headers, rows: [...keptRows, ...fresh.rows], rowCount: keptRows.length + fresh.rows.length };
    }

    async function processTab(role: SheetRole, tab: string, index: number): Promise<void> {
      try {
        await processTabInner(role, tab, index);
      } catch (e) {
        // A tab that fails partway through (e.g. Resumen_Fac's 404 after 90 of
        // 98 pages) still had most of its pages land successfully — persist
        // that partial coverage to sheetsCache instead of throwing it all
        // away, so the NEXT sync attempt (or a role-filling sync that skips
        // this role) has something better than nothing to fall back to. The
        // role is still reported as failed for THIS sync (buildAnalysisResult
        // falls back to `previous` for it, same as any other failure) — this
        // only improves what's sitting in the cache for later.
        if (e instanceof PartialTabFetchError) {
          await putCachedTab({
            tab,
            headers: e.partial.headers,
            rows: e.partial.rows,
            rowCount: e.partial.rowCount ?? e.partial.rows.length,
            syncedAt: new Date().toISOString(),
          }).catch(() => {});
          logWarn(`Pestaña "${tab}" quedó parcial en caché (${e.pagesOk}/${e.pagesTotal} páginas) tras el fallo.`);
        }
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
      const fromSnapshot = await tryFetchFromSnapshot(role, tab);
      const fromRecentMonth = fromSnapshot ? null : await tryFetchRecentMonthMerged(role, tab);
      let tabRows: TabRows;
      let viaSnapshot = false;
      let viaRecentMonth = false;

      if (fromSnapshot) {
        tabRows = fromSnapshot;
        viaSnapshot = true;
        emit({
          phase: 'parsing',
          percent: Math.round(10 + (60 * done) / tabs.length),
          message: `${ROLE_LABEL[role]}: snapshot nocturno (${tabRows.rows.length.toLocaleString('es-MX')} filas)`,
        });
      } else if (fromRecentMonth) {
        tabRows = fromRecentMonth;
        viaRecentMonth = true;
        emit({
          phase: 'parsing',
          percent: Math.round(10 + (60 * done) / tabs.length),
          message: `${ROLE_LABEL[role]}: mes corriente + histórico en caché (${tabRows.rows.length.toLocaleString('es-MX')} filas)`,
        });
      } else {
        // Todas las pestañas se traen completas (offset 0) — ver el comentario
        // de arriba. `forceFull` ya no cambia nada aquí (se deja el parámetro
        // por compatibilidad con la UI existente); el caché delta
        // (`sheetsCache`) solo sirve ahora para rellenar roles NO seleccionados
        // en una sync parcial (ver más abajo, fuera de este loop).
        const offset = 0;

        // Per-PAGE progress (not just per-tab): a cold "Reporte de Consumo"
        // sync (~80k rows) solía quedarse en el mismo porcentaje todo el tiempo
        // que tardaba esa sola petición. Ahora son varias peticiones más
        // chicas, así que se reporta progreso fraccional dentro del slot de
        // cada pestaña también.
        const reportPage = (rowsSoFar: number, rowCount: number | undefined) => {
          const remaining = typeof rowCount === 'number' ? Math.max(1, rowCount - offset) : null;
          const tabFrac = remaining ? Math.min(1, rowsSoFar / remaining) : 0;
          emit({
            phase: 'parsing',
            percent: Math.round(10 + (60 * (done + tabFrac)) / tabs.length),
            message: remaining && remaining > pageSizeFor(tab)
              ? `${ROLE_LABEL[role]}: ${rowsSoFar.toLocaleString('es-MX')} de ${remaining.toLocaleString('es-MX')} filas…`
              : `${ROLE_LABEL[role]} (${done} de ${tabs.length})`,
          });
        };

        tabRows = await fetchReportSheetTabPaginated(tab, offset, reportPage);
      }

      // Defensive dedup: "Todas las Sugerencias"/"Reporte de Consumo" son
      // salida de fórmulas vivas (QUERY/FILTER) o traen claves repetidas
      // legítimas en origen. Colapsar filas exactamente duplicadas (mismos
      // valores en el mismo orden), quedándose con la primera ocurrencia.
      // `dedupKey` (join, not JSON.stringify) is the same equality test for
      // these flat arrays-of-primitives rows but noticeably cheaper at
      // Resumen_Fac's ~488k-row scale — JSON.stringify re-walks each value
      // through its stringify machinery (quoting/escaping every string,
      // formatting every number) where a plain join just concatenates.
      const dedupSeen = new Set<string>();
      const dedupedRows = tabRows.rows.filter((row) => {
        const key = dedupKey(row);
        if (dedupSeen.has(key)) return false;
        dedupSeen.add(key);
        return true;
      });
      const merged: TabRows = {
        headers: tabRows.headers,
        rows: dedupedRows,
        rowCount: typeof tabRows.rowCount === 'number' ? tabRows.rowCount : tabRows.rows.length,
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
        message: `${ROLE_LABEL[role]}${viaSnapshot ? ' (snapshot)' : viaRecentMonth ? ' (mes corriente)' : ''} (${done} de ${tabs.length})`,
      });

      // `resumenFac` never gets its own partial build: it's the sole member
      // of the "pesada" wave (see below), so it always arrives last and the
      // real, final build runs immediately after via `await partialChain` —
      // a partial build here would just be a ~488k-row build thrown away a
      // few lines later. Combined with the other tabs, this caps a sync at 3
      // partial builds (one per tab in the "liviana" wave) instead of up to
      // 4, each of which re-runs `buildRF`/`buildAbc`/`buildPrecioDispersion`
      // over whatever's arrived so far AND re-renders `AnalyticsContext`'s
      // `useMemo` (invalidated by every `setActiveAnalysis`) — see
      // `AnalyticsContext.tsx`.
      if (params.onPartialResult && role !== 'resumenFac') {
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

    // Dos olas en vez de un solo Promise.all: las pestañas ligeras primero (en
    // paralelo entre sí, cada una pintándose apenas llega), Resumen_Fac —la
    // más pesada— arranca solo cuando esa ola termina. Ver ROLE_PRIORITY.
    const liviana = roles.map((role, i) => [role, i] as const).filter(([role]) => role !== 'resumenFac');
    const pesada = roles.map((role, i) => [role, i] as const).filter(([role]) => role === 'resumenFac');
    await Promise.all(liviana.map(([role, i]) => processTab(role, tabs[i], i)));
    await Promise.all(pesada.map(([role, i]) => processTab(role, tabs[i], i)));
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
