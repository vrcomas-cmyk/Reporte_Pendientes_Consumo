// ---------------------------------------------------------------------------
// resumenSin.ts · Pivot Material (rows) x Centro (cols) for "Resumen Sin
// Sugerencias". Pure port of buildRSS()/esLento() from legacy js/resumenSin.js.
// Each cell = general inventory of a center (warehouses 1030+1031+1060).
// ---------------------------------------------------------------------------
import type { ResumenSinSugerenciaRow } from './types';
import { norm, num } from '@/lib/text';
import { mesKey } from './resumenFac';

const RSS = {
  centro: 'Centro', alm: 'Almacen', pedidos: 'Pedidos', material: 'Material', desc: 'Descripcion',
  pend: 'Cantidad_Pendiente', impPend: 'Importe_Pendiente', prom: 'Promedio_Consumo_12M',
  ultMes: 'Ultimo_Mes_Consumo', cantUlt: 'Cantidad_Ultimo_Mes', penMes: 'Penultimo_Mes_Consumo', cantPen: 'Cantidad_Penultimo_Mes',
  meses: 'Meses_Inventario', inv1030: 'Inv 1030', inv1031: 'Inv 1031', inv1032: 'Inv 1032', inv1060: 'Inv 1060',
  transito: 'Cant. en Tránsito', disp1030: 'Disponible 1031-1030', disp1032: 'Disponible 1031-1032',
  sumaInv: 'Suma inventario', sumaPend: 'Suma pendiente', status: 'Status Revisión', fuente: 'Fuente',
};
const ALM_INV: Record<string, '1030' | '1031' | '1032' | '1060'> = { '1030': '1030', '1031': '1031', '1032': '1032', '1060': '1060' };

export interface RSSAlmacen {
  alm: string; inv: number; pend: number; transito: number; impPend: number; prom: number;
  ultMes: string; cantUlt: number; penMes: string; cantPen: number; meses: number; status: string; fuente: string;
}
export interface RSSCentro {
  centro: string; invAlm: Record<string, number>; pend: number; transito: number; impPend: number;
  pedidos: number; ultMesK: number; status: Set<string>; alm: Map<string, RSSAlmacen>;
}
export interface RSSMaterial {
  material: string; desc: string; centros: Map<string, RSSCentro>; fuentes: Set<string>;
  disp1030: number; disp1032: number; sumaInv: number; sumaPend: number;
}
export interface RSSIndex {
  mats: Map<string, RSSMaterial>;
  centros: string[];
  curMes: number;
}

export const invGen = (co: RSSCentro | undefined): number =>
  co ? co.invAlm['1030'] + co.invAlm['1031'] + co.invAlm['1060'] : 0;

const MESES_LENTO = 6;

/** Centro 1031 es el hub de abasto/distribución (casi no factura directo,
 * distribuye a otros intercentros): "sin movimiento", "quiebre", "exceso" e
 * "inmovilizado" son falsos positivos ahí — se excluye de esos estados en
 * vez de intentar leerlos con las mismas reglas que un centro normal. */
export function esCentroDistribucion(centro: string): boolean {
  return centro === '1031';
}

export function esLento(co: RSSCentro | undefined, curMes: number): boolean {
  if (!co) return false;
  if (esCentroDistribucion(co.centro)) return false;
  if (invGen(co) <= 0 || co.pend > 0) return false;
  if (!co.ultMesK) return true;
  return curMes - co.ultMesK >= MESES_LENTO;
}

// ---------------------------------------------------------------------------
// Cobertura: clasifica cada almacén por `Meses_Inventario` (ya viene
// calculado en la hoja) contra el consumo/inventario que lo respaldan.
// Buckets mutuamente excluyentes (a diferencia de una comprobación
// independiente por condición, que podría marcar la misma fila como
// "exceso" Y "inmovilizado" a la vez) — para que un resumen por clase sume
// 100% del universo sin doble conteo.
// ---------------------------------------------------------------------------
export type CoberturaEstado = 'quiebre' | 'sano' | 'aceptable' | 'exceso' | 'inmovilizado' | 'sinDatos';

export interface CoberturaThresholds {
  /** Por debajo de esto (meses) es riesgo de quiebre. */
  quiebreMeses: number;
  /** Arriba de esto (meses) es exceso de inventario. */
  excesoMeses: number;
}
/** Sin persistir en Settings todavía (a diferencia de shortExpiryDays/
 * lowStockThreshold) — mismo patrón que MESES_LENTO arriba: constante de
 * módulo hasta que haya necesidad real de ajustarla por usuario. */
export const DEFAULT_COBERTURA_THRESHOLDS: CoberturaThresholds = { quiebreMeses: 1, excesoMeses: 12 };

/** Orden de urgencia operativa, del más al menos crítico — usado para
 * decidir el "peor" estado entre varios almacenes de un mismo centro. El
 * riesgo de quiebre (posible desabasto) pesa más que el capital
 * inmovilizado, que a su vez pesa más que el exceso simple. */
const SEVERIDAD: Record<CoberturaEstado, number> = {
  quiebre: 0, inmovilizado: 1, exceso: 2, aceptable: 3, sano: 4, sinDatos: 5,
};

export function coberturaEstado(
  meses: number,
  consumo: number,
  inventario: number,
  thresholds: CoberturaThresholds = DEFAULT_COBERTURA_THRESHOLDS,
): CoberturaEstado {
  if (consumo <= 0) return inventario > 0 ? 'inmovilizado' : 'sinDatos';
  if (meses < thresholds.quiebreMeses) return 'quiebre';
  if (meses <= 6) return 'sano';
  if (meses <= thresholds.excesoMeses) return 'aceptable';
  return 'exceso';
}

export function coberturaDeAlmacen(al: RSSAlmacen, thresholds?: CoberturaThresholds): CoberturaEstado {
  return coberturaEstado(al.meses, al.prom, al.inv, thresholds);
}

/** El estado más urgente entre los almacenes de un centro — un centro con
 * UN almacén en quiebre está en quiebre, aunque otro almacén del mismo
 * centro esté sano. `undefined` cuando el centro no tiene almacenes. */
export function peorCobertura(co: RSSCentro | undefined, thresholds?: CoberturaThresholds): CoberturaEstado | undefined {
  if (!co || !co.alm.size) return undefined;
  if (esCentroDistribucion(co.centro)) return undefined;
  let peor: CoberturaEstado | undefined;
  co.alm.forEach((al) => {
    const e = coberturaDeAlmacen(al, thresholds);
    if (!peor || SEVERIDAD[e] < SEVERIDAD[peor]) peor = e;
  });
  return peor;
}

export interface CoberturaSummaryEntry {
  estado: CoberturaEstado;
  count: number;
}
/** Conteo por clase — para las tarjetas de resumen de una vista. */
export function summarizeCobertura(estados: (CoberturaEstado | undefined)[]): CoberturaSummaryEntry[] {
  const orden: CoberturaEstado[] = ['quiebre', 'inmovilizado', 'exceso', 'aceptable', 'sano', 'sinDatos'];
  const counts = new Map<CoberturaEstado, number>();
  for (const e of estados) if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
  return orden.map((estado) => ({ estado, count: counts.get(estado) ?? 0 }));
}

/** Un quiebre con tránsito ya en camino a ESE centro no es tan urgente como
 * uno sin nada llegando — `Cant. en Tránsito` llega en la hoja y hoy se
 * ignora en la clasificación de cobertura. No cambia el `CoberturaEstado`
 * en sí (sigue siendo técnicamente "quiebre": el inventario en mano es bajo)
 * pero separa cuál necesita acción YA de cuál solo hay que monitorear. */
export function quiebreMitigadoPorTransito(estado: CoberturaEstado | undefined, co: RSSCentro | undefined): boolean {
  return estado === 'quiebre' && (co?.transito ?? 0) > 0;
}

export interface CoberturaSummaryConTransito {
  base: CoberturaSummaryEntry[];
  /** De los quiebres, cuántos ya tienen tránsito en camino (mitigados, monitorear) vs. no (urgentes, actuar ya). */
  quiebreUrgente: number;
  quiebreMitigado: number;
}
export function summarizeCoberturaConTransito(
  pares: { estado: CoberturaEstado | undefined; co: RSSCentro | undefined }[],
): CoberturaSummaryConTransito {
  const base = summarizeCobertura(pares.map((p) => p.estado));
  let quiebreMitigado = 0;
  for (const p of pares) if (quiebreMitigadoPorTransito(p.estado, p.co)) quiebreMitigado++;
  const totalQuiebre = base.find((s) => s.estado === 'quiebre')?.count ?? 0;
  return { base, quiebreUrgente: totalQuiebre - quiebreMitigado, quiebreMitigado };
}

/** Texto y color semántico (mismas clases que `StatePill`/`Estado.cls` en
 * `resumenFac.ts`: verde/rojo/amb/vio/gris) por estado de cobertura. */
export const COBERTURA_LABEL: Record<CoberturaEstado, string> = {
  quiebre: 'Quiebre', sano: 'Sano', aceptable: 'Aceptable', exceso: 'Exceso', inmovilizado: 'Inmovilizado', sinDatos: 'Sin datos',
};
export const COBERTURA_CLS: Record<CoberturaEstado, string> = {
  quiebre: 'rojo', sano: 'verde', aceptable: 'gris', exceso: 'amb', inmovilizado: 'vio', sinDatos: 'gris',
};

/** Definición corta de cada estado de cobertura, para tooltip en el badge de
 * celda, en las tarjetas de resumen y en la leyenda del filtro. */
export const COBERTURA_HELP: Record<CoberturaEstado, string> = {
  quiebre: `Cobertura menor a ${DEFAULT_COBERTURA_THRESHOLDS.quiebreMeses} mes(es): riesgo de desabasto con el consumo actual.`,
  sano: 'Cobertura entre 1 y 6 meses de consumo: nivel saludable.',
  aceptable: `Cobertura entre 6 y ${DEFAULT_COBERTURA_THRESHOLDS.excesoMeses} meses: por encima de lo ideal, sin ser exceso.`,
  exceso: `Cobertura mayor a ${DEFAULT_COBERTURA_THRESHOLDS.excesoMeses} meses: capital inmovilizado por exceso de inventario.`,
  inmovilizado: 'Hay inventario pero sin consumo registrado: no rota.',
  sinDatos: 'Sin inventario ni consumo suficiente para clasificar.',
};
/** Igual que arriba pero para el caso "quiebre mitigado" (`quiebreMitigadoPorTransito`), que en UI se etiqueta distinto ("Quiebre (en tránsito)"). */
export const COBERTURA_HELP_TRANSITO = 'Cobertura baja, pero ya hay mercancía en tránsito hacia este centro: monitorear, no es tan urgente como un quiebre sin nada en camino.';

export function buildRSS(rows: ResumenSinSugerenciaRow[]): RSSIndex {
  const mats = new Map<string, RSSMaterial>();
  const centros = new Set<string>();
  let curMes = 0;
  for (const row of rows) {
    const r = row.raw;
    if (!r) continue;
    const m = norm(r[RSS.material]);
    if (!m) continue;
    const c = norm(r[RSS.centro]);
    const a = norm(r[RSS.alm]);
    centros.add(c);
    const uk = mesKey(norm(r[RSS.ultMes]));
    if (uk > curMes) curMes = uk;
    let mo = mats.get(m);
    if (!mo) {
      mo = {
        material: m, desc: norm(r[RSS.desc]), centros: new Map(), fuentes: new Set(),
        disp1030: num(r[RSS.disp1030]), disp1032: num(r[RSS.disp1032]),
        sumaInv: num(r[RSS.sumaInv]), sumaPend: num(r[RSS.sumaPend]),
      };
      mats.set(m, mo);
    }
    if (norm(r[RSS.fuente])) mo.fuentes.add(norm(r[RSS.fuente]));
    let co = mo.centros.get(c);
    if (!co) {
      co = {
        centro: c,
        invAlm: { '1030': num(r[RSS.inv1030]), '1031': num(r[RSS.inv1031]), '1032': num(r[RSS.inv1032]), '1060': num(r[RSS.inv1060]) },
        pend: 0, transito: 0, impPend: 0, pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map(),
      };
      mo.centros.set(c, co);
    }
    co.pend += num(r[RSS.pend]);
    co.transito += num(r[RSS.transito]);
    co.impPend += num(r[RSS.impPend]);
    co.pedidos = Math.max(co.pedidos, num(r[RSS.pedidos]));
    if (uk > co.ultMesK) co.ultMesK = uk;
    if (norm(r[RSS.status])) co.status.add(norm(r[RSS.status]));
    const invA = ALM_INV[a] ? co.invAlm[a] : 0;
    co.alm.set(a || '—', {
      alm: a || '—', inv: invA, pend: num(r[RSS.pend]), transito: num(r[RSS.transito]), impPend: num(r[RSS.impPend]),
      prom: num(r[RSS.prom]), ultMes: norm(r[RSS.ultMes]), cantUlt: num(r[RSS.cantUlt]),
      penMes: norm(r[RSS.penMes]), cantPen: num(r[RSS.cantPen]), meses: num(r[RSS.meses]),
      status: norm(r[RSS.status]), fuente: norm(r[RSS.fuente]),
    });
  }
  return { mats, centros: [...centros].filter(Boolean).sort(), curMes };
}
