import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ColumnFilterMenu } from './ColumnFilterMenu';

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

/** Barra de filtros multi-columna (Material AND Ejecutivo AND Estado…), cada uno elegido desde un autocomplete de los valores distintos de esa columna (computado perezosamente). */
export function ColumnFilterBar<T>({ columns, rows, active, onChange }: {
  columns: FilterColumn<T>[];
  rows: T[];
  active: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pickCol, setPickCol] = useState('');

  const pickedColumn = useMemo(() => columns.find((c) => c.key === pickCol) ?? null, [columns, pickCol]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((f) => {
        const col = columns.find((c) => c.key === f.col);
        return (
          <button key={`${f.col}:${f.value}`} type="button" onClick={() => onChange(active.filter((x) => !(x.col === f.col && x.value === f.value)))} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-xs text-accent">
            {col?.label || f.col}: {f.value} <X className="size-3" />
          </button>
        );
      })}
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-text-faint hover:border-accent hover:text-accent">
          <Plus className="size-3" /> Filtro
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <select value={pickCol} onChange={(ev) => setPickCol(ev.target.value)} className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs" autoFocus>
            <option value="">Columna…</option>
            {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {pickedColumn && (
            <ColumnFilterMenu
              column={pickedColumn}
              rows={rows}
              active={active}
              onChange={onChange}
              open
              onOpenChange={(v) => { if (!v) { setAdding(false); setPickCol(''); } }}
              trigger={<button type="button" className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs">Valores…</button>}
            />
          )}
          <button type="button" onClick={() => { setAdding(false); setPickCol(''); }} className="text-text-faint hover:text-text"><X className="size-3.5" /></button>
        </div>
      )}
    </div>
  );
}
