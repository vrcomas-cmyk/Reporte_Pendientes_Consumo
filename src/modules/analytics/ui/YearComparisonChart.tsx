import { memo, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { categorical } from '@/lib/chartColors';
import type { AnioComparado } from '@/core/analisisDirectivo';

/** Evolución mensual (Ene–Dic) de dos años superpuestos, un color por año —
 * si uno de los años sigue en curso, su línea se vuelve punteada a partir del
 * último mes con dato real y continúa hasta diciembre al nivel del promedio
 * mensual real ("cómo se espera que quede el año si sigue este ritmo"). Cada
 * año trae dos series de Recharts (sólida + punteada) que comparten color:
 * la punteada arranca duplicando el último punto real para que la línea no
 * se corte visualmente. */
export const YearComparisonChart = memo(function YearComparisonChart({ anios, metric = 'imp', height = 260 }: {
  anios: AnioComparado[];
  metric?: 'imp' | 'margen';
  height?: number;
}) {
  const theme = useUiStore((s) => s.theme);
  const colores = categorical(theme === 'dark');
  const gridColor = theme === 'dark' ? '#2d2d2b' : '#e4e3e0';

  const data = useMemo(() => {
    const filas = Array.from({ length: 12 }, (_, i) => ({ label: '', mesNum: i + 1 } as Record<string, unknown>));
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
      });
      if (ultimoRealIdx >= 0 && ultimoRealIdx < 11) filas[ultimoRealIdx][proyKey] = filas[ultimoRealIdx][realKey];
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
            formatter={(v: number, name: string) => [v == null ? '—' : formatCurrency(v), name]}
            contentStyle={{
              fontSize: 12, borderRadius: 8,
              background: theme === 'dark' ? '#1c1c1b' : '#fff',
              border: `1px solid ${gridColor}`,
            }}
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
              strokeDasharray="5 4"
              dot={false}
              connectNulls
              legendType="none"
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
