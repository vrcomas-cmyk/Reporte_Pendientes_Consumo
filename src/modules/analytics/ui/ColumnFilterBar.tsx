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
export interface ActiveFilter { col: string; value: string }

export function valuesOf<T>(col: FilterColumn<T>, row: T): string[] {
  if (col.getMany) return col.getMany(row);
  return col.get ? [col.get(row)] : [];
}

/** Aplica los quick-filters a una fila: valores de la misma columna son OR, entre columnas son AND. Compartido por todas las vistas. */
export function passesFilters<T>(row: T, columns: FilterColumn<T>[], active: ActiveFilter[]): boolean {
  if (!active.length) return true;
  const byCol = new Map<string, string[]>();
  for (const f of active) {
    const arr = byCol.get(f.col);
    if (arr) arr.push(f.value); else byCol.set(f.col, [f.value]);
  }
  for (const [key, values] of byCol) {
    const col = columns.find((c) => c.key === key);
    if (!col) continue;
    const rowValues = valuesOf(col, row);
    if (!values.some((v) => rowValues.includes(v))) return false;
  }
  return true;
}

/** Barra de filtros multi-columna (Material AND Ejecutivo AND Estado…), estilo
 * Excel: UN botón por columna con filtro activo (no uno por valor elegido) —
 * clic en ese botón reabre el mismo popover de valores, ya con lo elegido
 * marcado, para seguir buscando/agregando/quitando valores del mismo filtro
 * sin generar botones nuevos por cada uno. "+ Filtro" arranca un filtro en
 * una columna todavía sin elegir. */
export function ColumnFilterBar<T>({ columns, rows, active, onChange }: {
  columns: FilterColumn<T>[];
  rows: T[];
  active: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickCol, setPickCol] = useState('');
  const [colSearch, setColSearch] = useState('');
  const [editingCol, setEditingCol] = useState<string | null>(null);

  const closeAndReset = () => { setOpen(false); setPickCol(''); setColSearch(''); };
  const pickedColumn = columns.find((c) => c.key === pickCol) ?? null;
  const columnsShown = colSearch.trim()
    ? columns.filter((c) => c.label.toLowerCase().includes(colSearch.toLowerCase()))
    : columns;

  const activeByCol: [string, string[]][] = [];
  for (const f of active) {
    const entry = activeByCol.find(([col]) => col === f.col);
    if (entry) entry[1].push(f.value); else activeByCol.push([f.col, [f.value]]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeByCol.map(([col, values]) => {
        const column = columns.find((c) => c.key === col);
        const label = column?.label || col;
        const valueText = values.length > 2 ? `${values.slice(0, 2).join(', ')} +${values.length - 2}` : values.join(', ');
        return (
          <Popover key={col} open={editingCol === col} onOpenChange={(v) => setEditingCol(v ? col : null)}>
            <div className="inline-flex items-center overflow-hidden rounded-full bg-accent-soft text-xs text-accent">
              <PopoverTrigger asChild>
                <button type="button" title="Clic para buscar, agregar o quitar valores de este filtro" className="py-1 pl-2 pr-1 hover:bg-accent/20">
                  {label}: {valueText}
                </button>
              </PopoverTrigger>
              <button
                type="button"
                onClick={() => onChange(active.filter((x) => x.col !== col))}
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
          {!pickedColumn ? (
            <div>
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
                {columnsShown.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setPickCol(c.key)}
                    className="flex w-full items-center rounded px-1.5 py-1.5 text-left text-xs hover:bg-bg-inset"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ColumnValuesPicker
              column={pickedColumn}
              rows={rows}
              active={active}
              onChange={onChange}
              onBack={() => setPickCol('')}
              onDone={closeAndReset}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
