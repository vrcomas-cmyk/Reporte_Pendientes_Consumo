import { Filter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { valuesOf, type ActiveFilter, type FilterColumn } from './ColumnFilterBar';

/** Cuerpo del filtro de una columna al estilo Excel/Sheets: valores distintos
 * de esa columna (sobre el universo sin filtrar), búsqueda, "seleccionar
 * todo" y multi-select con checkbox — sin el `Popover` que lo envuelve, para
 * poder incrustarlo dentro de otro popover ya abierto (ver `ColumnFilterBar`,
 * que lo usa junto a un picker de columna en un solo flujo) además de en el
 * trigger standalone de `ColumnFilterMenu` de abajo. */
export function ColumnValuesPicker<T>({ column, rows, active, onChange, onBack, onDone }: {
  column: FilterColumn<T>;
  rows: T[];
  active: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
  /** Si viene, muestra un enlace "← columnas" arriba (usado por `ColumnFilterBar`
   * para volver al picker de columna sin cerrar el popover). */
  onBack?: () => void;
  /** Se llama al "Aplicar" — cierra el popover contenedor. */
  onDone: () => void;
}) {
  const [typed, setTyped] = useState('');

  const distinct = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { valuesOf(column, r).forEach((v) => { if (v) s.add(v); }); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [column, rows]);

  const activeSet = useMemo(() => new Set(active.find((f) => f.col === column.key)?.values ?? []), [active, column.key]);
  const hasActive = activeSet.size > 0;

  // Orden congelado en la apertura del popover: lo ya seleccionado va arriba,
  // a propósito sin reordenar en vivo — si lo hiciera, cada clic haría saltar
  // la fila que acabas de tocar. Radix desmonta el contenido al cerrar, así
  // que la próxima apertura vuelve a congelar con la selección vigente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pinned = useMemo(() => new Set(activeSet), []);
  const ordenados = useMemo(() => {
    const sel: string[] = [], resto: string[] = [];
    for (const v of distinct) (pinned.has(v) ? sel : resto).push(v);
    return [...sel, ...resto];
  }, [distinct, pinned]);

  const visible = typed.trim()
    ? ordenados.filter((v) => v.toLowerCase().includes(typed.toLowerCase()))
    : ordenados;
  const shown = visible.slice(0, 300);

  // Escribe (o crea) la entrada de esta columna EN SU SITIO, sin borrarla
  // nunca aquí: vaciar los valores la deja como `{col, values: []}` — el chip
  // sigue vivo hasta que se quita con su ✕ en la barra.
  const setValues = (values: Set<string>) => {
    const arr = [...values];
    const i = active.findIndex((f) => f.col === column.key);
    if (i < 0) { onChange([...active, { col: column.key, values: arr }]); return; }
    const next = active.slice();
    next[i] = { col: column.key, values: arr };
    onChange(next);
  };

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
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-1.5 text-xs text-text-faint hover:text-text">
          ← columnas
        </button>
      )}
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
          Deseleccionar todo
        </button>
        <button type="button" onClick={onDone} className="text-xs text-accent hover:underline">
          Aplicar
        </button>
      </div>
    </div>
  );
}

/** Menú de filtro de una columna al estilo Excel/Sheets — mismo `ActiveFilter[]`
 * que ya consume `passesFilters`; ninguna página cambia su lógica de filtrado
 * por usar esto en vez del picker fusionado de `ColumnFilterBar`. */
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

  const activeSet = useMemo(() => new Set(active.find((f) => f.col === column.key)?.values ?? []), [active, column.key]);
  const hasActive = activeSet.size > 0;

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
        <ColumnValuesPicker column={column} rows={rows} active={active} onChange={onChange} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
