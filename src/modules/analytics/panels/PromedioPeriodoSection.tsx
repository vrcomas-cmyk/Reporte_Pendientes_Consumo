import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from './_shared';
import { MonthRangeFilter } from '../ui/MonthRangeFilter';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { promedioPeriodo, preciosPeriodo, rangoDisponible, mesDeKey, periodo12Cerrados, cantidadesMensuales } from '@/core/facMensual';
import { promedioAcotado } from '@/core/promedioAcotado';
import { SegmentedControl } from '@/components/layout/report';
import { mesKey, mesAnterior, hoyMes, mesLabel } from '@/core/resumenFac';
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
  const per = periodo12Cerrados(a.facMensual);
  if (!per) return { periodo: guardado, setPeriodo, esDefault: true };
  return { periodo: { desde: per.desde, hasta: per.hasta }, setPeriodo, esDefault: true };
}

/** Sección "Promedio por periodo" del detalle de Inventario: el usuario elige
 * un rango mm/aaaa y el promedio mensual se recalcula desde "Fac_Mensual_CAM"
 * (en vez del `Promedio_Consumo_12M` fijo que trae la hoja de Resumen Sin).
 * Muestra el promedio del material (todos los centros) y del material en este
 * centro; el desglose por almacén vive en la tabla de abajo (columnas extra). */
export function PromedioPeriodoSection({ a, material, centro, periodo, esDefault, onChange, embebido = false }: {
  /** Dentro del bloque de Facturación (sin tarjeta propia). */
  embebido?: boolean;
  a: Analytics;
  material: string;
  /** Sin centro (detalle general del material) solo se muestra lo de todos los centros. */
  centro?: string;
  periodo: PeriodoProm;
  /** true = el periodo mostrado es el predeterminado (12 meses cerrados), no uno elegido. */
  esDefault?: boolean;
  onChange: (p: PeriodoProm) => void;
}) {
  const [verGeneral, setVerGeneral] = useState(false);
  // Promedio normal (suma ÷ meses) o acotado (limita los meses con picos muy altos). Se recuerda.
  const [modoProm, setModoProm] = usePersistedState<'normal' | 'acotado'>('promedio.periodo.modo', 'normal');
  const rango = rangoDisponible(a.facMensual);
  const listo = periodoCompleto(periodo);
  const matProm = listo ? promedioPeriodo(a.facMensual, { material }, periodo.desde, periodo.hasta) : null;
  const centroProm = listo && centro ? promedioPeriodo(a.facMensual, { material, centro }, periodo.desde, periodo.hasta) : null;
  const acotadoMat = listo ? promedioAcotado(cantidadesMensuales(a.facMensual, { material }, periodo.desde, periodo.hasta)) : null;
  const acotadoCentro = listo && centro ? promedioAcotado(cantidadesMensuales(a.facMensual, { material, centro }, periodo.desde, periodo.hasta)) : null;
  const acotando = modoProm === 'acotado';
  const filas = a.facMensualCam;
  const precMat = listo ? preciosPeriodo(filas, { material }, periodo.desde, periodo.hasta) : null;
  const precCentro = listo && centro ? preciosPeriodo(filas, { material, centro }, periodo.desde, periodo.hasta) : null;
  const fueraDeRango = listo && rango && (mesKey(periodo.hasta) < rango.min || mesKey(periodo.desde) > rango.max);

  // Los botones 3m/6m/12m terminan siempre en el último mes CERRADO con dato:
  // el mes corriente está incompleto y sesgaría el promedio a la baja. Solo
  // entra si el usuario lo teclea a mano en el filtro de periodo.
  const finPreset = rango ? mesKey(mesAnterior(hoyMes())) : 0;
  const aplicarPreset = (n: number) => {
    if (!rango) return;
    onChange({ desde: mesDeKey(finPreset - n + 1), hasta: mesDeKey(finPreset) });
  };

  return (
    <Envoltura embebido={embebido}>
      {!a.facMensual ? (
        <p className="text-sm text-text-muted">
          Sin datos de la pestaña “Fac_Mensual_CAM”. Sincroniza los reportes desde Carga para poder calcular el promedio de un periodo.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <MonthRangeFilter label="Periodo" desde={periodo.desde} hasta={periodo.hasta} onChange={onChange} />
            <div className="flex items-center gap-1" title={`Termina en el último mes cerrado (${rango ? mesDeKey(finPreset) : '—'}); no incluye el mes corriente.`}>
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
          {listo && matProm && (
            <div className="@container mt-3 flex flex-col gap-3">
              {/* Promedio (protagonista) a la izquierda y precio unitario a la derecha, sobre el mismo ancho que "Facturación del material"; se apilan solo si la sección es angosta (< 36 rem) */}
              <div className="grid grid-cols-1 items-stretch gap-3 @xl:grid-cols-2">
                {/* El protagonista es el ámbito que se está viendo: el centro (si se abrió un centro) o el material general. */}
                {(() => {
                  const esCentro = !!(centro && centroProm && acotadoCentro);
                  const prin = esCentro ? centroProm! : matProm;
                  const acPrin = esCentro ? acotadoCentro! : acotadoMat!;
                  const valor = acotando ? acPrin.promedio : prin.promedio;
                  const secundarioValor = acotando ? acotadoMat!.promedio : matProm.promedio;
                  return (
                    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">Promedio mensual · {mesLabel(periodo.desde)} – {mesLabel(periodo.hasta)}</p>
                        <SegmentedControl
                          value={modoProm}
                          onChange={setModoProm}
                          ariaLabel="Tipo de promedio"
                          options={[{ value: 'normal', label: 'Normal' }, { value: 'acotado', label: 'Acotado' }]}
                        />
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-4xl font-bold leading-none tabular-nums text-text">{formatNumber(valor)}</span>
                          <span className="text-sm text-text-muted">unidades / mes</span>
                        </div>
                        <p className="mt-1 text-xs text-text-muted">
                          {esCentro ? `Centro ${centro} · ${formatNumber(centroProm!.mesesConDato)} meses con venta` : `Material · todos los centros · ${formatNumber(matProm.meses)} meses del periodo`}
                        </p>
                        {acotando && (
                          <p className="mt-1 text-[11px] text-text-faint" title="Tope = Q3 + 3 × IQR de los meses con venta (solo picos extremos). Los meses por encima se toman como el tope; los meses en 0 sí cuentan.">
                            {acPrin.acotados > 0
                              ? `Quita picos: ${acPrin.acotados} mes(es) limitados a ${formatNumber(acPrin.tope ?? 0)} · normal: ${formatNumber(prin.promedio)}`
                              : `Sin picos que acotar en este periodo · normal: ${formatNumber(prin.promedio)}`}
                          </p>
                        )}
                      </div>
                      {esCentro && (
                        <div className="flex items-baseline justify-between gap-3 border-t border-accent/20 pt-2">
                          <span className="text-xs text-text-muted">Material · todos los centros · {formatNumber(matProm.meses)} meses</span>
                          <span className="font-display text-xl font-semibold tabular-nums text-text">{formatNumber(secundarioValor)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="flex min-w-0 flex-col gap-3">
                  {(precCentro && !verGeneral ? [[`centro ${centro}`, precCentro] as const]
                    : precCentro ? [[`centro ${centro}`, precCentro] as const, ['material (todos los centros)', precMat!] as const]
                    : precMat ? [['material (todos los centros)', precMat] as const] : []
                  ).map(([et, p]) => (
                    <div key={et} className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elevated p-4">
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">Precio unitario · {et}</p>
                        <span className="text-[11px] text-text-faint">{formatNumber(p.meses)} meses con precio</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-3xl font-bold leading-none tabular-nums text-text">{p.meses ? formatCurrency(p.promedio) : '—'}</span>
                        <span className="text-xs text-text-muted">precio promedio ponderado</span>
                      </div>
                      <RangoPrecio min={p.min} prom={p.promedio} max={p.max} hay={p.meses > 0} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-[11px] text-text-faint">Precio = importe ÷ cantidad facturada por mes (Fac_Mensual_CAM); mín./máx. sobre el precio de cada mes, promedio ponderado por cantidad. Sigue el periodo elegido arriba.</p>
                {precCentro && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setVerGeneral((v) => !v)}>
                    {verGeneral ? 'Ocultar general' : 'Mostrar general (todos los centros)'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Envoltura>
  );
}

function Envoltura({ embebido, children }: { embebido: boolean; children: React.ReactNode }) {
  if (embebido) return <div className="mt-4 border-t border-border pt-3"><h4 className="mb-2 text-sm font-semibold text-text">Promedio por periodo</h4>{children}</div>;
  return <Section ancho tono="fac" origen="Fac_Mensual_CAM" title="Promedio por periodo">{children}</Section>;
}

/** Barra del rango de precio del periodo: mínimo y máximo en los extremos y el promedio marcado entre ellos. */
function RangoPrecio({ min, prom, max, hay }: { min: number; prom: number; max: number; hay: boolean }) {
  if (!hay) return null;
  const pos = max > min ? Math.min(100, Math.max(0, ((prom - min) / (max - min)) * 100)) : 50;
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full bg-border/60" role="img" aria-label={`Precio de ${formatCurrency(min)} a ${formatCurrency(max)}, promedio ${formatCurrency(prom)}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent/30" style={{ width: `${pos}%` }} />
        <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg-elevated bg-accent shadow" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1.5 flex items-start justify-between text-xs">
        <span><span className="block text-[10px] uppercase tracking-wide text-text-faint">Mín.</span><span className="font-semibold tabular-nums">{formatCurrency(min)}</span></span>
        <span className="text-right"><span className="block text-[10px] uppercase tracking-wide text-text-faint">Máx.</span><span className="font-semibold tabular-nums">{formatCurrency(max)}</span></span>
      </div>
    </div>
  );
}
