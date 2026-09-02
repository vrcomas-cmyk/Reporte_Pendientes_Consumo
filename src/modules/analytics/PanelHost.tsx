import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense, type FC } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { usePanelStore, type Panel } from '@/store/panelStore';
import { useAnalytics, type Analytics } from './AnalyticsContext';

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
  'materialHub', 'material', 'sugDetalle', 'consumoMaterial', 'clienteDetalle', 'celda', 'invCondCelda', 'sector', 'grupo', 'materialTotales', 'materialColocacion', 'ejecutivoPedidos',
]);

// `pedido` es el único panel de 3 columnas (detalle + inventario + BO) — con
// el ancho de WIDE (7xl) cada columna queda apretada, así que usa un ancho
// mayor propio en vez de compartir el set de arriba.
const EXTRA_WIDE = new Set<Panel['type']>(['pedido']);

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
  const close = usePanelStore((s) => s.close);
  const push = usePanelStore((s) => s.push);
  const a = useAnalytics();
  const panel = stack[stack.length - 1];

  return (
    <Sheet open={!!panel} onOpenChange={(o) => !o && close()}>
      <SheetContent className={`w-full max-w-4xl ${panel && EXTRA_WIDE.has(panel.type) ? 'sm:max-w-[100rem]' : panel && WIDE.has(panel.type) ? 'sm:max-w-7xl' : 'sm:max-w-4xl'}`}>
        {stack.length > 1 && (
          <button onClick={back} className="mb-3 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
            <ArrowLeft className="size-4" /> Atrás
          </button>
        )}
        {panel && <PanelBody panel={panel} a={a} push={push} />}
      </SheetContent>
    </Sheet>
  );
}
