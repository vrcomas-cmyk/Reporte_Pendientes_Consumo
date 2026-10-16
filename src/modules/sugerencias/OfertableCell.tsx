import type { Ofertable } from '@/core/invCondicionLibros';
import { formatNumber } from '@/lib/utils';
import { StatePill } from '@/modules/analytics/ui';

/** Celda "Ofertable" de Seg. de pedidos: qué tiene el material para ofrecer en cambio — lotes de Corta caducidad o PNC (con existencia), su condición
 * de Revisión o un sustituto con inventario. Mismo criterio que el resaltado de "1. Materiales del pedido" en el detalle. */
export function OfertableCell({ o }: { o: Ofertable | null }) {
  if (!o?.tiene) return <span className="text-text-faint">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {o.corta.n > 0 && (
        <span title={`${o.corta.n} lote(s) de corta caducidad con existencia: ${formatNumber(o.corta.cantidad)} u.`}>
          <StatePill label={`CC ${o.corta.n} · ${formatNumber(o.corta.cantidad)}`} cls="rojo" />
        </span>
      )}
      {o.pnc.n > 0 && (
        <span title={`${o.pnc.n} lote(s) en PNC: ${formatNumber(o.pnc.cantidad)} u.`}>
          <StatePill label={`PNC ${o.pnc.n} · ${formatNumber(o.pnc.cantidad)}`} cls="gris" />
        </span>
      )}
      {o.revision && (
        <span title={`Material en la pestaña Revision: ${o.revision}`}>
          <StatePill label={o.revision} cls="amb" />
        </span>
      )}
      {o.sustitutos > 0 && (
        <span title={`${o.sustitutos} sustituto(s) con inventario`}>
          <StatePill label={`Sust. ${o.sustitutos}`} cls="azul" />
        </span>
      )}
    </div>
  );
}
