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
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-danger/30 bg-danger/10 px-2.5 text-sm font-medium text-danger hover:border-danger/50 hover:bg-danger/20"
    >
      <X className="size-3.5" />
      Limpiar filtros
    </button>
  );
}
