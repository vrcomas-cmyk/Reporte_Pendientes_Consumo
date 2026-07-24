import { TrendBadge, ComparativaDual, EvolChart, DetailChevron } from '../ui';
import { Section } from './_shared';
import { formatCurrency } from '@/lib/utils';
import { materialesDe, serieSolic, serieDest, mesLabel } from '@/core/resumenFac';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Facturación general de un Solicitante o Destinatario: comparativo anual, evolución y códigos facturados. */
export function EvolPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'evol' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rf, enrich } = a;
  if (!rf) return <p>No hay Resumen_Fac cargado.</p>;
  const serie = panel.kind === 'solic' ? serieSolic(rf, panel.key) : serieDest(rf, panel.key);
  const mats = materialesDe(rf, panel.kind, panel.key).map((m) => ({ ...m, sector: enrich.matSector(m.material), grupo: enrich.matGrupo(m.material) }));
  const titulo = panel.kind === 'solic' ? 'Facturación general del Solicitante' : 'Facturación general del Destinatario';
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      <p className="mt-1 text-sm text-text-muted">{panel.kind === 'solic' ? 'Solicitante' : 'Destinatario'}: {panel.key} · {mats.length} material(es)</p>
      <Section title="Comparativo anual"><ComparativaDual serie={serie} /></Section>
      <Section title="Evolución mensual — Importe facturado"><EvolChart serie={serie} /></Section>
      <Section title="Códigos facturados y su tendencia">
        <div>
          <Table wrapperClassName="max-h-80 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Sector/Grupo</TableHead><TableHead>Último mes</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Tendencia</TableHead><TableHead className="w-8" /></TableRow></TableHeader>
            <TableBody>
              {mats.map((m) => (
                <TableRow key={m.material} className="group">
                  <TableCell><span className="text-accent">{m.material}</span><div className="text-[11px] text-text-faint max-w-72 truncate">{m.texto}</div></TableCell>
                  <TableCell>{m.sector || '—'}<div className="text-[11px] text-text-faint">{m.grupo}</div></TableCell>
                  <TableCell>{m.ultimo ? mesLabel(m.ultimo.mes) : '—'}</TableCell>
                  <TableCell className="text-right">{m.ultimo ? formatCurrency(m.ultimo.imp) : '—'}</TableCell>
                  <TableCell><TrendBadge t={m.tend} /></TableCell>
                  <TableCell><DetailChevron onOpen={() => push({ type: 'codigoEvol', kind: panel.kind, key: panel.key, material: m.material })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
