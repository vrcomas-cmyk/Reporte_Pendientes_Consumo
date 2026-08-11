import { useState } from 'react';

// AppShell.tsx anima cada ruta con `<motion.div key={location.pathname}>` —
// cambiar de ruta le da al Outlet una key distinta, así que React desmonta
// por completo la página anterior. Un `useState` normal de filtros se pierde
// ahí: volver a un reporte siempre arrancaba con los filtros en blanco.
// Persistido en localStorage bajo el prefijo `filter-state:` — mismo patrón
// que `useColumnVisibility`/`useSavedViews` — así los filtros sobreviven
// tanto la navegación entre reportes como recargar la pestaña (F5).
// `key` debe ser único por página + campo (convención: `'sugerencias.q'',
// 'consumo.estado'`…) — dos páginas usando la misma key comparten valor.
const STORAGE_PREFIX = 'filter-state:';

function readStored<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw != null ? (JSON.parse(raw) as T) : initial;
  } catch {
    return initial;
  }
}
function writeStored<T>(key: string, value: T): void {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}

/**
 * Reemplazo directo de `useState` (misma firma de retorno) cuyo valor
 * persiste en localStorage — sobrevive tanto la navegación entre reportes
 * como recargar la pestaña.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, initial));

  function setAndCache(next: T | ((prev: T) => T)) {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      writeStored(key, resolved);
      return resolved;
    });
  }

  return [value, setAndCache];
}
