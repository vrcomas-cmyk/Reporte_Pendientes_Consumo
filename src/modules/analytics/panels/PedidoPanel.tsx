import { useEffect, useMemo, useRef, useState } from 'react';

import {

  Copy,
  MessageSquare,

  Trash2,


  Layers,

  Package,

  BarChart2,

  Boxes,

  Building2,

  User,

  Users,

  MapPin,

  Hash,

  CalendarDays,

  FileText,

} from 'lucide-react';

import { StatePill, Chip } from '../ui';

import { InventarioPrincipalSection } from './SugDetallePanel';

import { PedidoNavControl } from './PedidoNavControl';

import { CostoOcultable } from './CostoMaterial';

import { HistorialConsumo } from './DetalleLayout';
import { DetalleMosaico, ListaScroll, MetaField, Tile } from './DetalleMosaico';

import { cn, formatCurrency, formatFechaCaducidad, formatNumber } from '@/lib/utils';
import { esSustituto, textoCambioCodigo } from '@/core/ofertaSustituto';
import { armarMensajePedido } from '@/core/mensajeEjecutivo';
import { MensajePedido } from './MensajePedido';

import { norm, num } from '../helpers';
import { claveMaterial } from '@/core/pedidos';

import { usePanelStore, type Panel } from '@/store/panelStore';

import { condicionTextoDeMaterial } from '@/core/oportunidad';
import { CONDICION_PNC, contextoOfertables, ofertablesDeMaterial, textoOfertable } from '@/core/invCondicionLibros';
import { centroPasaFiltro, useCentrosFiltroStore } from '@/store/centrosFiltroStore';

import { promedioConsumo } from '@/core/consumoDesdeRF';

import { preciosPorCondicion } from '@/core/enrich';

import { useClipboard } from '@/hooks/useClipboard';

import { useKeybindings, isEditableTarget, type KeyHandler } from '@/hooks/useKeybindings';

import type { Sugerencia } from '@/core/types';

import type { Analytics } from '../AnalyticsContext';

import { LotesOfertablesSection } from './OpcionesOferta';



const fuenteKey = (f: Sugerencia): string =>

  `${f.lote}|${f.materialSugerido}|${f.centroSugerido}|${f.fechaCaducidad}`;

const MAX_LOTES_POR_MATERIAL = 2;



/* ------------------------------------------------------------------ */

/*  Helpers de presentación                                            */

/* ------------------------------------------------------------------ */






export function PedidoPanel({

  panel,

  a,

  push,

}: {

  panel: Extract<Panel, { type: 'pedido' }>;

  a: Analytics;

  push: (p: Panel) => void;

}) {

  const bo = a.boPedidos;

  const replaceTop = usePanelStore((s) => s.replaceTop);

  const { copy } = useClipboard();



  const items = useMemo(() => {

    // Desde Seg. de pedidos (o con un renglón de Seg) se muestran SUS renglones, uno por fila del libro: la versión agrupada del reporte fusiona renglones repetidos.
    const delSeg = panel.fuente === 'seg' || (panel.boKey ? a.boSeg.some((it) => it.k === panel.boKey) : false);

    return (delSeg ? a.boSeg : bo).filter((it) => norm(it.bo.pedido) === norm(panel.pedido));

  }, [bo, a.boSeg, panel.pedido, panel.boKey, panel.fuente]);



  const [seleccion, setSeleccion] = useState<Map<string, Map<string, Sugerencia>>>(new Map());
  // Mensaje al ejecutivo (folio, materiales, lotes y condiciones elegidos): se muestra al pulsar «Generar mensaje».
  const [verMensaje, setVerMensaje] = useState(false);

  // Ofertable (renglones de Seg. de pedidos): lotes de Corta caducidad con existencia, Revisión o Sustituto — el mismo criterio y el mismo
  // filtro "Considerar centros" que la columna Ofertable de la tabla principal.
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  const ctxOfertables = useMemo(() => contextoOfertables(a.lotesLibros, a.revisionLibros, a.sustitucionesLibros, a.detalleLotesLibros[CONDICION_PNC]), [a.lotesLibros, a.revisionLibros, a.sustitucionesLibros, a.detalleLotesLibros]);



  const toggleFuente = (boKey: string, f: Sugerencia) => {

    setSeleccion((prev) => {

      const next = new Map(prev);

      const actual = new Map(next.get(boKey) ?? []);

      const k = fuenteKey(f);

      if (actual.has(k)) actual.delete(k);

      else if (actual.size < MAX_LOTES_POR_MATERIAL) actual.set(k, f);

      else return prev;

      if (actual.size) next.set(boKey, actual);

      else next.delete(boKey);

      return next;

    });

  };



  const totalSeleccion = [...seleccion.values()].reduce((s, m) => s + m.size, 0);



  const lista = panel.lista;

  const idx = lista ? lista.indexOf(panel.pedido) : -1;

  const irA = (i: number) => {

    if (lista && i >= 0 && i < lista.length) replaceTop({ type: 'pedido', pedido: lista[i], lista, fuente: panel.fuente });

  };



  const pedidoCliente = useMemo(() => {

    const m = new Map<string, string>();

    for (const it of a.boPedidos) {

      const k = norm(it.bo.pedido);

      if (!m.has(k)) m.set(k, it.bo.razonSocial || it.bo.destinatario || '');

    }

    return m;

  }, [a.boPedidos]);



  const etiquetaPedido = (p: string) => {

    const cliente = pedidoCliente.get(norm(p));

    return cliente ? `${p} · ${cliente}` : p;

  };



  const selKey = panel.boKey && items.some((it) => it.k === panel.boKey) ? panel.boKey : items[0]?.k;

  const selIdx = items.findIndex((it) => it.k === selKey);



  const irAMaterial = (i: number) => {

    if (i < 0 || i >= items.length) return;

    replaceTop({ type: 'pedido', pedido: panel.pedido, boKey: items[i].k, lista, fuente: panel.fuente });

  };



  const listaMatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {

    listaMatRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' });

  }, [selKey]);



  useKeybindings(

    useMemo<KeyHandler[]>(

      () => [

        {

          combo: 'ArrowUp',

          handler: (ev) => {

            if (isEditableTarget(ev) || selIdx <= 0) return;

            ev.preventDefault();

            irAMaterial(selIdx - 1);

          },

        },

        {

          combo: 'ArrowDown',

          handler: (ev) => {

            if (isEditableTarget(ev) || selIdx < 0 || selIdx >= items.length - 1) return;

            ev.preventDefault();

            irAMaterial(selIdx + 1);

          },

        },

      ],

      [selIdx, items, panel.pedido, lista],

    ),

    items.length > 1,

  );



  useKeybindings(

    useMemo<KeyHandler[]>(

      () => [

        {

          combo: 'ArrowLeft',

          handler: (ev) => {

            if (isEditableTarget(ev) || !lista || idx <= 0) return;

            ev.preventDefault();

            irA(idx - 1);

          },

        },

        {

          combo: 'ArrowRight',

          handler: (ev) => {

            if (isEditableTarget(ev) || !lista || idx < 0 || idx >= lista.length - 1) return;

            ev.preventDefault();

            irA(idx + 1);

          },

        },

      ],

      [idx, lista],

    ),

    !!lista && lista.length > 1,

  );




  const serieActiva = (items.find((it) => it.k === selKey) ?? items[0])?.serie;

  const curmes = a.rf?.curmes;

  const consumoPromedio = useMemo(

    () => (serieActiva?.length && curmes ? Math.round(promedioConsumo(serieActiva, '12m', curmes)) : null),

    [serieActiva, curmes],

  );

  if (!items.length) return <p className="p-4 text-text-faint">Pedido sin materiales.</p>;



  const b0 = items[0].bo;

  const pendTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);

  const impTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente) * num(it.bo.precio), 0);

  const selItem = items.find((it) => it.k === selKey) ?? items[0];
  // Condición de la pestaña Revision del material seleccionado (no Corta caducidad); solo en renglones de Seg. de pedidos (libros).
  const revisionMat = selItem && (panel.fuente === 'seg' || a.boSeg.some((x) => x.k === selItem.k)) ? a.revisionLibros.get(claveMaterial(selItem.bo.materialBase)) ?? '' : '';







  // Seg. de pedidos: se resalta SOLO lo ofertable de los libros; Pedidos conserva su criterio (fuentes o condición registrada).
  const enSeg = panel.fuente === 'seg';
  const ofertableDe = (it: (typeof items)[number]) =>
    ofertablesDeMaterial(it.bo.materialBase, ctxOfertables, (c) => centroPasaFiltro(c, it.bo.centroPedido, centrosElegidos));
  const materialTieneOferta = (it: (typeof items)[number]): { tiene: boolean; texto: string } => {
    if (enSeg) {
      const o = ofertableDe(it);
      return { tiene: o.tiene, texto: textoOfertable(o) };
    }
    return { tiene: it.fuentes.length > 0 || !!condicionTextoDeMaterial(it.bo.materialBase, a.invCondicion), texto: 'Tiene fuentes ofertables o condición registrada' };
  };



  const copiarDatosOferta = () => {

    const lineas: string[] = [];

    for (const it of items) {

      const sel = seleccion.get(it.k);

      if (!sel) continue;

      for (const f of sel.values()) {

        const cad = f.fechaCaducidad ? formatFechaCaducidad(f.fechaCaducidad) : '—';

        const precios = preciosPorCondicion(f.materialSugerido, a.invConsolidadoCatalog, a.invCondicion, a.preciosAutorizados, true);

        const precio = precios[0]?.precio || 0;

        // Un sustituto (otro código que el del pedido) lleva delante la instrucción de qué código cambiar por cuál.
        if (esSustituto(it.bo.materialBase, f.materialSugerido)) lineas.push(textoCambioCodigo(it.bo.materialBase, f.materialSugerido));

        lineas.push(

          [`${f.materialSugerido}${f.descripcionSugerida ? `	${f.descripcionSugerida}` : ''}`, ...(f.lote ? [`Lote ${f.lote}`] : []), ...(f.fechaCaducidad ? [`cad. ${cad}`] : []), ...(precio ? [formatCurrency(precio)] : [])].join('	'),

        );

      }

    }

    const texto = [`Pedido ${panel.pedido}`, `Cliente ${b0.destinatario} — ${b0.razonSocial}`, ...lineas].join('\n');

    copy(texto, 'Datos de oferta copiados');

  };



  const ejecutivoNombre = a.enrich.ejecutivoNombre(b0.gpoVdor) || b0.gpoVdor || '—';

  // Mensaje del pedido: por cada renglón con lotes elegidos, esos lotes con su condición (sustituto / corta caducidad / otras).
  const mensajePedido = verMensaje && totalSeleccion > 0
    ? armarMensajePedido({
      ejecutivo: a.enrich.ejecutivoNombre(b0.gpoVdor),
      pedido: panel.pedido,
      oc: b0.oc,
      cliente: b0.razonSocial,
      centro: b0.centroPedido,
      items: items.map((it) => ({
        material: it.bo.materialBase,
        descripcion: it.bo.descripcionSolicitada,
        pendiente: num(it.bo.cantidadPendiente),
        lotes: [...(seleccion.get(it.k)?.values() ?? [])].map((f) => ({
          material: f.materialSugerido,
          descripcion: f.descripcionSugerida,
          lote: f.lote,
          caducidad: f.fechaCaducidad ? formatFechaCaducidad(f.fechaCaducidad) : '',
          disponible: f.disponible,
          precio: preciosPorCondicion(f.materialSugerido, a.invConsolidadoCatalog, a.invCondicion, a.preciosAutorizados, true)[0]?.precio || 0,
          fuente: f.fuente,
        })),
      })),
    })
    : null;



  return (

    <DetalleMosaico
      cabecera={<header className="shrink-0 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm">

        {/* Fila 1 · Identidad + metadatos */}

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border/60 bg-gradient-to-r from-bg-inset/60 via-bg-inset/20 to-transparent px-4 py-2.5">

          <div className="flex items-center gap-3">

            <div className="flex flex-col leading-tight">

              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-accent">

                Pedido

              </span>

              <div className="flex items-center gap-2">

                <span className="font-display text-xl font-bold tracking-tight text-text">

                  {panel.pedido}

                </span>

                {lista && lista.length > 1 && (

                  <PedidoNavControl lista={lista} idx={idx} irA={irA} etiqueta={etiquetaPedido} />

                )}

              </div>

            </div>

          </div>



          <div className="grid flex-1 grid-cols-2 items-center gap-x-6 gap-y-1.5 text-xs @xl:grid-cols-3 @4xl:grid-cols-4">

            <MetaField icon={Building2} label="Destinatario">

              <Chip

                title="Ver facturación del destinatario"

                onClick={() => push({ type: 'evol', kind: 'dest', key: b0.destinatario })}
                

              >

                {b0.destinatario}

              </Chip>

              <span

                className="max-w-[160px]  font-medium text-text @4xl:max-w-[220px]"

                title={b0.razonSocial}

              >

                {b0.razonSocial}

              </span>

            </MetaField>



            <MetaField icon={User} label="Solicitante">

              <Chip

                title="Ver facturación del solicitante"

                onClick={() => push({ type: 'evol', kind: 'solic', key: b0.solicitante })}

              >

                {b0.solicitante}

              </Chip>

            </MetaField>



            <MetaField icon={Users} label="Ejecutivo">

              <Chip

                title="Ver pedidos pendientes de este ejecutivo"

                onClick={() => push({ type: 'ejecutivoPedidos', gpoVdor: b0.gpoVdor })}

              >

                {ejecutivoNombre}

              </Chip>

            </MetaField>



            <MetaField icon={Hash} label="Grupo Cliente">

              <span

                className="truncate rounded-md bg-accent-soft px-2 py-0.5 text-sm font-bold text-accent"

                title={a.enrich.grupoCliente(b0.gpoCte) || b0.gpoCte || '—'}

              >

                {a.enrich.grupoCliente(b0.gpoCte) || b0.gpoCte || '—'}

              </span>

            </MetaField>



            <MetaField icon={FileText} label="OC">

              <span className="font-medium text-text">{b0.oc || '—'}</span>

            </MetaField>



            <MetaField icon={CalendarDays} label="Fecha">

              <span className="font-medium text-text">{b0.fecha || '—'}</span>

            </MetaField>



            <MetaField icon={MapPin} label="Centro / Almacen:">

              <span className="font-medium text-[15px] text-text">

                {selItem.bo.centroPedido || '—'}

                {selItem.bo.almacen ? ` / ${selItem.bo.almacen}` : ''}

              </span>

            </MetaField>

          </div>

        </div>



        {/* Fila 2 · Totales + Material activo */}

        <div className="grid grid-cols-1 divide-y divide-border/60 @3xl:grid-cols-12 @3xl:divide-x @3xl:divide-y-0">

          <div className="flex flex-col justify-center gap-1.5 px-4 py-3 @3xl:col-span-4">

            <div className="flex items-center justify-between">

              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-faint">

                Totales del pedido

              </span>

              <StatePill label={`${items.length} ${items.length === 1 ? 'renglón' : 'renglones'}`} cls="gris" />

            </div>

            <div className="grid grid-cols-3 gap-3">

              <div className="flex flex-col">

                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">

                  Importe pend.

                </span>

                <span className="font-display text-lg font-bold leading-tight tabular-nums text-text">

                  {formatCurrency(impTot)}

                </span>

              </div>

              <div className="flex flex-col">

                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">

                  Materiales

                </span>

                <span className="font-display text-lg font-bold leading-tight tabular-nums text-text">

                  {items.length}

                </span>

              </div>

              <div className="flex flex-col">

                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">

                  Cant. pend.

                </span>

                <span className="font-display text-lg font-bold leading-tight tabular-nums text-text">

                  {formatNumber(pendTot)}

                </span>

              </div>

            </div>

          </div>



          <div className="flex flex-col justify-center gap-2 bg-accent/[0.03] px-4 py-3 @3xl:col-span-8">

            <div className="flex min-w-0 flex-wrap items-center gap-2">

              <span className="shrink-0 text-[12px] font-bold uppercase tracking-[0.15em] text-accent">

                Material&#x20;

              </span>

              <Chip

                title="Ver todos los pedidos y consumo de este material"

                onClick={() => push({ type: 'material', material: selItem.bo.materialBase })}

              >

                {selItem.bo.materialBase}

              </Chip>

              <span

                className="min-w-0 flex-1 truncate text-sm font-semibold text-text"

                title={selItem.bo.descripcionSolicitada}

              >

                {selItem.bo.descripcionSolicitada}

              </span>

              {selItem.bo.bloqueado && <StatePill label={selItem.bo.bloqueado} cls="amb" />}

            </div>



            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 @lg:grid-cols-4">

              <div className="flex flex-col">

                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">

                  Pendiente

                </span>

                <span className="text-[28px] font-extrabold tabular-nums leading-tight text-accent">

                  {formatNumber(selItem.bo.cantidadPendiente)}{' '}

                  <span className="text-[12px] font-normal text-text-faint">

                    de {formatNumber(selItem.bo.cantidadPedido)}

                  </span>

                </span>

              </div>



              <div className="flex flex-col">

                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">

                  Precio

                </span>

                <span className="font-bold tabular-nums text-text">

                  {formatCurrency(selItem.bo.precio)}

                </span>

              </div>



              <div className="flex min-w-0 flex-col">

                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">

                  Estado

                </span>

                <span className="flex min-w-0 items-center gap-1.5">

                  <span className="truncate font-medium text-text" title={selItem.status.label}>

                    {selItem.status.label}

                  </span>

                  {revisionMat && <span title={`Material en la pestaña Revision: ${revisionMat}`}><StatePill label={revisionMat} cls="amb" /></span>}

                </span>

              </div>



              <CostoOcultable a={a} material={selItem.bo.materialBase} />

            </div>

          </div>

        </div>

      </header>}
      izquierda={<>
        {/* 1. Materiales del pedido */}
        <Tile
          icon={Package}
          title="1. Materiales del pedido"
          trailing={
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
              {items.length} {items.length === 1 ? 'material' : 'materiales'}
            </span>
          }
          className="h-full"
          bodyClassName="flex min-h-0 flex-col"
        >
          <ListaScroll listRef={listaMatRef}>
            {items.map((it) => {
              const oferta = materialTieneOferta(it);
              const conOfertaFlag = oferta.tiene;
              const nSel = seleccion.get(it.k)?.size ?? 0;
              const isActive = it.k === selKey;

              return (
                <button
                  key={it.k}
                  type="button"
                  data-sel={isActive}
                  title={
                    conOfertaFlag
                      ? oferta.texto
                      : undefined
                  }
                  onClick={() =>
                    replaceTop({ type: 'pedido', pedido: panel.pedido, boKey: it.k, lista, fuente: panel.fuente })
                  }
                  className={cn(
                    'flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    isActive
                      ? 'border-accent bg-accent-soft font-medium text-accent shadow-xs'
                      : conOfertaFlag
                        ? 'border-warning/40 bg-warning/20 hover:border-warning/60'
                        : 'border-border/60 hover:border-border hover:bg-bg-inset/70',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{it.bo.materialBase}</span>
                    <span className="ml-2 text-text-muted">{it.bo.descripcionSolicitada}</span>
                    {enSeg && conOfertaFlag && <span className="mt-0.5 block text-[11px] font-medium text-warning">{oferta.texto}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {nSel > 0 && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                        {nSel} {nSel === 1 ? 'lote' : 'lotes'} seleccionado{nSel === 1 ? '' : 's'}
                      </span>
                    )}
                    <span className="text-xs text-text-faint">Pendiente</span>
                    <span className="tabular-nums font-semibold">
                      {formatNumber(num(it.bo.cantidadPendiente))}
                    </span>
                  </span>
                </button>
              );
            })}
          </ListaScroll>

          {totalSeleccion > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-bg-inset/30 px-3 py-3">
              <div className="text-sm">
                <span className="font-semibold text-success">
                  Selección de oferta: {totalSeleccion}
                </span>
                <span className="ml-2 text-text-muted">
                  Máximo {MAX_LOTES_POR_MATERIAL} lotes por material
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Limpiar selección"
                  onClick={() => { setSeleccion(new Map()); setVerMensaje(false); }}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 className="size-4" />
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={() => setVerMensaje(true)}
                  title="Arma el mensaje para el ejecutivo con el folio, los materiales y los lotes elegidos"
                  className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  <MessageSquare className="size-4" />
                  Generar mensaje
                </button>
                <button
                  type="button"
                  onClick={copiarDatosOferta}
                  className="flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-success transition-colors hover:bg-success/20"
                >
                  <Copy className="size-4" />
                  Copiar datos de oferta
                </button>
              </div>
            </div>
          )}
          {mensajePedido && <MensajePedido mensaje={mensajePedido} onCerrar={() => setVerMensaje(false)} />}
        </Tile>

        {/* 2. Disponibilidad de inventario */}
        <Tile
          icon={Boxes}
          title="2. Disponibilidad de inventario"
          trailing={
            <span className="rounded-full bg-bg-inset px-2.5 py-1 text-xs font-medium text-text-muted">
              Centro {selItem.bo.centroPedido || '—'}
            </span>
          }
          className="h-full"
          bodyClassName="p-3"
        >
          <InventarioPrincipalSection a={a} b={selItem.bo} it={selItem} push={push} />
        </Tile>

        </>}
      derecha={<>
        {/* 3. Lotes, condiciones y materiales ofertables */}
        <Tile
          icon={Layers}
          title="3. Lotes, condiciones y materiales ofertables"
          trailing={
            <Chip
              title="Ver historial del material"
              onClick={() => push({ type: 'material', material: selItem.bo.materialBase })}
            >
              Material {selItem.bo.materialBase}
            </Chip>
          }
          bodyClassName="p-4"
        >
          <LotesOfertablesSection
            a={a}
            material={selItem.bo.materialBase}
            it={selItem}
            cliente={`${b0.destinatario} — ${b0.razonSocial}`}
            push={push}
            selection={{
              isSelected: (f) => seleccion.get(selItem.k)?.has(fuenteKey(f)) ?? false,
              onToggle: (f) => toggleFuente(selItem.k, f),
              full: (seleccion.get(selItem.k)?.size ?? 0) >= MAX_LOTES_POR_MATERIAL,
            }}
          />
        </Tile>

        {/* 4. Historial de demanda y facturación */}
        <Tile
          icon={BarChart2}
          title="4. Historial de demanda y facturación"
          trailing={
            <span className="rounded-full bg-bg-inset px-2.5 py-1 text-xs font-medium text-text-muted">
              Destinatario {b0.destinatario || '—'}
            </span>
          }
          bodyClassName="flex flex-col gap-4 p-4"
        >
          <HistorialConsumo
            a={a}
            serie={selItem.serie}
            titulo="Historial de facturación — material y destinatario"
            dest={b0.destinatario}
            material={selItem.bo.materialBase}
            promedioMensual={consumoPromedio}
            plegableKey="pedido.historial.facturacion"
            onMonth={(mes) =>
              push({
                type: 'clientesMes',
                material: selItem.bo.materialBase,
                mes,
                dest: selItem.bo.destinatario,
              })
            }
          />
        </Tile>
        </>}
    />
  );
}
