import { useEffect, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';

export interface ColDef { key: string; label: string }

/** Visibilidad de columnas por sesión: no persiste al recargar, solo mientras se usa la tabla. */
export function useColumnVisibility() {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const isVisible = (key: string) => !hidden.has(key);
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const reset = () => setHidden(new Set());
  const apply = (keys: string[]) => setHidden(new Set(keys));
  return { hidden, isVisible, toggle, reset, apply };
}

/** Botón + panel para ocultar/mostrar columnas de una tabla, solo para la sesión actual. */
export function ColumnVisibilityControl({ columns, hidden, toggle, reset }: {
  columns: ColDef[];
  hidden: Set<string>;
  toggle: (key: string) => void;
  reset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm text-text-muted hover:bg-bg-inset"
        title="Mostrar/ocultar columnas (solo esta sesión)"
      >
        <Columns3 className="size-3.5" />
        Columnas{hidden.size > 0 ? ` (${hidden.size} ocultas)` : ''}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-border bg-bg-elevated p-1 shadow-lg">
          {hidden.size > 0 && (
            <button type="button" onClick={reset} className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-accent hover:bg-bg-inset">
              Mostrar todas
            </button>
          )}
          {columns.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-bg-inset">
              <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
