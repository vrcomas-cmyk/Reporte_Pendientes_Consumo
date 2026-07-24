import { formatNumber } from '@/lib/utils';

/** Grid de inventario: una tarjeta por (centro, cantidad). */
export function InvGrid({ items }: { items: [string, number][] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-md border border-border px-2.5 py-1.5">
          <p className="text-[11px] text-text-faint">{k}</p>
          <p className="font-mono text-sm">{formatNumber(v)}</p>
        </div>
      ))}
    </div>
  );
}
