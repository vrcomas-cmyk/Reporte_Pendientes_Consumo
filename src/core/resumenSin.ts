// ---------------------------------------------------------------------------
// resumenSin.ts · Pivot Material (rows) x Centro (cols) for "Resumen Sin
// Sugerencias". Pure port of buildRSS()/esLento() from legacy js/resumenSin.js.
// Each cell = general inventory of a center (warehouses 1030+1031+1060).
// ---------------------------------------------------------------------------
import type { ResumenSinSugerenciaRow } from './types';
import { mesKey } from './resumenFac';

const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
const num = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

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
export function esLento(co: RSSCentro | undefined, curMes: number): boolean {
  if (!co) return false;
  // Centro 1031 is the supply/distribution hub and rarely has direct invoicing;
  // "no movement >= 6 months" is a false positive there, so suppress the flag.
  if (co.centro === '1031') return false;
  if (invGen(co) <= 0 || co.pend > 0) return false;
  if (!co.ultMesK) return true;
  return curMes - co.ultMesK >= MESES_LENTO;
}

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
