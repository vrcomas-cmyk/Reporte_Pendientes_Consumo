import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { CHART_UI } from '@/lib/chartColors';
import { TooltipHint } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/utils';
import { COLOR, fmtK } from './piezas';

const EJE = { fontSize: 10, fill: 'var(--text-muted)' } as const;
/** Tooltip con el color de texto del tema (recharts pinta cada renglón con el color de la serie y, sin esto, sale negro sobre fondo oscuro). */
const TOOLTIP = { contentStyle: CHART_UI.tooltipStyle, itemStyle: { color: 'var(--text)' }, labelStyle: { color: 'var(--text)', fontWeight: 600 } } as const;
const LEYENDA = { fontSize: 11, color: 'var(--text-muted)' } as const;

export interface PuntoEvol { label: string; periodo: string; fac: number; com: number }

/** Evolución mensual: facturación (eje izquierdo) y piezas de comodato (eje derecho). Clic en un mes → detalle por cliente. */
export function EvolucionChart({ datos, metric, onMes, alto = 300 }: { datos: PuntoEvol[]; metric: 'importe' | 'bolsas'; onMes?: (periodo: string) => void; alto?: number }) {
  const facLbl = metric === 'bolsas' ? 'Facturación (bolsas)' : 'Facturación ($)';
  if (!datos.length) return <p className="py-8 text-center text-sm text-text-muted">Sin datos de la serie mensual.</p>;
  return (
    <div style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 12, left: 4, bottom: 8 }} onClick={(s) => { const i = Number(s?.activeTooltipIndex); const p = Number.isInteger(i) ? datos[i] : undefined; if (p && onMes) onMes(p.periodo); }}>
          <CartesianGrid stroke={CHART_UI.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={EJE} angle={-45} textAnchor="end" height={50} interval="preserveStartEnd" />
          <YAxis yAxisId="l" tick={{ ...EJE, fill: COLOR.info }} tickFormatter={(v: number) => (metric === 'bolsas' ? String(v) : fmtK(v))} width={56} />
          <YAxis yAxisId="r" orientation="right" tick={{ ...EJE, fill: COLOR.warn }} width={44} />
          <Tooltip
            {...TOOLTIP}
            formatter={(v, name) => (name === facLbl && metric !== 'bolsas' ? formatCurrency(Number(v)) : Math.round(Number(v)).toLocaleString('es-MX'))}
            labelFormatter={(l) => `${l} · clic para ver el detalle por cliente`}
          />
          <Legend wrapperStyle={LEYENDA} />
          <Line yAxisId="l" type="monotone" dataKey="fac" name={facLbl} stroke={COLOR.info} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6, style: { cursor: 'pointer' } }} />
          <Line yAxisId="r" type="monotone" dataKey="com" name="Comodato (piezas)" stroke={COLOR.warn} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} activeDot={{ r: 6, style: { cursor: 'pointer' } }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface Rebanada { name: string; valor: number; color: string }
/** Dona compacta con el total (importe y etiqueta) debajo y, a un lado, una leyenda legible: qué es cada rebanada, cuánto vale y qué porcentaje es. Clic = filtrar. */
export function DonaChart({ datos, onClick, formato, descripciones, etiqueta, alto = 190 }: {
  datos: Rebanada[]; onClick?: (name: string) => void; formato: (n: number) => string; descripciones?: Record<string, string>; /** Qué suma la dona (Facturación…). */ etiqueta: string; alto?: number;
}) {
  const total = datos.reduce((a, d) => a + d.valor, 0);
  if (!datos.length || total <= 0) return <p className="py-8 text-center text-sm text-text-muted">Sin datos.</p>;
  const orden = [...datos].sort((x, y) => y.valor - x.valor);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex shrink-0 flex-col items-center gap-1">
      <div style={{ height: alto, width: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={orden} dataKey="valor" nameKey="name" innerRadius="55%" outerRadius="96%" paddingAngle={1} stroke="var(--bg-elevated)" strokeWidth={2} onClick={(d) => onClick?.(String((d as { name?: string }).name ?? ''))} style={{ cursor: onClick ? 'pointer' : 'default' }}>
              {orden.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip {...TOOLTIP} formatter={(v, n) => [`${formato(Number(v))} (${Math.round((Number(v) / total) * 100)}%)`, String(n)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
        <div className="text-center">
          <div className="font-display text-xl font-semibold tabular-nums">{formato(total)}</div>
          <div className="text-[11px] uppercase tracking-wide text-text-faint">{etiqueta}</div>
        </div>
      </div>
      <ul className="min-w-56 flex-1 divide-y divide-border text-sm">
        {orden.map((d) => {
          const fila = (
            <button type="button" onClick={() => onClick?.(d.name)} disabled={!onClick} className="flex w-full items-center gap-2 px-1 py-1.5 text-left transition-colors hover:bg-bg-inset disabled:cursor-default">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden />
              <span className="flex-1 font-medium">{d.name}</span>
              <span className="tabular-nums">{formato(d.valor)}</span>
              <span className="w-12 text-right tabular-nums text-text-muted">{Math.round((d.valor / total) * 100)}%</span>
            </button>
          );
          return <li key={d.name}>{descripciones?.[d.name] ? <TooltipHint text={descripciones[d.name]!}>{fila}</TooltipHint> : fila}</li>;
        })}
      </ul>
    </div>
  );
}

export interface Barra { name: string; valor: number; color: string }
/** Barras horizontales; `formato` da el texto del valor en ejes y tooltip. */
export function BarrasH({ datos, onClick, formato, etiqueta, alto = 240, ancho = 130 }: { datos: Barra[]; onClick?: (name: string) => void; formato: (n: number) => string; /** Qué mide la barra (Facturación, Inversión, Equipos…): sale en el tooltip. */ etiqueta: string; alto?: number; ancho?: number }) {
  if (!datos.length) return <p className="py-8 text-center text-sm text-text-muted">Sin datos.</p>;
  return (
    <div style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid stroke={CHART_UI.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={EJE} tickFormatter={formato} />
          <YAxis type="category" dataKey="name" tick={{ ...EJE, fontSize: 9 }} width={ancho} interval={0} />
          <Tooltip {...TOOLTIP} formatter={(v) => formato(Number(v))} cursor={{ fill: 'var(--bg-inset)' }} />
          <Bar dataKey="valor" name={etiqueta} radius={[0, 4, 4, 0]} onClick={(d) => onClick?.(String((d as { name?: string }).name ?? ''))} style={{ cursor: onClick ? 'pointer' : 'default' }}>
            {datos.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface SerieBurbuja { name: string; color: string; puntos: { x: number; y: number; z: number; etiqueta: string }[] }
/** Inversión (x) contra margen (y); el tamaño de la burbuja es la facturación. */
export function BurbujaChart({ series, alto = 280 }: { series: SerieBurbuja[]; alto?: number }) {
  return (
    <div style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid stroke={CHART_UI.grid} strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" name="Inversión" tick={EJE} tickFormatter={fmtK} />
          <YAxis type="number" dataKey="y" name="Margen" tick={EJE} tickFormatter={fmtK} width={56} />
          <ZAxis type="number" dataKey="z" range={[30, 420]} name="Facturación" />
          <Tooltip {...TOOLTIP} cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => (n === 'Inversión' || n === 'Margen' || n === 'Facturación' ? formatCurrency(Number(v)) : String(v))} />
          <Legend wrapperStyle={{ ...LEYENDA, fontSize: 10 }} />
          {series.map((s) => <Scatter key={s.name} name={s.name} data={s.puntos} fill={s.color} fillOpacity={0.7} />)}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
