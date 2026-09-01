import { useMemo } from 'react';
import { SugTable } from './_shared';
import { norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Todos los pedidos pendientes (BO) de un ejecutivo, destino del
 * chip "Ejecutivo" en `PedidoPanel` — análogo a `evol` (solicitante/
 * destinatario) pero sobre pedidos en vez de facturación histórica. */
export function EjecutivoPedidosPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'ejecutivoPedidos' }>; a: Analytics; push: (p: Panel) => void }) {
  const nombre = a.enrich.ejecutivoNombre(panel.gpoVdor) || panel.gpoVdor;
  const list = useMemo(() => a.bo.filter((it) => norm(it.bo.gpoVdor) === norm(panel.gpoVdor)), [a.bo, panel.gpoVdor]);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Pedidos pendientes · {nombre}</h2>
      <p className="mt-1 text-sm text-text-muted">{list.length} renglón(es) de pedido</p>
      <div className="mt-3"><SugTable list={list} a={a} push={push} /></div>
    </div>
  );
}
