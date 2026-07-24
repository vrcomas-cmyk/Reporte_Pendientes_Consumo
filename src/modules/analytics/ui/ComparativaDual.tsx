import { comparativa, type Serie } from '@/core/resumenFac';
import { formatCurrency } from '@/lib/utils';

/** Texto de porcentaje con flecha y color, usado por ComparativaDual. */
function pctTxt(p: number) {
  const up = p >= 0;
  return (
    <span className={up ? 'text-emerald-500' : 'text-danger'}>
      {up ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%
    </span>
  );
}

/** Comparativo mensual y trimestral (mismo mes año anterior / Q año anterior) en dos recuadros. */
export function ComparativaDual({ serie }: { serie: Serie }) {
  const c = comparativa(serie);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-border p-3">
        <p className="text-[11px] uppercase tracking-wide text-text-faint">Mes {c.mesActLbl} vs {c.mesAntLbl}</p>
        <p className="mt-1 font-mono text-lg">{formatCurrency(c.mesAct.imp)}</p>
        <p className="text-xs text-text-muted">ant. {formatCurrency(c.mesAnt.imp)} · {pctTxt(c.mesPct)}</p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <p className="text-[11px] uppercase tracking-wide text-text-faint">Q{c.q} {c.cy} vs Q{c.q} {c.cy - 1}</p>
        <p className="mt-1 font-mono text-lg">{formatCurrency(c.qAct.imp)}</p>
        <p className="text-xs text-text-muted">ant. {formatCurrency(c.qAnt.imp)} · {pctTxt(c.qPct)}</p>
      </div>
    </div>
  );
}
