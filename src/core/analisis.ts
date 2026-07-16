// ---------------------------------------------------------------------------
// analisis.ts · Commercial intelligence computed entirely from Resumen_Fac
// monthly series. Pure port of analisisVentas() from legacy js/analisis.js.
// ---------------------------------------------------------------------------
import { mesKey, mesAnterior, hoyMes, type RFIndex, type Serie } from './resumenFac';
import type { BOItem } from './buildBO';
import type { EnrichIndex } from './enrich';

const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();
const num = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

const refK = () => mesKey(mesAnterior(hoyMes()));
const sumRange = (serie: Serie, kIni: number, kFin: number) => {
  let t = 0;
  for (const s of serie || []) {
    const k = mesKey(s.mes);
    if (k >= kIni && k <= kFin) t += s.imp;
  }
  return t;
};
const lastBuyK = (serie: Serie) => {
  let mx = 0;
  for (const s of serie || []) if (s.imp > 0) { const k = mesKey(s.mes); if (k > mx) mx = k; }
  return mx;
};
const kToLbl = (k: number) => {
  const y = Math.floor((k - 1) / 12);
  const m = ((k - 1) % 12) + 1;
  return String(m).padStart(2, '0') + '/' + y;
};

export interface ClienteAna {
  code: string; razon: string; ejec: string; grupo: string;
  i12: number; a3: number; p3: number; last: number; compras: number; sinComprar: number; base?: number;
}
export interface MatAna { code: string; texto: string; a3: number; p3: number; i12: number; }
export interface SectorAna {
  sector: string; a3: number; p3: number; i12: number;
  grupos: Map<string, { grupo: string; a3: number; p3: number; i12: number }>;
}

export interface AnalisisResult {
  serieTotal: Serie;
  crecen: ClienteAna[];
  caen: ClienteAna[];
  riesgo: ClienteAna[];
  matSuben: MatAna[];
  matCaen: MatAna[];
  sectores: SectorAna[];
  conc: { top5: number; top10: number; total12: number; nClientes: number };
  ops: { total: number; conFuente: number; bloq: number; top: { pedido: string; razon: string; imp: number; mat: string }[] };
  kpi: { mesPrevImp: number; mesPrevAnt: number; qImp: number; qAnt: number; activos3m: number; refLbl: string };
}

export function analisisVentas(rf: RFIndex | null, bo: BOItem[], enrich: EnrichIndex): AnalisisResult | null {
  if (!rf) return null;
  const R = refK();
  const hoyK = mesKey(hoyMes());
  const a3 = (s: Serie) => sumRange(s, R - 2, R);
  const p3 = (s: Serie) => sumRange(s, R - 5, R - 3);
  const imp12 = (s: Serie) => sumRange(s, R - 11, R);

  const tot = new Map<number, { cant: number; imp: number }>();
  rf.mat.forEach((serie) =>
    serie.forEach((x) => {
      const k = mesKey(x.mes);
      const o = tot.get(k) || { cant: 0, imp: 0 };
      o.cant += x.cant;
      o.imp += x.imp;
      tot.set(k, o);
    }),
  );
  const serieTotal: Serie = [...tot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => ({ mes: kToLbl(k), cant: v.cant, imp: v.imp }));

  const ejecDe = (c: string) => enrich.ejecutivoNombre(rf.solicGpoV.get(c) || '') || '';
  const grupoDe = (c: string) => enrich.grupoCliente(rf.solicGpoC.get(c) || '') || (rf.solicGpoC.get(c) || '');
  const clientes: ClienteAna[] = [];
  rf.solic.forEach((serie, s) => {
    const i12 = imp12(serie);
    const last = lastBuyK(serie);
    if (!i12 && !last) return;
    const compras = (serie || []).filter((x) => x.imp > 0).length;
    clientes.push({
      code: s, razon: rf.solicRazon.get(s) || '', ejec: ejecDe(s), grupo: grupoDe(s),
      i12, a3: a3(serie), p3: p3(serie), last, compras, sinComprar: last ? hoyK - last : 999,
    });
  });
  const conBase = clientes.filter((c) => c.p3 > 0 || c.a3 > 0);
  const crecen = conBase.filter((c) => c.a3 > c.p3 * 1.15).sort((a, b) => b.a3 - b.p3 - (a.a3 - a.p3)).slice(0, 12);
  const caen = conBase.filter((c) => c.p3 > 0 && c.a3 < c.p3 * 0.85).sort((a, b) => b.p3 - b.a3 - (a.p3 - a.a3)).slice(0, 12);
  const riesgo = clientes
    .filter((c) => c.compras >= 3 && c.sinComprar >= 3 && c.sinComprar <= 24)
    .map((c) => ({ ...c, base: sumRange(rf.solic.get(c.code) || [], c.last - 11, c.last) }))
    .sort((a, b) => (b.base || 0) - (a.base || 0))
    .slice(0, 12);

  const mats: MatAna[] = [];
  rf.mat.forEach((serie, m) => {
    const A = a3(serie);
    const P = p3(serie);
    if (A || P) mats.push({ code: m, texto: rf.matTexto.get(m) || '', a3: A, p3: P, i12: imp12(serie) });
  });
  const matSuben = mats.filter((x) => x.a3 > x.p3 * 1.15).sort((a, b) => b.a3 - b.p3 - (a.a3 - a.p3)).slice(0, 12);
  const matCaen = mats.filter((x) => x.p3 > 0 && x.a3 < x.p3 * 0.85).sort((a, b) => b.p3 - b.a3 - (a.p3 - a.a3)).slice(0, 12);

  const secMap = new Map<string, SectorAna>();
  rf.mat.forEach((serie, m) => {
    const A = a3(serie);
    const P = p3(serie);
    const I = imp12(serie);
    if (!A && !P && !I) return;
    const sec = enrich.matSector(m) || '(sin sector)';
    const gru = enrich.matGrupo(m) || '(sin grupo)';
    let so = secMap.get(sec);
    if (!so) {
      so = { sector: sec, a3: 0, p3: 0, i12: 0, grupos: new Map() };
      secMap.set(sec, so);
    }
    so.a3 += A;
    so.p3 += P;
    so.i12 += I;
    let go = so.grupos.get(gru);
    if (!go) {
      go = { grupo: gru, a3: 0, p3: 0, i12: 0 };
      so.grupos.set(gru, go);
    }
    go.a3 += A;
    go.p3 += P;
    go.i12 += I;
  });
  const sectores = [...secMap.values()].filter((s) => s.i12 > 0).sort((a, b) => b.i12 - a.i12);

  const ordered = clientes.filter((c) => c.i12 > 0).sort((a, b) => b.i12 - a.i12);
  const total12 = ordered.reduce((a, c) => a + c.i12, 0);
  const share = (n: number) => (total12 ? ordered.slice(0, n).reduce((a, c) => a + c.i12, 0) / total12 : 0);

  let opTotal = 0;
  let opConFuente = 0;
  let opBloq = 0;
  const opTop: { pedido: string; razon: string; imp: number; mat: string }[] = [];
  bo.forEach((it) => {
    const b = it.bo;
    const impPend = num(b.cantidadPendiente) * num(b.precio);
    opTotal += impPend;
    if (norm(b.bloqueado)) opBloq += impPend;
    if (it.fuentes && it.fuentes.length) {
      opConFuente += impPend;
      opTop.push({ pedido: norm(b.pedido), razon: norm(b.razonSocial), imp: impPend, mat: norm(b.materialBase) });
    }
  });
  opTop.sort((a, b) => b.imp - a.imp);

  const mesPrevImp = sumRange(serieTotal, R, R);
  const mesPrevAnt = sumRange(serieTotal, R - 12, R - 12);
  const q0 = Math.floor(((hoyK - 1) % 12) / 3) * 3 + 1 + Math.floor((hoyK - 1) / 12) * 12;
  const qImp = sumRange(serieTotal, q0, hoyK);
  const qAnt = sumRange(serieTotal, q0 - 12, hoyK - 12);
  const activos3m = clientes.filter((c) => c.sinComprar <= 3).length;

  return {
    serieTotal, crecen, caen, riesgo, matSuben, matCaen, sectores,
    conc: { top5: share(5), top10: share(10), total12, nClientes: ordered.length },
    ops: { total: opTotal, conFuente: opConFuente, bloq: opBloq, top: opTop.slice(0, 10) },
    kpi: { mesPrevImp, mesPrevAnt, qImp, qAnt, activos3m, refLbl: mesAnterior(hoyMes()) },
  };
}
