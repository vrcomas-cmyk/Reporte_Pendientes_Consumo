import { useMemo } from 'react';
import { Section } from './_shared';
import { formatCurrency } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { analisisVentas } from '@/core/comercial';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

function pct(a: number, b: number) {
  const p = b ? (a / b - 1) * 100 : a ? 100 : 0;
  return <span className={p >= 0 ? 'text-emerald-500' : 'text-danger'}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>;
}

/** Panel — Grupos de artículo de un sector, misma ventana 3m previos / últ. 3m / 12m que la tabla de sectores. */
export function SectorPanel({ panel, a, push: _push }: { panel: Extract<Panel, { type: 'sector' }>; a: Analytics; push: (p: Panel) => void }) {
  void _push;
  const A = useMemo(() => analisisVentas(a.rf, a.bo, a.enrich), [a.rf, a.bo, a.enrich]);
  if (!A) return <p>Sin datos.</p>;
  const sectorData = A.sectores.find((s) => s.sector === panel.sector);
  const list = sectorData ? [...sectorData.grupos.values()].sort((x, y) => y.i12 - x.i12) : [];
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Sector · {panel.sector}</h2>
      <p className="mt-1 text-sm text-text-muted">Grupos de artículo del sector · 3m previos vs últ. 3m completos</p>
      <Section title={`${list.length} grupo(s)`}>
        <div>
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader>
              <TableRow>
                <TableHead>Grupo de artículo</TableHead>
                <TableHead className="text-right">3m previos</TableHead>
                <TableHead className="text-right">Últ. 3m</TableHead>
                <TableHead className="text-right">Imp. 12m</TableHead>
                <TableHead>Var.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((g) => (
                <TableRow key={g.grupo}>
                  <TableCell>{g.grupo}</TableCell>
                  <TableCell className="text-right">{formatCurrency(g.p3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(g.a3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(g.i12)}</TableCell>
                  <TableCell>{pct(g.a3, g.p3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
