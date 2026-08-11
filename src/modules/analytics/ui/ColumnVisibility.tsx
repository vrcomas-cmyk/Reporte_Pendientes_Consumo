import { useState } from 'react';
import { Columns3 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip';

export interface ColDef { key: string; label: string }

function readStoredHidden(storageKey: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(raw) ? new Set(raw) : new Set();
  } catch {
    return new Set();
  }
}
function writeStoredHidden(storageKey: string, hidden: Set<string>): void {
  try { localStorage.setItem(storageKey, JSON.stringify([...hidden])); } catch { /* ignore */ }
}

/** Visibilidad de columnas, persistida en localStorage por `storageKey` (por
 * tabla) — antes se perdía al recargar y había que re-ocultar las mismas
 * columnas cada vez que se entraba a la página. */
export function useColumnVisibility(storageKey: string) {
  const [hidden, setHiddenState] = useState<Set<string>>(() => readStoredHidden(storageKey));
  const setHidden = (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setHiddenState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      writeStoredHidden(storageKey, resolved);
      return resolved;
    });
  };
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

/** Lista de checkboxes de columnas — presentacional, sin popover. Reutilizada
 * por `ColumnVisibilityControl` (botón + popover, dentro de cada página de
 * reporte) y directamente por `SettingsPage.tsx` (sección "Columnas
 * visibles"), ambas apuntando al mismo `hidden`/`toggle` — un solo lugar de
 * verdad, cambiar desde Ajustes se refleja en la página y en los paneles que
 * comparten esa misma `storageKey`. */
export function ColumnChecklist({ columns, hidden, toggle, reset }: {
  columns: ColDef[];
  hidden: Set<string>;
  toggle: (key: string) => void;
  reset: () => void;
}) {
  return (
    <div>
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
  );
}

/** Botón + panel para ocultar/mostrar columnas de una tabla. Persistido en
 * localStorage (`useColumnVisibility`) — no "solo esta sesión": sobrevive a
 * recargar y es la misma preferencia que la sección "Columnas visibles" de
 * Ajustes edita. */
export function ColumnVisibilityControl({ columns, hidden, toggle, reset }: {
  columns: ColDef[];
  hidden: Set<string>;
  toggle: (key: string) => void;
  reset: () => void;
}) {
  return (
    <Popover>
      <TooltipHint text="Mostrar/ocultar columnas (también editable desde Ajustes)">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm text-text-muted hover:bg-bg-inset"
          >
            <Columns3 className="size-3.5" />
            Columnas{hidden.size > 0 ? ` (${hidden.size} ocultas)` : ''}
          </button>
        </PopoverTrigger>
      </TooltipHint>
      <PopoverContent className="max-h-80 w-56 overflow-auto">
        <ColumnChecklist columns={columns} hidden={hidden} toggle={toggle} reset={reset} />
      </PopoverContent>
    </Popover>
  );
}
