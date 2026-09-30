import { catalogRepository } from '@/repositories';
import { parseCatalog } from './analysisService';
import { mapGerenciaMarca, mapEjecutivo, mapMaterial, mapInvConsolidado, mapInvDetalle } from '@/core/mappers';
import { logInfo, logWarn } from '@/lib/logError';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { getConnector, CONNECTOR_KEYS } from '@/services/connectorsService';
import type { CatalogSnapshot, ProcessingProgress } from '@/core/types';

/** Google Apps Script endpoint (one Sync workbook, four tabs, no auth) — same
 * source the legacy portal used. Resolved from the admin-editable
 * `degasa_connectors` row (see /admin · Conectores), falling back to the
 * build-time VITE_APPSCRIPT_URL env var (see .env.example) when that row is
 * empty or Supabase is unreachable. */
const APPSCRIPT_URL_ENV = import.meta.env.VITE_APPSCRIPT_URL as string | undefined;
const APPSCRIPT_TABS = {
  ejecutivos: 'Ejecutivos',
  materiales: 'Materiales',
  invConsolidado: 'InvConsolidado',
  invDetalle: 'InvDetalle',
  gerenciaMarca: 'GERENCIA DE MARCA',
} as const;

/** Apps Script tab reads (e.g. `getDataRange()`) commonly pull a few trailing
 * blank rows past the real data — a row where every cell is empty/whitespace
 * isn't a material, it's sheet padding, so it's dropped before mapping. */
function isBlankRow(r: Record<string, unknown>): boolean {
  return Object.values(r).every((v) => v === undefined || v === null || String(v).trim() === '');
}

/** Apps Script tarda varios segundos en leer pestañas grandes (Materiales,
 * InvDetalle); 15 s era muy justo y una sola pestaña lenta tiraba TODA la
 * sincronización. Por eso 45 s + un reintento ante fallo de red/timeout. */
const TAB_TIMEOUT_MS = 45_000;
const TAB_RETRY_DELAY_MS = 1_500;

async function fetchAppScriptTabOnce(appscriptUrl: string, tab: string): Promise<Record<string, unknown>[]> {
  const url = `${appscriptUrl}?tab=${encodeURIComponent(tab)}`;
  const res = await fetchWithTimeout(url, {}, TAB_TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la pestaña "${tab}" del catálogo.`);
  const data = await res.json();
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  return Array.isArray(data) ? (data as Record<string, unknown>[]).filter((r) => !isBlankRow(r)) : [];
}

async function fetchAppScriptTab(tab: string): Promise<Record<string, unknown>[]> {
  const appscriptUrl = await getConnector(CONNECTOR_KEYS.appscriptCatalogUrl, APPSCRIPT_URL_ENV);
  if (!appscriptUrl) {
    throw new Error('Falta configurar el conector "Apps Script · Catálogo" (Admin) o VITE_APPSCRIPT_URL.');
  }
  try {
    return await fetchAppScriptTabOnce(appscriptUrl, tab);
  } catch (err) {
    void logWarn('catalog-load', `Pestaña "${tab}" falló (${String(err)}); reintentando una vez.`);
    await new Promise((r) => setTimeout(r, TAB_RETRY_DELAY_MS));
    return fetchAppScriptTabOnce(appscriptUrl, tab);
  }
}

/** Fetches the sync catalog live from the AppScript endpoint (no xlsx upload
 * needed — the response is already row-object JSON per tab, so this maps
 * directly through the same pure mappers the xlsx-parsing worker path uses).
 * Persists the result and replaces whatever was cached, same as the manual
 * "Actualizar" flow used to. */
export async function syncCatalogFromAppScript(): Promise<CatalogSnapshot> {
  const [ejecutivosRows, materialesRows, invConsolidadoRows, invDetalleRows, gerenciaRows] = await Promise.all([
    fetchAppScriptTab(APPSCRIPT_TABS.ejecutivos),
    fetchAppScriptTab(APPSCRIPT_TABS.materiales),
    fetchAppScriptTab(APPSCRIPT_TABS.invConsolidado),
    fetchAppScriptTab(APPSCRIPT_TABS.invDetalle),
    // Tolerante: si la pestaña aún no existe o falla, el catálogo carga igual.
    fetchAppScriptTab(APPSCRIPT_TABS.gerenciaMarca).catch((err) => {
      void logWarn('catalog-load', `Pestaña "${APPSCRIPT_TABS.gerenciaMarca}" no disponible: ${String(err)}`);
      return [] as Record<string, unknown>[];
    }),
  ]);
  const catalog: CatalogSnapshot = {
    id: 'current',
    fileName: 'Ejecutivos y materiales (Sync) · AppScript',
    loadedAt: new Date().toISOString(),
    ejecutivos: ejecutivosRows.map(mapEjecutivo),
    materiales: materialesRows.map(mapMaterial),
    invConsolidado: invConsolidadoRows.map(mapInvConsolidado),
    invDetalle: invDetalleRows.map(mapInvDetalle),
    gerenciaMarca: gerenciaRows.map(mapGerenciaMarca).filter((g) => g.gerente && g.sector),
  };
  await catalogRepository.save(catalog);
  void logInfo('catalog-load', `AppScript sync: ${catalog.materiales.length} materiales, ${catalog.ejecutivos.length} ejecutivos`);
  return catalog;
}

// ---------------------------------------------------------------------------
// Sincronización automática. El catálogo se edita a lo largo del día en Google
// Sheets, así que (a diferencia del reporte diario, que se revisa una vez al
// día) se revisa al abrir, al volver a la pestaña y cada pocos minutos.
// ---------------------------------------------------------------------------
const CATALOG_META_KEY = 'catalog-sync-meta';
/** No volver a preguntar al Sheet antes de este tiempo (salvo `force`). */
const MIN_RECHECK_MS = 5 * 60_000;
/** Si el Apps Script no sabe responder `?meta=1`, se refresca por antigüedad. */
const FALLBACK_MAX_AGE_MS = 30 * 60_000;

interface CatalogSyncMeta {
  modifiedTime?: string;
  checkedAt?: string;
}

function readMeta(): CatalogSyncMeta {
  try {
    return JSON.parse(localStorage.getItem(CATALOG_META_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeMeta(meta: CatalogSyncMeta): void {
  try {
    localStorage.setItem(CATALOG_META_KEY, JSON.stringify(meta));
  } catch {
    // worst case: se vuelve a revisar en la siguiente oportunidad
  }
}

/** `modifiedTime` del Spreadsheet del catálogo (Drive), sin leer filas. Devuelve
 * `null` si el Apps Script aún no implementa `?meta=1` o falla — en ese caso
 * quien llama cae al refresco por antigüedad. */
export async function fetchCatalogMeta(): Promise<string | null> {
  try {
    const appscriptUrl = await getConnector(CONNECTOR_KEYS.appscriptCatalogUrl, APPSCRIPT_URL_ENV);
    if (!appscriptUrl) return null;
    const res = await fetchWithTimeout(`${appscriptUrl}?meta=1`, {}, 10_000);
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' && typeof (data as { modifiedTime?: unknown }).modifiedTime === 'string'
      ? (data as { modifiedTime: string }).modifiedTime
      : null;
  } catch {
    return null;
  }
}

export interface CatalogCheckResult {
  changed: boolean;
  catalog?: CatalogSnapshot;
}

async function runCatalogCheck(force: boolean, cachedLoadedAt: string | null | undefined): Promise<CatalogCheckResult> {
  const meta = readMeta();
  const now = Date.now();

  // Sin catálogo local o sync manual: descargar directo.
  if (force || !cachedLoadedAt) {
    const modifiedTime = await fetchCatalogMeta();
    const catalog = await syncCatalogFromAppScript();
    writeMeta({ modifiedTime: modifiedTime ?? meta.modifiedTime, checkedAt: new Date().toISOString() });
    return { changed: true, catalog };
  }

  if (meta.checkedAt && now - Date.parse(meta.checkedAt) < MIN_RECHECK_MS) return { changed: false };

  const modifiedTime = await fetchCatalogMeta();
  const stale = now - Date.parse(cachedLoadedAt) > FALLBACK_MAX_AGE_MS;
  const hasChanged = modifiedTime ? modifiedTime !== meta.modifiedTime : stale;
  if (!hasChanged) {
    writeMeta({ modifiedTime: modifiedTime ?? meta.modifiedTime, checkedAt: new Date().toISOString() });
    return { changed: false };
  }
  const catalog = await syncCatalogFromAppScript();
  writeMeta({ modifiedTime: modifiedTime ?? meta.modifiedTime, checkedAt: new Date().toISOString() });
  return { changed: true, catalog };
}

let checkInFlight: Promise<CatalogCheckResult> | null = null;

/** Revisa si el catálogo del Sheet cambió y, si es así, lo descarga y lo
 * persiste. Una sola ejecución a la vez: el arranque, el foco de la pestaña y
 * el intervalo comparten la misma promesa en vez de lanzar descargas dobles. Si
 * falla, el catálogo cacheado sigue intacto y el error se propaga. */
export function checkForCatalogUpdate(
  opts: { force?: boolean; cachedLoadedAt?: string | null } = {},
): Promise<CatalogCheckResult> {
  checkInFlight ??= runCatalogCheck(!!opts.force, opts.cachedLoadedAt).finally(() => {
    checkInFlight = null;
  });
  return checkInFlight;
}

/** Loads the cached catalog from IndexedDB, if any. Never touches the
 * worker/xlsx — this is the "don't reload until user clicks Actualizar"
 * path. */
export async function getCachedCatalog(): Promise<CatalogSnapshot | null> {
  return catalogRepository.getCached();
}

/** Parses a fresh catalog xlsx (drag&drop / file picker) via the worker and
 * persists it, replacing whatever was cached. Only called explicitly by the
 * user ("Actualizar"). */
export async function loadCatalogFromFile(
  file: File,
  onProgress?: (p: ProcessingProgress) => void,
): Promise<CatalogSnapshot> {
  const buffer = await file.arrayBuffer();
  const { promise } = parseCatalog(buffer, file.name, { onProgress });
  const catalog = await promise;
  await catalogRepository.save(catalog);
  void logInfo('catalog-load', `${file.name}: ${catalog.materiales.length} materiales, ${catalog.ejecutivos.length} ejecutivos`);
  return catalog;
}
