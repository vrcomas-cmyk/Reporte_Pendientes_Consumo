import { rowsToParquet, parquetToRows } from '@/services/duckdbService';
import type { Table } from 'dexie';

/** Detects IndexedDB's persistent-storage quota exceeded condition — either the
 *  modern DOMException name 'QuotaExceededError' or its legacy code 22 — and
 *  re-throws a friendlier Error so the UI can offer a clear "clear cache /
 *  export & delete analyses" recovery path instead of a bare IndexedDB error. */
function isQuotaExceeded(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.code === 22)
  );
}

export function quotaExceededMessage(): string {
  return (
    'No hay espacio suficiente en el almacenamiento del navegador. ' +
    'Exporta y elimina análisis antiguos o limpia la caché del catálogo, ' +
    'luego vuelve a intentarlo.'
  );
}

/** IndexedDB write of a Parquet-encoded snapshot. Wraps `table.put` so the
 *  QuotaExceededError detection lives next to the codec that produced the
 *  blobs; callers stay one-liners and get the friendly message for free. */
export async function putSnapshot<T, K>(
  table: Table<T, K>,
  row: T,
): Promise<K> {
  try {
    return (await table.put(row)) as K;
  } catch (e) {
    if (isQuotaExceeded(e)) throw new Error(quotaExceededMessage());
    throw e;
  }
}

/** Splits an object into its array-valued fields (each Parquet-encoded, the
 * actual bulk of the data) and everything else (kept as plain JSON). Used to
 * shrink what CatalogSnapshot/AnalysisResult cost in IndexedDB — the arrays
 * (resumenFac, sugerencias, invDetalle, ...) are what blow up JSON storage;
 * scalar/meta fields are negligible either way. */
export async function encodeSnapshot<T extends object>(
  obj: T,
): Promise<{ meta: Partial<T>; blobs: Record<string, Uint8Array> }> {
  const meta: Record<string, unknown> = {};
  const blobs: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      blobs[key] = await rowsToParquet(value);
    } else {
      meta[key] = value;
    }
  }
  return { meta: meta as Partial<T>, blobs };
}

export async function decodeSnapshot<T extends object>(
  meta: Partial<T>,
  blobs: Record<string, Uint8Array>,
): Promise<T> {
  const out: Record<string, unknown> = { ...meta };
  for (const [key, buf] of Object.entries(blobs)) {
    out[key] = await parquetToRows(buf);
  }
  return out as T;
}
