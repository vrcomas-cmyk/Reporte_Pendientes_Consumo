import { Chip, StatePill, EvolChart, ComparativaDual, InvGrid, StatTile } from '../ui';
import { FuentesTable, Section } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { buildFromInventarioCentro } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden, isDetailHidden } from '@/core/permissions';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle de una sugerencia/BO individual con fuentes, inventario por centro y evolución material+destinatario. */
export function SugDetallePanel({ panel, a, push }: { panel: Extract<Panel, { type: 'sugDetalle' }>; a: Analytics; push: (p: Panel) => void }) {
  const { enrich, boByKey, rf: _rf } = a;
  void _rf;
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const perms = usePermissionsStore((s) => s.perms);
  const fuenteDetalleOculto = isDetailHidden(perms, 'sugerencias', 'fuente');
  const precioOculto = isColumnHidden(perms, 'sugerencias', 'precio');
  const it = boByKey.get(panel.boKey);
  if (!it) return <p>Sugerencia no encontrada.</p>;
  const b = it.bo;
  const invPrin: [string, number][] = [['1030', b.invByCenter['1030']], ['1031', b.invByCenter['1031']], ['1032', b.invByCenter['1032']], ['1060', b.invByCenter['1060']]];
  const invOtros: [string, number][] = ['1001', '1003', '1004', '1017', '1018', '1022', '1036'].map((c) => [c, b.invByCenter[c] || 0]);

  // Dónde normalmente se solicita: hub 1031 (almacenes 1030/1032 por separado,
  // ya visibles arriba en "Inventario principales") y, para el sector
  // Suturas, el total de centro 1018 (el reporte no trae desglose por
  // almacén ahí — ver docs del plan). Cada tarjeta es su propio disparador
  // de click derecho → Solicitar, usando el total mostrado (no un lote
  // específico).
  const esSuturas = enrich.matSector(b.materialBase) === 'Suturas';
  const condicionesMat = enrich.matCondiciones(b.materialBase).join(', ');
  const puntosSolicitar: { titulo: string; centro: string; almacen: string; cantidad: number }[] = [
    { titulo: 'Centro 1031 / Alm 1030', centro: '1031', almacen: '1030', cantidad: b.invByCenter['1030'] || 0 },
    { titulo: 'Centro 1031 / Alm 1032', centro: '1031', almacen: '1032', cantidad: b.invByCenter['1032'] || 0 },
    ...(esSuturas ? [{ titulo: 'Centro 1018 (Suturas)', centro: '1018', almacen: '', cantidad: b.invByCenter['1018'] || 0 }] : []),
  ];
  const sourceKeyInv = (centro: string, almacen: string) => `sug|${it.k}|inv-${centro}-${almacen}`;
  const yaSolicitado = (centro: string, almacen: string) =>
    solicitudesList.some((s) => s.origen === 'sugerencias' && s.sourceKey === sourceKeyInv(centro, almacen));
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
        {!precioOculto && <StatTile label="Precio" value={formatCurrency(b.precio)} />}
        <StatTile label="Estado" value={it.status.label} />
        <StatTile label="Ejecutivo" value={enrich.ejecutivoNombre(b.gpoVdor) || '—'} />
      </div>
      <Section title="Evolución mensual — material + destinatario"><EvolChart serie={it.serie} onMonth={(mes) => push({ type: 'clientesMes', material: b.materialBase, mes })} /></Section>
      {a.rf && <Section title="Comparativo anual"><ComparativaDual serie={it.serie} /></Section>}
      {!fuenteDetalleOculto && (
        <Section title={`Fuentes / materiales ofertables (${it.fuentes.length})`}>
          {it.fuentes.length ? (
            <FuentesTable fuentes={it.fuentes} push={push} />
          ) : <p className="text-sm text-text-muted">Este BO no tiene fuentes asociadas.</p>}
        </Section>
      )}
      <Section title="Inventario principales"><InvGrid items={invPrin} /></Section>
      <Section title="Otros centros (1001–1036)"><InvGrid items={invOtros} /></Section>
      <Section title="Solicitar desde inventario (click derecho)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {puntosSolicitar.map((p) => (
            <SolicitarContextMenu
              key={p.titulo}
              label={b.materialBase}
              solicitado={yaSolicitado(p.centro, p.almacen)}
              onSolicitar={() => solicitar.abrir(buildFromInventarioCentro(b, it.k, p.centro, p.almacen || p.centro, p.cantidad, enrich))}
            >
              <div className="cursor-context-menu rounded-md border border-border px-2.5 py-1.5">
                <p className="text-[11px] text-text-faint">{p.titulo}</p>
                <p className="font-mono text-sm">{formatNumber(p.cantidad)}</p>
                {condicionesMat && <p className="text-[10px] text-text-faint">{condicionesMat}</p>}
              </div>
            </SolicitarContextMenu>
          ))}
        </div>
      </Section>

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}
