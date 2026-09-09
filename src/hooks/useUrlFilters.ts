import { useEffect, useRef } from 'react';
// Import directo del módulo (no del barrel `@/modules/analytics/ui`): el
// barrel re-exporta componentes que a su vez cargan `supabaseClient` al
// importarse, lo que rompe este hook en tests que no levantan ese cliente.
import { normalizeFilters, type ActiveFilter } from '@/modules/analytics/ui/ColumnFilterBar';

const PARAM = 'f';

/** `?f=col:val1,val2|col2:` — una entrada por columna, valores separados por
 * coma (una columna sin valores todavía sale como `col:`, sin lista). Los
 * valores pasan por `encodeURIComponent`, así que una coma literal dentro de
 * un valor queda escapada y no se confunde con el separador. */
export function encode(filters: ActiveFilter[]): string {
  return filters.map((f) => `${encodeURIComponent(f.col)}:${f.values.map(encodeURIComponent).join(',')}`).join('|');
}
/** Tolera además el formato legado `col:val` (una entrada por valor, sin
 * comas) — `normalizeFilters` fusiona entradas repetidas de la misma
 * columna, así que un link viejo con la misma columna varias veces sigue
 * funcionando. */
export function decode(raw: string): ActiveFilter[] {
  if (!raw) return [];
  const parsed = raw.split('|').map((chunk) => {
    const i = chunk.indexOf(':');
    if (i < 0) return null;
    const col = decodeURIComponent(chunk.slice(0, i));
    const rest = chunk.slice(i + 1);
    const values = rest ? rest.split(',').map(decodeURIComponent).filter(Boolean) : [];
    return { col, values };
  }).filter((f): f is ActiveFilter => !!f);
  return normalizeFilters(parsed);
}

/**
 * Sincroniza `ActiveFilter[]` con `?f=col:val1,val2|col2:` en la URL, para
 * poder compartir un link con el reporte ya filtrado. Se compone sobre el
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
