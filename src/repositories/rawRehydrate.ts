import type { AnalysisResult } from '@/core/types';
import { getAllCachedTabs } from './sheetsCache';

/** Rehydrates the per-row `raw` field of an `AnalysisResult` after it's read
 * back from IndexedDB, where it was stripped on write (see `LocalReportRepository
 * saveAnalysis` + `blobCodec.encodeSnapshot({stripField:'raw'})`). `raw` carries
 * every source-sheet column dynamically by header — pages like Consumo, the
 * analytics helpers and resumenSin read legacy/RC.* columns from it; dropping
 * it from persistence roughly halves the Parquet snapshot size (the same
 * columns are already encoded once in typed fields like `gpoCte`, `material`).
 *
 * Rehydrate here by looking up the dense-rows cache (`sheetsCache`, populated by
 * the report-sheets sync) for each of the three report sheets that carry `raw`,
 * and zipping `headers × rows[i]` back into `{header: value}` objects. Rows
 * line up 1:1 with the corresponding typed array as long as both came from the
 * same sync — the source arrays are produced by pure, order-preserving mappers,
 * and the cache holds exactly those rows densely.
 *
 * Best-effort: when the cache is missing or shorter than the typed array (e.g.
 * a restore on a new device that never ran a sync), rows without a matching
 * dense counterpart get an empty-object `raw` — pages that reach for a
 * dynamic column then see `undefined`, never throw. */

const ROLE_TO_TAB: Array<{ field: 'sugerencias' | 'resumenSinSugerencias' | 'consumo'; tab: string }> = [
  { field: 'sugerencias', tab: 'Todas las Sugerencias' },
  { field: 'resumenSinSugerencias', tab: 'Resumen Sin Sugerencias' },
  { field: 'consumo', tab: 'Reporte de Consumo' },
];

function zipOne(headers: string[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i];
  return obj;
}

export async function rehydrateRaw(result: AnalysisResult): Promise<AnalysisResult> {
  try {
    const cached = await getAllCachedTabs();
    const byTab = new Map(cached.map((c) => [c.tab, c]));

    for (const { field, tab } of ROLE_TO_TAB) {
      const arr = result[field] as Array<{ raw?: Record<string, unknown> }>;
      if (!arr || !arr.length) continue;
      // Skip if `raw` was already persisted (older snapshot pre-strip) — leave
      // those rows untouched so we never downgrade an existing analysis.
      if (arr[0].raw && Object.keys(arr[0].raw).length) continue;

      const entry = byTab.get(tab);
      if (!entry || !entry.headers.length || entry.rows.length < arr.length) {
        // No match — give every row a vacía `raw` so consumers get `undefined`
        // rather than `undefined` itself (preserves the typed shape contract).
        for (const r of arr) r.raw = {};
        continue;
      }

      for (let i = 0; i < arr.length; i++) {
        arr[i].raw = zipOne(entry.headers, entry.rows[i] as unknown[]);
      }
    }
    return result;
  } catch {
    // Any cache/zip failure is non-fatal — the analysis is still useful for
    // KPIs/dashboard; pages with dynamic-column reads will fall back to '' / 0.
    return result;
  }
}
