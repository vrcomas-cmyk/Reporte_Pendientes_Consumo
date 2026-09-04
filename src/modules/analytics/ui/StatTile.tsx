import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { TooltipHint } from '@/components/ui/tooltip';

/** Tile de estadística: label + valor con tipografía condensada y tono opcional
 * (e.g. text-danger). `title`, si se pasa, explica qué mide el KPI — se muestra
 * como un ícono Info junto al label (vía TooltipHint) en vez de un tooltip
 * nativo del navegador, que no es alcanzable en mobile ni discoverable. */
export function StatTile({ label, value, sub, tone, compact = false, title }: { label: string; value: string; sub?: ReactNode; tone?: string; compact?: boolean; title?: string }) {
  return (
    <div className={cn('w-fit min-w-[132px] rounded-xl border border-border bg-bg-elevated', compact ? 'px-2.5 py-2' : 'p-3')}>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-faint whitespace-nowrap">
        {label}
        {title && (
          <TooltipHint text={title}>
            <Info className="size-3 shrink-0 normal-case text-text-faint/70" />
          </TooltipHint>
        )}
      </p>
      <p className={cn('mt-0.5 font-mono font-medium', compact ? 'text-base' : 'text-lg', tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
    </div>
  );
}
