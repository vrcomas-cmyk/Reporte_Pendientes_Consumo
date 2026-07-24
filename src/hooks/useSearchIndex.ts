import { useMemo } from 'react';
import { searchNorm, matchesQueryNormalized } from '@/modules/analytics/helpers';

// ---------------------------------------------------------------------------
// useSearchIndex · precomputes the search-normalized haystack for every row
// once (per row identity change), so keystroke-by-keystroke filtering over
// tens of thousands of rows doesn't redo the normalize() call on every row.
// Previously ConsumoPage had a hand-rolled equivalent inline; Sugerencias/
// Inventario/ResumenSin rebuilt the haystack on every keystroke. Centralizing
// the pattern here lets every table page consume the same memo.
// ---------------------------------------------------------------------------

/**
 * @param rows       rows to index
 * @param getHaystack builds the raw haystack string for a row (concat the
 *                   searchable fields with spaces)
 * @returns `{ index, matches }`:
 *   - index[i] = searchNorm(getHaystack(rows[i]))
 *   - matches(query) returns the subset of row indices whose haystack contains
 *     every whitespace-separated token of query.
 */
export function useSearchIndex<T>(
  rows: T[],
  getHaystack: (row: T) => string,
): {
  index: string[];
  matches: (query: string) => number[];
} {
  const index = useMemo(
    () => rows.map((r) => searchNorm(getHaystack(r))),
    [rows, getHaystack],
  );

  const matches = (query: string): number[] => {
    const q = searchNorm(query);
    if (!q) return index.map((_, i) => i);
    const out: number[] = [];
    for (let i = 0; i < index.length; i++) {
      if (matchesQueryNormalized(q, index[i])) out.push(i);
    }
    return out;
  };

  return { index, matches };
}

/** Convenience: returns the filtered array directly instead of indices. */
export function useFilteredRows<T>(
  rows: T[],
  getHaystack: (row: T) => string,
  query: string,
): T[] {
  const matches = useMemo(() => {
    const q = searchNorm(query);
    if (!q) return null;
    return rows.reduce<number[]>((acc, r, i) => {
      if (matchesQueryNormalized(q, searchNorm(getHaystack(r)))) acc.push(i);
      return acc;
    }, []);
  }, [rows, getHaystack, query]);

  if (matches === null) return rows;
  return matches.map((i) => rows[i]);
}
