import { X, Target } from 'lucide-react';

/** Aviso de que la tabla llegó prefiltrada desde el HUB del módulo
 * Oportunidades (req. 9) — visible porque DebouncedSearch no puede reflejar
 * el filtro en su propio input (es no controlado por diseño). */
export function PrefiltroBanner({ material, onClear }: { material: string; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs text-accent">
      <Target className="size-3.5 shrink-0" />
      <span>Filtrado desde Oportunidades por material <span className="font-mono">{material}</span></span>
      <button type="button" onClick={onClear} className="ml-auto shrink-0 hover:opacity-70" aria-label="Quitar filtro">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
