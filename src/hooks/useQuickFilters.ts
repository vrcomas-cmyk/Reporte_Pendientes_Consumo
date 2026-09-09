import { useCallback, useMemo } from 'react';
import { normalizeFilters, type ActiveFilter } from '@/modules/analytics/ui/ColumnFilterBar';
import { usePersistedState } from './usePersistedState';
import { useUrlFilters } from './useUrlFilters';

/**
 * Punto único para el estado de los quick-filters (`ColumnFilterBar`) de una
 * página: persistencia en localStorage + sincronización con `?f=` en la URL,
 * ambas ya provistas por `usePersistedState`/`useUrlFilters`, más
 * `normalizeFilters` en cada entrada y salida — así cualquier dato guardado
 * antes de este cambio (localStorage con formato `{col, value}`, un link
 * viejo, o una vista guardada que embebe `quick`) se migra solo, sin
 * versionar el storage.
 *
 * `storageKey` sigue la misma convención que el resto de `usePersistedState`
 * (`'<pagina>.quick'`).
 */
export function useQuickFilters(storageKey: string): [ActiveFilter[], (v: ActiveFilter[]) => void] {
  const [raw, setRaw] = usePersistedState<ActiveFilter[]>(storageKey, []);
  const quick = useMemo(() => normalizeFilters(raw), [raw]);
  const setQuick = useCallback((v: ActiveFilter[]) => setRaw(normalizeFilters(v)), [setRaw]);
  useUrlFilters(quick, setQuick);
  return [quick, setQuick];
}
