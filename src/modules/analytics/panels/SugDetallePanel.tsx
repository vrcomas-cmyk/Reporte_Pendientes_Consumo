import { inventarioBloques } from '../inventarioBloques';
import { DetalleLayout, HistorialConsumo, AccionTotalesMaterial, OcultarCerosToggle } from './DetalleLayout';
import { Chip, StatePill, InvGrid } from '../ui';
import { KpiBand } from '@/components/layout/report';
import { LotesOfertablesSection } from './OpcionesOferta';
import { puntosSolicitarInventario } from './MaterialInventario';
import { detalle12Cerrados, ayudaPromedio12 } from '../promedio12';
import { FuentesTable, Section, precioPorCondicion, type FuentesSelection } from './_shared';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { buildFromInventarioCentro } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useCentrosFiltroStore, centroPasaFiltro } from '@/store/centrosFiltroStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden, isDetailHidden } from '@/core/permissions';
import { norm, transitoFor } from '../helpers';
import { claveMaterial } from '@/core/pedidos';
import { CONDICION_PNC, contextoOfertables, ofertablesDeMaterial, textoOfertable } from '@/core/invCondicionLibros';
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
      if (!e) {
        e = { condicion: p.condicion, precio: p.precio, materiales: new Set() };
        map.set(key, e);
      }
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
export function InventarioPrincipalSection({
  a,
  b,
  it,
  push,
}: {
  a: Analytics;
  b: BOItem['bo'];
  it: BOItem;
  push?: (p: Panel) => void;
}) {
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
  const invPrin: [string, number, number?, string?, string?][] = ALMS.map((c) => [
    c,
    b.invByCenter[c] || 0,
    transitoFor(a.rss, b.centroPedido, c, b.materialBase),
    ...prom(b.centroPedido, c),
  ]);

  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  const bloques = inventarioBloques(a, b.materialBase, b.centroPedido, centrosElegidos);
  const puntosSolicitar = puntosSolicitarInventario(a, b.materialBase, b.invByCenter['1018'] || 0);

  const sourceKeyInv = (centro: string, almacen: string) => `sug|${it.k}|inv-${centro}-${almacen}`;
  const yaSolicitado = (centro: string, almacen: string) =>
    solicitudesList.some((s) => s.origen === 'sugerencias' && s.sourceKey === sourceKeyInv(centro, almacen));

  return (
    <>
      <div className="flex justify-end"><OcultarCerosToggle /></div>
      <Section tono="inv" origen="Disponibilidad" title={`Principales · Centro ${b.centroPedido}`}>
        <InvGrid
          ocultables
          cols={4}
          items={invPrin}
          onSelect={
            push
              ? (i) =>
                  push({
                    type: 'celda',
                    material: b.materialBase,
                    centro: b.centroPedido,
                    almacen: ALMS[i],
                  })
              : undefined
          }
        />
      </Section>

      <Section tono="inv" origen="Disponibilidad" title="Otros centros (alm. 1030+1031+1060)">
        {bloques.otrosCentros.length ? (
          <InvGrid
          ocultables
            cols={4}
            items={bloques.otrosCentros.map((x) => [`Centro ${x.clave}`, x.cantidad, x.transito, `prom 12m: ${formatNumber(x.promedio ?? 0)}`, x.ayudaPromedio])}
            onSelect={
              push
                ? (i) =>
                    push({
                      type: 'celda',
                      material: b.materialBase,
                      centro: bloques.otrosCentros[i].clave,
                    })
                : undefined
            }
          />
        ) : (
          <p className="text-sm text-text-muted">Ningún centro elegido en el filtro.</p>
        )}
      </Section>

      {/* Sección consolidada: datos interactivos de solicitar con el formato y estilo visual de disponibilidad */}
      <Section
        tono="inv"
        origen="Disponibilidad"
        title="Centro 1031 · almacén 1030 y 1032 (clic derecho = Solicitar)"
      >
        <div className="grid grid-cols-2 gap-2">
          {puntosSolicitar.map((p) => {
            const solicitado = yaSolicitado(p.centro, p.almacen);
            const esCortaCaducidad = p.almacen === '1032';

            return (
              <SolicitarContextMenu
                key={p.titulo}
                label={b.materialBase}
                solicitado={solicitado}
                onSolicitar={() =>
                  solicitar.abrir(
                    buildFromInventarioCentro(
                      b,
                      it.k,
                      p.centro,
                      p.almacen || p.centro,
                      p.cantidad,
                      enrich,
                    ),
                  )
                }
              >
                <div
                  onClick={
                    push
                      ? () =>
                          push({
                            type: 'celda',
                            material: b.materialBase,
                            centro: p.centro,
                            almacen: p.almacen,
                          })
                      : undefined
                  }
                  className={cn(
                    'group flex cursor-context-menu flex-col justify-between rounded-md border p-2 text-left transition-colors',
                    'hover:border-accent hover:bg-bg-inset',
                    solicitado
                      ? 'border-accent/50 bg-accent/10'
                      : 'border-border/70 bg-bg-inset/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[11px] font-medium text-text-faint group-hover:text-text">
                      {p.titulo}
                    </span>
                    {solicitado ? (
                      <span className="rounded bg-accent/20 px-1 py-0.5 text-[9px] font-semibold text-accent">
                        Solicitado
                      </span>
                    ) : esCortaCaducidad ? (
                      <span className="rounded bg-warning/20 px-1 py-0.5 text-[9px] font-medium text-warning">
                        Corta caducidad
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <span className="font-mono text-sm font-bold tabular-nums text-text">
                      {formatNumber(p.cantidad)}
                    </span>
                  </div>
                </div>
              </SolicitarContextMenu>
            );
          })}
        </div>
      </Section>

      <SolicitarDialog
        draft={solicitar.dialogDraft}
        loteOptions={solicitar.dialogLoteOptions}
        onClose={solicitar.cerrar}
      />
    </>
  );
}

/** Sección — "Fuentes / materiales ofertables (N)", con selección opcional
 * de hasta 2 lotes por material (ver `PedidoPanel`). */
export function FuentesOfertaSection({
  it,
  push,
  selection,
}: {
  it: BOItem;
  push: (p: Panel) => void;
  selection?: FuentesSelection;
}) {
  const perms = usePermissionsStore((s) => s.perms);
  const fuenteDetalleOculto = isDetailHidden(perms, 'sugerencias', 'fuente');
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  if (fuenteDetalleOculto) return null;

  const fuentes = centrosElegidos.length
    ? it.fuentes.filter((f) => centroPasaFiltro(f.centroSugerido, it.bo.centroPedido, centrosElegidos))
    : it.fuentes;

  return (
    <Section
      title={`Fuentes / materiales ofertables (${fuentes.length}${
        fuentes.length !== it.fuentes.length ? ` de ${it.fuentes.length}` : ''
      })`}
    >
      {fuentes.length ? (
        <FuentesTable fuentes={fuentes} push={push} selection={selection} />
      ) : (
        <p className="text-sm text-text-muted">
          {it.fuentes.length
            ? 'Ninguna fuente coincide con los centros elegidos.'
            : 'Este BO no tiene fuentes asociadas.'}
        </p>
      )}
    </Section>
  );
}

/** Panel — Detalle de una sugerencia/BO individual con fuentes, inventario por centro y evolución material+destinatario. */
export function SugDetallePanel({
  panel,
  a,
  push,
}: {
  panel: Extract<Panel, { type: 'sugDetalle' }>;
  a: Analytics;
  push: (p: Panel) => void;
}) {
  const { enrich, boByKey, rf: _rf } = a;
  void _rf;
  const perms = usePermissionsStore((s) => s.perms);
  const precioOculto = isColumnHidden(perms, 'sugerencias', 'precio');
  const it = boByKey.get(panel.boKey);
  if (!it) return <p>Sugerencia no encontrada.</p>;
  const b = it.bo;

  // Condición de la pestaña Revision del material (no Corta caducidad); solo para renglones de Seg. de pedidos (libros).
  const enSeg = a.boSeg.some((x) => x.k === it.k);
  const revision = enSeg ? a.revisionLibros.get(claveMaterial(b.materialBase)) ?? '' : '';
  // Ofertable (mismo criterio que la columna de la tabla y el resaltado del pedido): corta caducidad con existencia, Revisión o Sustituto.
  const ofertable = enSeg
    ? ofertablesDeMaterial(b.materialBase, contextoOfertables(a.lotesLibros, a.revisionLibros, a.sustitucionesLibros, a.detalleLotesLibros[CONDICION_PNC]), (c) => {
      const elegidos = useCentrosFiltroStore.getState().centros;
      return !elegidos.length || !c || c === b.centroPedido || elegidos.includes(c);
    })
    : null;

  return (
    <DetalleLayout
      acciones={<AccionTotalesMaterial material={b.materialBase} push={push} />}
      encabezado={
        <>
          <p className="text-xs text-text-faint">Detalle de sugerencia / BO</p>
          <h2 className="font-display text-lg font-semibold">
            <Chip onClick={() => push({ type: 'evol', kind: 'solic', key: b.solicitante })}>
              {b.solicitante}
            </Chip>{' '}
            › {b.razonSocial} ›{' '}
            <Chip onClick={() => push({ type: 'clienteDetalle', dest: b.destinatario, material: b.materialBase })}>
              {b.destinatario}
            </Chip>
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Pedido <Chip onClick={() => push({ type: 'pedido', pedido: b.pedido, boKey: it.k })}>{b.pedido}</Chip> · OC{' '}
            {b.oc || '—'} · Material{' '}
            <Chip onClick={() => push({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip> —{' '}
            {b.descripcionSolicitada}
            {b.bloqueado && (
              <>
                {' '}
                · <StatePill label={b.bloqueado} cls="amb" />
              </>
            )}
          </p>
        </>
      }
      datos={[
        { etiqueta: 'Ejecutivo', valor: enrich.ejecutivoNombre(b.gpoVdor) },
        { etiqueta: 'Grupo cliente', valor: enrich.grupoCliente(b.gpoCte) || b.gpoCte },
        { etiqueta: 'Centro / Alm', valor: `${b.centroPedido}${b.almacen ? ` / ${b.almacen}` : ''}` },
        { etiqueta: 'Sector', valor: enrich.matSector(b.materialBase) },
        { etiqueta: 'Fecha', valor: b.fecha },
      ]}
      banda={
        <KpiBand
          titulo="Renglón del pedido (BO)"
          principal={{
            etiqueta: 'Pendiente',
            valor: formatNumber(b.cantidadPendiente),
            sub: `de ${formatNumber(b.cantidadPedido)} pedidas`,
            tono: b.bloqueado ? 'danger' : undefined,
          }}
          metricas={[
            ...(precioOculto
              ? []
              : [
                  {
                    etiqueta: 'Precio',
                    valor: formatCurrency(b.precio),
                    sub: `Importe ${formatCurrency(b.precio * b.cantidadPendiente)}`,
                  },
                ]),
            {
              etiqueta: 'Estado',
              valor: revision ? <span className="inline-flex flex-wrap items-center gap-1.5">{it.status.label}<StatePill label={revision} cls="amb" /></span> : it.status.label,
              title: revision ? `Material en la pestaña Revision: ${revision}` : undefined,
            },
            ...(ofertable?.tiene ? [{ etiqueta: 'Ofertable', valor: <span className="text-base font-semibold text-warning">{textoOfertable(ofertable)}</span> }] : []),
            { etiqueta: 'Fuentes', valor: formatNumber(it.fuentes.length) },
          ]}
        />
      }
      izquierda={<InventarioPrincipalSection a={a} b={b} it={it} push={push} />}
      centro={
        <HistorialConsumo
          a={a}
          serie={it.serie}
          titulo="Historial de facturación — material + destinatario"
          dest={b.destinatario}
          material={b.materialBase}
          costosMaterial={b.materialBase}
          onMonth={(mes) =>
            push({
              type: 'clientesMes',
              material: b.materialBase,
              mes,
              dest: b.destinatario,
            })
          }
        />
      }
      abajo={
        <LotesOfertablesSection
          a={a}
          material={b.materialBase}
          it={it}
          cliente={`${b.destinatario} — ${b.razonSocial}`}
          push={push}
        />
      }
    />
  );
}