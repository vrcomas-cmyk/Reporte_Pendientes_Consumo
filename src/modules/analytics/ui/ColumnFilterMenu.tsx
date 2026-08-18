import { Filter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { valuesOf, type ActiveFilter, type FilterColumn } from './ColumnFilterBar';

/** Menú de filtro de una columna al estilo Excel/Sheets: valores distintos de
 * esa columna (sobre el universo sin filtrar), búsqueda, "seleccionar todo" y
 * multi-select con checkbox. Emite el mismo `ActiveFilter[]` que ya consume
 * `passesFilters` — ninguna página cambia su lógica de filtrado por usar esto
 * en vez del autocomplete de un solo valor de `ColumnFilterBar`. */
export function ColumnFilterMenu<T>({ column, rows, active, onChange, trigger, open: openProp, onOpenChange, onClose }: {
  column: FilterColumn<T>;
  rows: T[];
  active: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
  trigger?: React.ReactNode;
  /** Controlado: si se pasa, el popover se abre/cierra desde afuera (p. ej. al elegir la columna en `ColumnFilterBar`). Sin esto, maneja su propio estado. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v); else setUncontrolledOpen(v);
    if (!v) onClose?.();
  };
  const [typed, setTyped] = useState('');

  const distinct = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { valuesOf(column, r).forEach((v) => { if (v) s.add(v); }); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [column, rows]);

  const activeSet = useMemo(() => new Set(active.filter((f) => f.col === column.key).map((f) => f.value)), [active, column.key]);
  const hasActive = activeSet.size > 0;

  const visible = typed.trim()
    ? distinct.filter((v) => v.toLowerCase().includes(typed.toLowerCase()))
    : distinct;
  const shown = visible.slice(0, 300);

  const others = active.filter((f) => f.col !== column.key);
  const setValues = (values: Set<string>) => onChange([...others, ...[...values].map((value) => ({ col: column.key, value }))]);

  const toggle = (v: string) => {
    const next = new Set(activeSet);
    if (next.has(v)) next.delete(v); else next.add(v);
    setValues(next);
  };

  const allVisibleSelected = shown.length > 0 && shown.every((v) => activeSet.has(v));
  const someVisibleSelected = shown.some((v) => activeSet.has(v));
  const toggleAllVisible = () => {
    const next = new Set(activeSet);
    if (allVisibleSelected) shown.forEach((v) => next.delete(v));
    else shown.forEach((v) => next.add(v));
    setValues(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            title={`Filtrar por ${column.label}`}
            className={cn('rounded p-0.5 hover:bg-bg-inset', hasActive ? 'text-accent' : 'text-text-faint opacity-60 hover:opacity-100')}
          >
            <Filter className="size-3" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Buscar en ${column.label}…`}
          className="mb-1.5 h-8 w-full rounded-md border border-border bg-bg-elevated px-2 text-xs"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs font-medium hover:bg-bg-inset">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
            onChange={toggleAllVisible}
          />
          Seleccionar todo{typed.trim() ? ' (resultados)' : ''}
        </label>
        <div className="mt-1 max-h-56 overflow-auto border-t border-border pt-1">
          {shown.length === 0 && <div className="px-1.5 py-2 text-xs text-text-faint">Sin valores</div>}
          {shown.map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-bg-inset">
              <input type="checkbox" checked={activeSet.has(v)} onChange={() => toggle(v)} />
              <span className="truncate">{v}</span>
            </label>
          ))}
          {visible.length > shown.length && (
            <div className="px-1.5 py-1 text-[11px] text-text-faint">+{visible.length - shown.length} más — sigue escribiendo para acotar</div>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5">
          <button
            type="button"
            disabled={!hasActive}
            onClick={() => setValues(new Set())}
            className="text-xs text-text-faint hover:text-text disabled:opacity-40"
          >
            Limpiar columna
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-accent hover:underline">
            Aplicar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
