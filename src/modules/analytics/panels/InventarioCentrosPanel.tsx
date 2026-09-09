import { AlertTriangle } from 'lucide-react';
import { StatePill } from '../ui';
import { Section } from './_shared';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { esCondicionCortaCaducidad } from '@/core/inventoryRules';
import { pendPorCondicion, transitoPorCondicion, esLentoPorCondicion } from '@/core/resumenSin';
import { CENTERS } from '@/core/types';
import { norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel lateral — "Inventario por centro" de un material, réplica del
 * desglose que ya muestra Inv Condición (`InventarioPage`) y el panel
 * `invCondCelda` ("Otros centros"), pero para TODOS los centros a la vez y
 * agrupado por condición (un material puede tener más de una fila en
 * `invCondicion` si aparece con distinta condición). Clic en un centro abre
 * el desglose por lote de ese material+centro. */
export function InventarioCentrosPanel({ a, material, push }: { a: Analytics; material: string; push: (p: Panel) => void }) {
  const filas = a.invCondicion.filter((r) => norm(r.material) === norm(material));

  if (!filas.length) {
    return (
      <Section title="Inventario por centro">
        <p className="text-sm text-text-muted">Sin inventario por condición para este material.</p>
      </Section>
    );
  }

  const mo = a.rss?.mats.get(norm(material));

  return (
    <Section title="Inventario por centro">
      <div className="flex flex-col gap-3">
        {filas.map((r) => {
          const invSuma = CENTERS.reduce((s, c) => s + (r.invByCenter[c] || 0), 0) + (r.disponible31_30 || 0) + (r.disponible31_32 || 0);
          return (
            <div key={r.condicion || 'sin-condicion'} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <StatePill label={r.condicion || 'Sin condición'} cls={esCondicionCortaCaducidad(r.condicion) ? 'rojo' : 'gris'} />
                {r.precioOferta > 0 && <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(r.precioOferta)}</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {CENTERS.map((c) => {
                  const co = mo?.centros.get(c);
                  const pend = pendPorCondicion(co, r.condicion);
                  const transito = transitoPorCondicion(co, r.condicion);
                  const lento = a.rss ? esLentoPorCondicion(co, r.condicion, a.rss.curMes) : false;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => push({ type: 'invCondCelda', material, centro: c })}
                      className="rounded-md border border-border px-2 py-1.5 text-left hover:border-accent"
                    >
                      <p className="text-[11px] text-text-faint">Inv {c}</p>
                      <p className="font-mono text-sm">
                        {formatNumber(r.invByCenter[c] || 0)}
                        {transito > 0 && <span className="text-emerald-500"> +{formatNumber(transito)}</span>}
                        {lento && <AlertTriangle className="ml-1 inline size-3 text-warning" />}
                      </p>
                      {pend > 0 && <p className="text-[11px] text-danger">Pend {formatNumber(pend)}</p>}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-border pt-2 text-[11px] text-text-faint">
                <div><span className="block">Disp 31·30</span><span className="font-mono text-xs text-text">{formatNumber(r.disponible31_30 || 0)}</span></div>
                <div><span className="block">Disp 31·32</span><span className="font-mono text-xs text-text">{formatNumber(r.disponible31_32 || 0)}</span></div>
                <div><span className="block">Inv Suma</span><span className="font-mono text-xs text-text">{formatNumber(invSuma)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
