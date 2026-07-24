import { Chip, StatePill, EvolChart, ComparativaDual, InvGrid, StatTile } from '../ui';
import { FuentesTable, Section } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle de una sugerencia/BO individual con fuentes, inventario por centro y evolución material+destinatario. */
export function SugDetallePanel({ panel, a, push }: { panel: Extract<Panel, { type: 'sugDetalle' }>; a: Analytics; push: (p: Panel) => void }) {
  const { enrich, boByKey, rf: _rf } = a;
  void _rf;
  const it = boByKey.get(panel.boKey);
  if (!it) return <p>Sugerencia no encontrada.</p>;
  const b = it.bo;
  const invPrin: [string, number][] = [['1030', b.invByCenter['1030']], ['1031', b.invByCenter['1031']], ['1032', b.invByCenter['1032']], ['1060', b.invByCenter['1060']]];
  const invOtros: [string, number][] = ['1001', '1003', '1004', '1017', '1018', '1022', '1036'].map((c) => [c, b.invByCenter[c] || 0]);
  return (
    <div>
      <p className="text-xs text-text-faint">Detalle de sugerencia / BO</p>
      <h2 className="font-display text-lg font-semibold">
        <Chip onClick={() => push({ type: 'evol', kind: 'solic', key: b.solicitante })}>{b.solicitante}</Chip> ›{' '}
        {b.razonSocial} › <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: b.destinatario })}>{b.destinatario}</Chip>
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Pedido <Chip onClick={() => push({ type: 'pedido', pedido: b.pedido })}>{b.pedido}</Chip> · OC {b.oc || '—'} · Material{' '}
        <Chip onClick={() => push({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip> — {b.descripcionSolicitada}
        {b.bloqueado && <> · <StatePill label={b.bloqueado} cls="amb" /></>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Pendiente" value={formatNumber(b.cantidadPendiente)} />
        <StatTile label="Precio" value={formatCurrency(b.precio)} />
        <StatTile label="Estado" value={it.status.label} />
        <StatTile label="Ejecutivo" value={enrich.ejecutivoNombre(b.gpoVdor) || '—'} />
      </div>
      <Section title="Evolución mensual — material + destinatario"><EvolChart serie={it.serie} onMonth={(mes) => push({ type: 'clientesMes', material: b.materialBase, mes })} /></Section>
      {a.rf && <Section title="Comparativo anual"><ComparativaDual serie={it.serie} /></Section>}
      <Section title={`Fuentes / materiales ofertables (${it.fuentes.length})`}>
        {it.fuentes.length ? (
          <FuentesTable fuentes={it.fuentes} push={push} />
        ) : <p className="text-sm text-text-muted">Este BO no tiene fuentes asociadas.</p>}
      </Section>
      <Section title="Inventario principales"><InvGrid items={invPrin} /></Section>
      <Section title="Otros centros (1001–1036)"><InvGrid items={invOtros} /></Section>
    </div>
  );
}
