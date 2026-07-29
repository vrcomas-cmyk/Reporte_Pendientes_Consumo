import { cn } from '@/lib/utils';

/** Shimmering placeholder block — swap in wherever a loading state was just
 * plain text before ("Cargando…" with no layout hint). Uses the same
 * bg-bg-inset token as the rest of the muted-surface system. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-bg-inset', className)} />;
}
