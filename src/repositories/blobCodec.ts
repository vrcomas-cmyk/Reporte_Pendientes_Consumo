import { rowsToParquet, parquetToRows } from '@/services/duckdbService';

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
