import { AlertTriangle } from 'lucide-react';
import { StatePill } from '../ui';
import { Section } from './_shared';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { esCondicionCortaCaducidad } from '@/core/inventoryRules';
import { pendPorCondicion, transitoPorCondicion, esLentoPorCondicion, invGen, esLento, type RSSMaterial } from '@/core/resumenSin';
import { CENTERS, type InvConsolidadoRow } from '@/core/types';
import { norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Una tarjeta de inventario por centro para UNA fila de "Inv Condición" —
 * una tarjeta por cada condición que tenga el material (Corta caducidad,
 * Lento movimiento, etc.). */
function BloqueCondicion({ r, mo, curMes, material, push }: {
  r: InvConsolidadoRow;
  mo: RSSMaterial | undefined;
  curMes: number;
  material: string;
  push: (p: Panel) => void;
}) {
  const invSuma = CENTERS.reduce((s, c) => s + (r.invByCenter[c] || 0), 0) + (r.disponible31_30 || 0) + (r.disponible31_32 || 0);
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <StatePill label={r.condicion || 'Sin condición'} cls={esCondicionCortaCaducidad(r.condicion) ? 'rojo' : 'gris'} />
        {r.precioOferta > 0 && <span className="font-mono text-xs font-semibold text-text">{formatCurrency(r.precioOferta)}</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {CENTERS.map((c) => {
          const co = mo?.centros.get(c);
          const pend = pendPorCondicion(co, r.condicion);
          const transito = transitoPorCondicion(co, r.condicion);
          const lento = esLentoPorCondicion(co, r.condicion, curMes);
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
                {transito > 0 && <span className="text-success"> +{formatNumber(transito)}</span>}
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
}

/** Tarjeta "General" — inventario 1030+1031+1060 (`invGen`, sin distinguir
 * condición) por centro, EXACTAMENTE el mismo dato que ya muestra el módulo
 * "Inventario" (Resumen Sin Sugerencias, columna "C {centro}") — no viene del
 * catálogo, viene de Resumen Sin Sugerencias (`a.rss`), que es donde vive
 * ese desglose de almacén. Sirve para comparar contra las condiciones de
 * arriba sin tener que abrir el otro módulo. */
function BloqueGeneral({ mo, curMes, material, push }: {
  mo: RSSMaterial | undefined;
  curMes: number;
  material: string;
  push: (p: Panel) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <StatePill label="General (1030+1031+1060)" cls="gris" />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {CENTERS.map((c) => {
          const co = mo?.centros.get(c);
          const ig = invGen(co);
          const lento = co ? esLento(co, curMes) : false;
          return (
            <button
              key={c}
              type="button"
              onClick={() => push({ type: 'celda', material, centro: c })}
              className="rounded-md border border-border px-2 py-1.5 text-left hover:border-accent"
            >
              <p className="text-[11px] text-text-faint">Inv {c}</p>
              <p className="font-mono text-sm">
                {formatNumber(ig)}
                {!!co?.transito && co.transito > 0 && <span className="text-success"> +{formatNumber(co.transito)}</span>}
                {lento && <AlertTriangle className="ml-1 inline size-3 text-warning" />}
              </p>
              {!!co?.pend && co.pend > 0 && <p className="text-[11px] text-danger">Pend {formatNumber(co.pend)}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Panel lateral — "Inventario por centro" de un material: SIEMPRE muestra,
 * en secciones separadas, (1) las filas de "Inv Condición" propias del
 * material (Corta caducidad, Lento movimiento, etc.) y (2) el inventario
 * GENERAL (almacenes 1030+1031+1060, sin distinguir condición — mismo dato
 * que el módulo "Inventario"/Resumen Sin Sugerencias), sin importar si el
 * material tiene condición o no — así se compara "cuánto es Corta
 * caducidad" contra "cuánto es lo normal" sin perder de vista ninguno de
 * los dos. Clic en un centro de "Por condición" abre el desglose por lote de
 * ese material+centro+condición; clic en uno de "General" abre la celda
 * normal (Material×Centro) de Resumen Sin Sugerencias. */
export function InventarioCentrosPanel({ a, material, push }: { a: Analytics; material: string; push: (p: Panel) => void }) {
  const filasCondicion = a.invCondicion.filter((r) => norm(r.material) === norm(material));
  const mo = a.rss?.mats.get(norm(material));
  const curMes = a.rss?.curMes ?? 0;

  if (!filasCondicion.length && !mo) {
    return (
      <Section title="Inventario por centro">
        <p className="text-sm text-text-muted">Sin inventario registrado para este material.</p>
      </Section>
    );
  }

  return (
    <Section title="Inventario por centro">
      <div className="flex flex-col gap-3">
        {filasCondicion.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-text-faint">Por condición (reporte del día)</p>
            <div className="flex flex-col gap-2">
              {filasCondicion.map((r) => (
                <BloqueCondicion key={r.condicion || 'sin-condicion'} r={r} mo={mo} curMes={curMes} material={material} push={push} />
              ))}
            </div>
          </div>
        )}
        {mo && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-text-faint" title="Inventario general de almacenes 1030+1031+1060 (Resumen Sin Sugerencias), sin distinguir condición — sirve de comparación contra las tarjetas de condición de arriba.">
              General
            </p>
            <BloqueGeneral mo={mo} curMes={curMes} material={material} push={push} />
          </div>
        )}
      </div>
    </Section>
  );
}
