import { useMemo } from 'react';
import { StatTile } from '../ui';
import { SugDetallePanel } from './SugDetallePanel';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { norm, num } from '../helpers';
import { usePanelStore, type Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Resumen del pedido (izquierda) + detalle del material seleccionado (derecha),
 * para recorrer los materiales de un pedido sin perder el contexto ni usar "Atrás". */
export function PedidoPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'pedido' }>; a: Analytics; push: (p: Panel) => void }) {
  const { bo } = a;
  const replaceTop = usePanelStore((s) => s.replaceTop);
  const items = useMemo(() => bo.filter((it) => norm(it.bo.pedido) === norm(panel.pedido)), [bo, panel.pedido]);
  if (!items.length) return <p>Pedido sin materiales.</p>;
  const b0 = items[0].bo;
  const pendTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);
  const impTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente) * num(it.bo.precio), 0);
  const selKey = panel.boKey && items.some((it) => it.k === panel.boKey) ? panel.boKey : items[0].k;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="text-xs text-text-faint">Detalle del pedido</p>
        <h2 className="font-display text-lg font-semibold">Pedido {panel.pedido}</h2>
        <p className="mt-1 text-sm text-text-muted">{b0.razonSocial} · OC {b0.oc || '—'} · {items.length} material(es)</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile label="Materiales" value={String(items.length)} />
          <StatTile label="Cant. pendiente" value={formatNumber(pendTot)} />
          <StatTile label="Importe pendiente" value={formatCurrency(impTot)} />
        </div>
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-xs font-semibold text-text-muted">Materiales del pedido</p>
          {items.map((it) => (
            <button
              key={it.k}
              type="button"
              onClick={() => replaceTop({ type: 'pedido', pedido: panel.pedido, boKey: it.k })}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs',
                it.k === selKey
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-transparent hover:border-border hover:bg-bg-inset',
              )}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{it.bo.materialBase}</span>
                <span className="ml-1 truncate text-text-faint">{it.bo.descripcionSolicitada}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatNumber(num(it.bo.cantidadPendiente))}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-4 md:pt-0">
        <SugDetallePanel panel={{ type: 'sugDetalle', boKey: selKey }} a={a} push={push} />
      </div>
    </div>
  );
}
