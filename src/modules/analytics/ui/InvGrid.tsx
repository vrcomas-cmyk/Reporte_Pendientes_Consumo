import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

/** Grid de inventario: una tarjeta por (centro, cantidad). El tercer elemento
 * opcional de la tupla es la cantidad en tránsito hacia ese centro/almacén —
 * mismo marcado "↻+N" ya usado en Sugerencias/ResumenSin.
 * `onSelect` (opcional) vuelve clicables las tarjetas y recibe el índice;
 * `activeIndex` resalta la seleccionada. */
export function InvGrid({ items, cols = 4, onSelect, activeIndex }: {
  items: [string, number, number?][];
  cols?: 2 | 4;
  onSelect?: (index: number) => void;
  activeIndex?: number;
}) {
  return (
    <div className={cols === 2 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-2 sm:grid-cols-4'}>
      {items.map(([k, v, transito], i) => {
        const contenido = (
          <>
            <p className="text-[11px] text-text-faint">{k}</p>
            <p className="font-mono text-sm">{formatNumber(v)}</p>
            {!!transito && transito > 0 && <p className="text-[10px] text-success">↻+{formatNumber(transito)}</p>}
          </>
        );
        if (!onSelect) return <div key={k} className="rounded-md border border-border px-2.5 py-1.5">{contenido}</div>;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(i)}
            title="Ver el detalle de este centro"
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-left hover:border-accent',
              i === activeIndex ? 'border-accent bg-accent-soft' : 'border-border',
            )}
          >
            {contenido}
          </button>
        );
      })}
    </div>
  );
}
