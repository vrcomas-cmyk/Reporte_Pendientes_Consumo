import { memo, useMemo, useState, type ReactNode } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { completarSerie, mesLabel, mesKey, hoyMes, type Serie } from '@/core/resumenFac';
import { proyectarMesCorriente, tendenciaVsPromedio } from '@/core/proyeccion';
import { IndicadorTendencia, OPACIDAD_PROYECCION } from './ProyeccionTooltip';
import { categorical, CHART_UI } from '@/lib/chartColors';
import { MonthRangeFilter } from './MonthRangeFilter';

export type Fila = {
  mes: string; label: string;
  imp: number | null; imp_proy?: number; imp_acum?: number;
  cant: number | null; cant_proy?: number; cant_acum?: number;
  margen?: number | null; margen_proy?: number; margen_acum?: number;
  /** Promedio de los últimos meses cerrados (la «tendencia» con la que se proyecta): base del indicador de tendencia del tooltip. Solo en el mes en curso. */
  imp_tend?: number; cant_tend?: number; margen_tend?: number;
  /** Presupuesto del mes (solo Facturación con presupuesto). */
  pto?: number | null;
};

/** Pasa a fila: si el mes es el corriente (parcial) y se puede proyectar, la
 * línea sólida se corta en el último mes cerrado y el mes corriente queda como
 * tramo punteado hacia la proyección + un punto hueco con lo facturado a la
 * fecha. Sin meses cerrados (o si todo vale 0) se deja como dato real.
 * Aplica igual a importe, cantidad y (si existe) margen. `range` acota los
 * meses mostrados (escala `mesKey`). */
export function armarFilas(serie: Serie, proyectar: boolean, hoy: Date, range?: [number, number], pto?: ReadonlyMap<number, number>): { filas: Fila[]; proyectado: boolean; conMargen: boolean; conCantidad: boolean; conPresupuesto?: boolean } {
  const base = armarFilasBase(serie, proyectar, hoy, range);
  if (!pto || pto.size === 0) return base;
  // El presupuesto cubre meses que aún no tienen ventas (el resto del año): se agregan como puntos solo de presupuesto.
  const filas = base.filas;
  const porK = new Map(filas.map((f) => [mesKey(f.mes), f]));
  for (const [k, monto] of pto) {
    if (range && (k < range[0] || k > range[1])) continue;
    const f = porK.get(k);
    if (f) f.pto = monto;
    else {
      const mes = String(((k - 1) % 12) + 1).padStart(2, '0') + '/' + Math.floor((k - 1) / 12);
      filas.push({ mes, label: mesLabel(mes), imp: null, cant: null, pto: monto });
    }
  }
  filas.sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
  return { ...base, filas, conPresupuesto: true };
}

function armarFilasBase(serie: Serie, proyectar: boolean, hoy: Date, range?: [number, number]): { filas: Fila[]; proyectado: boolean; conMargen: boolean; conCantidad: boolean } {
  const completa = completarSerie(serie, range);
  const conMargen = completa.some((p) => p.margen !== undefined);
  const conCantidad = completa.some((p) => p.cant > 0);
  const filas: Fila[] = completa.map((p) => ({
    mes: p.mes, label: mesLabel(p.mes), imp: p.imp, cant: p.cant, ...(conMargen ? { margen: p.margen ?? 0 } : {}),
  }));
  if (!proyectar) return { filas, proyectado: false, conMargen, conCantidad };

  const curK = mesKey(hoyMes());
  const iCur = filas.findIndex((f) => mesKey(f.mes) === curK);
  // Solo hay "cerrados" si existe al menos un mes anterior con dato real.
  const previos = filas.slice(0, Math.max(iCur, 0));
  const iPrimero = previos.findIndex((f) => (f.imp ?? 0) > 0 || (f.margen ?? 0) > 0);
  if (iCur <= 0 || iPrimero < 0) return { filas, proyectado: false, conMargen, conCantidad };

  const cerrados = previos.slice(iPrimero);
  const pI = proyectarMesCorriente(cerrados.map((f) => f.imp ?? 0), filas[iCur].imp ?? 0, hoy);
  if (!pI || pI.proyectado <= 0) return { filas, proyectado: false, conMargen, conCantidad };

  const cur = filas[iCur];
  const ult = filas[iCur - 1];
  ult.imp_proy = ult.imp ?? 0;
  cur.imp_proy = pI.proyectado;
  cur.imp_acum = pI.acumulado;
  cur.imp_tend = pI.tendencia;
  cur.imp = null;
  if (conCantidad) {
    const pC = proyectarMesCorriente(cerrados.map((f) => f.cant ?? 0), cur.cant ?? 0, hoy);
    if (pC) {
      ult.cant_proy = ult.cant ?? 0;
      cur.cant_proy = pC.proyectado;
      cur.cant_acum = pC.acumulado;
      cur.cant_tend = pC.tendencia;
      cur.cant = null;
    }
  }
  if (conMargen) {
    const pM = proyectarMesCorriente(cerrados.map((f) => f.margen ?? 0), cur.margen ?? 0, hoy);
    if (pM) {
      ult.margen_proy = ult.margen ?? 0;
      cur.margen_proy = pM.proyectado;
      cur.margen_acum = pM.acumulado;
      cur.margen_tend = pM.tendencia;
      cur.margen = null;
    }
  }
  return { filas, proyectado: true, conMargen, conCantidad };
}

const compacto = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 });
const tickMoneda = (v: number) => '$' + compacto.format(v);
const tickCantidad = (v: number) => compacto.format(v);
/** Ancho del eje según el label más largo (≈6.5px por carácter de 10px) — evita que se corten los números. */
const anchoEje = (valores: number[], fmt: (v: number) => string) =>
  Math.max(40, Math.max(...valores.map((v) => fmt(v).length), 1) * 6.5 + 12);

/** Un concepto del tooltip (Importe, Cantidad, Rendimiento, Presupuesto): título con su color y debajo líneas «etiqueta … valor», una por dato, para que cada cifra diga qué es. */
function BloqueTooltip({ color, titulo, children }: { color: string; titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex items-center gap-1.5 font-semibold"><span className="inline-block size-2.5 rounded-full" style={{ background: color }} />{titulo}</p>
      <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-5 gap-y-0.5 pl-4">{children}</dl>
    </div>
  );
}

/** Una línea del bloque. `tenue` = dato estimado (proyección): más pequeño y en color atenuado; sin `tenue` es el dato que se debe leer primero. */
function LineaTooltip({ etiqueta, valor, tenue, extra }: { etiqueta: string; valor: string; tenue?: boolean; extra?: ReactNode }) {
  return (
    <>
      <dt className="text-text-faint">{etiqueta}</dt>
      <dd className={cn('flex items-center justify-end gap-1.5 text-right tabular-nums', tenue ? 'text-text-faint' : 'font-semibold')}>
        {valor}{extra}
      </dd>
    </>
  );
}

function TooltipEvol({ active, payload, conMargen, conCantidad, conPto, colores }: {
  active?: boolean;
  payload?: { payload?: Fila }[];
  conMargen: boolean;
  conCantidad: boolean;
  conPto: boolean;
  colores: string[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const proy = row.imp_proy !== undefined && row.imp === null;

  /** Bloque de un dato (importe, cantidad, rendimiento). Mes en curso: «A la fecha» (con su tendencia) y «Cierre proyectado» (tenue); mes cerrado: «Real». */
  const bloque = (titulo: string, color: string, real: number | null | undefined, proyectado: number | undefined, acum: number | undefined, tend: number | undefined, fmt: (n: number) => string, hayProy: boolean) => {
    if (hayProy && proyectado !== undefined) {
      return (
        <BloqueTooltip color={color} titulo={titulo}>
          {acum !== undefined && (
            <LineaTooltip
              etiqueta="A la fecha"
              valor={fmt(acum)}
              extra={tend !== undefined ? (() => { const t = tendenciaVsPromedio(proyectado, tend); return t ? <IndicadorTendencia t={t} /> : null; })() : null}
            />
          )}
          <LineaTooltip etiqueta="Cierre proyectado" valor={fmt(proyectado)} tenue />
        </BloqueTooltip>
      );
    }
    return (
      <BloqueTooltip color={color} titulo={titulo}>
        <LineaTooltip etiqueta="Real" valor={real == null ? '—' : fmt(real)} tenue={real == null} />
      </BloqueTooltip>
    );
  };

  const pctDe = (v: number | null | undefined, pto: number) => (v == null ? null : `${Math.round((v / pto) * 100)} %`);
  return (
    <div className="min-w-56 rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: CHART_UI.surface, borderColor: CHART_UI.border, color: CHART_UI.label }}>
      <p className="mb-1.5 font-display text-sm font-semibold">{row.label}</p>
      <div className="flex flex-col gap-2">
        {bloque('Importe', colores[0], row.imp, row.imp_proy, row.imp_acum, row.imp_tend, formatCurrency, proy)}
        {conCantidad && bloque('Cantidad', colores[1], row.cant, row.cant_proy, row.cant_acum, row.cant_tend, (n) => formatNumber(n), proy && row.cant_proy !== undefined && row.cant === null)}
        {conMargen && bloque('Rendimiento aprox.', colores[2], row.margen, row.margen_proy, row.margen_acum, row.margen_tend, formatCurrency, proy)}
        {conPto && row.pto != null && (
          <BloqueTooltip color={colores[3]} titulo="Presupuesto">
            <LineaTooltip etiqueta="Meta del mes" valor={formatCurrency(row.pto)} />
            {row.pto > 0 && (proy
              ? (
                <>
                  <LineaTooltip etiqueta="Cumplido a la fecha" valor={pctDe(row.imp_acum, row.pto) ?? '—'} />
                  <LineaTooltip etiqueta="Cumplimiento proyectado" valor={pctDe(row.imp_proy, row.pto) ?? '—'} tenue />
                </>
              )
              : row.imp != null && <LineaTooltip etiqueta="Cumplido" valor={pctDe(row.imp, row.pto) ?? '—'} />)}
          </BloqueTooltip>
        )}
      </div>
      {proy && <p className="mt-2 border-t border-border/60 pt-1 text-[11px] text-text-faint">Mes en curso: el cierre se estima con el ritmo del mes y el promedio de los últimos 3 meses.</p>}
    </div>
  );
}

/** Gráfico de líneas de importe por mes con completarSerie. Click sobre un punto llama onMonth(mes). isAnimationActive=false para evitar quedarse en 0-length dash-array cuando trabajo síncrono pesado corre tras el mount.
 * Colors/tooltip match the Dashboard's recharts (same categorical palette,
 * same theme-aware dark/light tooltip) — this used to be a hardcoded
 * light-only gray box with an unrelated indigo line, the single most visible
 * inconsistency between Dashboard's charts and every other module's (this
 * component is shared by Sugerencias, Consumo, and every detail panel).
 *
 * MES CORRIENTE: el mes en curso está incompleto y dibujado como dato real
 * "se desploma" frente a los cerrados (a 0 al arrancar un mes nuevo). Con
 * `proyectar` (default) la línea sólida termina en el último mes cerrado y un
 * tramo punteado llega a donde se espera cerrar el mes (ver
 * `core/proyeccion.ts`); lo facturado a la fecha se marca con un punto hueco.
 * Si los puntos de `serie` traen `margen`, se dibuja también esa línea. */
export const EvolChart = memo(function EvolChart({ serie, onMonth, height = 220, proyectar = true, cantidad = true, filtroPeriodo = true, presupuesto }: {
  serie: Serie;
  /** Presupuesto por mes (clave `mesKey` → monto): se dibuja como línea punteada junto al importe. Debe venir YA filtrado igual que `serie`. */
  presupuesto?: ReadonlyMap<number, number>;
  onMonth?: (mes: string) => void;
  height?: number;
  proyectar?: boolean;
  /** Dibuja también la cantidad (otro color, eje derecho). */
  cantidad?: boolean;
  /** Muestra el filtro de periodo (mm/aaaa a mm/aaaa) sobre la gráfica. */
  filtroPeriodo?: boolean;
}) {
  const [periodo, setPeriodo] = useState({ desde: '', hasta: '' });
  const range = useMemo<[number, number] | undefined>(() => {
    if (!filtroPeriodo || (!periodo.desde && !periodo.hasta) || !serie.length) return undefined;
    const lo = periodo.desde ? mesKey(periodo.desde) : mesKey(serie[0].mes);
    const hi = periodo.hasta ? mesKey(periodo.hasta) : Math.max(mesKey(serie[serie.length - 1].mes), mesKey(hoyMes()));
    return [lo, hi];
  }, [filtroPeriodo, periodo, serie]);
  const { filas: data, proyectado, conMargen, conCantidad: hayCant, conPresupuesto } = useMemo(() => armarFilas(serie, proyectar, new Date(), range, presupuesto), [serie, proyectar, range, presupuesto]);
  const conPto = !!conPresupuesto;
  const conCantidad = cantidad && hayCant;
  const filtro = filtroPeriodo && (
    <div className="mb-2"><MonthRangeFilter desde={periodo.desde} hasta={periodo.hasta} onChange={setPeriodo} label="Periodo" /></div>
  );
  if (!data.length) return <div>{filtro}<p className="text-sm text-text-muted">Sin datos para graficar.</p></div>;
  const palette = categorical();
  const gridColor = CHART_UI.grid;
  const colores = [palette[0], palette[1] ?? palette[0], palette[2] ?? palette[1] ?? palette[0], palette[7] ?? palette[3] ?? palette[0]];
  const hueco = (color: string) => ({ r: 4, strokeWidth: 2, stroke: color, fill: CHART_UI.surface });
  const maxImp = Math.max(0, ...data.flatMap((d) => [d.imp ?? 0, d.imp_proy ?? 0, d.margen ?? 0, d.margen_proy ?? 0, d.pto ?? 0]));
  const maxCant = Math.max(0, ...data.flatMap((d) => [d.cant ?? 0, d.cant_proy ?? 0]));
  return (
    <div>
      {filtro}
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
            onClick={(s: { activeLabel?: string | number }) => {
              if (!onMonth || s?.activeLabel == null) return;
              const pt = data.find((d) => d.label === String(s.activeLabel));
              if (pt) onMonth(pt.mes);
            }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="imp" tick={{ fontSize: 10 }} width={anchoEje([maxImp, maxImp / 2], tickMoneda)} tickFormatter={(v) => tickMoneda(Number(v))} />
            {conCantidad && (
              <YAxis yAxisId="cant" orientation="right" tick={{ fontSize: 10, fill: colores[1] }} stroke={colores[1]} width={anchoEje([maxCant, maxCant / 2], tickCantidad)} tickFormatter={(v) => tickCantidad(Number(v))} />
            )}
            <Tooltip
              content={<TooltipEvol conMargen={conMargen} conCantidad={conCantidad} conPto={conPto} colores={colores} />}
              cursor={{ stroke: gridColor }}
              // El cuadro es más alto que la gráfica: puede salir por abajo/arriba (sin recortarse) y va por encima de la leyenda de colores, que se dibuja después.
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ zIndex: 40, pointerEvents: 'none' }}
            />
            {(conMargen || conCantidad || conPto) && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {conPto && <Line yAxisId="imp" type="monotone" dataKey="pto" name="Presupuesto" stroke={colores[3]} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} connectNulls isAnimationActive={false} />}
            <Line yAxisId="imp" type="monotone" dataKey="imp" name="Importe" stroke={colores[0]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            {proyectado && (
              <Line yAxisId="imp" type="monotone" dataKey="imp_proy" name="Importe proyectado" stroke={colores[0]} strokeWidth={2} strokeOpacity={OPACIDAD_PROYECCION} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} connectNulls legendType="none" isAnimationActive={false} />
            )}
            {proyectado && (
              <Line yAxisId="imp" type="monotone" dataKey="imp_acum" name="Importe a la fecha" stroke="none" dot={hueco(colores[0])} activeDot={false} legendType="none" isAnimationActive={false} />
            )}
            {conCantidad && (
              <Line yAxisId="cant" type="monotone" dataKey="cant" name="Cantidad" stroke={colores[1]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            )}
            {conCantidad && proyectado && (
              <Line yAxisId="cant" type="monotone" dataKey="cant_proy" name="Cantidad proyectada" stroke={colores[1]} strokeWidth={2} strokeOpacity={OPACIDAD_PROYECCION} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} connectNulls legendType="none" isAnimationActive={false} />
            )}
            {conCantidad && proyectado && (
              <Line yAxisId="cant" type="monotone" dataKey="cant_acum" name="Cantidad a la fecha" stroke="none" dot={hueco(colores[1])} activeDot={false} legendType="none" isAnimationActive={false} />
            )}
            {conMargen && (
              <Line yAxisId="imp" type="monotone" dataKey="margen" name="Rendimiento aprox." stroke={colores[2]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            )}
            {conMargen && proyectado && (
              <Line yAxisId="imp" type="monotone" dataKey="margen_proy" name="Rendimiento proyectado" stroke={colores[2]} strokeWidth={2} strokeOpacity={OPACIDAD_PROYECCION} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} connectNulls legendType="none" isAnimationActive={false} />
            )}
            {conMargen && proyectado && (
              <Line yAxisId="imp" type="monotone" dataKey="margen_acum" name="Rendimiento a la fecha" stroke="none" dot={hueco(colores[2])} activeDot={false} legendType="none" isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
