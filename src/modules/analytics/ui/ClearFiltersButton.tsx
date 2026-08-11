import { X } from 'lucide-react';

/** Botón "Limpiar filtros" — cada página define su propio `onClear` que
 * resetea sus `usePersistedState` a valor inicial. Si la página usa
 * `DebouncedSearch`, además debe bumpear una `key` (`clearTick`) para
 * remontarlo — ver comentario en DebouncedSearch.tsx sobre por qué no es
 * controlado directamente. */
export function ClearFiltersButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-2 text-sm text-text-faint hover:border-accent hover:text-accent"
    >
      <X className="size-3.5" />
      Limpiar filtros
    </button>
  );
}
