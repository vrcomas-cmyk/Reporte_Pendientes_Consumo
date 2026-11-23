import { memo, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { categorical, CHART_UI } from '@/lib/chartColors';
import type { AnioComparado } from '@/core/analisisDirectivo';
import { promedioCerrados, tendenciaVsPromedio } from '@/core/proyeccion';
import { AFechaConTendencia, ProyectadoTenue, OPACIDAD_PROYECCION } from './ProyeccionTooltip';

type Fila = Record<string, unknown> & { label: string; mesNum: number };

/** Tooltip del comparativo anual: al pasar el cursor por un mes lista el valor
 * de CADA año en ese mes (marcando "proyectado" en el punteado) y, debajo, el
 * Δ% de cada año contra el año inmediato anterior — para leer de un vistazo
 * "marzo 2026 vs marzo 2025" sin ir a buscar el punto en la línea. */
function TooltipAnual({ active, payload, anios, colores, metric }: {
  active?: boolean;
  payload?: { payload?: Fila }[];
  anios: AnioComparado[];
  colores: string[];
  metric: 'imp' | 'margen';
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const valores = anios.map((a) => {
    const real = row[`y${a.anio}`] as number | null | undefined;
    const proy = row[`y${a.anio}_proy`] as number | null | undefined;
    const esProy = real == null && proy != null;
    const acum = row[`y${a.anio}_acum`] as number | null | undefined;
    const valor = real ?? proy ?? null;
    // Tendencia del mes en curso: su cierre proyectado contra el promedio de los últimos 3 meses cerrados de ese mismo año.
    const cerrados = a.meses.slice(0, row.mesNum - 1).filter((m) => !m.esProyeccion).map((m) => (metric === 'imp' ? m.imp : m.margen));
    const promedio = esProy && acum != null ? promedioCerrados(cerrados) : null;
    const tendencia = valor != null && promedio !== null ? tendenciaVsPromedio(valor, promedio) : null;
    return { anio: a.anio, valor, esProy, acum: esProy ? acum ?? null : null, tendencia };
  });
  return (
    <div
      className="min-w-44 rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: CHART_UI.surface, borderColor: CHART_UI.border, color: CHART_UI.label }}
    >
      <p className="mb-1.5 font-display text-sm font-semibold">{row.label}</p>
      <div className="flex flex-col gap-1">
        {valores.map((v, i) => {
          const prev = i > 0 ? valores[i - 1].valor : null;
          const delta = v.valor != null && prev != null && prev !== 0 ? ((v.valor - prev) / Math.abs(prev)) * 100 : null;
          const conAFecha = v.esProy && v.acum != null;
          return (
            <div key={v.anio} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: colores[i % colores.length] }} />
                  <span className="font-medium tabular-nums">{v.anio}</span>
                  {v.esProy && !conAFecha && <span className="text-[11px] text-text-faint">proyectado</span>}
                </span>
                {/* Mes en curso: lo facturado «a la fecha» se lee primero, con su tendencia; el cierre proyectado va del otro lado, en tenue. */}
                {conAFecha && <div className="pl-4"><AFechaConTendencia valor={formatCurrency(v.acum!)} tendencia={v.tendencia} /></div>}
              </div>
              <span className="flex items-center gap-2">
                {v.valor == null
                  ? <span className="tabular-nums">—</span>
                  : conAFecha
                    ? <ProyectadoTenue valor={formatCurrency(v.valor)} />
                    : <span className={cn('tabular-nums', v.esProy && 'text-text-faint')}>{formatCurrency(v.valor)}</span>}
                {delta != null && (
                  <span className={cn('flex w-14 items-center justify-end gap-0.5 font-medium tabular-nums', delta >= 0 ? 'text-success' : 'text-danger', v.esProy && 'opacity-70')}>
                    {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {`${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {valores.length > 1 && <p className="mt-1.5 border-t border-border/60 pt-1 text-[11px] text-text-faint">Δ% contra el año anterior, mismo mes</p>}
    </div>
  );
}

/** Evolución mensual (Ene–Dic) de varios años superpuestos, un color por año —
 * si uno de los años sigue en curso, su línea se vuelve punteada a partir del
 * último mes con dato real y continúa hasta diciembre al nivel del promedio
 * mensual real ("cómo se espera que quede el año si sigue este ritmo"). Cada
 * año trae dos series de Recharts (sólida + punteada) que comparten color:
 * la punteada arranca duplicando el último punto real para que la línea no
 * se corte visualmente. Al pasar el cursor se resalta el mes (banda) y el
 * tooltip compara los años entre sí. */
export const YearComparisonChart = memo(function YearComparisonChart({ anios, metric = 'imp', height = 260 }: {
  anios: AnioComparado[];
  metric?: 'imp' | 'margen';
  height?: number;
}) {
  const colores = categorical();

  const data = useMemo(() => {
    const filas = Array.from({ length: 12 }, (_, i) => ({ label: '', mesNum: i + 1 } as Fila));
    anios.forEach((anio) => {
      const realKey = `y${anio.anio}`;
      const proyKey = `y${anio.anio}_proy`;
      let ultimoRealIdx = -1;
      anio.meses.forEach((m, i) => {
        filas[i].label = m.label;
        const valor = metric === 'imp' ? m.imp : m.margen;
        if (!m.esProyeccion) {
          filas[i][realKey] = valor;
          if (valor != null) ultimoRealIdx = i;
        }
      });
      // La punteada empieza EN el último mes real (mismo valor, para que la
      // línea se conecte) y sigue con el promedio en los meses proyectados.
      anio.meses.forEach((m, i) => {
        if (m.esProyeccion) filas[i][proyKey] = metric === 'imp' ? m.imp : m.margen;
        // Mes corriente: lo facturado a la fecha (punto hueco) — su `imp`/`margen` ya es la proyección de cierre.
        const acum = metric === 'imp' ? m.acumImp : m.acumMargen;
        if (m.esProyeccion && acum !== undefined) filas[i][`y${anio.anio}_acum`] = acum;
      });
      if (ultimoRealIdx >= 0 && ultimoRealIdx < 11 && anio.esAnioEnCurso) filas[ultimoRealIdx][proyKey] = filas[ultimoRealIdx][realKey];
    });
    return filas;
  }, [anios, metric]);

  if (!anios.length) return <p className="text-sm text-text-muted">Sin datos para graficar.</p>;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={54} tickFormatter={(v) => formatCurrency(Number(v))} />
          <Tooltip
            content={<TooltipAnual anios={anios} colores={colores} metric={metric} />}
            cursor={{ stroke: 'var(--text)', strokeOpacity: 0.08, strokeWidth: 30 }}
            // Con varios años y el mes en curso el cuadro es alto: que no se recorte ni quede bajo la leyenda.
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ zIndex: 40, pointerEvents: 'none' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {anios.map((anio, i) => (
            <Line
              key={`y${anio.anio}`}
              type="monotone"
              dataKey={`y${anio.anio}`}
              name={String(anio.anio)}
              stroke={colores[i % colores.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
          {anios.filter((a) => a.esAnioEnCurso).map((anio) => (
            <Line
              key={`y${anio.anio}_proy`}
              type="monotone"
              dataKey={`y${anio.anio}_proy`}
              name={`${anio.anio} · promedio proyectado`}
              stroke={colores[anios.indexOf(anio) % colores.length]}
              strokeWidth={2}
              strokeOpacity={OPACIDAD_PROYECCION}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls
              legendType="none"
              isAnimationActive={false}
            />
          ))}
          {anios.filter((a) => a.meses.some((m) => m.acumImp !== undefined)).map((anio) => (
            <Line
              key={`y${anio.anio}_acum`}
              dataKey={`y${anio.anio}_acum`}
              name={`${anio.anio} · a la fecha`}
              stroke="none"
              dot={{ r: 4, strokeWidth: 2, stroke: colores[anios.indexOf(anio) % colores.length], fill: CHART_UI.surface }}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
