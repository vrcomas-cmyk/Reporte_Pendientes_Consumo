import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function KpiTile({
  label,
  value,
  icon: Icon,
  tone = 'default',
  sub,
  size = 'lg',
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'default' | 'warning' | 'danger';
  /** Optional second line under the value (e.g. a breakdown) — same pattern as `StatTile.sub`. */
  sub?: ReactNode;
  /** 'lg' (default) for the primary "needs attention" row; 'sm' for the
   * secondary context row — same card, smaller type/padding, so the two
   * rows read as a hierarchy instead of 8 equal-weight tiles competing. */
  size?: 'lg' | 'sm';
}) {
  return (
    <Card>
      <CardContent className={cn('flex items-start justify-between gap-3', size === 'lg' ? 'p-4' : 'p-3')}>
        <div className="min-w-0">
          <p className={cn('font-medium uppercase tracking-wide text-text-faint', size === 'lg' ? 'text-[11px]' : 'text-[10px]')}>{label}</p>
          <p className={cn('mt-1 truncate font-mono font-medium text-text', size === 'lg' ? 'text-xl' : 'text-base')}>{value}</p>
          {sub && <p className="mt-0.5 truncate text-[11px] text-text-faint">{sub}</p>}
        </div>
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md',
            size === 'lg' ? 'size-8' : 'size-6',
            tone === 'warning' && 'bg-warning/15 text-warning',
            tone === 'danger' && 'bg-danger/15 text-danger',
            tone === 'default' && 'bg-accent-soft text-accent',
          )}
        >
          <Icon className={size === 'lg' ? 'size-4' : 'size-3.5'} />
        </div>
      </CardContent>
    </Card>
  );
}
