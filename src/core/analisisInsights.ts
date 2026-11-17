// ---------------------------------------------------------------------------
// analisisInsights.ts · «Lo que requiere atención»: hallazgos del Análisis redactados para quien decide, ordenados por gravedad. Puro: solo usa cifras que la
// página ya calcula (nada de modelos nuevos) y devuelve texto + tono; el color lo pone la interfaz junto con un ícono y la palabra, nunca solo el color.
// ---------------------------------------------------------------------------
import type { AnalisisResult } from './comercial';

export type TonoInsight = 'danger' | 'warning' | 'info' | 'success';
export interface Insight { tono: TonoInsight; titulo: string; detalle?: string }

export interface EntradaInsights {
  A: AnalisisResult;
  /** Presupuesto acumulado enero → último mes cerrado, ya filtrado como las ventas; null/0 si no hay presupuesto. */
  ptoYtd?: number | null;
  /** Materiales que caen y aún tienen inventario (riesgo de sobre-existencia). */
  matCaenConInventario?: number;
}

const mxn = (n: number): string => Math.abs(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const pct = (n: number): string => `${Math.abs(n * 100).toFixed(n !== 0 && Math.abs(n) < 0.1 ? 1 : 0)}%`;
const ORDEN: Record<TonoInsight, number> = { danger: 0, warning: 1, info: 2, success: 3 };

export function insightsAnalisis({ A, ptoYtd, matCaenConInventario = 0 }: EntradaInsights): Insight[] {
  const out: Insight[] = [];
  const { kpi, resumen, puente, conc } = A;

  // 1. Último mes cerrado contra el mismo mes del año anterior.
  if (kpi.mesPrevAnt > 0) {
    const v = kpi.mesPrevImp / kpi.mesPrevAnt - 1;
    if (v <= -0.1) out.push({ tono: 'danger', titulo: `Las ventas de ${kpi.refLbl} cayeron ${pct(v)} contra el año anterior`, detalle: `${mxn(kpi.mesPrevAnt - kpi.mesPrevImp)} menos que ${mxn(kpi.mesPrevAnt)}.` });
    else if (v >= 0.1) out.push({ tono: 'success', titulo: `Las ventas de ${kpi.refLbl} crecieron ${pct(v)} contra el año anterior`, detalle: `${mxn(kpi.mesPrevImp - kpi.mesPrevAnt)} más que ${mxn(kpi.mesPrevAnt)}.` });
  }

  // 2. Cumplimiento del presupuesto del año a la fecha.
  if (ptoYtd && ptoYtd > 0) {
    const c = kpi.ytdImp / ptoYtd;
    if (c < 0.9) out.push({ tono: 'danger', titulo: `Vas al ${pct(c)} del presupuesto del año a la fecha`, detalle: `Faltan ${mxn(ptoYtd - kpi.ytdImp)} para alcanzar ${mxn(ptoYtd)}.` });
    else if (c < 1) out.push({ tono: 'warning', titulo: `Vas al ${pct(c)} del presupuesto del año a la fecha`, detalle: `Faltan ${mxn(ptoYtd - kpi.ytdImp)} para alcanzar ${mxn(ptoYtd)}.` });
    else out.push({ tono: 'success', titulo: `Cumples el presupuesto del año a la fecha (${pct(c)})`, detalle: `${mxn(kpi.ytdImp - ptoYtd)} por encima de ${mxn(ptoYtd)}.` });
  }

  // 3. Qué explica el cambio de los últimos 3 meses.
  if (puente.base > 0 && Math.abs(puente.delta) / puente.base >= 0.05) {
    const piezas: [string, number][] = [['el volumen vendido', puente.volumen], ['el precio', puente.precio], ['clientes/materiales nuevos', puente.nuevos], ['materiales que dejaron de venderse', puente.perdidos]];
    const [nombre, valor] = piezas.reduce((m, p) => (Math.abs(p[1]) > Math.abs(m[1]) ? p : m));
    out.push({ tono: 'info', titulo: `El periodo ${kpi.periodo.desdeLbl} – ${kpi.periodo.hastaLbl} ${puente.delta < 0 ? 'bajó' : 'subió'} ${mxn(puente.delta)}: lo explica sobre todo ${nombre}`, detalle: `${nombre[0].toUpperCase()}${nombre.slice(1)}: ${valor < 0 ? '−' : '+'}${mxn(valor)}.` });
  }

  // 4. Clientes.
  if (resumen.riesgo.n > 0) out.push({ tono: 'warning', titulo: `${resumen.riesgo.n} clientes dejaron de comprar hace 3 meses o más`, detalle: `Facturaban ${mxn(resumen.riesgo.base)} en sus últimos 12 meses de compra.` });
  if (resumen.caen.n > 0 && resumen.caen.delta < 0) out.push({ tono: 'warning', titulo: `${resumen.caen.n} clientes compran menos`, detalle: `Restan ${mxn(resumen.caen.delta)} frente a la base de comparación.` });

  // 5. Concentración.
  if (conc.top5 >= 0.6) out.push({ tono: 'warning', titulo: `Dependes de pocos clientes: el top 5 es el ${pct(conc.top5)} de las ventas`, detalle: 'Perder uno solo movería el resultado.' });

  // 6. Materiales que caen con inventario.
  if (matCaenConInventario > 0) out.push({ tono: 'warning', titulo: `${matCaenConInventario} materiales caen en ventas y aún tienen inventario`, detalle: 'Riesgo de sobre-existencia: revisa su Inventario y Disponibilidad.' });

  return out.sort((a, b) => ORDEN[a.tono] - ORDEN[b.tono]).slice(0, 6);
}
