import { StatTile } from '../ui';
import { Section, SugTable } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { norm, num } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Resumen del pedido: totales y listar todos sus materiales con drill al detalle. */
export function PedidoPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'pedido' }>; a: Analytics; push: (p: Panel) => void }) {
  const { bo } = a;
  const items = bo.filter((it) => norm(it.bo.pedido) === norm(panel.pedido));
  if (!items.length) return <p>Pedido sin materiales.</p>;
  const b0 = items[0].bo;
  const pendTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);
  const impTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente) * num(it.bo.precio), 0);
  return (
    <div>
      <p className="text-xs text-text-faint">Detalle del pedido</p>
      <h2 className="font-display text-lg font-semibold">Pedido {panel.pedido}</h2>
      <p className="mt-1 text-sm text-text-muted">{b0.razonSocial} · OC {b0.oc || '—'} · {items.length} material(es)</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatTile label="Materiales" value={String(items.length)} />
        <StatTile label="Cant. pendiente" value={formatNumber(pendTot)} />
        <StatTile label="Importe pendiente" value={formatCurrency(impTot)} />
      </div>
      <Section title="Materiales del pedido"><SugTable list={items} push={push} /></Section>
    </div>
  );
}
