import { memo, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';

/** Ranking de items (code/desc/val) con barra de progreso y, opcionalmente, layout wide con rows de dos líneas. */
export const Ranking = memo(function Ranking({ title, items, money = false, onRow, wide = false, className, collapsible = false, storageKey = 'ranking.open', subLabel }: {
  title: string;
  /** Unidad de `valSub` (p.ej. "pzas/mes"), mostrada tras el número. */
  subLabel?: string;
  /** `valSub` is an optional second metric shown under `val` (e.g. avg
   * quantity under avg importe) — plain formatNumber, never currency. */
  items: { code: string; desc: string; val: number; valSub?: number; tip?: string }[];
  money?: boolean;
  onRow?: (code: string) => void;
  wide?: boolean;
  className?: string;
  /** Encabezado clicable que colapsa/expande la lista (abierto por defecto). */
  collapsible?: boolean;
  /** Clave de persistencia del estado abierto/cerrado (única por ranking). */
  storageKey?: string;
}) {
  const [openState, setOpen] = usePersistedState<boolean>(storageKey, true);
  const open = !collapsible || openState;
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.val)), [items]);
  if (wide) {
    return (
      <div className={cn('rounded-xl border border-border p-3', className)}>
        {collapsible ? (
          <button type="button" onClick={() => setOpen(!openState)} aria-expanded={open}
            className={cn('flex w-full items-center justify-between text-xs font-semibold text-text-muted', open && 'mb-2')}>
            <span>{title}</span>
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        ) : (
          <h4 className="mb-2 text-xs font-semibold text-text-muted">{title}</h4>
        )}
        {open && <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.length === 0 && <p className="text-xs text-text-faint">Sin datos.</p>}
          {items.map((it) => (
            <button
              key={it.code}
              type="button"
              onClick={() => onRow?.(it.code)}
              title={it.tip}
              className="group flex flex-col rounded px-2 py-1.5 text-left hover:bg-bg-inset border border-border/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn('font-medium text-xs', onRow && 'text-accent')}>{it.code}</span>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="font-mono text-sm font-medium tabular-nums">{money ? formatCurrency(it.val) : formatNumber(it.val)}</span>
                  {it.valSub !== undefined && <span className="font-mono text-xs tabular-nums text-text-faint">{formatNumber(it.valSub)}{subLabel ? ` ${subLabel}` : ''}</span>}
                </div>
              </div>
              <div className="text-[11px] text-text-faint whitespace-normal break-words">{it.desc}</div>
              <div className="mt-1 h-1 rounded-full bg-bg-inset">
                <div className="h-1 rounded-full bg-accent" style={{ width: `${(it.val / max) * 100}%` }} />
              </div>
            </button>
          ))}
        </div>}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border p-3">
      <h4 className="mb-2 text-xs font-semibold text-text-muted">{title}</h4>
      <div className="flex max-h-[132px] flex-col gap-1 overflow-y-auto pr-1">
        {items.length === 0 && <p className="text-xs text-text-faint">Sin datos.</p>}
        {items.map((it) => (
          <button
            key={it.code}
            type="button"
            onClick={() => onRow?.(it.code)}
            className="group grid grid-cols-[1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-bg-inset"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs">
                <span className={cn('truncate font-medium', onRow && 'text-accent')}>{it.code}</span>
                <span className="truncate text-text-faint">{it.desc}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-bg-inset">
                <div className="h-1 rounded-full bg-accent" style={{ width: `${(it.val / max) * 100}%` }} />
              </div>
            </div>
            <span className="font-mono text-xs tabular-nums">{money ? formatCurrency(it.val) : formatNumber(it.val)}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
