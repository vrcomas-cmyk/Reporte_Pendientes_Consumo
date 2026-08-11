import { cn } from '@/lib/utils';
import type { ScoreResult } from '@/core/scoring';

const TONE: Record<ScoreResult['nivel'], string> = {
  alta: 'bg-success',
  media: 'bg-warning',
  baja: 'bg-danger',
};

/** Barra de score compacta: usarse dentro de una lista de clientes compatibles. */
export function ScoreBar({ score, nivel }: { score: number; nivel: ScoreResult['nivel'] }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-inset">
        <div className={cn('h-full rounded-full', TONE[nivel])} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-xs font-semibold tabular-nums">{score}</span>
    </div>
  );
}
