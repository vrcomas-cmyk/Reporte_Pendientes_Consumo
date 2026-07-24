import { ArrowLeft } from 'lucide-react';
import type { FC } from 'react';
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
import { MaterialTotalesPanel } from './panels/MaterialTotalesPanel';
import { ClienteDetallePanel } from './panels/ClienteDetallePanel';

// oxlint-disable-next-line typescript/no-explicit-any -- el discrim `panel.type` ya tipa panel; el dispatcher usa `any` para que cada rama acepte su Extract<Panel,...> sin sobrecargar la signatura.
const PANELS: Partial<Record<Panel['type'], FC<any>>> = {
  sugDetalle: SugDetallePanel,
  pedido: PedidoPanel,
  evol: EvolPanel,
  codigoEvol: CodigoEvolPanel,
  material: MaterialPanel,
  consumoMaterial: ConsumoMaterialPanel,
  clientesMes: ClientesMesPanel,
  mesClientesFiltro: MesClientesFiltroPanel,
  sector: SectorPanel,
  grupo: GrupoPanel,
  celda: CeldaPanel,
  materialTotales: MaterialTotalesPanel,
  clienteDetalle: ClienteDetallePanel,
};

/** Dispatcher de paneles: dado el discrim `panel.type` delega al componente de la rama correspondiente en `./panels/`. */
function PanelBody({ panel, a, push }: { panel: Panel; a: Analytics; push: (p: Panel) => void }) {
  const Cmp = PANELS[panel.type];
  if (!Cmp) return null;
  return <Cmp panel={panel} a={a} push={push} />;
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
      <SheetContent className="w-full max-w-4xl sm:max-w-4xl">
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
