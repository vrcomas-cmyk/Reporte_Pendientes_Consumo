import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { AbcClass } from '@/core/abc';

const CLS: Record<AbcClass, string> = {
  // Clasificacion, no alerta: jerarquia por peso de texto, sin colores semanticos.
  A: 'bg-text/10 font-semibold text-text',
  B: 'bg-bg-inset text-text-muted',
  C: 'bg-bg-inset text-text-faint',
};

const TITLE: Record<AbcClass, string> = {
  A: 'Clase A — dentro del 80% del importe facturado (12m)',
  B: 'Clase B — entre 80% y 95% del importe facturado (12m)',
  C: 'Clase C — cola, resto del importe facturado (12m)',
};

/** Badge compacto de clase ABC/Pareto (A/B/C). `undefined` = sin facturación
 * en los últimos 12 meses (no clasificado) — se pinta como guion, no como C,
 * para no confundir "no vendió" con "vendió poco". */
export const AbcBadge = memo(function AbcBadge({ clase }: { clase: AbcClass | undefined }) {
  if (!clase) return <span className="text-text-faint" title="Sin facturación en los últimos 12 meses">—</span>;
  return (
    <span
      title={TITLE[clase]}
      className={cn('inline-flex size-5 items-center justify-center rounded text-[11px] font-semibold', CLS[clase])}
    >
      {clase}
    </span>
  );
});
