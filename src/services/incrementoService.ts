import { incrementoRepository } from '@/repositories';
import { mapIncrementoCosto } from '@/core/mappers';
import { logInfo } from '@/lib/logError';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { getConnector, CONNECTOR_KEYS } from '@/services/connectorsService';
import type { IncrementoSnapshot } from '@/core/types';

/** Google Apps Script endpoint for the "Incremento de costos" Sheet — one
 * tab (`IncrementoCostosTab`), same no-auth GET-by-tab contract as the sync
 * catalog (see catalogService.ts). Resolved from the admin-editable
 * `degasa_connectors` row (see /admin · Conectores), falling back to the
 * build-time VITE_INCREMENTO_URL env var when that row is empty or
 * Supabase is unreachable. */
const INCREMENTO_URL_ENV = import.meta.env.VITE_INCREMENTO_URL as string | undefined;
const INCREMENTO_COSTOS_TAB = 'IncrementoCostos';

async function fetchIncrementoTab(): Promise<Record<string, unknown>[]> {
  const url = await getConnector(CONNECTOR_KEYS.incrementoCostosUrl, INCREMENTO_URL_ENV);
  if (!url) {
    throw new Error('Falta configurar el conector "Apps Script · Incremento de costos" (Admin) o VITE_INCREMENTO_URL.');
  }
  const res = await fetchWithTimeout(`${url}?tab=${encodeURIComponent(INCREMENTO_COSTOS_TAB)}`, {}, 15_000);
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la pestaña "${INCREMENTO_COSTOS_TAB}".`);
  const data = await res.json();
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/** Fetches the "Incremento de costos" Sheet live from its AppScript endpoint
 * and persists it, replacing whatever was cached — same "no upload needed"
 * flow as `syncCatalogFromAppScript`. */
export async function syncIncrementoFromAppScript(): Promise<IncrementoSnapshot> {
  const rows = await fetchIncrementoTab();
  const snapshot: IncrementoSnapshot = {
    id: 'current',
    fileName: 'Incremento de costos · AppScript',
    loadedAt: new Date().toISOString(),
    vigenciaDesde: '',
    motivo: '',
    temporal: false,
    rows: rows.map(mapIncrementoCosto),
  };
  await incrementoRepository.save(snapshot);
  void logInfo('incremento-load', `AppScript sync: ${snapshot.rows.length} materiales con incremento`);
  return snapshot;
}

/** Loads the cached "Incremento de costos" snapshot from IndexedDB, if any.
 * Never touches the network — this is the "don't reload until the user
 * clicks Actualizar" path. */
export async function getCachedIncremento(): Promise<IncrementoSnapshot | null> {
  return incrementoRepository.getCached();
}
