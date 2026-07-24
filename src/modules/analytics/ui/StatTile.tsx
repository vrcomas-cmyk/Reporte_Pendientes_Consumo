import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Tile de estadística: label + valor con tipografía condensada y tono opcional (e.g. text-danger). */
export function StatTile({ label, value, sub, tone, compact = false }: { label: string; value: string; sub?: ReactNode; tone?: string; compact?: boolean }) {
  return (
    <div className={cn('w-fit min-w-[132px] rounded-xl border border-border bg-bg-elevated', compact ? 'px-2.5 py-2' : 'p-3')}>
      <p className="text-[10px] uppercase tracking-wide text-text-faint whitespace-nowrap">{label}</p>
      <p className={cn('mt-0.5 font-mono font-medium', compact ? 'text-base' : 'text-lg', tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
    </div>
  );
}
