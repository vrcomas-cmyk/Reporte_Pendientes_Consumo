import { cn } from '@/lib/utils';
import { useCentrosFiltroStore } from '@/store/centrosFiltroStore';

const CENTROS_FILTRABLES = ['1001', '1003', '1004', '1017', '1018', '1022', '1031', '1036'];

/** Barra "Considerar centros": limita inventario de otros centros y fuentes a
 * los centros elegidos (+ el del pedido + filas sin centro). Persistente. */
export function CentrosFiltroBar({ centroPedido }: { centroPedido: string }) {
  const { centros, toggle, clear } = useCentrosFiltroStore();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-2.5 py-2">
      <span className="text-[11px] font-medium text-text-muted" title="Solo se muestran fuentes e inventario de estos centros, más el centro del pedido y lo que no tiene centro. Se conserva al cambiar de pedido.">
        Considerar centros{centroPedido ? ` (+ ${centroPedido})` : ''}
      </span>
      {CENTROS_FILTRABLES.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={centros.includes(c)}
          onClick={() => toggle(c)}
          className={cn(
            'rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors',
            centros.includes(c) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-faint hover:border-accent/50 hover:text-text',
          )}
        >
          {c}
        </button>
      ))}
      {centros.length > 0 && <button type="button" onClick={clear} className="text-[11px] text-accent hover:underline">Todos</button>}
    </div>
  );
}
