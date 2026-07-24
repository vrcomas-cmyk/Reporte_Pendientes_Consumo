import { Section } from './_shared';
import { formatCurrency } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Grupos de artículo de un sector con importe histórico. */
export function SectorPanel({ panel, a, push: _push }: { panel: Extract<Panel, { type: 'sector' }>; a: Analytics; push: (p: Panel) => void }) {
  void _push;
  const { rf, enrich } = a;
  if (!rf) return <p>Sin datos.</p>;
  const grupos = new Map<string, { grupo: string; i12: number }>();
  rf.mat.forEach((serie, m) => {
    if (enrich.matSector(m) !== panel.sector && !(panel.sector === '(sin sector)' && !enrich.matSector(m))) return;
    const gru = enrich.matGrupo(m) || '(sin grupo)';
    const i12 = serie.reduce((s, x) => s + x.imp, 0);
    const g = grupos.get(gru) || { grupo: gru, i12: 0 };
    g.i12 += i12;
    grupos.set(gru, g);
  });
  const list = [...grupos.values()].sort((x, y) => y.i12 - x.i12);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Sector · {panel.sector}</h2>
      <p className="mt-1 text-sm text-text-muted">Grupos de artículo del sector</p>
      <Section title={`${list.length} grupo(s)`}>
        <div>
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead>Grupo de artículo</TableHead><TableHead className="text-right">Importe (histórico)</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((g) => (
                <TableRow key={g.grupo}><TableCell>{g.grupo}</TableCell><TableCell className="text-right">{formatCurrency(g.i12)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
