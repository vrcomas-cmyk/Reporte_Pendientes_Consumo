import { memo, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { completarSerie, mesLabel, mesKey, hoyMes, type Serie } from '@/core/resumenFac';
import { proyectarMesCorriente } from '@/core/proyeccion';
import { categorical, CHART_UI } from '@/lib/chartColors';

type Fila = {
  mes: string; label: string;
  imp: number | null; imp_proy?: number; imp_acum?: number;
  margen?: number | null; margen_proy?: number; margen_acum?: number;
};

/** Pasa a fila: si el mes es el corriente (parcial) y se puede proyectar, la
 * línea sólida se corta en el último mes cerrado y el mes corriente queda como
 * tramo punteado hacia la proyección + un punto hueco con lo facturado a la
 * fecha. Sin meses cerrados (o si todo vale 0) se deja como dato real. */
function armarFilas(serie: Serie, proyectar: boolean, hoy: Date): { filas: Fila[]; proyectado: boolean; conMargen: boolean } {
  const completa = completarSerie(serie);
  const conMargen = completa.some((p) => p.margen !== undefined);
  const filas: Fila[] = completa.map((p) => ({
    mes: p.mes, label: mesLabel(p.mes), imp: p.imp, ...(conMargen ? { margen: p.margen ?? 0 } : {}),
  }));
  if (!proyectar) return { filas, proyectado: false, conMargen };

  const curK = mesKey(hoyMes());
  const iCur = filas.findIndex((f) => mesKey(f.mes) === curK);
  // Solo hay "cerrados" si existe al menos un mes anterior con dato real.
  const previos = filas.slice(0, Math.max(iCur, 0));
  const iPrimero = previos.findIndex((f) => (f.imp ?? 0) > 0 || (f.margen ?? 0) > 0);
  if (iCur <= 0 || iPrimero < 0) return { filas, proyectado: false, conMargen };

  const cerrados = previos.slice(iPrimero);
  const pI = proyectarMesCorriente(cerrados.map((f) => f.imp ?? 0), filas[iCur].imp ?? 0, hoy);
  if (!pI || pI.proyectado <= 0) return { filas, proyectado: false, conMargen };

  const cur = filas[iCur];
  const ult = filas[iCur - 1];
  ult.imp_proy = ult.imp ?? 0;
  cur.imp_proy = pI.proyectado;
  cur.imp_acum = pI.acumulado;
  cur.imp = null;
  if (conMargen) {
    const pM = proyectarMesCorriente(cerrados.map((f) => f.margen ?? 0), cur.margen ?? 0, hoy);
    if (pM) {
      ult.margen_proy = ult.margen ?? 0;
      cur.margen_proy = pM.proyectado;
      cur.margen_acum = pM.acumulado;
      cur.margen = null;
    }
  }
  return { filas, proyectado: true, conMargen };
}

function TooltipEvol({ active, payload, conMargen, colores }: {
  active?: boolean;
  payload?: { payload?: Fila }[];
  conMargen: boolean;
  colores: string[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const proy = row.imp_proy !== undefined && row.imp === null;
  const fila = (nombre: string, color: string, real: number | null | undefined, proyectado: number | undefined, acum: number | undefined) => (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full" style={{ background: color }} />{nombre}</span>
      <span className="tabular-nums">
        {proy && proyectado !== undefined
          ? <>{formatCurrency(proyectado)} <span className="text-[10px] text-text-faint">proyectado</span></>
          : formatCurrency(real ?? 0)}
        {proy && acum !== undefined && <span className="ml-1.5 text-[10px] text-text-faint">· a la fecha {formatCurrency(acum)}</span>}
      </span>
    </div>
  );
  return (
    <div className="min-w-44 rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: CHART_UI.surface, borderColor: CHART_UI.border, color: CHART_UI.label }}>
      <p className="mb-1 font-display text-sm font-semibold">{row.label}</p>
      <div className="flex flex-col gap-1">
        {fila('Venta', colores[0], row.imp, row.imp_proy, row.imp_acum)}
        {conMargen && fila('Rendimiento aprox.', colores[1], row.margen, row.margen_proy, row.margen_acum)}
      </div>
      {proy && <p className="mt-1.5 border-t border-border/60 pt-1 text-[10px] text-text-faint">Mes en curso: cierre estimado con el ritmo del mes y el promedio de los últimos 3 meses.</p>}
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
export const EvolChart = memo(function EvolChart({ serie, onMonth, height = 220, proyectar = true }: {
  serie: Serie;
  onMonth?: (mes: string) => void;
  height?: number;
  proyectar?: boolean;
}) {
  const { filas: data, proyectado, conMargen } = useMemo(() => armarFilas(serie, proyectar, new Date()), [serie, proyectar]);
  if (!data.length) return <p className="text-sm text-text-muted">Sin datos para graficar.</p>;
  const palette = categorical();
  const gridColor = CHART_UI.grid;
  const colores = [palette[0], palette[1] ?? palette[0]];
  const hueco = (color: string) => ({ r: 4, strokeWidth: 2, stroke: color, fill: CHART_UI.surface });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          onClick={(s: { activeLabel?: string | number }) => {
            if (!onMonth || s?.activeLabel == null) return;
            const pt = data.find((d) => d.label === String(s.activeLabel));
            if (pt) onMonth(pt.mes);
          }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} width={54} tickFormatter={(v) => formatCurrency(Number(v))} />
          <Tooltip
            content={<TooltipEvol conMargen={conMargen} colores={colores} />}
            cursor={{ stroke: gridColor }}
          />
          {conMargen && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Line type="monotone" dataKey="imp" name="Venta" stroke={colores[0]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          {proyectado && (
            <Line type="monotone" dataKey="imp_proy" name="Venta proyectada" stroke={colores[0]} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} connectNulls legendType="none" isAnimationActive={false} />
          )}
          {proyectado && (
            <Line type="monotone" dataKey="imp_acum" name="Venta a la fecha" stroke="none" dot={hueco(colores[0])} activeDot={false} legendType="none" isAnimationActive={false} />
          )}
          {conMargen && (
            <Line type="monotone" dataKey="margen" name="Rendimiento aprox." stroke={colores[1]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          )}
          {conMargen && proyectado && (
            <Line type="monotone" dataKey="margen_proy" name="Rendimiento proyectado" stroke={colores[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} connectNulls legendType="none" isAnimationActive={false} />
          )}
          {conMargen && proyectado && (
            <Line type="monotone" dataKey="margen_acum" name="Rendimiento a la fecha" stroke="none" dot={hueco(colores[1])} activeDot={false} legendType="none" isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
