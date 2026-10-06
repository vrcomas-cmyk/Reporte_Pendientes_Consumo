import { Chip, StatePill, EvolChart, ComparativaDual, InvGrid, StatTile } from '../ui';
import { CentrosFiltroBar } from './CentrosFiltroBar';
import { puntosSolicitarInventario } from './MaterialInventario';
import { detalle12Cerrados, ayudaPromedio12 } from '../promedio12';
import { FuentesTable, Section, precioPorCondicion, type FuentesSelection } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { buildFromInventarioCentro } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useCentrosFiltroStore, centroPasaFiltro } from '@/store/centrosFiltroStore';
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
              <span className="font-mono text-sm font-semibold text-text">{formatCurrency(g.precio)}</span>
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
export function InventarioPrincipalSection({ a, b, it, push }: { a: Analytics; b: BOItem['bo']; it: BOItem; push?: (p: Panel) => void }) {
  const { enrich } = a;
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  // Inventario principales = almacenes del CENTRO DEL PEDIDO; cada tarjeta lleva el
  // consumo promedio de los últimos 12 meses cerrados de ese centro + almacén y, al
  // hacer clic, abre su tendencia (panel `celda` con `almacen`).
  const prom = (centro: string, almacen?: string): [string, string] => {
    const d = detalle12Cerrados(a, b.materialBase, centro, almacen);
    return [`prom 12m: ${formatNumber(d.promedio)}`, ayudaPromedio12(d)];
  };
  const ALMS = ['1030', '1031', '1032', '1060'] as const;
  const invPrin: [string, number, number?, string?, string?][] = ALMS
    .map((c) => [c, b.invByCenter[c] || 0, transitoFor(a.rss, b.centroPedido, c, b.materialBase), ...prom(b.centroPedido, c)]);
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  const centrosOtros = ['1001', '1003', '1004', '1017', '1018', '1022', '1036']
    .filter((c) => centroPasaFiltro(c, b.centroPedido, centrosElegidos));
  const invOtros: [string, number, number?, string?, string?][] = centrosOtros
    .map((c) => [c, b.invByCenter[c] || 0, transitoFor(a.rss, b.centroPedido, c, b.materialBase), ...prom(c)]);
  const condicionesMat = enrich.matCondiciones(b.materialBase).join(', ');
  const puntosSolicitar = puntosSolicitarInventario(a, b.materialBase, b.invByCenter['1018'] || 0);
  const sourceKeyInv = (centro: string, almacen: string) => `sug|${it.k}|inv-${centro}-${almacen}`;
  const yaSolicitado = (centro: string, almacen: string) =>
    solicitudesList.some((s) => s.origen === 'sugerencias' && s.sourceKey === sourceKeyInv(centro, almacen));
  return (
    <>
      <Section title="Inventario principales" collapsible storageKey="inv.principales"><InvGrid items={invPrin} onSelect={push ? (i) => push({ type: 'celda', material: b.materialBase, centro: b.centroPedido, almacen: ALMS[i] }) : undefined} /></Section>
      <Section title={`Otros centros (1001–1036)${centrosElegidos.length ? ' · filtrado' : ''}`} collapsible storageKey="inv.otros">
        {invOtros.length ? <InvGrid items={invOtros} onSelect={push ? (i) => push({ type: 'celda', material: b.materialBase, centro: centrosOtros[i] }) : undefined} /> : <p className="text-sm text-text-muted">Ningún centro elegido en el filtro.</p>}
      </Section>
      <Section title="Solicitar desde inventario (click derecho)" collapsible storageKey="inv.solicitar">
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
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  if (fuenteDetalleOculto) return null;
  const fuentes = centrosElegidos.length ? it.fuentes.filter((f) => centroPasaFiltro(f.centroSugerido, it.bo.centroPedido, centrosElegidos)) : it.fuentes;
  return (
    <Section title={`Fuentes / materiales ofertables (${fuentes.length}${fuentes.length !== it.fuentes.length ? ` de ${it.fuentes.length}` : ''})`}>
      {fuentes.length ? (
        <FuentesTable fuentes={fuentes} push={push} selection={selection} />
      ) : <p className="text-sm text-text-muted">{it.fuentes.length ? 'Ninguna fuente coincide con los centros elegidos.' : 'Este BO no tiene fuentes asociadas.'}</p>}
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
      <Section title="Evolución mensual — material + destinatario"><EvolChart serie={it.serie} onMonth={(mes) => push({ type: 'clientesMes', material: b.materialBase, mes, dest: b.destinatario })} /></Section>
      {a.rf && <Section title="Comparativo anual"><ComparativaDual serie={it.serie} /></Section>}
      <CentrosFiltroBar centroPedido={b.centroPedido} />
      <FuentesOfertaSection it={it} push={push} />
      <PrecioCondicionSection a={a} materiales={materialesOferta} />
      {/* Inventario principales / Otros centros / Solicitar: panel lateral izquierdo (ver PanelHost). */}
    </div>
  );
}
