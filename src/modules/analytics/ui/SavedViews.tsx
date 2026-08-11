import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip';

export interface SavedView<T> { name: string; state: T }

function load<T>(storageKey: string): SavedView<T>[] {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
}

/** Vistas guardadas (nombre + snapshot arbitrario de estado) persistidas en localStorage, entre sesiones. */
export function useSavedViews<T>(storageKey: string) {
  const [views, setViews] = useState<SavedView<T>[]>(() => load<T>(storageKey));

  const persist = (next: SavedView<T>[]) => {
    setViews(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const save = (name: string, state: T) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    persist([...views.filter((v) => v.name !== trimmed), { name: trimmed, state }]);
  };
  const remove = (name: string) => persist(views.filter((v) => v.name !== name));

  return { views, save, remove };
}

/** Botón + panel para guardar/aplicar/borrar vistas nombradas (p.ej. combinaciones de columnas visibles). */
export function SavedViewsControl<T>({ views, onApply, onSave, onRemove }: {
  views: SavedView<T>[];
  onApply: (state: T) => void;
  onSave: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const doSave = () => {
    if (!name.trim()) return;
    onSave(name);
    setName('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipHint text="Guardar o aplicar vistas (persisten entre sesiones)">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm text-text-muted hover:bg-bg-inset"
          >
            <Bookmark className="size-3.5" />
            Vistas{views.length > 0 ? ` (${views.length})` : ''}
          </button>
        </PopoverTrigger>
      </TooltipHint>
      <PopoverContent className="w-64">
        {views.length === 0 && <div className="px-2 py-1.5 text-xs text-text-faint">Sin vistas guardadas</div>}
        {views.map((v) => (
          <div key={v.name} className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-bg-inset">
            <button type="button" onClick={() => { onApply(v.state); setOpen(false); }} className="flex-1 truncate rounded px-1 py-1 text-left text-sm">
              {v.name}
            </button>
            <TooltipHint text="Borrar vista">
              <button type="button" onClick={() => onRemove(v.name)} aria-label="Borrar vista" className="rounded p-1 text-text-faint opacity-0 hover:text-red-500 group-hover:opacity-100">
                <Trash2 className="size-3.5" />
              </button>
            </TooltipHint>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-1 border-t border-border pt-1">
          <input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter') doSave(); }}
            placeholder="Nombre de la vista"
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded border border-border bg-bg px-2 text-sm"
          />
          <button type="button" onClick={doSave} disabled={!name.trim()} className="h-8 shrink-0 rounded bg-accent px-2 text-xs text-accent-fg disabled:opacity-40">
            Guardar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
