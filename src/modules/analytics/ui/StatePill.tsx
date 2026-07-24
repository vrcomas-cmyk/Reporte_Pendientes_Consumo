import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { Tendencia } from '@/core/resumenFac';

// Maps the legacy semantic color classes to Tailwind utility combos.
const CLS: Record<string, string> = {
  verde: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  rojo: 'bg-danger/15 text-danger',
  amb: 'bg-warning/15 text-warning',
  azul: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  vio: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  gris: 'bg-bg-inset text-text-muted',
};

/** Pill de estado con color semántico (verde/rojo/ámbar/azul/vio/gris). */
export const StatePill = memo(function StatePill({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', CLS[cls] || CLS.gris)}>
      {label}
    </span>
  );
});

/** Badge de tendencia (▲/▼/—) con color y texto. */
export const TrendBadge = memo(function TrendBadge({ t }: { t: Tendencia }) {
  const Icon = t.dir === 'up' ? TrendingUp : t.dir === 'down' ? TrendingDown : Minus;
  const color = t.dir === 'up' ? 'text-emerald-500' : t.dir === 'down' ? 'text-danger' : 'text-text-faint';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', color)}>
      <Icon className="size-3" /> {t.txt}
    </span>
  );
});
