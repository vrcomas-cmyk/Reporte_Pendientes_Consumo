import { useMemo, useState, useCallback } from 'react';
import type { SortDir } from '@/components/ui/table';

export type SortAccessors<T> = Record<string, (row: T) => string | number>;

/**
 * Generic 3-state (asc -> desc -> none) column sorter.
 * `accessors` maps a sortKey to a function extracting the comparable value from a row.
 */
export function useSort<T>(rows: T[], accessors: SortAccessors<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>(null);

  const toggleSort = useCallback((key: string) => {
    setSortKey((prevKey) => {
      if (prevKey !== key) {
        setDir('asc');
        return key;
      }
      setDir((prevDir) => {
        if (prevDir === 'asc') return 'desc';
        if (prevDir === 'desc') return null;
        return 'asc';
      });
      return key;
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sortKey || !dir) return rows;
    const get = accessors[sortKey];
    if (!get) return rows;
    const withIdx = rows.map((r, i) => ({ r, i }));
    withIdx.sort((a, b) => {
      const av = get(a.r);
      const bv = get(b.r);
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });
      if (cmp === 0) cmp = a.i - b.i;
      return dir === 'asc' ? cmp : -cmp;
    });
    return withIdx.map((x) => x.r);
  }, [rows, sortKey, dir, accessors]);

  return { sorted, sortKey, dir, toggleSort };
}
