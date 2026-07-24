import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface FilterColumn<T> { key: string; label: string; get: (row: T) => string }
export interface ActiveFilter { col: string; value: string }

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
    if (!values.includes(col.get(row))) return false;
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
  const [typed, setTyped] = useState('');

  const distinctForCol = useMemo(() => {
    if (!pickCol) return [] as string[];
    const col = columns.find((c) => c.key === pickCol);
    if (!col) return [] as string[];
    const s = new Set<string>();
    rows.forEach((r) => { const v = col.get(r); if (v) s.add(v); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [pickCol, columns, rows]);

  const options = pickCol
    ? distinctForCol.filter((v) => v.toLowerCase().includes(typed.toLowerCase())).slice(0, 25)
    : [];

  const addFilter = (col: string, value: string) => {
    if (!value) return;
    onChange([...active.filter((f) => f.col !== col), { col, value }]);
    setAdding(false); setPickCol(''); setTyped('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((f) => {
        const col = columns.find((c) => c.key === f.col);
        return (
          <button key={f.col} type="button" onClick={() => onChange(active.filter((x) => x.col !== f.col))} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-xs text-accent">
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
          <select value={pickCol} onChange={(ev) => { setPickCol(ev.target.value); setTyped(''); }} className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs" autoFocus>
            <option value="">Columna…</option>
            {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {pickCol && (
            <div className="relative">
              <input
                autoFocus
                value={typed}
                onChange={(ev) => setTyped(ev.target.value)}
                placeholder="Buscar valor…"
                className="h-8 w-40 rounded-md border border-border bg-bg-elevated px-2 text-xs"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && options[0]) addFilter(pickCol, options[0]);
                  if (ev.key === 'Escape') { setAdding(false); setPickCol(''); }
                }}
              />
              {options.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-56 overflow-auto rounded-md border border-border bg-bg-elevated shadow-lg">
                  {options.map((o) => (
                    <button key={o} type="button" onClick={() => addFilter(pickCol, o)} className="block w-full truncate px-2 py-1 text-left text-xs hover:bg-bg-inset">{o}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={() => { setAdding(false); setPickCol(''); }} className="text-text-faint hover:text-text"><X className="size-3.5" /></button>
        </div>
      )}
    </div>
  );
}
