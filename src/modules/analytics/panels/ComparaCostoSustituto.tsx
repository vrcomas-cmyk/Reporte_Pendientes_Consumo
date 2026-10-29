import { formatCurrency } from '@/lib/utils';
import { compararCosto, esSustituto, textoCambioCodigo } from '@/core/ofertaSustituto';
import type { Analytics } from '../AnalyticsContext';
import { useCostoVisible } from './CostoMaterial';

const VEREDICTO: Record<string, { txt: string; cls: string }> = {
  'mas-caro': { txt: 'El sustituto cuesta MÁS', cls: 'text-danger' },
  'mas-barato': { txt: 'El sustituto cuesta MENOS', cls: 'text-success' },
  igual: { txt: 'Mismo costo', cls: 'text-text-muted' },
  'sin-costo': { txt: 'Falta el costo de alguno de los dos', cls: 'text-text-faint' },
};

/** Compara el costo del material que viene en el pedido contra el de su sustituto, y recuerda el cambio de código a ofertar.
 * No se muestra si lo ofertado es el mismo código o si el rol no puede ver costos (mismo permiso que el resto de paneles). */
export function ComparaCostoSustituto({ a, original, sustituto }: { a: Analytics; original: string; sustituto: string }) {
  const costoVisible = useCostoVisible();
  if (!esSustituto(original, sustituto)) return null;
  const costoO = a.enrich.matCosto(original);
  const costoS = a.enrich.matCosto(sustituto);
  const c = compararCosto(costoO, costoS);
  const v = VEREDICTO[c.veredicto];
  const fila = (etiqueta: string, codigo: string, costo: number) => (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-3 text-xs text-text-muted">{etiqueta}</td>
      <td className="py-1.5 pr-3"><div className="font-mono text-xs font-medium">{codigo}</div><div className="max-w-72 truncate text-[11px] text-text-faint">{a.enrich.matTexto(codigo) || '—'}</div></td>
      <td className="py-1.5 text-right tabular-nums">{costo ? `${formatCurrency(costo)}${a.enrich.matUm(codigo) ? ` / ${a.enrich.matUm(codigo)}` : ''}` : '—'}</td>
    </tr>
  );
  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-elevated p-3">
      <h3 className="mb-1 text-sm font-semibold">Comparar con el material del pedido</h3>
      {costoVisible && (
        <>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-text-faint"><th className="pb-1 pr-3 font-semibold" /><th className="pb-1 pr-3 font-semibold">Material</th><th className="pb-1 text-right font-semibold">Costo</th></tr></thead>
            <tbody>
              {fila('En el pedido', original, costoO)}
              {fila('Sustituto', sustituto, costoS)}
            </tbody>
          </table>
          <p className={`mt-2 text-sm font-medium ${v.cls}`}>
            {v.txt}
            {c.veredicto !== 'sin-costo' && c.veredicto !== 'igual' && c.pct != null && (
              <span className="tabular-nums"> · {c.diferencia > 0 ? '+' : '−'}{formatCurrency(Math.abs(c.diferencia))} ({c.diferencia > 0 ? '+' : '−'}{Math.abs(Math.round(c.pct * 1000) / 10)}%)</span>
            )}
          </p>
        </>
      )}
      <p className="mt-2 rounded bg-bg-inset px-2 py-1.5 text-xs text-text-muted">{textoCambioCodigo(original, sustituto)}</p>
    </div>
  );
}
