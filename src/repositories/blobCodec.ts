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

/** Options for {@link encodeSnapshot}. */
export interface EncodeSnapshotOptions {
  /** When serializing each array-valued field to Parquet, strip this key from
   * every element of every array first. The key (e.g. `raw`) is rehydrated
   * on read by {@link decodeSnapshot} if a rehydrator is provided — or simply
   * left absent otherwise. Used by `LocalReportRepository.saveAnalysis` to
   * avoid persisting the per-row `raw` duplicate of every source column,
   * which roughly doubles the Parquet size of the big arrays (sugerencias,
   * consumo, …). The trade-off is the consumer must be able to live without
   * `raw` after a restore (or rehydrate it from the dense-rows cache). */
  stripField?: string;
}

/** Splits an object into its array-valued fields (each Parquet-encoded, the
 * actual bulk of the data) and everything else (kept as plain JSON). Used to
 * shrink what CatalogSnapshot/AnalysisResult cost in IndexedDB — the arrays
 * (resumenFac, sugerencias, invDetalle, ...) are what blow up JSON storage;
 * scalar/meta fields are negligible either way. */
export async function encodeSnapshot<T extends object>(
  obj: T,
  opts: EncodeSnapshotOptions = {},
): Promise<{ meta: Partial<T>; blobs: Record<string, Uint8Array> }> {
  const { stripField } = opts;
  const stripFieldKey = stripField && stripField.length > 0 ? stripField : null;
  const meta: Record<string, unknown> = {};
  const blobs: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      const rows = stripFieldKey ? stripKeyFromArray(value, stripFieldKey) : value;
      blobs[key] = await rowsToParquet(rows);
    } else {
      meta[key] = value;
    }
  }
  return { meta: meta as Partial<T>, blobs };
}

function stripKeyFromArray(rows: unknown[], key: string): unknown[] {
  const out: unknown[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      out[i] = row;
      continue;
    }
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k !== key) copy[k] = v;
    }
    out[i] = copy;
  }
  return out;
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
