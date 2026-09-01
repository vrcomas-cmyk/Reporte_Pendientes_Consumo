import { Chip, StatePill, EvolChart, ComparativaDual, InvGrid, StatTile } from '../ui';
import { FuentesTable, Section, precioPorCondicion, type FuentesSelection } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { buildFromInventarioCentro } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden, isDetailHidden } from '@/core/permissions';
import { norm, transitoFor } from '../helpers';
import type { BOItem } from '@/core/buildBO';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Consolida `precioPorCondicion` de varios materiales en UN cuadro por
 * condición (en vez de uno por material) — varios materiales del mismo BO
 * suelen compartir condición/precio de promoción, y repetirlo por material
 * era ruido. Cada cuadro lista los materiales que aplican. */
function precioPorCondicionConsolidado(a: Analytics, materiales: string[]) {
  const map = new Map<string, { condicion: string; precio: number; materiales: Set<string> }>();
  for (const mat of materiales) {
    for (const p of precioPorCondicion(a, mat)) {
      if (!p.precio) continue;
      const key = norm(p.condicion).toLowerCase();
      let e = map.get(key);
      if (!e) { e = { condicion: p.condicion, precio: p.precio, materiales: new Set() }; map.set(key, e); }
      e.materiales.add(mat);
    }
  }
  return [...map.values()]
    .map((e) => ({ condicion: e.condicion, precio: e.precio, materiales: [...e.materiales] }))
    .sort((x, y) => y.precio - x.precio);
}

/** Sección — "Precio de oferta por condición", un cuadro por condición
 * (nunca repetido por material). Reutilizada por `SugDetallePanel` (BO
 * único) y por `PedidoPanel` (todos los materiales del pedido). */
export function PrecioCondicionSection({ a, materiales }: { a: Analytics; materiales: string[] }) {
  const grupos = precioPorCondicionConsolidado(a, materiales);
  if (!grupos.length) return null;
  return (
    <Section title="Precio de oferta por condición">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {grupos.map((g, i) => (
          <div key={i} className="rounded-lg border border-border bg-bg-elevated p-2.5">
            <div className="flex items-center justify-between gap-2">
              <StatePill label={g.condicion} cls={/caducidad/i.test(g.condicion) ? 'rojo' : 'gris'} />
              <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(g.precio)}</span>
            </div>
            <p className="mt-1.5 truncate text-[11px] text-text-faint">{g.materiales.join(', ')}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Sección — Inventario principales + Otros centros + Solicitar desde
 * inventario, para el material de UN BOItem. Self-contenida (trae su propio
 * diálogo de Solicitar) para poder vivir en cualquier columna/panel. */
export function InventarioPrincipalSection({ a, b, it }: { a: Analytics; b: BOItem['bo']; it: BOItem }) {
  const { enrich } = a;
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const invPrin: [string, number, number?][] = (['1030', '1031', '1032', '1060'] as const)
    .map((c) => [c, b.invByCenter[c] || 0, transitoFor(a.rss, b.centroPedido, c, b.materialBase)]);
  const invOtros: [string, number, number?][] = ['1001', '1003', '1004', '1017', '1018', '1022', '1036']
    .map((c) => [c, b.invByCenter[c] || 0, transitoFor(a.rss, b.centroPedido, c, b.materialBase)]);
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
    <>
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
    </>
  );
}

/** Sección — "Fuentes / materiales ofertables (N)", con selección opcional
 * de hasta 2 lotes por material (ver `PedidoPanel`). */
export function FuentesOfertaSection({ it, push, selection }: { it: BOItem; push: (p: Panel) => void; selection?: FuentesSelection }) {
  const perms = usePermissionsStore((s) => s.perms);
  const fuenteDetalleOculto = isDetailHidden(perms, 'sugerencias', 'fuente');
  if (fuenteDetalleOculto) return null;
  return (
    <Section title={`Fuentes / materiales ofertables (${it.fuentes.length})`}>
      {it.fuentes.length ? (
        <FuentesTable fuentes={it.fuentes} push={push} selection={selection} />
      ) : <p className="text-sm text-text-muted">Este BO no tiene fuentes asociadas.</p>}
    </Section>
  );
}

/** Panel — Detalle de una sugerencia/BO individual con fuentes, inventario por centro y evolución material+destinatario. */
export function SugDetallePanel({ panel, a, push }: { panel: Extract<Panel, { type: 'sugDetalle' }>; a: Analytics; push: (p: Panel) => void }) {
  const { enrich, boByKey, rf: _rf } = a;
  void _rf;
  const perms = usePermissionsStore((s) => s.perms);
  const precioOculto = isColumnHidden(perms, 'sugerencias', 'precio');
  const it = boByKey.get(panel.boKey);
  if (!it) return <p>Sugerencia no encontrada.</p>;
  const b = it.bo;

  // Materiales del BO (origen + fuentes) con condición registrada en Inv
  // Condición — para que el analista sepa a qué precio de promoción puede
  // ofertar sin abrir Inv Condición.
  const materialesOferta = [b.materialBase, ...new Set(it.fuentes.map((f) => f.materialSugerido).filter(Boolean))];

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
      <FuentesOfertaSection it={it} push={push} />
      <PrecioCondicionSection a={a} materiales={materialesOferta} />
      <InventarioPrincipalSection a={a} b={b} it={it} />
    </div>
  );
}
