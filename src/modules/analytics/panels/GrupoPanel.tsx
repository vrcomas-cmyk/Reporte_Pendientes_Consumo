import { useMemo, useState } from 'react';
import { KpiBand } from '@/components/layout/report';
import { EvolChart, DetailChevron } from '../ui';
import { ControlesAB, CeldaPeriodo, CeldaVariacion, TablaAB, FilaTotalAB, resumenPeriodo, usePeriodosAB } from './ComparaPeriodos';
import { Section, SubFilter } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { mesKey, mesLabel, tendenciaTexto, type Serie } from '@/core/resumenFac';
import { matchesQuery } from '../helpers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

interface FilaSolic { solic: string; razon: string; serie: Serie; imp: number; ult: string }

/** Panel — Detalle por grupo de artículo: solicitantes con estado actual y del trimestre anterior, y evolución del grupo. */
export function GrupoPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'grupo' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rf, enrich } = a;
  const g = panel.grupo;
  const { rows, serie, mats } = useMemo(() => {
    if (!rf) return { rows: [] as FilaSolic[], serie: [] as Serie, mats: [] as { mat: string; imp: number; cant: number; bucket: Map<string, { mes: string; imp: number; cant: number }> }[] };
    const matAcc = new Map<string, { mat: string; imp: number; cant: number; bucket: Map<string, { mes: string; imp: number; cant: number }> }>();
    const rows: FilaSolic[] = [];
    const gbucket = new Map<string, { imp: number; cant: number; mes: string }>();
    rf.solicMats.forEach((mats, s) => {
      const bucket = new Map<string, { imp: number; cant: number; mes: string }>();
      mats.forEach((serie, mat) => {
        if ((enrich.matGrupo(mat) || '(sin grupo)') !== g) return;
        serie.forEach((p) => {
          const ma = matAcc.get(mat) || { mat, imp: 0, cant: 0, bucket: new Map() };
          ma.imp += p.imp; ma.cant += p.cant; matAcc.set(mat, ma);
          const mb = ma.bucket.get(p.mes) || { mes: p.mes, imp: 0, cant: 0 };
          mb.imp += p.imp; mb.cant += p.cant; ma.bucket.set(p.mes, mb);
          const c = bucket.get(p.mes) || { imp: 0, cant: 0, mes: p.mes };
          c.imp += p.imp; c.cant += p.cant; bucket.set(p.mes, c);
          const gb = gbucket.get(p.mes) || { imp: 0, cant: 0, mes: p.mes };
          gb.imp += p.imp; gb.cant += p.cant; gbucket.set(p.mes, gb);
        });
      });
      if (!bucket.size) return;
      const serie = [...bucket.values()].map((v) => ({ mes: v.mes, cant: v.cant, imp: v.imp })).sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
      const imp = serie.reduce((acc, x) => acc + x.imp, 0);
      rows.push({ solic: s, razon: rf.solicRazon.get(s) || '', serie, imp, ult: serie[serie.length - 1]?.mes || '' });
    });
    rows.sort((x, y) => y.imp - x.imp);
    const serie = [...gbucket.values()].map((v) => ({ mes: v.mes, cant: v.cant, imp: v.imp })).sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
    const mats = [...matAcc.values()].sort((x, y) => y.imp - x.imp);
    return { rows, serie, mats };
  }, [rf, enrich, g]);
  if (!rf) return <p>Sin datos.</p>;
  return <GrupoPanelBody g={g} rows={rows} serie={serie} mats={mats} a={a} push={push} />;
}

/** Cuerpo de GrupoPanel: lista de solicitantes con estado actual vs trimestre anterior y filtrado acotado. */
function GrupoPanelBody({ g, rows, serie, mats, a, push }: {
  mats: { mat: string; imp: number; cant: number; bucket: Map<string, { mes: string; imp: number; cant: number }> }[];
  a: Analytics;
  g: string;
  rows: FilaSolic[];
  serie: Serie;
  push: (p: Panel) => void;
}) {
  const [f, setF] = useState('');
  const ab = usePeriodosAB();
  // Cada solicitante resumido en los periodos A y B; se ordena por el importe del periodo A.
  const comparados = useMemo(() => rows
    .map((x) => ({ x, ra: resumenPeriodo(x.serie, ab.a), rb: resumenPeriodo(x.serie, ab.b) }))
    .sort((p, q) => (q.ra?.imp ?? q.x.imp) - (p.ra?.imp ?? p.x.imp)), [rows, ab.a, ab.b]);
  const shown = f ? comparados.filter(({ x }) => matchesQuery(f, `${x.razon} ${x.solic}`)) : comparados;
  const tend = tendenciaTexto(serie);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Grupo de artículo · {g}</h2>
      <p className="mt-1 text-sm text-text-muted">{rows.length} solicitante(s) · {tend.txt}</p>
      <KpiBand
        className="mt-3"
        titulo="Grupo de artículo · resumen"
        principal={{ etiqueta: 'Importe del grupo', valor: formatCurrency(serie.reduce((s, p) => s + p.imp, 0)) }}
        metricas={[
          { etiqueta: 'Solicitantes', valor: formatNumber(rows.length) },
          { etiqueta: 'Cantidad', valor: formatNumber(serie.reduce((s, p) => s + p.cant, 0)) },
        ]}
      />
      <Section title="Evolución mensual del grupo"><EvolChart serie={serie} /></Section>
      <Section title="Comparar periodos">
        <ControlesAB ab={ab} />
        <p className="text-[11px] text-text-faint">El mismo periodo A / B se usa en materiales y solicitantes.</p>
      </Section>
      <Section title={`Materiales del grupo · ${mats.length} · doble clic para ver el material`}>
        <TablaAB
          ab={ab}
          colTitulo="Material"
          conEstado={false}
          maxH="max-h-80"
          filas={mats.map((m) => ({
            key: m.mat,
            titulo: m.mat,
            sub: a.enrich.matTexto(m.mat),
            serie: [...m.bucket.values()],
            onOpen: () => push({ type: 'material', material: m.mat }),
          }))}
        />
      </Section>
      <Section title="Solicitantes · periodo A vs periodo B">
        <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente…" />
        <div>
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="border-b-2 border-accent text-accent">Periodo A ({ab.a.desde ? mesLabel(ab.a.desde) : '…'} – {ab.a.hasta ? mesLabel(ab.a.hasta) : '…'})</TableHead>
                <TableHead className="border-b-2 border-info text-info">Periodo B ({ab.b.desde ? mesLabel(ab.b.desde) : '…'} – {ab.b.hasta ? mesLabel(ab.b.hasta) : '…'})</TableHead>
                <TableHead>A vs B</TableHead>
                <TableHead className="text-right">Importe total</TableHead>
                <TableHead>Última</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(({ x, ra, rb }) => (
                <TableRow key={x.solic} className="group cursor-pointer" title="Doble clic para ver al cliente" onDoubleClick={() => push({ type: 'evol', kind: 'solic', key: x.solic })}>
                  <TableCell className="max-w-72 truncate">{x.razon || '—'}<div className="text-[11px] text-text-faint">Solic {x.solic}</div></TableCell>
                  <TableCell><CeldaPeriodo r={ra} /></TableCell>
                  <TableCell><CeldaPeriodo r={rb} /></TableCell>
                  <TableCell><CeldaVariacion a={ra} b={rb} /></TableCell>
                  <TableCell className="text-right">{formatCurrency(x.imp)}</TableCell>
                  <TableCell>{x.ult ? mesLabel(x.ult) : '—'}</TableCell>
                  <TableCell><DetailChevron onOpen={() => push({ type: 'evol', kind: 'solic', key: x.solic })} /></TableCell>
                </TableRow>
              ))}
              {shown.length > 0 && <FilaTotalAB series={shown.map(({ x }) => x.serie)} ab={ab} etiqueta="Total solicitantes" colsExtra={2} />}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
