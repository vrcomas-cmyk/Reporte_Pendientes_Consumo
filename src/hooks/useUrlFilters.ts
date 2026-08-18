import { useEffect, useRef } from 'react';
import type { ActiveFilter } from '@/modules/analytics/ui';

const PARAM = 'f';

function encode(filters: ActiveFilter[]): string {
  return filters.map((f) => `${encodeURIComponent(f.col)}:${encodeURIComponent(f.value)}`).join('|');
}
function decode(raw: string): ActiveFilter[] {
  if (!raw) return [];
  return raw.split('|').map((chunk) => {
    const i = chunk.indexOf(':');
    if (i < 0) return null;
    return { col: decodeURIComponent(chunk.slice(0, i)), value: decodeURIComponent(chunk.slice(i + 1)) };
  }).filter((f): f is ActiveFilter => !!f);
}

/**
 * Sincroniza `ActiveFilter[]` con `?f=col:val|col:val2` en la URL, para poder
 * compartir un link con el reporte ya filtrado. Se compone sobre el
 * `usePersistedState('<pagina>.quick', [])` que ya usan las páginas: si la
 * URL trae `?f=`, gana sobre lo persistido en localStorage (una sola vez, al
 * montar); después, cada cambio de filtros se refleja en la URL con
 * `replaceState` (sin ensuciar el historial de "atrás").
 */
export function useUrlFilters(quick: ActiveFilter[], setQuick: (v: ActiveFilter[]) => void): void {
  const appliedFromUrl = useRef(false);

  useEffect(() => {
    if (appliedFromUrl.current) return;
    appliedFromUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(PARAM);
    if (raw) setQuick(decode(raw));
    // Solo al montar — el resto de cambios de `quick` los escribe el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!appliedFromUrl.current) return;
    const url = new URL(window.location.href);
    if (quick.length) url.searchParams.set(PARAM, encode(quick));
    else url.searchParams.delete(PARAM);
    window.history.replaceState(window.history.state, '', url);
  }, [quick]);
}
