import { cn } from '@/lib/utils';

/** Shimmering placeholder block — swap in wherever a loading state was just
 * plain text before ("Cargando…" with no layout hint). Uses the same
 * bg-bg-inset token as the rest of the muted-surface system. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-bg-inset', className)} />;
}

/** Generic "big data table" loading shape: title + a KPI-tile strip + a
 * toolbar bar + N skeleton rows — the layout every Pedidos/Consumo/
 * Inventario-style page shares. Covers the brief window where `AppShell`'s
 * IndexedDB restore hasn't settled yet (`useDataStore.bootstrapped`), so
 * those pages don't flash their "sube un archivo" EmptyState when a report
 * IS cached and about to appear. */
export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex h-full flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[60px]" />)}
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
        {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    </div>
  );
}
