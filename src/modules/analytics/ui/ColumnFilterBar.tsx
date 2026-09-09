import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ColumnValuesPicker } from './ColumnFilterMenu';

/** `get` is for columns with one clean value per row (equality match).
 * `getMany` is for rows that can belong to several values at once (e.g. a
 * material present in more than one centro) — matching becomes "row has
 * this value among its own" instead of exact equality, and distinct-value
 * enumeration flattens every row's values instead of taking one per row.
 * A column defines exactly one of the two. */
export interface FilterColumn<T> { key: string; label: string; get?: (row: T) => string; getMany?: (row: T) => string[] }
/** Una entrada por columna filtrada — `values` vacío significa "campo
 * agregado, sin restringir todavía" (el chip queda vivo, en "todos", hasta
 * que se quita con su ✕; no se borra solo al deseleccionar todo). */
export interface ActiveFilter { col: string; values: string[] }

export function valuesOf<T>(col: FilterColumn<T>, row: T): string[] {
  if (col.getMany) return col.getMany(row);
  return col.get ? [col.get(row)] : [];
}

/** Acepta tanto el formato actual (`{col, values}`) como el legado
 * `{col, value}` (localStorage/URLs guardados antes de este cambio, y vistas
 * guardadas viejas) — fusiona entradas repetidas de la misma columna y
 * deduplica valores. Idempotente: llamarla sobre datos ya normalizados no
 * cambia nada, así que sirve como migración sin versionar el storage. */
export function normalizeFilters(raw: unknown): ActiveFilter[] {
  if (!Array.isArray(raw)) return [];
  const order: string[] = [];
  const byCol = new Map<string, Set<string>>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const col = (item as { col?: unknown }).col;
    if (typeof col !== 'string' || !col) continue;
    let values: unknown[];
    if (Array.isArray((item as { values?: unknown }).values)) values = (item as { values: unknown[] }).values;
    else if ('value' in item) values = [(item as { value?: unknown }).value];
    else values = [];
    let set = byCol.get(col);
    if (!set) { set = new Set(); byCol.set(col, set); order.push(col); }
    for (const v of values) if (typeof v === 'string' && v) set.add(v);
  }
  return order.map((col) => ({ col, values: [...(byCol.get(col) ?? [])] }));
}

/** Aplica los quick-filters a una fila: valores de la misma columna son OR,
 * entre columnas son AND. Una columna con `values` vacío no restringe (está
 * agregada pero "en todos"). Compartido por todas las vistas. */
export function passesFilters<T>(row: T, columns: FilterColumn<T>[], active: ActiveFilter[]): boolean {
  for (const f of active) {
    if (!f.values.length) continue;
    const col = columns.find((c) => c.key === f.col);
    if (!col) continue;
    const rowValues = valuesOf(col, row);
    if (!f.values.some((v) => rowValues.includes(v))) return false;
  }
  return true;
}

/** Barra de filtros multi-columna (Material AND Ejecutivo AND Estado…), estilo
 * Excel: UN chip por columna agregada — clic en el chip abre el popover de
 * valores, ya con lo elegido marcado, para seguir buscando/agregando/quitando
 * valores del mismo filtro sin generar chips nuevos por cada uno. El chip
 * vive hasta que se quita con su ✕, aunque quede sin valores elegidos ("+
 * Filtro" agrega el campo; vaciar sus valores no lo elimina). */
export function ColumnFilterBar<T>({ columns, rows, active, onChange }: {
  columns: FilterColumn<T>[];
  rows: T[];
  active: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [colSearch, setColSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editingCol, setEditingCol] = useState<string | null>(null);

  const activeCols = new Set(active.map((f) => f.col));
  const closeAndReset = () => { setOpen(false); setColSearch(''); setChecked(new Set()); };
  const columnsShown = colSearch.trim()
    ? columns.filter((c) => c.label.toLowerCase().includes(colSearch.toLowerCase()))
    : columns;

  const toggleChecked = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key); else next.add(key);
    setChecked(next);
  };
  const agregar = () => {
    const nuevas = [...checked].filter((k) => !activeCols.has(k)).map((col) => ({ col, values: [] as string[] }));
    if (nuevas.length) onChange([...active, ...nuevas]);
    closeAndReset();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((f) => {
        const column = columns.find((c) => c.key === f.col);
        const label = column?.label || f.col;
        const hasValues = f.values.length > 0;
        const valueText = hasValues
          ? (f.values.length > 2 ? `${f.values.slice(0, 2).join(', ')} +${f.values.length - 2}` : f.values.join(', '))
          : 'todos';
        return (
          <Popover key={f.col} open={editingCol === f.col} onOpenChange={(v) => setEditingCol(v ? f.col : null)}>
            <div className={`inline-flex items-center overflow-hidden rounded-full text-xs ${hasValues ? 'bg-accent-soft text-accent' : 'bg-bg-inset text-text-muted'}`}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={hasValues ? 'Clic para buscar, agregar o quitar valores de este filtro' : 'Filtro agregado sin valores — no restringe aún. Clic para elegir valores.'}
                  className="py-1 pl-2 pr-1 hover:bg-accent/20"
                >
                  {label}: {valueText}
                </button>
              </PopoverTrigger>
              <button
                type="button"
                onClick={() => onChange(active.filter((x) => x.col !== f.col))}
                title={`Quitar filtro de ${label}`}
                className="py-1 pl-1 pr-2 hover:bg-accent/20"
              >
                <X className="size-3" />
              </button>
            </div>
            <PopoverContent align="start" className="w-64 p-2">
              {column && (
                <ColumnValuesPicker
                  column={column}
                  rows={rows}
                  active={active}
                  onChange={onChange}
                  onDone={() => setEditingCol(null)}
                />
              )}
            </PopoverContent>
          </Popover>
        );
      })}
      <Popover open={open} onOpenChange={(v) => { if (v) setOpen(true); else closeAndReset(); }}>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-accent/40 bg-accent-soft px-2 text-xs font-medium text-accent hover:bg-accent/20">
            <Plus className="size-3" /> Filtro
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <input
            autoFocus
            autoComplete="off"
            value={colSearch}
            onChange={(e) => setColSearch(e.target.value)}
            placeholder="Buscar columna…"
            className="mb-1.5 h-8 w-full rounded-md border border-border bg-bg-elevated px-2 text-xs"
          />
          <div className="max-h-56 overflow-auto">
            {columnsShown.length === 0 && <div className="px-1.5 py-2 text-xs text-text-faint">Sin columnas</div>}
            {columnsShown.map((c) => {
              const yaAgregado = activeCols.has(c.key);
              return (
                <label
                  key={c.key}
                  className={`flex items-center gap-2 rounded px-1.5 py-1.5 text-xs ${yaAgregado ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-bg-inset'}`}
                  title={yaAgregado ? 'Ya agregado' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={yaAgregado || checked.has(c.key)}
                    disabled={yaAgregado}
                    onChange={() => toggleChecked(c.key)}
                  />
                  {c.label}
                </label>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-end border-t border-border pt-1.5">
            <button
              type="button"
              disabled={checked.size === 0}
              onClick={agregar}
              className="text-xs text-accent hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              Agregar{checked.size ? ` (${checked.size})` : ''}
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
