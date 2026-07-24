import { memo, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { completarSerie, mesLabel, type Serie } from '@/core/resumenFac';

/** Gráfico de líneas de importe por mes con completarSerie. Click sobre un punto llama onMonth(mes). isAnimationActive=false para evitar quedarse en 0-length dash-array cuando trabajo síncrono pesado corre tras el mount. */
export const EvolChart = memo(function EvolChart({ serie, onMonth, height = 220 }: { serie: Serie; onMonth?: (mes: string) => void; height?: number }) {
  const data = useMemo(() => completarSerie(serie).map((p) => ({ ...p, label: mesLabel(p.mes) })), [serie]);
  if (!data.length) return <p className="text-sm text-text-muted">Sin datos para graficar.</p>;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          onClick={(s: { activeLabel?: string | number }) => {
            if (!onMonth || s?.activeLabel == null) return;
            const pt = data.find((d) => d.label === String(s.activeLabel));
            if (pt) onMonth(pt.mes);
          }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} width={54} tickFormatter={(v) => formatCurrency(Number(v))} />
          <Tooltip
            formatter={(v) => formatCurrency(Number(v))}
            labelClassName="text-xs"
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: '#f3f4f6',
              borderColor: '#d1d5db',
              color: '#111827',
            }}
          />
          <Line type="monotone" dataKey="imp" stroke="var(--color-accent, #6366f1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
