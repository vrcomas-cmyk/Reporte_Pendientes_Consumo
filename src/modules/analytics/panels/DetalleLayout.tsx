import { useMemo, useState, type ReactNode } from 'react';
import { InvGrid, EvolChart, ComparativaDual } from '../ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Section, SugTable, ConsumoTable, ConsumoMaterialCard, PrecioCondicionBox, type SeleccionFilas } from './_shared';
import { MensajeEjecutivo, type LotesOfertados } from './MensajeEjecutivo';
import { SolicitarGrid } from './MaterialInventario';
import { puntosSolicitarInventario } from '../inventario1031';
import { inventarioBloques } from '../inventarioBloques';
import { useCentrosFiltroStore } from '@/store/centrosFiltroStore';
import { useNombresStore, useVistaCentrosStore } from '@/store/nombresStore';
import { etiquetaCentro, etiquetaAlmacen } from '@/lib/nombres';
import { formatNumber } from '@/lib/utils';
import { norm } from '../helpers';
import { useInvCerosStore } from '@/store/invCerosStore';
import type { BOItem } from '@/core/buildBO';
import type { ConsumoRow } from '@/core/types';
import type { Serie } from '@/core/resumenFac';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Dato general (etiqueta + valor) de la franja superior del detalle. */
export interface DatoGeneral { etiqueta: string; valor: ReactNode }

/** Molde común de los detalles: encabezado + datos generales + banda arriba; inventarios a la izquierda;
 * historial de facturación y consumo al centro; pestañas Sugerencias / Consumo y secciones de apoyo abajo. */
export function DetalleLayout({ encabezado, datos = [], banda, izquierda, centro, abajo, acciones }: {
  encabezado: ReactNode;
  /** Botones de la esquina superior derecha (p. ej. "Ver totales del material"). */
  acciones?: ReactNode;
  datos?: readonly DatoGeneral[];
  banda?: ReactNode;
  izquierda?: ReactNode;
  centro?: ReactNode;
  abajo?: ReactNode;
}) {
  const datosVisibles = datos.filter((d) => d.valor !== undefined && d.valor !== null && d.valor !== '');
  return (
    <div className="@container">
    <div className="flex flex-col gap-4">
      {/* Banda superior inmovilizada: cabecera + datos generales + cifras clave se quedan arriba mientras se baja por el detalle. */}
      <div className="@3xl:sticky @3xl:top-0 z-20 shadow-[0_8px_8px_-8px_rgba(0,0,0,0.25)] -mx-1 flex flex-col gap-4 bg-bg-elevated px-1 pb-3">
      <header>
        {acciones && <div className="mb-2 flex flex-wrap items-center justify-end gap-2">{acciones}</div>}
        {encabezado}
        {datosVisibles.length > 0 && (
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs">
            {datosVisibles.map((d) => (
              <div key={d.etiqueta} className="flex items-baseline gap-1.5">
                <dt className="text-text-faint">{d.etiqueta}</dt>
                <dd className="font-medium text-text">{d.valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>
      {banda}
      </div>
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] @3xl:items-start">
        {izquierda && <aside className="min-w-0 @3xl:sticky @3xl:top-0">{izquierda}</aside>}
        {/* Collage: cada bloque es una ficha; las anchas (tablas, gráfica) ocupan las dos columnas. */}
        <div className={`grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] items-start gap-3 [&>*]:!mt-0 ${izquierda ? '' : '@3xl:col-span-2'}`}>
          {centro}
          {abajo}
        </div>
      </div>
    </div>
    </div>
  );
}

/** Columna izquierda: SIEMPRE los mismos tres bloques de inventario del material + Solicitar.
 * 1) Principales (almacenes 1030/1031/1032/1060 del centro revisado), 2) Otros centros (1030+1031+1060 sumados),
 * 3) Centro 1031 · almacén 1030 y 1032 (con Solicitar desde inventario: clic derecho). */
export function InventarioColumna({ a, material, centro = '1031', push, abrirCelda, sinPrincipales = false }: { a: Analytics; material: string; centro?: string; push?: (p: Panel) => void; /** El desglose por almacén del centro ya está en el cuerpo (Inventario · Disponibilidad / Inv con Condición). */ sinPrincipales?: boolean; /** Cómo abrir un centro/almacén (por defecto el panel `celda`; Inv con Condición usa `invCondCelda`). */ abrirCelda?: (centro: string, almacen?: string) => void }) {
  const ir = abrirCelda ?? (push ? (c: string, alm?: string) => push({ type: 'celda', material, centro: c, ...(alm ? { almacen: alm } : {}) }) : undefined);
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  const nombresCentros = useNombresStore((s) => s.centros);
  const nombresAlm = useNombresStore((s) => s.almacenes);
  const mostrarNombres = useVistaCentrosStore((s) => s.mostrarNombres);
  const b = useMemo(() => inventarioBloques(a, material, centro, centrosElegidos), [a, material, centro, centrosElegidos]);
  const condiciones = a.enrich.matCondiciones(material).join(', ');
  const puntos = puntosSolicitarInventario(a, material, b.otrosCentros.find((c) => c.clave === '1018')?.cantidad ?? 0);
  const tituloPunto = (p: { centro: string; almacen: string; titulo: string }) => (p.almacen
    ? `Centro ${etiquetaCentro(p.centro, nombresCentros, mostrarNombres)} / Alm ${etiquetaAlmacen(p.almacen, nombresAlm)}`
    : p.titulo);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">Inventario · {material}</h3>
        <OcultarCerosToggle />
      </div>
      {!sinPrincipales && (
        <Section tono="inv" origen="Disponibilidad" title={`Principales · Centro ${etiquetaCentro(b.centro, nombresCentros, mostrarNombres)}`}>
          <InvGrid ocultables cols={2} items={b.principales.map((x) => [x.etiqueta, x.cantidad])}
            onSelect={ir ? (i) => ir(b.centro, b.principales[i].clave) : undefined} />
        </Section>
      )}
      <Section tono="inv" origen="Disponibilidad" title="Otros centros (alm. 1030+1031+1060)">
        {b.otrosCentros.length
          ? <InvGrid ocultables cols={2} items={b.otrosCentros.map((x) => [`Centro ${etiquetaCentro(x.clave, nombresCentros, mostrarNombres)}`, x.cantidad, x.transito, `prom 12m: ${formatNumber(x.promedio ?? 0)}`, x.ayudaPromedio])}
            onSelect={ir ? (i) => ir(b.otrosCentros[i].clave) : undefined} />
          : <p className="text-sm text-text-muted">Ningún centro elegido en el filtro.</p>}
      </Section>
      <Section tono="inv" origen="Disponibilidad" title="Centro 1031 · almacén 1030 y 1032 (clic derecho = Solicitar)">
        <SolicitarGrid a={a} material={material} mat={norm(material)} puntos={puntos} condiciones={condiciones} tituloDe={tituloPunto}
          onAbrir={ir ? (p) => ir(p.centro, p.almacen || undefined) : undefined} />
      </Section>
    </div>
  );
}

/** Centro: historial de facturación (importe + cantidad, filtro de periodo) con el "Consumo del material" del cliente integrado
 * y el comparativo anual. `dest` + `material` activan la tarjeta de consumo del par. */
export function HistorialConsumo({ a, serie, titulo = 'Historial de facturación', dest, material, onMonth, children, costosMaterial, promedioMensual, plegableKey }: {
  a: Analytics; serie: Serie; titulo?: string; dest?: string; material?: string; onMonth?: (mes: string) => void; /** Material cuyo costo y precios por condición se muestran junto al consumo del material. */ costosMaterial?: string; /** Fichas extra de Facturación (promedio por periodo, A vs B…). */ children?: ReactNode;
  /** Reemplaza el costo de la banda de consumo por el promedio mensual de 12 meses cerrados (null = sin histórico). */ promedioMensual?: number | null;
  /** Con clave, la ficha del historial (gráfica y comparativo) es plegable y arranca CERRADA (después recuerda lo que el usuario elija). */
  plegableKey?: string;
}) {
  return (
    <>
      {(costosMaterial || (dest && material)) && <ConsumoCostoPrecios a={a} material={(costosMaterial ?? material)!} dest={dest} promedioMensual={promedioMensual} />}
      <Section ancho tono="fac" origen="Resumen_Fac · Fac_Mensual_CAM" title={titulo} {...(plegableKey ? { collapsible: true, defaultOpen: false, storageKey: plegableKey } : {})}>
        <EvolChart serie={serie} height={240} onMonth={onMonth} />
        {a.rf && <div className="mt-3"><ComparativaDual serie={serie} /></div>}
      </Section>
      {children}
    </>
  );
}

/** Pestañas Sugerencias / Consumo (como en el detalle de Inventario · Disponibilidad). Con `lotes` (la tabla de materiales ofertables del mismo detalle)
 * las filas se pueden filtrar por cualquier columna y marcar para armar un mensaje al ejecutivo ("¿puedes ofertar alguno de estos productos?"). */
export function TabsSugConsumo({ sug, cons, a, push, titulo = 'Sugerencias / Consumo', lotes, material, centro, descripcion }: {
  sug: BOItem[]; cons: ConsumoRow[]; a: Analytics; push: (p: Panel) => void; titulo?: string;
  lotes?: LotesOfertados; material?: string; centro?: string; descripcion?: string;
}) {
  const [selSug, setSelSug] = useState<ReadonlySet<string>>(new Set());
  const [selCons, setSelCons] = useState<ReadonlySet<string>>(new Set());
  const fabrica = (set: ReadonlySet<string>, setSet: (s: ReadonlySet<string>) => void): SeleccionFilas => ({
    isSelected: (k) => set.has(k),
    onToggle: (k) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); setSet(n); },
    onToggleAll: (keys, on) => { const n = new Set(set); for (const k of keys) { if (on) n.add(k); else n.delete(k); } setSet(n); },
  });
  const conSeleccion = !!lotes && !!material;
  return (
    <Section ancho tono="ped" origen="Seg pedidos · Resumen_Fac" title={titulo}>
      <Tabs defaultValue={sug.length || !cons.length ? 'sug' : 'cons'}>
        <TabsList>
          <TabsTrigger value="sug">Sugerencias ({sug.length}){selSug.size > 0 && ` · ${selSug.size} ✓`}</TabsTrigger>
          <TabsTrigger value="cons">Consumo ({cons.length}){selCons.size > 0 && ` · ${selCons.size} ✓`}</TabsTrigger>
        </TabsList>
        <TabsContent value="sug"><SugTable list={sug} a={a} push={push} selection={conSeleccion ? fabrica(selSug, setSelSug) : undefined} /></TabsContent>
        <TabsContent value="cons"><ConsumoTable list={cons} a={a} push={push} selection={conSeleccion ? fabrica(selCons, setSelCons) : undefined} /></TabsContent>
      </Tabs>
      {conSeleccion && lotes && material && (
        <MensajeEjecutivo
          a={a} material={material} centro={centro ?? ''} descripcion={descripcion ?? ''} sug={sug} cons={cons} selSug={selSug} selCons={selCons} lotes={lotes}
          onLimpiar={() => { setSelSug(new Set()); setSelCons(new Set()); }}
        />
      )}
    </Section>
  );
}

/** Costos y precios del material (costo por unidad + precio oferta por condición), siempre en la columna izquierda. */
export function ConsumoCostoPrecios({ a, material, dest, promedioMensual }: { a: Analytics; material: string; dest?: string; promedioMensual?: number | null }) {
  return (
    <>
      <ConsumoMaterialCard a={a} dest={dest} material={material} promedioMensual={promedioMensual} />
      <PrecioCondicionBox a={a} material={material} />
    </>
  );
}

/** Interruptor global "Ocultar inventarios en 0" para los bloques de inventario de los detalles. */
export function OcultarCerosToggle() {
  const ocultar = useInvCerosStore((s) => s.ocultar);
  const setOcultar = useInvCerosStore((s) => s.setOcultar);
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-text-muted">
      <input type="checkbox" checked={ocultar} onChange={(e) => setOcultar(e.target.checked)} className="size-3.5 accent-success" />
      Ocultar inventarios en 0
    </label>
  );
}

/** Botón "Ver totales del material" para la esquina del detalle. */
export function AccionTotalesMaterial({ material, push }: { material: string; push: (p: Panel) => void }) {
  return (
    <button type="button" onClick={() => push({ type: 'materialTotales', material })} className="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted hover:border-accent hover:text-accent">
      Ver totales del material
    </button>
  );
}
