import { useMemo } from 'react';
import { EvolChart, ComparativaDual, TrendBadge } from '../ui';
import { Section } from './_shared';
import { formatCurrency } from '@/lib/utils';
import { estadisticasDeHistorial, historialDeFacturacion } from '@/core/calculadoraPrecios';
import { serieMaterial, tendenciaTexto } from '@/core/resumenFac';
import type { Analytics } from '../AnalyticsContext';

const MESES_HISTORIAL = 12;

/** Facturación del material (gráfica mensual y comparativos, como en el detalle de material) y su precio unitario facturado en los últimos
 * 12 meses: mínimo, promedio (ponderado por volumen), P50 (mediana) y máximo — los mismos números de la Calculadora de Precios. */
export function FacturacionPreciosMaterial({ a, material }: { a: Analytics; material: string }) {
  const { rf } = a;
  const serie = useMemo(() => serieMaterial(rf, material), [rf, material]);
  const stats = useMemo(() => {
    if (!rf) return null;
    const meses = new Set(a.mesesDisponibles.slice(-MESES_HISTORIAL));
    const h = historialDeFacturacion(rf.rows, meses, material);
    return estadisticasDeHistorial([...h.values()][0]);
  }, [rf, a.mesesDisponibles, material]);

  return (
    <Section title="Facturación y precios del material" collapsible defaultOpen storageKey="vista.fac.precios">
      {!rf ? (
        <p className="text-sm text-text-muted">Sin facturación cargada: sincroniza Facturación desde Carga.</p>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['Precio mín', stats?.min], ['Promedio', stats?.promedio], ['P50 (mediana)', stats?.p50], ['Precio máx', stats?.max]] as const).map(([etiqueta, valor]) => (
              <div key={etiqueta} className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5">
                <div className="text-[11px] uppercase tracking-wide text-text-faint">{etiqueta}</div>
                <div className="font-mono text-sm font-semibold tabular-nums">{valor ? formatCurrency(valor) : '-'}</div>
              </div>
            ))}
          </div>
          <p className="mb-2 text-[11px] text-text-faint">
            {stats ? `Precio unitario facturado en los últimos ${MESES_HISTORIAL} meses (${stats.n} facturas cliente × mes); el promedio pesa por volumen.` : `Sin facturación de este material en los últimos ${MESES_HISTORIAL} meses.`}
          </p>
          {serie.length > 0 && <div className="mb-2"><TrendBadge t={tendenciaTexto(serie)} /></div>}
          <EvolChart serie={serie} height={160} />
          {serie.length > 0 && <div className="mt-3"><ComparativaDual serie={serie} /></div>}
        </>
      )}
    </Section>
  );
}
