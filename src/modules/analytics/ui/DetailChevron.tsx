import { ChevronRight } from 'lucide-react';

/** Un solo clic, siempre visible (no requiere doble-clic ni hover para descubrirlo), con hit-target propio para que un clic accidental en el resto de la fila no dispare la apertura del detalle. */
export function DetailChevron({ onOpen, label = 'Ver detalle' }: { onOpen: () => void; label?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className="inline-flex size-6 items-center justify-center rounded-md text-text-faint opacity-60 transition-opacity hover:bg-bg-inset hover:text-accent hover:opacity-100 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
    >
      <ChevronRight className="size-4" />
    </button>
  );
}
