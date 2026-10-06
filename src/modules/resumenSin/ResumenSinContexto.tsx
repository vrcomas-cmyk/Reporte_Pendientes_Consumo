import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { TooltipHint } from '@/components/ui/tooltip';
import { StatePill, Ranking, EvolChart } from '@/modules/analytics/ui';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { CHART_UI } from '@/lib/chartColors';
import { computeContexto } from '@/core/resumenSinContexto';
import { COBERTURA_LABEL, COBERTURA_CLS, COBERTURA_HELP, type CoberturaEstado, type RSSMaterial } from '@/core/resumenSin';
import { mesKey, serieMaterial, type Serie } from '@/core/resumenFac';
import { usePersistedState } from '@/hooks/usePersistedState';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';

const SEG: Record<CoberturaEstado, string> = {
  quiebre: 'bg-danger', inmovilizado: 'bg-warning', exceso: 'bg-warning/50', aceptable: 'bg-info/50', sano: 'bg-success', sinDatos: 'bg-border',
};
const compacto = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 });
const NO_1031 = 'No incluye Centro 1031 (hub de distribución).';

/** Contexto superior de Resumen Sin: hero de salud de cobertura (barra
 * clicable que filtra la tabla) + pestañas Cobertura / Por centro /
 * Rankings / Facturación, todo sobre los materiales YA filtrados. */
export function ResumenSinContexto({ list, a, lblCentro, coberturaFiltro, onCobertura, onMaterial, onSector }: {
  list: RSSMaterial[];
  a: Analytics;
  lblCentro: (c: string) => string;
  coberturaFiltro: '' | CoberturaEstado;
  onCobertura: (e: '' | CoberturaEstado) => void;
  onMaterial: (material: string) => void;
  onSector: (sector: string) => void;
}) {
  const [tab, setTab] = usePersistedState('resumenSin.contextoTab', 'cobertura');
  const [chartCentro, setChartCentro] = useState<'unidades' | 'riesgo'>('unidades');
  const ctx = useMemo(() => computeContexto(list, (m) => a.enrich.matSector(m)), [list, a.enrich]);
  const critico = ctx.quiebreUrgente > 0;
  const clasificados = ctx.estados.filter((e) => e.count > 0);

  // Facturación mensual agregada de los materiales visibles (Resumen_Fac).
  const serieFiltro = useMemo<Serie>(() => {
    if (!a.rf) return [];
    const by = new Map<string, { mes: string; cant: number; imp: number }>();
    for (const mo of list) {
      for (const p of serieMaterial(a.rf, mo.material)) {
        const o = by.get(p.mes) ?? { mes: p.mes, cant: 0, imp: 0 };
        o.cant += p.cant;
        o.imp += p.imp;
        by.set(p.mes, o);
      }
    }
    return [...by.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
  }, [list, a.rf]);

  const dataCentros = ctx.porCentro.map((c) => ({ ...c, label: lblCentro(c.centro) }));
  const toggleCobertura = (e: CoberturaEstado) => onCobertura(coberturaFiltro === e ? '' : e);

  return (
    <>
      {/* HERO — qué tan expuesto está el inventario, de un vistazo. */}
      <Card className={cn('p-5', critico ? 'border-danger/25 bg-danger/5' : 'border-success/25 bg-success/5')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', critico ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success')}>
              {critico ? <ShieldAlert className="size-5" /> : <ShieldCheck className="size-5" />}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Quiebre urgente · {formatNumber(ctx.pares)} pares (material × centro)</p>
              <TooltipHint text={`${COBERTURA_HELP.quiebre} Urgente = sin tránsito en camino. ${NO_1031}`}>
                <p className={cn('mt-1 font-display text-4xl font-bold tabular-nums', critico ? 'text-danger' : 'text-success')}>
                  {formatNumber(ctx.quiebreUrgente)} <span className="text-base font-medium text-text-muted">sin cobertura</span>
                </p>
              </TooltipHint>
              <p className="mt-1 text-sm text-text-muted">
                {formatCurrency(ctx.impPendQuiebreUrgente)} pendiente en riesgo · {formatNumber(ctx.quiebreMitigado)} más con tránsito en camino
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-right">
            <div><p className="text-[11px] uppercase tracking-wide text-text-faint">Materiales</p><p className="mt-0.5 font-mono text-lg font-medium">{formatNumber(ctx.totales.materiales)}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-text-faint">Inv. general</p><p className="mt-0.5 font-mono text-lg font-medium">{formatNumber(ctx.totales.inv)}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-text-faint">Pendiente</p><p className="mt-0.5 font-mono text-lg font-medium text-danger">{formatNumber(ctx.totales.pend)}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-text-faint">En tránsito</p><p className="mt-0.5 font-mono text-lg font-medium text-success">{formatNumber(ctx.totales.transito)}</p></div>
          </div>
        </div>

        {/* Salud de cobertura: barra apilada; clic en un tramo filtra la tabla. */}
        {ctx.pares > 0 && (
          <div className="mt-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-border/40" role="group" aria-label="Distribución de cobertura">
              {clasificados.map((e) => (
                <TooltipHint key={e.estado} text={`${COBERTURA_LABEL[e.estado]}: ${formatNumber(e.count)} (${((e.count / ctx.pares) * 100).toFixed(0)}%) — ${COBERTURA_HELP[e.estado]}`}>
                  <button
                    type="button"
                    onClick={() => toggleCobertura(e.estado)}
                    className={cn('h-full transition-opacity', SEG[e.estado], coberturaFiltro && coberturaFiltro !== e.estado && 'opacity-30')}
                    style={{ width: `${(e.count / ctx.pares) * 100}%` }}
                    aria-label={`${COBERTURA_LABEL[e.estado]}: ${e.count}`}
                  />
                </TooltipHint>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
              {clasificados.map((e) => (
                <button key={e.estado} type="button" onClick={() => toggleCobertura(e.estado)}
                  className={cn('inline-flex items-center gap-1.5 hover:text-text', coberturaFiltro === e.estado && 'font-semibold text-text')}>
                  <span className={cn('inline-block size-2 rounded-full', SEG[e.estado])} />
                  {COBERTURA_LABEL[e.estado]} <span className="tabular-nums">{formatNumber(e.count)}</span>
                </button>
              ))}
              {coberturaFiltro && <button type="button" onClick={() => onCobertura('')} className="text-accent hover:underline">Quitar filtro</button>}
            </div>
          </div>
        )}
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cobertura">Cobertura</TabsTrigger>
          <TabsTrigger value="centros">Por centro</TabsTrigger>
          <TabsTrigger value="rankings">Rankings críticos</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
        </TabsList>

        <TabsContent value="cobertura">
          <Card className="p-4">
            <Table wrapperClassName="max-h-72">
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Pares</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                  <TableHead className="text-right">Importe pendiente</TableHead>
                  <TableHead>Qué significa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clasificados.map((e) => (
                  <TableRow key={e.estado} className={cn('cursor-pointer', coberturaFiltro === e.estado && 'bg-accent-soft')} title="Clic para filtrar la tabla" onClick={() => toggleCobertura(e.estado)}>
                    <TableCell><StatePill label={COBERTURA_LABEL[e.estado]} cls={COBERTURA_CLS[e.estado]} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(e.count)}
                      {e.estado === 'quiebre' && <div className="text-[11px] text-text-faint">{formatNumber(ctx.quiebreUrgente)} urgentes · {formatNumber(ctx.quiebreMitigado)} con tránsito</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{ctx.pares ? ((e.count / ctx.pares) * 100).toFixed(1) : '0'}%</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(e.impPend)}</TableCell>
                    <TableCell className="max-w-md text-xs text-text-muted">{COBERTURA_HELP[e.estado]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-[11px] text-text-faint">{NO_1031} La peor cobertura entre los almacenes de cada centro define el estado del par.</p>
          </Card>
        </TabsContent>

        <TabsContent value="centros">
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{chartCentro === 'unidades' ? 'Inventario, pendiente y tránsito por centro' : 'Pares en quiebre y exceso por centro'}</h3>
              <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
                <button onClick={() => setChartCentro('unidades')} className={cn('rounded px-2 py-1', chartCentro === 'unidades' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text')}>Unidades</button>
                <button onClick={() => setChartCentro('riesgo')} className={cn('rounded px-2 py-1', chartCentro === 'riesgo' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text')}>Riesgo</button>
              </div>
            </div>
            <div style={{ height: 240 }} className="w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataCentros} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => compacto.format(Number(v))} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_UI.tooltipStyle} formatter={(v) => formatNumber(Number(v))} cursor={{ fill: 'var(--border)', fillOpacity: 0.3 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartCentro === 'unidades' ? (
                    <>
                      <Bar dataKey="inv" name="Inv. general" fill="var(--chart-1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="pend" name="Pendiente" fill={CHART_UI.negative} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="transito" name="En tránsito" fill={CHART_UI.positive} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </>
                  ) : (
                    <>
                      <Bar dataKey="quiebre" name="En quiebre" fill={CHART_UI.negative} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="exceso" name="En exceso" fill="var(--warning)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-text-faint">Inventario general = almacenes 1030 + 1031 + 1060. El Centro 1031 (hub) aparece en unidades pero no se clasifica en quiebre/exceso.</p>
          </Card>
        </TabsContent>

        <TabsContent value="rankings">
          <div className="grid gap-3 lg:grid-cols-2">
            <Ranking collapsible storageKey="resumenSin.rankMat.open" title="Materiales · importe pendiente en quiebre urgente" items={ctx.topQuiebre} money wide onRow={onMaterial} />
            <Ranking collapsible storageKey="resumenSin.rankSector.open" title="Sectores · pares en quiebre urgente" items={ctx.sectoresQuiebre} wide onRow={onSector} />
          </div>
        </TabsContent>

        <TabsContent value="facturacion">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Facturación mensual de los materiales visibles</h3>
            {a.rf
              ? <EvolChart serie={serieFiltro} height={220} filtroPeriodo />
              : <p className="text-sm text-text-muted">Sin Resumen_Fac cargado: sincroniza los reportes desde Carga para ligar inventario con demanda.</p>}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
