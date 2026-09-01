import { formatNumber } from '@/lib/utils';

/** Grid de inventario: una tarjeta por (centro, cantidad). El tercer elemento
 * opcional de la tupla es la cantidad en tránsito hacia ese centro/almacén —
 * mismo marcado "↻+N" ya usado en Sugerencias/ResumenSin. */
export function InvGrid({ items }: { items: [string, number, number?][] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([k, v, transito]) => (
        <div key={k} className="rounded-md border border-border px-2.5 py-1.5">
          <p className="text-[11px] text-text-faint">{k}</p>
          <p className="font-mono text-sm">{formatNumber(v)}</p>
          {!!transito && transito > 0 && <p className="text-[10px] text-emerald-500">↻+{formatNumber(transito)}</p>}
        </div>
      ))}
    </div>
  );
}
