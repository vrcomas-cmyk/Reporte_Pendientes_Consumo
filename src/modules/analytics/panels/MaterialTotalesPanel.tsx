import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatTile } from '../ui';
import { Section, SugTable, ConsumoTable, PrecioCondicionBox } from './_shared';
import { formatNumber } from '@/lib/utils';
import { sugFor, consFor, norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Totales globales de un material (inventario, pendiente, sugerencias, clientes de consumo) con tabs. */
export function MaterialTotalesPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'materialTotales' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rss, bo, result } = a;
  if (!rss) return <p>Sin datos.</p>;
  const mo = rss.mats.get(norm(panel.material));
  if (!mo) return <p>Material no encontrado.</p>;
  const sug = sugFor(bo, panel.material);
  const cons = consFor(result?.consumo ?? [], panel.material);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{panel.material} · Totales</h2>
      <p className="mt-1 text-sm text-text-muted">{mo.desc}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Inventario global" value={formatNumber(mo.sumaInv)} />
        <StatTile label="Pendiente global" value={formatNumber(mo.sumaPend)} tone="text-danger" />
        <StatTile label="Sugerencias" value={String(sug.length)} />
        <StatTile label="Clientes consumo" value={String(cons.length)} />
      </div>
      <PrecioCondicionBox a={a} material={panel.material} />
      <Section title="Sugerencias / Consumo del material">
        <Tabs defaultValue="sug">
          <TabsList><TabsTrigger value="sug">Sugerencias ({sug.length})</TabsTrigger><TabsTrigger value="cons">Consumo ({cons.length})</TabsTrigger></TabsList>
          <TabsContent value="sug"><SugTable list={sug} push={push} /></TabsContent>
          <TabsContent value="cons"><ConsumoTable list={cons} a={a} push={push} /></TabsContent>
        </Tabs>
      </Section>
    </div>
  );
}
