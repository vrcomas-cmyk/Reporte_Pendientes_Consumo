import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { EvolChart } from '@/modules/analytics/ui/EvolChart';
import { YearComparisonChart } from '@/modules/analytics/ui/YearComparisonChart';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn } from '@/lib/utils';
import type { AnioComparado } from '@/core/analisisDirectivo';
import type { Serie } from '@/core/resumenFac';

type Vista = 'anios' | 'filtro';
type Metrica = 'imp' | 'margen';

function Segmentado<T extends string>({ value, onChange, opciones, small }: {
  value: T;
  onChange: (v: T) => void;
  opciones: { key: T; label: string; hint: string }[];
  small?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-bg-inset p-0.5" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          title={o.hint}
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded px-2.5 py-1 font-medium transition-colors',
            small ? 'text-[11px]' : 'text-xs',
            value === o.key ? 'bg-bg-elevated text-text shadow-sm' : 'text-text-faint hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tarjeta única "Facturación mensual": reúne en un solo espacio la gráfica del
 * Panel (facturación mensual, aquí una línea por año para distinguir un año de
 * otro) y la de Consumo ("Facturación mensual (filtro)", una línea con el
 * total mensual de todo el historial bajo los filtros de esta pantalla, con
 * clic al detalle de clientes del mes). El interruptor de arriba elige cuál se
 * ve; el de Venta/Margen solo aplica al comparativo por año. */
export function FacturacionMensualCard({ anios, serieFiltro, onMonth }: {
  anios: AnioComparado[];
  serieFiltro: Serie;
  onMonth: (mes: string) => void;
}) {
  const [vista, setVista] = usePersistedState<Vista>('analisisDirectivo.factMensual.vista', 'anios');
  const [metrica, setMetrica] = useState<Metrica>('imp');

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text-muted">Facturación mensual</p>
          <p className="text-[11px] text-text-faint">
            {vista === 'anios'
              ? 'Un color por año — pasa el cursor sobre un mes para comparar los años entre sí.'
              : 'Total mensual de todo el historial con los filtros de arriba — clic en un mes para ver los clientes.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vista === 'anios' && (
            <Segmentado<Metrica>
              small
              value={metrica}
              onChange={setMetrica}
              opciones={[
                { key: 'imp', label: 'Venta', hint: 'Importe facturado por mes.' },
                { key: 'margen', label: 'Rendimiento aprox.', hint: 'Importe menos costo VIGENTE del catálogo × cantidad (aproximado).' },
              ]}
            />
          )}
          <Segmentado<Vista>
            value={vista}
            onChange={setVista}
            opciones={[
              { key: 'anios', label: 'Comparativo por año', hint: 'Como la gráfica del Panel, pero con una línea por año y proyección del año en curso.' },
              { key: 'filtro', label: 'Serie del filtro', hint: 'Como "Facturación mensual (filtro)" de Consumo: una sola línea con el total mensual bajo los filtros actuales.' },
            ]}
          />
        </div>
      </div>
      {vista === 'anios'
        ? <YearComparisonChart anios={anios} metric={metrica} height={300} />
        : <EvolChart serie={serieFiltro} height={300} onMonth={onMonth} />}
    </Card>
  );
}
