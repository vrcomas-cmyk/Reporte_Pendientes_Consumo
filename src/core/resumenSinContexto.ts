// ---------------------------------------------------------------------------
// resumenSinContexto.ts · Agregados de contexto para la parte superior de
// "Resumen Sin" (Inventario): salud de cobertura, balance por centro y
// rankings críticos. Puro — recibe los materiales YA filtrados por la página.
// ---------------------------------------------------------------------------
import { invGen, peorCobertura, quiebreMitigadoPorTransito, type CoberturaEstado, type RSSMaterial } from './resumenSin';

export const ORDEN_COBERTURA: CoberturaEstado[] = ['quiebre', 'inmovilizado', 'exceso', 'aceptable', 'sano', 'sinDatos'];

export interface ContextoEstado { estado: CoberturaEstado; count: number; impPend: number }
export interface ContextoCentro { centro: string; inv: number; pend: number; transito: number; quiebre: number; exceso: number }
export interface ContextoRank { code: string; desc: string; val: number; valSub?: number }
export interface ContextoResumen {
  totales: { materiales: number; inv: number; pend: number; transito: number; impPend: number };
  /** Pares (material, centro) clasificados — el 1031 (hub) no entra. */
  pares: number;
  estados: ContextoEstado[];
  quiebreUrgente: number;
  quiebreMitigado: number;
  /** Importe pendiente de los pares en quiebre SIN tránsito en camino. */
  impPendQuiebreUrgente: number;
  porCentro: ContextoCentro[];
  /** Materiales con más importe pendiente en quiebre urgente (valSub = centros afectados). */
  topQuiebre: ContextoRank[];
  /** Sectores con más pares en quiebre urgente. */
  sectoresQuiebre: ContextoRank[];
}

export function computeContexto(list: RSSMaterial[], sectorDe: (material: string) => string, topN = 10): ContextoResumen {
  const totales = { materiales: list.length, inv: 0, pend: 0, transito: 0, impPend: 0 };
  const est = new Map<CoberturaEstado, ContextoEstado>(ORDEN_COBERTURA.map((e) => [e, { estado: e, count: 0, impPend: 0 }]));
  const centros = new Map<string, ContextoCentro>();
  const topMat = new Map<string, ContextoRank & { centros: number }>();
  const sect = new Map<string, number>();
  let pares = 0, quiebreUrgente = 0, quiebreMitigado = 0, impPendQuiebreUrgente = 0;

  for (const mo of list) {
    for (const [c, co] of mo.centros) {
      const inv = invGen(co);
      totales.inv += inv; totales.pend += co.pend; totales.transito += co.transito; totales.impPend += co.impPend;
      let cc = centros.get(c);
      if (!cc) { cc = { centro: c, inv: 0, pend: 0, transito: 0, quiebre: 0, exceso: 0 }; centros.set(c, cc); }
      cc.inv += inv; cc.pend += co.pend; cc.transito += co.transito;

      const estado = peorCobertura(co);
      if (!estado) continue;
      pares++;
      const e = est.get(estado)!;
      e.count++; e.impPend += co.impPend;
      if (estado === 'exceso') cc.exceso++;
      if (estado !== 'quiebre') continue;
      cc.quiebre++;
      if (quiebreMitigadoPorTransito(estado, co)) { quiebreMitigado++; continue; }
      quiebreUrgente++;
      impPendQuiebreUrgente += co.impPend;
      const t = topMat.get(mo.material) ?? { code: mo.material, desc: mo.desc, val: 0, centros: 0 };
      t.val += co.impPend; t.centros++;
      topMat.set(mo.material, t);
      const s = sectorDe(mo.material) || 'Sin sector';
      sect.set(s, (sect.get(s) ?? 0) + 1);
    }
  }
  return {
    totales, pares,
    estados: ORDEN_COBERTURA.map((k) => est.get(k)!),
    quiebreUrgente, quiebreMitigado, impPendQuiebreUrgente,
    porCentro: [...centros.values()].sort((a, b) => a.centro.localeCompare(b.centro)),
    topQuiebre: [...topMat.values()].sort((a, b) => b.val - a.val).slice(0, topN).map((t) => ({ code: t.code, desc: t.desc, val: t.val, valSub: t.centros })),
    sectoresQuiebre: [...sect.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([s, n]) => ({ code: s, desc: s, val: n })),
  };
}
