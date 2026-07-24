import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatTile, EvolChart, StatePill } from '../ui';
import { Section, SugTable, ConsumoTable, PrecioCondicionBox } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { invGen } from '@/core/resumenSin';
import { serieMaterial } from '@/core/resumenFac';
import { sugFor, consFor, norm } from '../helpers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle por material+centro: inventario, desglose por almacén, tendencia y sugerencias/consumo en ese centro. */
export function CeldaPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'celda' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rss, bo, rf, result } = a;
  if (!rss) return <p>Sin datos.</p>;
  const mo = rss.mats.get(norm(panel.material));
  const co = mo?.centros.get(norm(panel.centro));
  if (!mo || !co) return <p>Celda no encontrada.</p>;
  const alms = [...co.alm.values()].sort((x, y) => String(x.alm).localeCompare(String(y.alm)));
  const sug = sugFor(bo, panel.material, panel.centro);
  const cons = consFor(result?.consumo ?? [], panel.material, panel.centro);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {panel.centro}</h2>
      <p className="mt-1 text-sm text-text-muted">{mo.desc}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Inv. general" value={formatNumber(invGen(co))} />
        <StatTile label="Pendiente" value={formatNumber(co.pend)} tone="text-danger" />
        <StatTile label="En tránsito" value={formatNumber(co.transito)} tone="text-warning" />
        <StatTile label="Importe pend." value={formatCurrency(co.impPend)} />
      </div>
      <PrecioCondicionBox a={a} material={panel.material} />
      <Section title="Desglose por almacén">
        <div>
          <Table wrapperClassName="max-h-64 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead>Almacén</TableHead><TableHead className="text-right">Inv.</TableHead><TableHead className="text-right">Pend.</TableHead><TableHead className="text-right">Tránsito</TableHead><TableHead className="text-right">Prom.</TableHead><TableHead>Último</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {alms.map((al, i) => (
                <TableRow key={i}>
                  <TableCell>{al.alm}</TableCell><TableCell className="text-right">{formatNumber(al.inv)}</TableCell>
                  <TableCell className="text-right">{al.pend ? formatNumber(al.pend) : '—'}</TableCell>
                  <TableCell className="text-right">{al.transito ? formatNumber(al.transito) : '—'}</TableCell>
                  <TableCell className="text-right">{formatNumber(al.prom)}</TableCell>
                  <TableCell>{al.ultMes || '—'}</TableCell>
                  <TableCell>{al.status ? <StatePill label={al.status} cls="amb" /> : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
      <Section title="Tendencia del material"><EvolChart serie={serieMaterial(rf, panel.material)} height={180} /></Section>
      <Section title="Sugerencias / Consumo en este centro">
        <Tabs defaultValue="sug">
          <TabsList><TabsTrigger value="sug">Sugerencias ({sug.length})</TabsTrigger><TabsTrigger value="cons">Consumo ({cons.length})</TabsTrigger></TabsList>
          <TabsContent value="sug"><SugTable list={sug} push={push} /></TabsContent>
          <TabsContent value="cons"><ConsumoTable list={cons} a={a} push={push} /></TabsContent>
        </Tabs>
      </Section>
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => push({ type: 'materialTotales', material: panel.material })}>Ver totales del material</Button>
      </div>
    </div>
  );
}
