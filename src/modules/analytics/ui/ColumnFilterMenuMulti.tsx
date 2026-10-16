import { Filter } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ActiveFilter, FilterColumn } from './ColumnFilterBar';
import { ColumnFilterMenu, ColumnValuesPicker } from './ColumnFilterMenu';

/** Embudo de un encabezado que reúne VARIAS columnas de filtro (p. ej. "Pedido/OC", "Sector/Grupo"): con una sola columna es el
 * `ColumnFilterMenu` de siempre; con varias, primero se elige cuál y luego sus valores (mismo `ActiveFilter[]` que `passesFilters`). */
export function ColumnFilterMenuMulti<T>({ columns, rows, active, onChange }: {
  columns: readonly FilterColumn<T>[];
  rows: T[];
  active: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  if (columns.length === 0) return null;
  if (columns.length === 1) return <ColumnFilterMenu column={columns[0]!} rows={rows} active={active} onChange={onChange} />;

  const hayActivo = columns.some((c) => (active.find((f) => f.col === c.key)?.values.length ?? 0) > 0);
  const columna = columns.find((c) => c.key === elegida);
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setElegida(null); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title={`Filtrar por ${columns.map((c) => c.label).join(' / ')}`}
          className={cn('rounded p-0.5 hover:bg-bg-inset', hayActivo ? 'text-accent' : 'text-text-faint opacity-60 hover:opacity-100')}
        >
          <Filter className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        {columna ? (
          <ColumnValuesPicker column={columna} rows={rows} active={active} onChange={onChange} onBack={() => setElegida(null)} onDone={() => { setOpen(false); setElegida(null); }} />
        ) : (
          <div className="flex flex-col gap-0.5">
            <div className="px-1.5 pb-1 text-[11px] text-text-faint">Filtrar por…</div>
            {columns.map((c) => {
              const n = active.find((f) => f.col === c.key)?.values.length ?? 0;
              return (
                <button key={c.key} type="button" onClick={() => setElegida(c.key)} className="flex items-center justify-between rounded px-1.5 py-1 text-left text-xs hover:bg-bg-inset">
                  <span>{c.label}</span>
                  {n > 0 && <span className="text-accent">{n}</span>}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
