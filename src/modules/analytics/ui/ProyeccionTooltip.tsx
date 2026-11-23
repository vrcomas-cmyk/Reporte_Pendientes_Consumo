import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TendenciaMes } from '@/core/proyeccion';

/** Opacidad de las líneas punteadas de proyección: se leen como «lo que se espera», más tenues que lo real. */
export const OPACIDAD_PROYECCION = 0.55;

/** Flecha + porcentaje de hacia dónde va el mes en curso (cierre proyectado contra el promedio de los últimos 3 meses cerrados). */
export function IndicadorTendencia({ t }: { t: TendenciaMes }) {
  const Icon = t.dir === 'up' ? TrendingUp : t.dir === 'down' ? TrendingDown : Minus;
  const color = t.dir === 'up' ? 'text-success' : t.dir === 'down' ? 'text-danger' : 'text-text-faint';
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums', color)}
      title="Cierre proyectado del mes contra el promedio de los últimos 3 meses cerrados"
    >
      <Icon className="size-3" />
      {t.dir === 'flat' ? 'estable' : `${t.pct > 0 ? '+' : ''}${t.pct.toFixed(1)}%`}
    </span>
  );
}

/** Lo facturado «a la fecha» del mes en curso, bien visible, con su indicador de tendencia. */
export function AFechaConTendencia({ valor, tendencia }: { valor: string; tendencia: TendenciaMes | null }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] text-text-faint">A la fecha</span>
      <span className="text-sm font-semibold tabular-nums">{valor}</span>
      {tendencia && <IndicadorTendencia t={tendencia} />}
    </span>
  );
}

/** Cierre proyectado: en color tenue y de un tamaño menor que lo real, porque es una estimación y no un dato. */
export function ProyectadoTenue({ valor, etiqueta = 'proyectado' }: { valor: string; etiqueta?: string }) {
  return (
    <span className="text-right tabular-nums text-text-faint">
      <span className="block">{valor}</span>
      <span className="block text-[11px]">{etiqueta}</span>
    </span>
  );
}
