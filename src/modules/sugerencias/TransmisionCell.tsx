import { Truck } from 'lucide-react';
import { textoTransmision, type EntregaTx } from '@/core/transmision';
import type { EstadoTransmision } from '@/store/transmisionStore';

/** Celda «Transmisión» de Seg. de pedidos: si alguna entrega del pedido está en transmisión, una etiqueta con la entrega y su fecha. Lleva ícono y texto, no solo color.
 *  Es por PEDIDO / ENTREGA: las pestañas de transmisión no traen el material (ver core/transmision.ts). */
export function TransmisionCell({ entregas, estado, hayIndice }: { entregas: readonly EntregaTx[]; estado: EstadoTransmision; hayIndice: boolean }) {
  if (entregas.length > 0) {
    const detalle = entregas.map((e) => `Entrega ${e.d}${e.n ? ` · transmisión ${e.n}` : ''}${e.f ? ` · ${e.f}` : ''}${e.p ? ` (${e.p})` : ''}`).join('\n');
    return (
      <div title={detalle}>
        <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info">
          <Truck className="size-3" aria-hidden />En transmisión
        </span>
        <div className="text-[11px] text-text-faint">{textoTransmision(entregas)}</div>
      </div>
    );
  }
  if (!hayIndice) {
    return <span className="text-text-faint" title={estado === 'error' ? 'No se pudo consultar Transmisión' : 'Consultando Transmisión…'}>{estado === 'error' ? '?' : '…'}</span>;
  }
  return <span className="text-text-faint">—</span>;
}
