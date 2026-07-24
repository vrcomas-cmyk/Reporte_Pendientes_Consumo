import { catalogRepository } from '@/repositories';
import { parseCatalog } from './analysisService';
import { mapEjecutivo, mapMaterial, mapInvConsolidado, mapInvDetalle } from '@/core/mappers';
import { logInfo } from '@/lib/logError';
import type { CatalogSnapshot, ProcessingProgress } from '@/core/types';

/** Google Apps Script endpoint (one Sync workbook, four tabs, no auth) — same
 * source the legacy portal used. Provided at build time via the VITE_APPSCRIPT_URL
 * env var (see .env.example) so the endpoint is never hardcoded in the repo. */
const APPSCRIPT_URL = import.meta.env.VITE_APPSCRIPT_URL as string | undefined;
const APPSCRIPT_TABS = {
  ejecutivos: 'Ejecutivos',
  materiales: 'Materiales',
  invConsolidado: 'InvConsolidado',
  invDetalle: 'InvDetalle',
} as const;

async function fetchAppScriptTab(tab: string): Promise<Record<string, unknown>[]> {
  if (!APPSCRIPT_URL) {
    throw new Error('Falta configurar VITE_APPSCRIPT_URL. Copia ".env.example" a ".env.local" y coloca la URL del AppScript.');
  }
  const url = `${APPSCRIPT_URL}?tab=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la pestaña "${tab}" del catálogo.`);
  const data = await res.json();
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/** Fetches the sync catalog live from the AppScript endpoint (no xlsx upload
 * needed — the response is already row-object JSON per tab, so this maps
 * directly through the same pure mappers the xlsx-parsing worker path uses).
 * Persists the result and replaces whatever was cached, same as the manual
 * "Actualizar" flow used to. */
export async function syncCatalogFromAppScript(): Promise<CatalogSnapshot> {
  const [ejecutivosRows, materialesRows, invConsolidadoRows, invDetalleRows] = await Promise.all([
    fetchAppScriptTab(APPSCRIPT_TABS.ejecutivos),
    fetchAppScriptTab(APPSCRIPT_TABS.materiales),
    fetchAppScriptTab(APPSCRIPT_TABS.invConsolidado),
    fetchAppScriptTab(APPSCRIPT_TABS.invDetalle),
  ]);
  const catalog: CatalogSnapshot = {
    id: 'current',
    fileName: 'Ejecutivos y materiales (Sync) · AppScript',
    loadedAt: new Date().toISOString(),
    ejecutivos: ejecutivosRows.map(mapEjecutivo),
    materiales: materialesRows.map(mapMaterial),
    invConsolidado: invConsolidadoRows.map(mapInvConsolidado),
    invDetalle: invDetalleRows.map(mapInvDetalle),
  };
  await catalogRepository.save(catalog);
  void logInfo('catalog-load', `AppScript sync: ${catalog.materiales.length} materiales, ${catalog.ejecutivos.length} ejecutivos`);
  return catalog;
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
