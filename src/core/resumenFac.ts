// ---------------------------------------------------------------------------
// resumenFac.ts · Monthly-invoicing indices + trend/state classification.
// Pure port of legacy js/resumenFac.js — no React, no DOM, no globals.
// All functions that depended on the legacy `store.CURMES`/`store.RF` globals
// now take an explicit RFIndex (which carries `curmes`).
// ---------------------------------------------------------------------------
import type { ResumenFacRow } from './types';
import { norm, num } from '@/lib/text';

/** "mm/aaaa" -> sortable key. */
export const mesKey = (m: unknown): number => {
  const x = norm(m).split('/');
  return x.length === 2 ? +x[1] * 12 + +x[0] : 0;
};

export interface SeriePoint {
  mes: string;
  cant: number;
  imp: number;
}
export type Serie = SeriePoint[];

export interface Estado {
  key: string;
  label: string;
  cls: string;
  pct: number;
  dias?: number;
}
export interface Tendencia {
  dir: 'up' | 'down' | 'flat';
  txt: string;
}

export interface RFIndex {
  matDest: Map<string, Serie>;
  solic: Map<string, Serie>;
  dest: Map<string, Serie>;
  mat: Map<string, Serie>;
  solicMats: Map<string, Map<string, Serie>>;
  destMats: Map<string, Map<string, Serie>>;
  matTexto: Map<string, string>;
  solicRazon: Map<string, string>;
  solicGpoV: Map<string, string>;
  solicGpoC: Map<string, string>;
  matMinYr: Map<string, number>;
  curmes: string;
  rows: ResumenFacRow[];
}

const RFC = {
  solic: 'solicitante',
  razon: 'razonSocial',
  dest: 'destinatario',
  material: 'material',
  texto: 'textoMaterial',
  mes: 'mesAno',
  cant: 'cantidadFacturada',
  imp: 'importeFacturado',
  centro: 'centro',
} as const;

/** Builds the monthly series indices from Resumen_Fac rows. */
export function buildRF(rows: ResumenFacRow[]): RFIndex {
  const matDest = new Map<string, Map<string, SeriePoint>>();
  const solic = new Map<string, Map<string, SeriePoint>>();
  const dest = new Map<string, Map<string, SeriePoint>>();
  const mat = new Map<string, Map<string, SeriePoint>>();
  const solicMats = new Map<string, Map<string, Map<string, SeriePoint>>>();
  const destMats = new Map<string, Map<string, Map<string, SeriePoint>>>();
  const matTexto = new Map<string, string>();
  const solicRazon = new Map<string, string>();
  const solicGpoV = new Map<string, string>();
  const solicGpoC = new Map<string, string>();
  const matMinYr = new Map<string, number>();
  let maxk = 0;
  let maxmes = '';

  const add = (m: Map<string, Map<string, SeriePoint>>, key: string, mes: string, c: number, i: number) => {
    if (!key) return;
    let mm = m.get(key);
    if (!mm) {
      mm = new Map();
      m.set(key, mm);
    }
    const cur = mm.get(mes) || { mes, cant: 0, imp: 0 };
    cur.cant += c;
    cur.imp += i;
    mm.set(mes, cur);
  };
  const add2 = (
    m: Map<string, Map<string, Map<string, SeriePoint>>>,
    k1: string,
    k2: string,
    mes: string,
    c: number,
    i: number,
  ) => {
    if (!k1) return;
    let inner = m.get(k1);
    if (!inner) {
      inner = new Map();
      m.set(k1, inner);
    }
    add(inner, k2, mes, c, i);
  };

  for (const r of rows) {
    const mes = norm(r[RFC.mes]);
    if (!mes) continue;
    const k = mesKey(mes);
    if (k > maxk) {
      maxk = k;
      maxmes = mes;
    }
  }
  const curYear = (maxmes.split('/')[1] || '').trim();

  for (const r of rows) {
    const mes = norm(r[RFC.mes]);
    if (!mes) continue;
    const c = num(r[RFC.cant]);
    const i = num(r[RFC.imp]);
    const d = norm(r[RFC.dest]);
    const s = norm(r[RFC.solic]);
    const m = norm(r[RFC.material]);
    add(matDest, d + '||' + m, mes, c, i);
    add(solic, s, mes, c, i);
    add(dest, d, mes, c, i);
    add(mat, m, mes, c, i);
    add2(solicMats, s, m, mes, c, i);
    add2(destMats, d, m, mes, c, i);
    if (m && !matTexto.has(m)) matTexto.set(m, norm(r[RFC.texto]));
    if (s && !solicRazon.has(s)) solicRazon.set(s, norm(r[RFC.razon]));
    if (s && !solicGpoV.has(s) && norm(r.gpoVdor)) solicGpoV.set(s, norm(r.gpoVdor));
    if (s && !solicGpoC.has(s) && norm(r.gpoCte)) solicGpoC.set(s, norm(r.gpoCte));
    if (m && c > 0 && (mes.split('/')[1] || '').trim() === curYear) {
      const u = i / c;
      const prev = matMinYr.get(m);
      if (u > 0 && (prev == null || u < prev)) matMinYr.set(m, u);
    }
  }

  const toSerie = (mm: Map<string, SeriePoint>): Serie =>
    [...mm.values()].sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
  const ser = (m: Map<string, Map<string, SeriePoint>>) => {
    const o = new Map<string, Serie>();
    m.forEach((mm, k) => o.set(k, toSerie(mm)));
    return o;
  };
  const ser2 = (m: Map<string, Map<string, Map<string, SeriePoint>>>) => {
    const o = new Map<string, Map<string, Serie>>();
    m.forEach((inner, k) => o.set(k, ser(inner)));
    return o;
  };

  return {
    matDest: ser(matDest),
    solic: ser(solic),
    dest: ser(dest),
    mat: ser(mat),
    solicMats: ser2(solicMats),
    destMats: ser2(destMats),
    matTexto,
    solicRazon,
    solicGpoV,
    solicGpoC,
    matMinYr,
    curmes: maxmes,
    rows,
  };
}

// ---- accessors --------------------------------------------------------------
export const serieMatDest = (rf: RFIndex | null, dest: unknown, mat: unknown): Serie =>
  rf ? rf.matDest.get(norm(dest) + '||' + norm(mat)) || [] : [];
export const serieSolic = (rf: RFIndex | null, s: unknown): Serie => (rf ? rf.solic.get(norm(s)) || [] : []);
export const serieDest = (rf: RFIndex | null, d: unknown): Serie => (rf ? rf.dest.get(norm(d)) || [] : []);
export const serieMaterial = (rf: RFIndex | null, m: unknown): Serie => (rf ? rf.mat.get(norm(m)) || [] : []);
export const precioMinAnioMaterial = (rf: RFIndex | null, m: unknown): number | null =>
  rf ? rf.matMinYr.get(norm(m)) ?? null : null;

// ---- date utilities ---------------------------------------------------------
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function hoyMes(): string {
  const d = new Date();
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
export function mesAnterior(refMes = hoyMes()): string {
  const k = mesKey(refMes) - 1;
  const yy = Math.floor((k - 1) / 12);
  const mm = ((k - 1) % 12) + 1;
  return String(mm).padStart(2, '0') + '/' + yy;
}
export function mesRefQAnterior(refMes = hoyMes()): string {
  const [cm, cy] = String(refMes).split('/').map(Number);
  const qStart = cy * 12 + (Math.floor((cm - 1) / 3) * 3 + 1);
  const k = qStart - 1;
  const yy = Math.floor((k - 1) / 12);
  const mm = ((k - 1) % 12) + 1;
  return String(mm).padStart(2, '0') + '/' + yy;
}
export function mesLabel(m: unknown): string {
  const p = String(m == null ? '' : m).split('/');
  if (p.length !== 2) return String(m || '');
  return (MESES[+p[0] - 1] || p[0]) + '/' + p[1];
}
/** date/"mm/aaaa"/"dd/mm/aaaa"/"yyyy-mm-dd" -> "mm/aaaa" */
export function aMesAnio(v: unknown): string {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return String(m[2]).padStart(2, '0') + '/' + y;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return String(m[2]).padStart(2, '0') + '/' + m[1];
  return '';
}

/** Fills missing months with zeros up to the current month (for full charts). */
export function completarSerie(serie: Serie, range?: [number, number]): Serie {
  const byMes = new Map((serie || []).map((s) => [s.mes, s]));
  let loK: number, hiK: number;
  if (range) {
    [loK, hiK] = range;
  } else {
    if (!serie || !serie.length) return serie || [];
    loK = mesKey(serie[0].mes);
    hiK = Math.max(mesKey(serie[serie.length - 1].mes), mesKey(hoyMes()));
  }
  if (!loK || !hiK || loK > hiK) return [];
  const out: Serie = [];
  let k = loK;
  let guard = 0;
  while (k <= hiK && guard++ < 600) {
    const yy = Math.floor((k - 1) / 12);
    const mm = ((k - 1) % 12) + 1;
    const mes = String(mm).padStart(2, '0') + '/' + yy;
    out.push(byMes.get(mes) || { mes, cant: 0, imp: 0 });
    k++;
  }
  return out;
}

// ---- trend / state ----------------------------------------------------------
function tendencia(serie: Serie): { dir: 'up' | 'down' | 'flat'; pct: number } {
  if (!serie || serie.length < 2) return { dir: 'flat', pct: 0 };
  const a = serie[serie.length - 2].imp;
  const b = serie[serie.length - 1].imp;
  if (a <= 0 && b <= 0) return { dir: 'flat', pct: 0 };
  const pct = a > 0 ? ((b - a) / a) * 100 : 100;
  if (pct >= 5) return { dir: 'up', pct };
  if (pct <= -5) return { dir: 'down', pct };
  return { dir: 'flat', pct };
}

export function diasDesdeUltimo(serie: Serie): number | null {
  if (!serie || !serie.length) return null;
  const [mm, yy] = String(serie[serie.length - 1].mes).split('/').map(Number);
  if (!mm || !yy) return null;
  const lastDay = new Date(yy, mm, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - lastDay.getTime()) / 86400000));
}

export const ESTADOS: [string, string][] = [
  ['nueva', 'Nueva compra'],
  ['corriente', 'Al corriente'],
  ['reactiva', 'Reactivación'],
  ['revisar', 'Revisar'],
  ['riesgo', 'En riesgo'],
  ['sinanio', 'Sin compra +1 año'],
  ['nada', 'Sin compra'],
];

/** Business state by real days since last purchase + quarter logic. */
export function clasificarEstado(serie: Serie | null, pedido = false, refMes = hoyMes()): Estado {
  const t = tendencia(serie || []);
  if (!serie || !serie.length)
    return pedido
      ? { key: 'nueva', label: 'Nueva compra', cls: 'vio', pct: 0 }
      : { key: 'nada', label: 'Sin compra', cls: 'gris', pct: 0 };
  const months = serie.map((s) => mesKey(s.mes)).filter(Boolean).sort((a, b) => a - b);
  const [cm, cy] = String(refMes).split('/').map(Number);
  const qStart = cy * 12 + (Math.floor((cm - 1) / 3) * 3 + 1);
  const qEnd = qStart + 2;
  const yearAgoQStart = qStart - 12;
  const billedCurQ = months.some((k) => k >= qStart && k <= qEnd);
  const before = months.filter((k) => k < qStart);

  if (billedCurQ && before.length === 0) return { key: 'nueva', label: 'Nueva compra', cls: 'vio', pct: t.pct };
  if (billedCurQ && before.length && Math.max(...before) < yearAgoQStart)
    return { key: 'reactiva', label: 'Reactivación', cls: 'vio', pct: t.pct };

  const dias = diasDesdeUltimo(serie) ?? 0;
  if (dias > 365) return { key: 'sinanio', label: 'Sin compra en más de un año', cls: 'gris', pct: t.pct, dias };
  if (dias > 150) return { key: 'riesgo', label: 'En riesgo', cls: 'rojo', pct: t.pct, dias };
  if (dias >= 90) return { key: 'revisar', label: 'Revisar', cls: 'amb', pct: t.pct, dias };
  return { key: 'corriente', label: 'Al corriente', cls: 'verde', pct: t.pct, dias };
}

export const TREND_MESES = 3;
/** Trend by period: avg of last N complete months vs the N previous. */
export function tendenciaTexto(serie: Serie, meses = TREND_MESES): Tendencia {
  if (!serie || !serie.length) return { dir: 'flat', txt: 'Sin datos' };
  const refK = mesKey(mesAnterior(hoyMes()));
  const valAt = (k: number) => {
    const f = serie.find((s) => mesKey(s.mes) === k);
    return f ? f.imp : 0;
  };
  let a = 0;
  let b = 0;
  for (let i = 0; i < meses; i++) {
    a += valAt(refK - i);
    b += valAt(refK - meses - i);
  }
  if (a === 0 && b === 0) return { dir: 'flat', txt: 'Sin movimiento' };
  if (b === 0) return { dir: 'up', txt: 'En aumento' };
  if (a === 0) return { dir: 'down', txt: 'En decremento' };
  const r = a / b;
  if (r > 1.1) return { dir: 'up', txt: 'En aumento' };
  if (r < 0.9) return { dir: 'down', txt: 'En decremento' };
  return { dir: 'flat', txt: 'Estable' };
}

export interface Comparativa {
  cm: number;
  cy: number;
  q: number;
  mesAct: SeriePoint;
  mesAnt: SeriePoint;
  mesPct: number;
  qAct: { cant: number; imp: number };
  qAnt: { cant: number; imp: number };
  qPct: number;
  mesActLbl: string;
  mesAntLbl: string;
}
/** Current month vs same month last year, and QTD vs same quarter last year. */
export function comparativa(serie: Serie, refMes = hoyMes()): Comparativa {
  const list = serie || [];
  const val = (mm: number, yy: number) => {
    const key = String(mm).padStart(2, '0') + '/' + yy;
    const f = list.find((s) => s.mes === key);
    return f ? { mes: key, cant: f.cant, imp: f.imp } : { mes: key, cant: 0, imp: 0 };
  };
  const [cm, cy] = String(refMes).split('/').map(Number);
  const q = Math.floor((cm - 1) / 3);
  const qMonths = [q * 3 + 1, q * 3 + 2, q * 3 + 3];
  const sumQ = (yy: number) =>
    qMonths.reduce(
      (a, mm) => {
        const v = val(mm, yy);
        return { cant: a.cant + v.cant, imp: a.imp + v.imp };
      },
      { cant: 0, imp: 0 },
    );
  const pct = (act: number, ant: number) => (ant > 0 ? ((act - ant) / ant) * 100 : act > 0 ? 100 : 0);
  const mesAct = val(cm, cy);
  const mesAnt = val(cm, cy - 1);
  const qAct = sumQ(cy);
  const qAnt = sumQ(cy - 1);
  return {
    cm,
    cy,
    q: q + 1,
    mesAct,
    mesAnt,
    mesPct: pct(mesAct.imp, mesAnt.imp),
    qAct,
    qAnt,
    qPct: pct(qAct.imp, qAnt.imp),
    mesActLbl: mesLabel(String(cm).padStart(2, '0') + '/' + cy),
    mesAntLbl: mesLabel(String(cm).padStart(2, '0') + '/' + (cy - 1)),
  };
}

export interface ConsumoInfo {
  tipo: 'nada' | 'actual' | 'previo';
  mes?: string;
  cant?: number;
  imp?: number;
  ultimo?: SeriePoint | null;
  penultimo?: SeriePoint | null;
  tnd: Estado;
}
/** Current-month consumption, or last + penultimate if none this month. */
export function consumoDe(serie: Serie, curmes: string): ConsumoInfo {
  const tnd = clasificarEstado(serie, false);
  if (!serie || !serie.length) return { tipo: 'nada', tnd };
  const cur = serie.find((s) => s.mes === curmes);
  if (cur && (cur.cant > 0 || cur.imp > 0)) return { tipo: 'actual', mes: curmes, cant: cur.cant, imp: cur.imp, tnd };
  return { tipo: 'previo', ultimo: serie[serie.length - 1], penultimo: serie[serie.length - 2] || null, tnd };
}

/** Materials invoiced to a solicitante/destinatario, with their trend. */
export function materialesDe(rf: RFIndex, kind: 'solic' | 'dest', key: string) {
  const map = kind === 'solic' ? rf.solicMats : rf.destMats;
  const inner = map.get(norm(key));
  if (!inner) return [];
  return [...inner.entries()]
    .map(([mat, serie]) => ({
      material: mat,
      texto: rf.matTexto.get(mat) || '',
      serie,
      ultimo: serie[serie.length - 1],
      tend: tendenciaTexto(serie),
      estado: clasificarEstado(serie, false),
    }))
    .sort((a, b) => (b.ultimo ? mesKey(b.ultimo.mes) : 0) - (a.ultimo ? mesKey(a.ultimo.mes) : 0));
}

/** Minimal 2-point series from a "Reporte de Consumo" row (fallback when there
 *  is no Resumen_Fac series for that dest+material). */
export function serieDeConsumo(
  r: Record<string, unknown>,
  RC: { penFecha: string; cantPen: string; impPen: string; ultMes: string; cantUlt: string; impUlt: string },
): Serie {
  const arr: Serie = [];
  const pm = aMesAnio(r[RC.penFecha]);
  if (pm) arr.push({ mes: pm, cant: num(r[RC.cantPen]), imp: num(r[RC.impPen]) });
  const um = aMesAnio(r[RC.ultMes]);
  if (um) arr.push({ mes: um, cant: num(r[RC.cantUlt]), imp: num(r[RC.impUlt]) });
  return arr.sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
}

/** Which clients invoiced a material in a given month (drill from a chart month). */
export function clientesPorMesMaterial(rf: RFIndex, material: string, mes: string) {
  const m = norm(material);
  const mk = mesKey(mes);
  const acc = new Map<string, { dest: string; solic: string; razon: string; centro: string; cant: number; imp: number }>();
  for (const r of rf.rows) {
    if (norm(r.material) !== m) continue;
    if (mesKey(norm(r.mesAno)) !== mk) continue;
    const d = norm(r.destinatario);
    let o = acc.get(d);
    if (!o) {
      o = { dest: d, solic: norm(r.solicitante), razon: norm(r.razonSocial), centro: norm(r.centro), cant: 0, imp: 0 };
      acc.set(d, o);
    }
    o.cant += num(r.cantidadFacturada);
    o.imp += num(r.importeFacturado);
  }
  return [...acc.values()].sort((a, b) => b.imp - a.imp);
}
