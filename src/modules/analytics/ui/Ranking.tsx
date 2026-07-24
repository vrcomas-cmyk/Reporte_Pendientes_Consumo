import { memo, useMemo } from 'react';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';

/** Ranking de items (code/desc/val) con barra de progreso y, opcionalmente, layout wide con rows de dos líneas. */
export const Ranking = memo(function Ranking({ title, items, money = false, onRow, wide = false, className }: {
  title: string;
  items: { code: string; desc: string; val: number }[];
  money?: boolean;
  onRow?: (code: string) => void;
  wide?: boolean;
  className?: string;
}) {
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.val)), [items]);
  if (wide) {
    return (
      <div className={cn('rounded-xl border border-border p-3', className)}>
        <h4 className="mb-2 text-xs font-semibold text-text-muted">{title}</h4>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.length === 0 && <p className="text-xs text-text-faint">Sin datos.</p>}
          {items.map((it) => (
            <button
              key={it.code}
              type="button"
              onClick={() => onRow?.(it.code)}
              className="group flex flex-col rounded px-2 py-1.5 text-left hover:bg-bg-inset border border-border/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn('font-medium text-xs', onRow && 'text-accent')}>{it.code}</span>
                <span className="font-mono text-xs tabular-nums shrink-0">{money ? formatCurrency(it.val) : formatNumber(it.val)}</span>
              </div>
              <div className="text-[11px] text-text-faint whitespace-normal break-words">{it.desc}</div>
              <div className="mt-1 h-1 rounded-full bg-bg-inset">
                <div className="h-1 rounded-full bg-accent" style={{ width: `${(it.val / max) * 100}%` }} />
              </div>
            </button>
          ))}
        </div>
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
