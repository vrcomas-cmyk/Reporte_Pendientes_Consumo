import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Trash2, X } from 'lucide-react';
import { StatTile, StatePill, EvolChart, ComparativaDual, Chip } from '../ui';
import { InventarioPrincipalSection, PrecioCondicionSection, FuentesOfertaSection } from './SugDetallePanel';
import { ConsumoMaterialCard, Section } from './_shared';
import { cn, formatCurrency, formatFechaCaducidad, formatNumber } from '@/lib/utils';
import { norm, num } from '../helpers';
import { usePanelStore, type Panel } from '@/store/panelStore';
import { condicionTextoDeMaterial } from '@/core/oportunidad';
import { preciosPorCondicion } from '@/core/enrich';
import { useClipboard } from '@/hooks/useClipboard';
import type { Sugerencia } from '@/core/types';
import type { Analytics } from '../AnalyticsContext';

/** Identifica una fuente (lote) de forma estable para la selección de
 * oferta — el índice del array no sirve porque `FuentesTable` filtra. */
const fuenteKey = (f: Sugerencia): string => `${f.lote}|${f.materialSugerido}|${f.centroSugerido}|${f.fechaCaducidad}`;

const MAX_LOTES_POR_MATERIAL = 2;

/** Panel — Detalle del pedido (izquierda), inventario/precio del material
 * seleccionado (centro), y detalle de sugerencia/BO con selección de lotes
 * para ofertar (derecha) — recorre los materiales de un pedido sin perder
 * el contexto ni usar "Atrás". */
export function PedidoPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'pedido' }>; a: Analytics; push: (p: Panel) => void }) {
  const { bo } = a;
  const replaceTop = usePanelStore((s) => s.replaceTop);
  const { copy } = useClipboard();
  const items = useMemo(() => bo.filter((it) => norm(it.bo.pedido) === norm(panel.pedido)), [bo, panel.pedido]);

  // Selección de oferta: hasta 2 lotes por material, indexada por boKey. Vive
  // en este componente (no en el descriptor del panel) porque persiste
  // mientras se navega entre materiales del MISMO pedido vía `replaceTop`
  // (React conserva la instancia — solo cambia `panel.boKey`).
  const [seleccion, setSeleccion] = useState<Map<string, Map<string, Sugerencia>>>(new Map());
  const toggleFuente = (boKey: string, f: Sugerencia) => {
    setSeleccion((prev) => {
      const next = new Map(prev);
      const actual = new Map(next.get(boKey) ?? []);
      const k = fuenteKey(f);
      if (actual.has(k)) actual.delete(k);
      else if (actual.size < MAX_LOTES_POR_MATERIAL) actual.set(k, f);
      else return prev;
      if (actual.size) next.set(boKey, actual); else next.delete(boKey);
      return next;
    });
  };
  const quitarSeleccion = (boKey: string, key: string) => {
    setSeleccion((prev) => {
      const next = new Map(prev);
      const actual = new Map(next.get(boKey) ?? []);
      actual.delete(key);
      if (actual.size) next.set(boKey, actual); else next.delete(boKey);
      return next;
    });
  };
  const totalSeleccion = [...seleccion.values()].reduce((s, m) => s + m.size, 0);

  if (!items.length) return <p>Pedido sin materiales.</p>;
  const b0 = items[0].bo;
  const pendTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);
  const impTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente) * num(it.bo.precio), 0);
  const selKey = panel.boKey && items.some((it) => it.k === panel.boKey) ? panel.boKey : items[0].k;
  const selItem = items.find((it) => it.k === selKey) ?? items[0];

  // Navegación ◀/▶ entre pedidos: recorre `panel.lista` (snapshot del orden
  // filtrado que tenía la tabla de Sugerencias al abrir el detalle). Sin
  // `lista` (p.ej. abierto desde Análisis) los controles no se muestran.
  const lista = panel.lista;
  const idx = lista ? lista.indexOf(panel.pedido) : -1;
  const irA = (i: number) => { if (lista && i >= 0 && i < lista.length) replaceTop({ type: 'pedido', pedido: lista[i], lista }); };

  // Materiales con fuente alterna o condición registrada — se marcan en
  // verde en la lista de materiales del pedido.
  const materialTieneOferta = (materialBase: string, fuentesCount: number) =>
    fuentesCount > 0 || !!condicionTextoDeMaterial(materialBase, a.invCondicion);

  const copiarDatosOferta = () => {
    const lineas: string[] = [];
    for (const it of items) {
      const sel = seleccion.get(it.k);
      if (!sel) continue;
      for (const f of sel.values()) {
        const cad = f.fechaCaducidad ? formatFechaCaducidad(f.fechaCaducidad) : '—';
        const precios = preciosPorCondicion(f.materialSugerido, a.invConsolidadoCatalog, a.invCondicion);
        const precio = precios[0]?.precio || 0;
        lineas.push(`${f.materialSugerido}\t${f.descripcionSugerida}\tLote ${f.lote || '—'}\tcad. ${cad}\t${precio ? formatCurrency(precio) : '—'}`);
      }
    }
    const texto = [
      `Pedido ${panel.pedido}`,
      `Cliente ${b0.destinatario} — ${b0.razonSocial}`,
      ...lineas,
    ].join('\n');
    copy(texto, 'Datos de oferta copiados');
  };

  const ejecutivoNombre = a.enrich.ejecutivoNombre(b0.gpoVdor) || b0.gpoVdor || '—';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,1fr)]">
      {/* Columna 1 — Detalle del pedido */}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-text-faint">Detalle del pedido</p>
            <h2 className="font-display text-lg font-semibold">Pedido {panel.pedido}</h2>
          </div>
          {lista && lista.length > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" title="Pedido anterior" disabled={idx <= 0} onClick={() => irA(idx - 1)} className="rounded-md border border-border p-1 disabled:opacity-30">
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="text-[11px] text-text-faint tabular-nums">{idx + 1}/{lista.length}</span>
              <button type="button" title="Pedido siguiente" disabled={idx < 0 || idx >= lista.length - 1} onClick={() => irA(idx + 1)} className="rounded-md border border-border p-1 disabled:opacity-30">
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        {/* Identidad: quién y por dónde — cada nombre es un chip a su propia
            vista (facturación del solicitante/destinatario, pedidos del
            ejecutivo), para moverse de este pedido a "todo lo demás" de esa
            persona sin perder el hilo. */}
        <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border text-xs">
          <div className="flex items-start justify-between gap-2 px-2.5 py-1.5">
            <span className="shrink-0 text-text-faint">Solicitante</span>
            <span className="text-right font-medium"><Chip title="Ver facturación del solicitante" onClick={() => push({ type: 'evol', kind: 'solic', key: b0.solicitante })}>{b0.solicitante}</Chip></span>
          </div>
          <div className="flex items-start justify-between gap-2 px-2.5 py-1.5">
            <span className="shrink-0 text-text-faint">Razón social</span>
            <span className="max-w-[70%] truncate text-right font-medium">{b0.razonSocial}</span>
          </div>
          <div className="flex items-start justify-between gap-2 px-2.5 py-1.5">
            <span className="shrink-0 text-text-faint">Destinatario</span>
            <span className="text-right font-medium"><Chip title="Ver facturación del destinatario" onClick={() => push({ type: 'evol', kind: 'dest', key: b0.destinatario })}>{b0.destinatario}</Chip></span>
          </div>
          <div className="flex items-start justify-between gap-2 px-2.5 py-1.5">
            <span className="shrink-0 text-text-faint">Ejecutivo</span>
            <span className="text-right font-medium"><Chip title="Ver todos los pedidos pendientes de este ejecutivo" onClick={() => push({ type: 'ejecutivoPedidos', gpoVdor: b0.gpoVdor })}>{ejecutivoNombre}</Chip></span>
          </div>
          <div className="flex items-start justify-between gap-2 px-2.5 py-1.5">
            <span className="shrink-0 text-text-faint">OC · Fecha</span>
            <span className="text-right font-medium">{b0.oc || '—'} · {b0.fecha || '—'}</span>
          </div>
          <div className="flex items-start justify-between gap-2 px-2.5 py-1.5">
            <span className="shrink-0 text-text-faint">Centro / Almacén</span>
            <span className="text-right font-medium">{b0.centroPedido || '—'}{b0.almacen ? ` / ${b0.almacen}` : ''}</span>
          </div>
        </div>

        {/* Totales del pedido — lo primero que se necesita para dimensionar
            el trabajo, en tiles grandes en vez de una fila más de texto. */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile compact label="Materiales" value={String(items.length)} />
          <StatTile compact label="Cant. pendiente" value={formatNumber(pendTot)} />
          <StatTile compact label="Importe pendiente" value={formatCurrency(impTot)} />
        </div>

        {/* Materiales del pedido — con alto acotado y scroll propio para que
            un pedido con muchos renglones nunca empuje fuera de vista el
            consumo del material seleccionado, justo debajo. */}
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-xs font-semibold text-text-muted">Materiales del pedido</p>
          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto pr-1">
            {items.map((it) => {
              const conOfertaFlag = materialTieneOferta(it.bo.materialBase, it.fuentes.length);
              const nSel = seleccion.get(it.k)?.size ?? 0;
              return (
                <button
                  key={it.k}
                  type="button"
                  title={conOfertaFlag ? 'Tiene fuentes ofertables o condición registrada' : undefined}
                  onClick={() => replaceTop({ type: 'pedido', pedido: panel.pedido, boKey: it.k, lista })}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs',
                    it.k === selKey
                      ? 'border-accent bg-accent-soft text-accent'
                      : conOfertaFlag
                        ? 'border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-500/60'
                        : 'border-transparent hover:border-border hover:bg-bg-inset',
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{it.bo.materialBase}</span>
                    <span className="ml-1 truncate text-text-faint">{it.bo.descripcionSolicitada}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {nSel > 0 && <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">{nSel} lote{nSel > 1 ? 's' : ''}</span>}
                    <span className="font-medium tabular-nums">{formatNumber(num(it.bo.cantidadPendiente))}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {totalSeleccion > 0 && (
          <Section title={`Selección para oferta (${totalSeleccion})`}>
            <div className="flex flex-col gap-1">
              {items.map((it) => {
                const sel = seleccion.get(it.k);
                if (!sel) return null;
                return [...sel.entries()].map(([k, f]) => (
                  <div key={k} className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px]">
                    <span className="min-w-0 truncate"><span className="font-medium">{f.materialSugerido}</span> · Lote {f.lote || '—'}</span>
                    <button type="button" title="Quitar de la selección" onClick={() => quitarSeleccion(it.k, k)}><X className="size-3.5 text-text-faint hover:text-danger" /></button>
                  </div>
                ));
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={copiarDatosOferta}
                className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                <Copy className="size-3.5" /> Copiar datos de oferta
              </button>
              <button type="button" title="Limpiar selección" onClick={() => setSeleccion(new Map())} className="rounded-md border border-border p-1.5 text-text-faint hover:text-danger">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </Section>
        )}
      </div>

      {/* Columna 2 — Detalle del material seleccionado: encabezado, fuentes
          ofertables, precio por condición e inventario. */}
      <div className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <p className="text-xs text-text-faint">Detalle del material</p>
        <h2 className="font-display text-lg font-semibold">
          <Chip title="Ver todos los pedidos y consumo de este material" onClick={() => push({ type: 'material', material: selItem.bo.materialBase })}>{selItem.bo.materialBase}</Chip>{' '}
          <span className="text-text-faint">— {selItem.bo.descripcionSolicitada}</span>
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile label="Pendiente" value={formatNumber(selItem.bo.cantidadPendiente)} />
          <StatTile label="Precio" value={formatCurrency(selItem.bo.precio)} />
          <StatTile label="Estado" value={selItem.status.label} />
        </div>
        {selItem.bo.bloqueado && <p className="mt-2"><StatePill label={selItem.bo.bloqueado} cls="amb" /></p>}
        <FuentesOfertaSection
          it={selItem}
          push={push}
          selection={{
            isSelected: (f) => seleccion.get(selItem.k)?.has(fuenteKey(f)) ?? false,
            onToggle: (f) => toggleFuente(selItem.k, f),
            full: (seleccion.get(selItem.k)?.size ?? 0) >= MAX_LOTES_POR_MATERIAL,
          }}
        />
        <PrecioCondicionSection a={a} materiales={[selItem.bo.materialBase, ...new Set(selItem.fuentes.map((f) => f.materialSugerido).filter(Boolean))]} />
        <InventarioPrincipalSection a={a} b={selItem.bo} it={selItem} />
      </div>

      {/* Columna 3 — Consumo y facturación del material seleccionado. */}
      <div className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <p className="text-xs text-text-faint">Consumo y facturación</p>
        <h2 className="font-display text-lg font-semibold">{selItem.bo.materialBase}</h2>
        {/* Cada cuándo compra, última y penúltima compra, importe, precio y
            tendencia; se actualiza solo al cambiar de material. */}
        <ConsumoMaterialCard a={a} dest={b0.destinatario} material={selItem.bo.materialBase} />
        <Section title="Comparativo anual">{a.rf ? <ComparativaDual serie={selItem.serie} /> : <p className="text-sm text-text-muted">Sin Resumen_Fac cargado.</p>}</Section>
        <Section title="Evolución mensual — material + destinatario">
          <EvolChart serie={selItem.serie} onMonth={(mes) => push({ type: 'clientesMes', material: selItem.bo.materialBase, mes })} />
        </Section>
      </div>
    </div>
  );
}
