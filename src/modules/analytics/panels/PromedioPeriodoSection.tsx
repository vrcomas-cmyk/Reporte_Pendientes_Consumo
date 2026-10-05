import { Button } from '@/components/ui/button';
import { StatTile } from '../ui';
import { Section } from './_shared';
import { MonthRangeFilter } from '../ui/MonthRangeFilter';
import { formatNumber } from '@/lib/utils';
import { promedioPeriodo, rangoDisponible, mesDeKey } from '@/core/facMensual';
import { mesKey, mesAnterior, hoyMes } from '@/core/resumenFac';
import { usePersistedState } from '@/hooks/usePersistedState';
import type { Analytics } from '../AnalyticsContext';

export interface PeriodoProm { desde: string; hasta: string }

/** ¿El periodo tiene ambos extremos válidos y en orden? */
export const periodoCompleto = (p: PeriodoProm): boolean => {
  const d = mesKey(p.desde);
  const h = mesKey(p.hasta);
  return !!d && !!h && h >= d;
};

const PRESETS = [3, 6, 12] as const;

/** Periodo vigente del promedio. Mismo para todo el módulo (se conserva al
 * navegar entre materiales). Si el usuario no eligió uno, por defecto son los
 * 12 meses cerrados más recientes con dato (sin el mes en curso, incompleto). */
export function usePeriodoProm(a: Analytics): { periodo: PeriodoProm; setPeriodo: (p: PeriodoProm) => void; esDefault: boolean } {
  const [guardado, setPeriodo] = usePersistedState<PeriodoProm>('resumenSin.promPeriodo', { desde: '', hasta: '' });
  if (periodoCompleto(guardado)) return { periodo: guardado, setPeriodo, esDefault: false };
  const rango = rangoDisponible(a.facMensual);
  if (!rango) return { periodo: guardado, setPeriodo, esDefault: true };
  const fin = Math.min(rango.max, mesKey(mesAnterior(hoyMes())));
  return { periodo: { desde: mesDeKey(fin - 11), hasta: mesDeKey(fin) }, setPeriodo, esDefault: true };
}

/** Sección "Promedio por periodo" del detalle de Inventario: el usuario elige
 * un rango mm/aaaa y el promedio mensual se recalcula desde "Fac_Mensual_CAM"
 * (en vez del `Promedio_Consumo_12M` fijo que trae la hoja de Resumen Sin).
 * Muestra el promedio del material (todos los centros) y del material en este
 * centro; el desglose por almacén vive en la tabla de abajo (columnas extra). */
export function PromedioPeriodoSection({ a, material, centro, periodo, esDefault, onChange }: {
  a: Analytics;
  material: string;
  centro: string;
  periodo: PeriodoProm;
  /** true = el periodo mostrado es el predeterminado (12 meses cerrados), no uno elegido. */
  esDefault?: boolean;
  onChange: (p: PeriodoProm) => void;
}) {
  const rango = rangoDisponible(a.facMensual);
  const listo = periodoCompleto(periodo);
  const matProm = listo ? promedioPeriodo(a.facMensual, { material }, periodo.desde, periodo.hasta) : null;
  const centroProm = listo ? promedioPeriodo(a.facMensual, { material, centro }, periodo.desde, periodo.hasta) : null;
  const fueraDeRango = listo && rango && (mesKey(periodo.hasta) < rango.min || mesKey(periodo.desde) > rango.max);

  // Los botones 3m/6m/12m terminan siempre en el último mes CERRADO con dato:
  // el mes corriente está incompleto y sesgaría el promedio a la baja. Solo
  // entra si el usuario lo teclea a mano en el filtro de periodo.
  const finPreset = rango ? Math.min(rango.max, mesKey(mesAnterior(hoyMes()))) : 0;
  const aplicarPreset = (n: number) => {
    if (!rango) return;
    onChange({ desde: mesDeKey(finPreset - n + 1), hasta: mesDeKey(finPreset) });
  };

  return (
    <Section title="Promedio por periodo">
      {!a.facMensual ? (
        <p className="text-sm text-text-muted">
          Sin datos de la pestaña “Fac_Mensual_CAM”. Sincroniza los reportes desde Carga para poder calcular el promedio de un periodo.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <MonthRangeFilter label="Periodo" desde={periodo.desde} hasta={periodo.hasta} onChange={onChange} />
            <div className="flex items-center gap-1" title={`Termina en el último mes cerrado con dato (${rango ? mesDeKey(finPreset) : '—'}); no incluye el mes corriente.`}>
              {PRESETS.map((n) => (
                <Button key={n} type="button" variant="outline" size="sm" onClick={() => aplicarPreset(n)}>{n}m</Button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-text-faint">
            Promedio mensual = cantidad facturada ÷ meses de calendario del periodo.”
            {rango && <> · datos de {mesDeKey(rango.min)} a {mesDeKey(rango.max)}</>}.
          </p>
          {esDefault && listo && <p className="mt-1.5 text-[11px] text-text-faint">Periodo predeterminado: últimos 12 meses cerrados. Cámbialo arriba.</p>}
          {fueraDeRango && <p className="mt-1.5 text-xs text-warning">El periodo elegido queda fuera de los meses cargados de Fac_Mensual_CAM.</p>}
          {listo && matProm && centroProm && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Prom. material (todos los centros)" value={formatNumber(matProm.promedio)} />
              <StatTile label={`Prom. material · centro ${centro}`} value={formatNumber(centroProm.promedio)} />
              <StatTile label="Meses del periodo" value={formatNumber(matProm.meses)} />
              <StatTile label={`Meses con venta (centro ${centro})`} value={formatNumber(centroProm.mesesConDato)} />
            </div>
          )}
        </>
      )}
    </Section>
  );
}
