import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ScoreResult } from '@/core/scoring';

/** Explicación completa del score: cada criterio con sus puntos y su detalle —
 * nunca se muestra un número desnudo (req. 8 del plan: transparencia total). */
export function ScoreExplain({ result }: { result: ScoreResult }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text" aria-label="Por qué se sugiere este cliente">
          <Info className="size-3.5" /> ¿Por qué?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <p className="mb-2 text-xs font-semibold text-text">Desglose de compatibilidad</p>
        <div className="flex flex-col gap-1.5">
          {result.criterios.map((c) => (
            <div key={c.key} className="flex items-start justify-between gap-2 text-xs">
              <div className={cn('flex-1', !c.cumple && 'text-text-faint')}>
                <span className={cn('font-medium', c.cumple ? 'text-text' : 'text-text-faint')}>{c.label}</span>
                <div className="text-[11px] text-text-faint">{c.detalle}</div>
              </div>
              <span className={cn('shrink-0 font-mono tabular-nums', c.puntos > 0 ? 'text-success' : c.puntos < 0 ? 'text-danger' : 'text-text-faint')}>
                {c.puntos > 0 ? '+' : ''}{c.puntos}/{c.peso}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
