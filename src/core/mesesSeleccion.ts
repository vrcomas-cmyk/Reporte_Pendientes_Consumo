// ---------------------------------------------------------------------------
// mesesSeleccion.ts · Selección de MESES para el filtro de periodo: un mes, un rango o periodos saltados
// (p. ej. "ene/2026-mar/2026, jul/2026"). Puro: se usa tanto al escribir el texto como al elegir en el calendario.
// Los meses se manejan como 'mm/aaaa' (igual que Resumen_Fac) y su orden numérico es `mesKey` (año*12+mes).
// ---------------------------------------------------------------------------
import { mesKey } from './resumenFac';

const ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
const MAX_MESES = 240;

export const ABREVIATURAS_MES: readonly string[] = ABR;

/** 'mm/aaaa' ← mesKey (año*12+mes). */
export const mesDeKey = (k: number): string => String(((k - 1) % 12) + 1).padStart(2, '0') + '/' + Math.floor((k - 1) / 12);

/** "oct/2026" ← '10/2026'. Texto que no es un mes se devuelve tal cual; vacío → ''. */
export function etiquetaMes(mm: string): string {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(String(mm ?? '').trim());
  if (!m) return String(mm ?? '').trim();
  const idx = Number(m[1]) - 1;
  return idx >= 0 && idx < 12 ? `${ABR[idx]}/${m[2]}` : String(mm).trim();
}

/** Un mes escrito: 'mm/aaaa', 'm/aaaa' o 'mmm/aaaa' (ene, feb… dic, también con punto o en mayúsculas) → mesKey, o null. */
export function parsearMes(texto: string): number | null {
  const t = String(texto ?? '').trim().toLowerCase().replace(/\./g, '');
  const m = /^([a-záéíóú]{3,4}|\d{1,2})\s*[/\-\s]\s*(\d{4})$/.exec(t);
  if (!m) return null;
  const mes = /^\d+$/.test(m[1]) ? Number(m[1]) : ABR.indexOf(m[1].slice(0, 3) as (typeof ABR)[number]) + 1;
  const anio = Number(m[2]);
  if (!(mes >= 1 && mes <= 12) || anio < 1990 || anio > 2100) return null;
  return anio * 12 + mes;
}

export interface MesesParseados {
  /** 'mm/aaaa' sin repetidos y en orden cronológico. */
  meses: string[];
  /** Fragmentos que no se pudieron leer. */
  errores: string[];
}

/** Lee lo que se escribe en el filtro: meses sueltos y rangos separados por coma o punto y coma.
 *  Rangos: "01/2026-03/2026", "ene/2026 a mar/2026" (también con – o —). Ej.: "ene/2026-mar/2026, 07/2026". */
export function parsearMeses(texto: string): MesesParseados {
  const claves = new Set<number>();
  const errores: string[] = [];
  for (const crudo of String(texto ?? '').split(/[,;]+/)) {
    const parte = crudo.trim();
    if (!parte) continue;
    const rango = /^(.+?)\s*(?:–|—|\ba\b|-(?=\s*(?:\d{1,2}|[a-zA-Záéíóú]{3,4})\s*[/\-\s.]\s*\d{4}$))\s*(.+)$/i.exec(parte);
    const [a, b] = rango ? [parsearMes(rango[1] ?? ''), parsearMes(rango[2] ?? '')] : [parsearMes(parte), null];
    if (a == null || (rango && b == null)) { errores.push(parte); continue; }
    const lo = b == null ? a : Math.min(a, b);
    const hi = b == null ? a : Math.max(a, b);
    if (hi - lo + 1 > MAX_MESES) { errores.push(parte); continue; }
    for (let k = lo; k <= hi; k++) claves.add(k);
  }
  return { meses: [...claves].sort((x, y) => x - y).map(mesDeKey), errores };
}

/** Texto compacto de una selección: rachas consecutivas como rango. ['01/2026','02/2026','03/2026','07/2026'] → "ene/2026–mar/2026, jul/2026". */
export function resumirMeses(meses: string[]): string {
  const ks = [...new Set(meses.map(mesKey).filter((k) => k > 0))].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < ks.length;) {
    let j = i;
    while (j + 1 < ks.length && ks[j + 1] === ks[j] + 1) j++;
    const ini = etiquetaMes(mesDeKey(ks[i]));
    partes.push(j === i ? ini : j === i + 1 ? `${ini}, ${etiquetaMes(mesDeKey(ks[j]))}` : `${ini}–${etiquetaMes(mesDeKey(ks[j]))}`);
    i = j + 1;
  }
  return partes.join(', ');
}

/** Mismos meses, únicos y en orden cronológico. */
export function normalizarMeses(meses: string[]): string[] {
  return [...new Set(meses.map(mesKey).filter((k) => k > 0))].sort((a, b) => a - b).map(mesDeKey);
}
