import { useEffect, useState } from 'react';
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
export function ColumnChecklist({ columns, hidden, toggle, reset, onMove }: {
  columns: ColDef[];
  hidden: Set<string>;
  toggle: (key: string) => void;
  reset: () => void;
  /** Si se pasa, cada columna muestra su posición editable: escribir otro número la coloca ahí y recorre las demás. */
  onMove?: (key: string, posicion: number) => void;
}) {
  return (
    <div>
      {hidden.size > 0 && (
        <button type="button" onClick={reset} className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-accent hover:bg-bg-inset">
          Mostrar todas
        </button>
      )}
      {onMove && <p className="px-2 pb-1 text-[11px] text-text-faint">Escribe el número de posición para mover una columna.</p>}
      {columns.map((c, i) => (
        <div key={c.key} className="flex items-center gap-1 rounded px-1 hover:bg-bg-inset">
          {onMove && <PosicionColumna posicion={i + 1} total={columns.length} etiqueta={c.label} onCommit={(p) => onMove(c.key, p)} />}
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm">
            <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggle(c.key)} />
            <span className="truncate">{c.label}</span>
          </label>
        </div>
      ))}
    </div>
  );
}

/** Posición de una columna, editable. El valor se aplica al salir del campo o con Enter (no a cada tecla: «10» no debe pasar antes por «1»); Escape lo deja como estaba. */
function PosicionColumna({ posicion, total, etiqueta, onCommit }: { posicion: number; total: number; etiqueta: string; onCommit: (posicion: number) => void }) {
  const [borrador, setBorrador] = useState(String(posicion));
  // Al reordenar, la lista se vuelve a numerar: el campo sigue a la posición real.
  useEffect(() => setBorrador(String(posicion)), [posicion]);
  const aplicar = () => {
    const n = Number.parseInt(borrador, 10);
    if (!Number.isFinite(n)) { setBorrador(String(posicion)); return; }
    const acotada = Math.min(Math.max(n, 1), total);
    setBorrador(String(acotada));
    if (acotada !== posicion) onCommit(acotada);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={borrador}
      onChange={(e) => setBorrador(e.target.value.replace(/\D/g, '').slice(0, 3))}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); aplicar(); (e.target as HTMLInputElement).blur(); }
        else if (e.key === 'Escape') { setBorrador(String(posicion)); (e.target as HTMLInputElement).blur(); }
      }}
      onFocus={(e) => e.target.select()}
      aria-label={`Posición de la columna ${etiqueta} (1 a ${total})`}
      title={`Posición (1 a ${total})`}
      className="h-6 w-9 shrink-0 rounded border border-border bg-bg-elevated text-center text-xs tabular-nums text-text outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

/** Botón + panel para ocultar/mostrar columnas de una tabla. Persistido en
 * localStorage (`useColumnVisibility`) — no "solo esta sesión": sobrevive a
 * recargar y es la misma preferencia que la sección "Columnas visibles" de
 * Ajustes edita. */
export function ColumnVisibilityControl({ columns, hidden, toggle, reset, onMove }: {
  columns: ColDef[];
  hidden: Set<string>;
  toggle: (key: string) => void;
  reset: () => void;
  /** Ver `ColumnChecklist`: habilita escribir la posición de cada columna. */
  onMove?: (key: string, posicion: number) => void;
}) {
  return (
    <Popover>
      <TooltipHint text={onMove ? 'Mostrar/ocultar columnas y cambiar su orden escribiendo la posición' : 'Mostrar/ocultar columnas (también editable desde Ajustes)'}>
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
      <PopoverContent className={onMove ? 'max-h-96 w-64 overflow-auto' : 'max-h-80 w-56 overflow-auto'}>
        <ColumnChecklist columns={columns} hidden={hidden} toggle={toggle} reset={reset} onMove={onMove} />
      </PopoverContent>
    </Popover>
  );
}
