import { useState } from 'react';
import { StatePill, EvolChart, DetailChevron } from '../ui';
import { Section, SubFilter } from './_shared';
import { formatCurrency } from '@/lib/utils';
import { clasificarEstado, mesKey, mesLabel, mesRefQAnterior, tendenciaTexto, type Serie } from '@/core/resumenFac';
import { matchesQuery } from '../helpers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

type Estado = ReturnType<typeof clasificarEstado>;

/** Panel — Detalle por grupo de artículo: solicitantes con estado actual y del trimestre anterior, y evolución del grupo. */
export function GrupoPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'grupo' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rf, enrich } = a;
  if (!rf) return <p>Sin datos.</p>;
  const g = panel.grupo;
  const rows: { solic: string; razon: string; st: Estado; stPrev: Estado; imp: number; ult: string }[] = [];
  const gbucket = new Map<string, { imp: number; cant: number; mes: string }>();
  const refPrev = mesRefQAnterior(rf.curmes);
  rf.solicMats.forEach((mats, s) => {
    const bucket = new Map<string, { imp: number; cant: number; mes: string }>();
    mats.forEach((serie, mat) => {
      if ((enrich.matGrupo(mat) || '(sin grupo)') !== g) return;
      serie.forEach((p) => {
        const c = bucket.get(p.mes) || { imp: 0, cant: 0, mes: p.mes };
        c.imp += p.imp; c.cant += p.cant; bucket.set(p.mes, c);
        const gb = gbucket.get(p.mes) || { imp: 0, cant: 0, mes: p.mes };
        gb.imp += p.imp; gbucket.set(p.mes, gb);
      });
    });
    if (!bucket.size) return;
    const serie = [...bucket.values()].map((v) => ({ mes: v.mes, cant: v.cant, imp: v.imp })).sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
    const st = clasificarEstado(serie, false);
    const stPrev = clasificarEstado(serie, false, refPrev);
    const imp = serie.reduce((acc, x) => acc + x.imp, 0);
    rows.push({ solic: s, razon: rf.solicRazon.get(s) || '', st, stPrev, imp, ult: serie[serie.length - 1]?.mes || '' });
  });
  rows.sort((x, y) => y.imp - x.imp);
  const serie = [...gbucket.values()].map((v) => ({ mes: v.mes, cant: v.cant, imp: v.imp })).sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
  return <GrupoPanelBody g={g} rows={rows} serie={serie} push={push} />;
}

/** Cuerpo de GrupoPanel: lista de solicitantes con estado actual vs trimestre anterior y filtrado acotado. */
function GrupoPanelBody({ g, rows, serie, push }: {
  g: string;
  rows: { solic: string; razon: string; st: Estado; stPrev: Estado; imp: number; ult: string }[];
  serie: Serie;
  push: (p: Panel) => void;
}) {
  const [f, setF] = useState('');
  const shown = f ? rows.filter((x) => matchesQuery(f, `${x.razon} ${x.solic}`)) : rows;
  const tend = tendenciaTexto(serie);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Grupo de artículo · {g}</h2>
      <p className="mt-1 text-sm text-text-muted">{rows.length} solicitante(s) · {tend.txt}</p>
      <Section title="Evolución mensual del grupo"><EvolChart serie={serie} /></Section>
      <Section title="Solicitantes (estado actual y del trimestre anterior)">
        <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente…" />
        <div>
          <Table wrapperClassName="max-h-80 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Estado actual</TableHead><TableHead>Estado trim. anterior</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Última</TableHead><TableHead className="w-8" /></TableRow></TableHeader>
            <TableBody>
              {shown.map((x) => (
                <TableRow key={x.solic} className="group">
                  <TableCell className="max-w-72 truncate">{x.razon || '—'}<div className="text-[11px] text-text-faint">Solic {x.solic}</div></TableCell>
                  <TableCell><StatePill label={x.st.label} cls={x.st.cls} /></TableCell>
                  <TableCell><StatePill label={x.stPrev.label} cls={x.stPrev.cls} /></TableCell>
                  <TableCell className="text-right">{formatCurrency(x.imp)}</TableCell>
                  <TableCell>{x.ult ? mesLabel(x.ult) : '—'}</TableCell>
                  <TableCell><DetailChevron onOpen={() => push({ type: 'evol', kind: 'solic', key: x.solic })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
