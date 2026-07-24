import { ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const ZOOM_LEVELS = ['text-[11px]', 'text-xs', 'text-sm'] as const;
const ZOOM_ROW = ['[&_td]:py-1 [&_th]:h-7', '[&_td]:py-2 [&_th]:h-9', '[&_td]:py-3 [&_th]:h-10'] as const;

/** Hook de zoom por tabla: nivel 0=compacto, 1=normal, 2=confortable. Devuelve clases listas para aplicar a la tabla. */
export function useZoom(initial = 1) {
  const [level, setLevel] = useState(initial);
  const className = cn(ZOOM_LEVELS[level], ZOOM_ROW[level]);
  return { level, setLevel, className };
}

/** Control de zoom reutilizable: reduce/amplía font-size y densidad de la tabla a la que pertenece sin afectar la página. */
export function ZoomControl({ level, setLevel }: { level: number; setLevel: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-bg-elevated p-0.5">
      <button type="button" title="Reducir" disabled={level <= 0} onClick={() => setLevel(Math.max(0, level - 1))} className="rounded p-1 text-text-faint hover:bg-bg-inset disabled:opacity-30">
        <ZoomOut className="size-3.5" />
      </button>
      <button type="button" title="Ampliar" disabled={level >= ZOOM_LEVELS.length - 1} onClick={() => setLevel(Math.min(ZOOM_LEVELS.length - 1, level + 1))} className="rounded p-1 text-text-faint hover:bg-bg-inset disabled:opacity-30">
        <ZoomIn className="size-3.5" />
      </button>
    </div>
  );
}
