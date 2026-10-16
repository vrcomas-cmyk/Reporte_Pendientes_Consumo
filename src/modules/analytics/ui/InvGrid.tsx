import { useInvCerosStore } from '@/store/invCerosStore';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

/** Grid de inventario: una tarjeta por (centro, cantidad). El tercer elemento
 * opcional de la tupla es la cantidad en tránsito hacia ese centro/almacén —
 * mismo marcado "↻+N" ya usado en Sugerencias/ResumenSin.
 * `onSelect` (opcional) vuelve clicables las tarjetas y recibe el índice;
 * `activeIndex` resalta la seleccionada. */
export function InvGrid({ items, cols = 4, onSelect, activeIndex, ocultables = false }: {
  /** Respeta el interruptor global "Ocultar inventarios en 0" (cantidad y tránsito en 0). */
  ocultables?: boolean;
  /** [etiqueta, cantidad, tránsito?, texto secundario?, ayuda (title)?] */
  items: [string, number, number?, string?, string?][];
  cols?: 2 | 4;
  onSelect?: (index: number) => void;
  activeIndex?: number;
}) {
  const ocultarCeros = useInvCerosStore((s) => s.ocultar);
  const filtrar = ocultables && ocultarCeros;
  // Se conserva el índice ORIGINAL para `onSelect`/`activeIndex`.
  const visibles = items.map((it, idx) => ({ it, idx })).filter(({ it }) => !filtrar || it[1] !== 0 || !!it[2]);
  if (!visibles.length) return <p className="text-xs text-text-faint">Todo en 0 (oculto).</p>;
  return (
    <div className={cols === 2 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-2 sm:grid-cols-4'}>
      {visibles.map(({ it: [k, v, transito, sub, ayuda], idx: i }) => {
        const contenido = (
          <>
            <p className="text-[11px] text-text-faint">{k}</p>
            <p className="font-mono text-sm">{formatNumber(v)}</p>
            {!!transito && transito > 0 && <p className="text-[10px] text-success">↻+{formatNumber(transito)}</p>}
            {sub && <p className="text-[10px] text-text-muted">{sub}</p>}
          </>
        );
        if (!onSelect) return <div key={k} title={ayuda} className="rounded-md border border-border px-2.5 py-1.5">{contenido}</div>;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(i)}
            title={ayuda ? `${ayuda} — clic para ver el detalle` : 'Ver el detalle (tendencia y desglose)'}
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
