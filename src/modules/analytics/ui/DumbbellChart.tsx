import { memo, useMemo } from 'react';
import { ComposedChart, Bar, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import { categorical } from '@/lib/chartColors';

export interface DumbbellRow {
  label: string;
  a: number;
  b: number;
}

/** Gráfica de mancuerna (dumbbell): un punto por categoría (sector/gerente)
 * en el valor del periodo A, otro en el B, unidos por una línea — la lectura
 * directa es "qué tanto se movió" cada categoría, no solo cuánto vale cada
 * una. Truco estándar en Recharts (sin librería nueva): una barra apilada
 * transparente (`base`) hasta el menor de los dos valores + una barra
 * delgada (`rango`) del tamaño de la diferencia hace de "cable", y dos
 * `Scatter` dibujan los puntos A/B encima. */
export const DumbbellChart = memo(function DumbbellChart({ rows, labelA, labelB, height = 320 }: {
  rows: DumbbellRow[];
  labelA: string;
  labelB: string;
  height?: number;
}) {
  const theme = useUiStore((s) => s.theme);
  const data = useMemo(
    () => rows.map((r) => ({ ...r, base: Math.min(r.a, r.b), rango: Math.abs(r.b - r.a) })),
    [rows],
  );
  if (!data.length) return <p className="text-sm text-text-muted">Sin datos para graficar.</p>;
  const [colorA, colorB] = categorical(theme === 'dark');
  const gridColor = theme === 'dark' ? '#2d2d2b' : '#e4e3e0';
  const cableColor = theme === 'dark' ? '#57534e' : '#a8a29e';

  return (
    <div style={{ height: Math.max(height, rows.length * 34 + 40) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(Number(v))} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={130} interval={0} />
          <Tooltip
            formatter={(v, key) => (key === 'a' ? [formatCurrency(Number(v)), labelA] : key === 'b' ? [formatCurrency(Number(v)), labelB] : [null, null])}
            contentStyle={{
              fontSize: 12, borderRadius: 8,
              background: theme === 'dark' ? '#1c1c1b' : '#fff',
              border: `1px solid ${gridColor}`,
            }}
          />
          <Bar dataKey="base" stackId="cable" fill="transparent" isAnimationActive={false} legendType="none" />
          <Bar dataKey="rango" stackId="cable" fill={cableColor} barSize={3} isAnimationActive={false} legendType="none" />
          <Scatter dataKey="a" name={labelA} fill={colorA} isAnimationActive={false} />
          <Scatter dataKey="b" name={labelB} fill={colorB} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 flex items-center justify-end gap-3 text-[11px] text-text-faint">
        <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: colorA }} />{labelA}</span>
        <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: colorB }} />{labelB}</span>
      </div>
    </div>
  );
});
