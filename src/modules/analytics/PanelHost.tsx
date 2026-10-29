import { ArrowLeft, ChevronRight } from 'lucide-react';
import { lazy, Suspense, useMemo, type FC } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { usePanelStore, type Panel } from '@/store/panelStore';
import { TilesOcultosControl } from './ui/TilesOcultosControl';
import { useAnalytics, type Analytics } from './AnalyticsContext';
import { useRssFuenteStore } from '@/store/rssFuenteStore';
import { useFacFuenteStore } from '@/store/facFuenteStore';
import { conFacturacion } from './facturacionAnalytics';
import { rfTieneCentro } from '@/core/resumenFac';
import { renglonesPorModo } from './helpers';
import { usePendienteBloqueoStore } from '@/store/pendienteBloqueoStore';

import { SugDetallePanel } from './panels/SugDetallePanel';
import { PedidoPanel } from './panels/PedidoPanel';
import { EvolPanel } from './panels/EvolPanel';
import { CodigoEvolPanel } from './panels/CodigoEvolPanel';
import { MaterialPanel } from './panels/MaterialPanel';
import { ConsumoMaterialPanel } from './panels/ConsumoMaterialPanel';
import { ClientesMesPanel, MesClientesFiltroPanel } from './panels/ClientesMesPanel';
import { SectorPanel } from './panels/SectorPanel';
import { GrupoPanel } from './panels/GrupoPanel';
import { CeldaPanel } from './panels/CeldaPanel';
import { InvCondCeldaPanel } from './panels/InvCondCeldaPanel';
import { MaterialTotalesPanel } from './panels/MaterialTotalesPanel';
import { ClienteDetallePanel } from './panels/ClienteDetallePanel';
import { EjecutivoPedidosPanel } from './panels/EjecutivoPedidosPanel';
import { LotePanel } from './panels/LotePanel';
import { panelTitulo } from './panelTitulo';

// Los paneles de Oportunidades se cargan con lazy para no arrastrar el módulo
// (scoring, HubLinks, conocimientoStore) al chunk inicial — PanelHost es eager
// en App.tsx, así que imports estáticos aquí anulaban el code-splitting.
const MaterialHubPanel = lazy(() => import('@/modules/oportunidades/panels/MaterialHubPanel').then((m) => ({ default: m.MaterialHubPanel })));
const OportunidadPanel = lazy(() => import('@/modules/oportunidades/panels/OportunidadPanel').then((m) => ({ default: m.OportunidadPanel })));
const ClienteConocimientoPanel = lazy(() => import('@/modules/oportunidades/panels/ClienteConocimientoPanel').then((m) => ({ default: m.ClienteConocimientoPanel })));
const MaterialColocacionPanel = lazy(() => import('@/modules/oportunidades/panels/MaterialColocacionPanel').then((m) => ({ default: m.MaterialColocacionPanel })));
const ClientesSinReglaPanel = lazy(() => import('@/modules/oportunidades/panels/ClientesSinReglaPanel').then((m) => ({ default: m.ClientesSinReglaPanel })));

// oxlint-disable-next-line typescript/no-explicit-any -- el discrim `panel.type` ya tipa panel; el dispatcher usa `any` para que cada rama acepte su Extract<Panel,...> sin sobrecargar la signatura.
const PANELS: Partial<Record<Panel['type'], FC<any>>> = {
  sugDetalle: SugDetallePanel,
  pedido: PedidoPanel,
  evol: EvolPanel,
  ejecutivoPedidos: EjecutivoPedidosPanel,
  codigoEvol: CodigoEvolPanel,
  material: MaterialPanel,
  consumoMaterial: ConsumoMaterialPanel,
  clientesMes: ClientesMesPanel,
  mesClientesFiltro: MesClientesFiltroPanel,
  sector: SectorPanel,
  grupo: GrupoPanel,
  celda: CeldaPanel,
  invCondCelda: InvCondCeldaPanel,
  materialTotales: MaterialTotalesPanel,
  lote: LotePanel,
  clienteDetalle: ClienteDetallePanel,
  materialHub: MaterialHubPanel,
  oportunidad: OportunidadPanel,
  clienteConocimiento: ClienteConocimientoPanel,
  materialColocacion: MaterialColocacionPanel,
  materialSinRegla: ClientesSinReglaPanel,
};

// Paneles que pueden renderizar `SugTable`/`ConsumoTable` con todas sus
// columnas (fiel al reporte completo, ver _shared.tsx) necesitan bastante más
// ancho que un panel de detalle simple — si no, la tabla queda apretada con
// scroll horizontal interno para casi cualquier cosa.
const WIDE = new Set<Panel['type']>([
  'materialHub', 'material', 'sugDetalle', 'consumoMaterial', 'clienteDetalle', 'celda', 'invCondCelda', 'sector', 'grupo', 'materialTotales', 'materialColocacion', 'ejecutivoPedidos', 'lote',
]);

// `pedido` es el único panel de 3 columnas (detalle + inventario + BO) — con
// el ancho de WIDE (7xl) cada columna queda apretada, así que usa un ancho
// mayor propio en vez de compartir el set de arriba.
const EXTRA_WIDE = new Set<Panel['type']>(['pedido', 'celda', 'invCondCelda', 'material', 'clienteDetalle', 'clientesMes', 'mesClientesFiltro']);

/** Dispatcher de paneles: dado el discrim `panel.type` delega al componente de la rama correspondiente en `./panels/`. */
function PanelBody({ panel, a, push }: { panel: Panel; a: Analytics; push: (p: Panel) => void }) {
  const Cmp = PANELS[panel.type];
  if (!Cmp) return null;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-muted">Cargando panel…</div>}>
      <Cmp panel={panel} a={a} push={push} />
    </Suspense>
  );
}

export function PanelHost() {
  const stack = usePanelStore((s) => s.stack);
  const back = usePanelStore((s) => s.back);
  const goTo = usePanelStore((s) => s.goTo);
  const close = usePanelStore((s) => s.close);
  const push = usePanelStore((s) => s.push);
  const aBase = useAnalytics();
  // Si hay un módulo Inventario con datos de Disponibilidad abierto, sus paneles leen ESE inventario (`rss`).
  const fuenteRss = useRssFuenteStore((s) => s.fuente);
  const modoBloqueo = usePendienteBloqueoStore((s) => s.modo);
  const facActivo = useFacFuenteStore((s) => s.activo);
  const aRss = useMemo(() => {
    // Pedidos pendientes de estos módulos: los renglones LIBERADOS de Seg pedidos (la misma fuente del número de la tabla), no los del reporte anterior.
    const boLibros = renglonesPorModo(aBase.boSeg, modoBloqueo);
    if (fuenteRss === 'disp' && aBase.rssDisp) return { ...aBase, rss: aBase.rssDisp, bo: boLibros };
    // Inv con Condición: inventario por condición, lotes y pendiente/tránsito/lento de los libros.
    if (fuenteRss === 'libros') return { ...aBase, rss: aBase.rssDisp ?? aBase.rss, invCondicion: aBase.invCondicionLibros, lotes: aBase.lotesLibros, bo: boLibros };
    return aBase;
  }, [aBase, fuenteRss, modoBloqueo]);
  // Módulo Facturación abierto: consumo y facturación de los libros de Drive (lo mismo que su tabla).
  // Con el módulo Facturación abierto, o cuando el Resumen_Fac del reporte no está cargado / no trae la columna Centro (p. ej. Inv. Disponibilidad
  // alimentado solo por libros), los detalles leen la facturación de los libros de Drive: historial, tendencias por centro, consumo y ABC.
  // Un módulo de libros abierto (Seg. de pedidos, Inventario…) también cuenta: sus detalles leen SIEMPRE la facturación de los libros.
  const facPedida = useFacFuenteStore((s) => s.demanda > 0);
  const usarLibrosFac = facActivo || (!!aRss.facturacion.rf && (facPedida || !rfTieneCentro(aRss.rf)));
  const a = useMemo(() => (usarLibrosFac ? conFacturacion(aRss) : aRss), [aRss, usarLibrosFac]);
  const panel = stack[stack.length - 1];
  return (
    <Sheet open={!!panel} onOpenChange={(o) => !o && close()}>
      <SheetContent className={`w-full max-w-4xl ${panel && EXTRA_WIDE.has(panel.type) ? 'sm:max-w-[min(112rem,calc(100vw-2rem))]' : panel && WIDE.has(panel.type) ? 'sm:max-w-[min(96rem,calc(100vw-2rem))]' : 'sm:max-w-4xl'}`}>
        {stack.length > 1 && (
          <nav aria-label="Ruta del detalle" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-text-muted">
            <button onClick={back} className="mr-1 inline-flex items-center gap-1 hover:text-text"><ArrowLeft className="size-4" /> Atrás</button>
            {stack.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3 text-text-faint" />}
                {i === stack.length - 1
                  ? <span className="max-w-56 truncate font-medium text-text" aria-current="page">{panelTitulo(p, a)}</span>
                  : <button type="button" onClick={() => goTo(i)} className="max-w-40 truncate hover:text-accent hover:underline" title="Volver a este nivel">{panelTitulo(p, a)}</button>}
              </span>
            ))}
          </nav>
        )}
        {panel && <TilesOcultosControl inline />}
        {panel && <PanelBody panel={panel} a={a} push={push} />}
      </SheetContent>
    </Sheet>
  );
}
