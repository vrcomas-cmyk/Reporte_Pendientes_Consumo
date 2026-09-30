import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { TooltipHint } from '@/components/ui/tooltip';

export type TileTone = 'success' | 'warning' | 'danger' | 'info';

const TEXT: Record<TileTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};
const TOP_BORDER: Record<TileTone, string> = {
  success: 'border-t-success',
  warning: 'border-t-warning',
  danger: 'border-t-danger',
  info: 'border-t-info',
};

/** `tone` acepta el nombre semantico ('danger') o, por compatibilidad, una clase
 * de texto ('text-danger'); se normaliza al nombre para derivar el resto. */
function toneName(tone?: string): TileTone | undefined {
  if (!tone) return undefined;
  return (Object.keys(TEXT) as TileTone[]).find((t) => tone === t || tone.includes(t === 'danger' ? 'danger' : t));
}

/** Tile de estadistica: label + valor con tipografia condensada.
 * - `tone`: color semantico del valor (ver contrato de color en index.css).
 *   Usalo solo cuando el valor es una alerta real; los conteos de contexto van
 *   sin tono para que lo importante destaque.
 * - `emphasis`: 'hero' = KPI protagonista de la pagina (mas grande, con filete
 *   superior del tono o del acento); 'muted' = contexto secundario.
 * - `title`: explica que mide el KPI (icono Info + TooltipHint). */
export function StatTile({
  label,
  value,
  sub,
  tone,
  compact = false,
  title,
  emphasis = 'default',
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: string;
  compact?: boolean;
  title?: string;
  emphasis?: 'hero' | 'default' | 'muted';
}) {
  const name = toneName(tone);
  const hero = emphasis === 'hero';
  const valueColor = name ? TEXT[name] : emphasis === 'muted' ? 'text-text-muted' : tone;
  return (
    <div
      className={cn(
        'w-fit rounded-xl border border-border bg-bg-elevated',
        hero ? 'min-w-[200px] border-t-2 px-4 py-3 shadow-sm' : cn('min-w-[132px]', compact ? 'px-2.5 py-2' : 'p-3'),
        hero && (name ? TOP_BORDER[name] : 'border-t-accent'),
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1 uppercase tracking-wide whitespace-nowrap',
          hero ? 'text-[11px] font-medium text-text-muted' : 'text-[10px] text-text-faint',
        )}
      >
        {label}
        {title && (
          <TooltipHint text={title}>
            <Info className="size-3 shrink-0 normal-case text-text-faint/70" />
          </TooltipHint>
        )}
      </p>
      <p
        className={cn(
          'mt-0.5 font-mono',
          hero ? 'font-display text-3xl font-semibold tracking-tight' : cn('font-medium', compact ? 'text-base' : 'text-lg'),
          valueColor ?? (hero ? 'text-text' : undefined),
        )}
      >
        {value}
      </p>
      {sub && <p className={cn('mt-0.5 text-text-muted', hero ? 'text-xs' : 'text-[11px]')}>{sub}</p>}
    </div>
  );
}
