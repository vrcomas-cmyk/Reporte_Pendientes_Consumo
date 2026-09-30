import { memo, useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

export interface DumbbellRow {
  label: string;
  a: number;
  b: number;
}

type Tono = 'up' | 'down' | 'flat';
const TOL = 0.005; // ±0.5% se considera "sin cambio"

const variacion = (a: number, b: number): { pct: number | null; tono: Tono } => {
  const base = Math.abs(a);
  if (base === 0) return { pct: null, tono: b > 0 ? 'up' : b < 0 ? 'down' : 'flat' };
  const p = (b - a) / base;
  return { pct: p * 100, tono: p > TOL ? 'up' : p < -TOL ? 'down' : 'flat' };
};

const TONO_BG: Record<Tono, string> = { up: 'bg-success', down: 'bg-danger', flat: 'bg-text-faint' };
const TONO_TXT: Record<Tono, string> = { up: 'text-success', down: 'text-danger', flat: 'text-text-faint' };

/** Gráfica de mancuerna SEMÁNTICA: una fila por categoría (sector), con el
 * valor del periodo A como punto gris hueco (la referencia), el del periodo B
 * como punto sólido y un cable entre ambos — todo en VERDE si creció y ROJO si
 * cayó, con el Δ% grande a la derecha (y flecha, nunca solo color). Ordenada
 * por variación en $ de mayor crecimiento a mayor caída, así lo que más se
 * movió salta a la vista sin tener que comparar colores de dos series. Filas
 * HTML/CSS (no Recharts): escala común, accesible, y legible en claro/oscuro
 * porque solo usa los tokens semánticos success/danger. */
export const DumbbellChart = memo(function DumbbellChart({ rows, labelA, labelB }: {
  rows: DumbbellRow[];
  labelA: string;
  labelB: string;
  height?: number;
}) {
  const { data, lo, span } = useMemo(() => {
    const ordenadas = [...rows].sort((x, y) => (y.b - y.a) - (x.b - x.a));
    const vals = ordenadas.flatMap((r) => [r.a, r.b]);
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    return { data: ordenadas, lo, span: hi - lo || 1 };
  }, [rows]);

  if (!data.length) return <p className="text-sm text-text-muted">Sin datos para graficar.</p>;
  const pos = (v: number) => ((v - lo) / span) * 100;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2 border-text-faint bg-bg-elevated" />{labelA} <span className="text-text-faint">(referencia)</span></span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-3.5 rounded-full bg-text" />{labelB}</span>
        <span className="flex items-center gap-1.5 text-success"><ArrowUpRight className="size-3.5" />Creció</span>
        <span className="flex items-center gap-1.5 text-danger"><ArrowDownRight className="size-3.5" />Cayó</span>
        <span className="text-text-faint">Ordenado por variación en $</span>
      </div>
      <div className="flex flex-col divide-y divide-border/60">
        {data.map((r) => {
          const { pct, tono } = variacion(r.a, r.b);
          const izq = Math.min(pos(r.a), pos(r.b));
          const der = Math.max(pos(r.a), pos(r.b));
          const Icono = tono === 'up' ? ArrowUpRight : tono === 'down' ? ArrowDownRight : Minus;
          return (
            <div
              key={r.label}
              className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3 py-2"
              title={`${r.label}\n${labelA}: ${formatCurrency(r.a)}\n${labelB}: ${formatCurrency(r.b)}\nVariación: ${formatCurrency(r.b - r.a)}`}
            >
              <span className="truncate text-xs font-medium">{r.label}</span>
              <div className="relative h-6">
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                {lo < 0 && <span className="absolute inset-y-0 w-px bg-border" style={{ left: `${pos(0)}%` }} />}
                <span className={cn('absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-70', TONO_BG[tono])} style={{ left: `${izq}%`, width: `${Math.max(der - izq, 0.4)}%` }} />
                <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text-faint bg-bg-elevated" style={{ left: `${pos(r.a)}%` }} />
                <span className={cn('absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-bg-elevated', TONO_BG[tono])} style={{ left: `${pos(r.b)}%` }} />
              </div>
              <div className="w-28 text-right">
                <p className={cn('flex items-center justify-end gap-0.5 text-sm font-semibold tabular-nums', TONO_TXT[tono])}>
                  <Icono className="size-4" />{pct == null ? (tono === 'flat' ? '0%' : 'Nuevo') : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                </p>
                <p className="text-[10px] tabular-nums text-text-faint">{formatCurrency(r.a)} → {formatCurrency(r.b)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
