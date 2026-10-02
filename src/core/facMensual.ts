// ---------------------------------------------------------------------------
// facMensual.ts · Índice de la pestaña "Fac_Mensual_CAM" (facturación mensual
// por Centro/Almacén/Material) y promedio de consumo sobre un periodo elegido.
// Alimenta el "Promedio por periodo" del detalle de Inventario (Resumen Sin),
// donde el promedio de 12M del Sheet (`Promedio_Consumo_12M`) no es ajustable.
// ---------------------------------------------------------------------------
import type { FacMensualCamRow } from './types';
import { norm } from '@/lib/text';
import { mesKey, esMesValido } from './resumenFac';

/** material → centro → almacén → mesKey (año*12+mes) → cantidad facturada. */
export type FacMensualIndex = Map<string, Map<string, Map<string, Map<number, number>>>>;

export function buildFacMensual(rows: FacMensualCamRow[]): FacMensualIndex {
  const idx: FacMensualIndex = new Map();
  for (const r of rows) {
    if (!esMesValido(r.mesAno)) continue;
    const m = norm(r.material);
    if (!m) continue;
    const c = norm(r.centro);
    const a = norm(r.almacen);
    const k = mesKey(r.mesAno);
    let porCentro = idx.get(m);
    if (!porCentro) { porCentro = new Map(); idx.set(m, porCentro); }
    let porAlm = porCentro.get(c);
    if (!porAlm) { porAlm = new Map(); porCentro.set(c, porAlm); }
    let porMes = porAlm.get(a);
    if (!porMes) { porMes = new Map(); porAlm.set(a, porMes); }
    porMes.set(k, (porMes.get(k) ?? 0) + r.cantidad);
  }
  return idx;
}

export interface PromedioPeriodo {
  /** Cantidad facturada total dentro del rango. */
  total: number;
  /** Meses de CALENDARIO del rango (incluye meses sin facturación), el denominador. */
  meses: number;
  /** `total / meses`; 0 si el rango es inválido. */
  promedio: number;
  /** Meses del rango con alguna facturación — para avisar si el dato es escaso. */
  mesesConDato: number;
}

export interface FacMensualFiltro {
  material: string;
  /** Sin centro = todos los centros del material. */
  centro?: string;
  /** Sin almacén = todos los almacenes (del centro, si se dio). */
  almacen?: string;
}

const VACIO: PromedioPeriodo = { total: 0, meses: 0, promedio: 0, mesesConDato: 0 };

/** Promedio mensual de la cantidad facturada de un material (opcionalmente
 * acotado a centro y/o almacén) entre `desde` y `hasta` (ambos 'mm/aaaa',
 * inclusivos). Los meses del rango sin facturación cuentan como 0 en el
 * denominador — mismo criterio que el "Promedio / mes" de Consumo. */
export function promedioPeriodo(
  idx: FacMensualIndex | null,
  f: FacMensualFiltro,
  desde: string,
  hasta: string,
): PromedioPeriodo {
  const d = mesKey(desde);
  const h = mesKey(hasta);
  if (!idx || !d || !h || h < d) return VACIO;
  const meses = h - d + 1;
  const porCentro = idx.get(norm(f.material));
  const mesesFac = new Map<number, number>();
  if (porCentro) {
    const centro = f.centro ? norm(f.centro) : null;
    const almacen = f.almacen ? norm(f.almacen) : null;
    porCentro.forEach((porAlm, c) => {
      if (centro !== null && c !== centro) return;
      porAlm.forEach((porMes, a) => {
        if (almacen !== null && a !== almacen) return;
        porMes.forEach((cant, k) => {
          if (k >= d && k <= h) mesesFac.set(k, (mesesFac.get(k) ?? 0) + cant);
        });
      });
    });
  }
  let total = 0;
  mesesFac.forEach((v) => { total += v; });
  return { total, meses, promedio: total / meses, mesesConDato: mesesFac.size };
}

/** Inverso de `mesKey`: año*12+mes → 'mm/aaaa'. */
export function mesDeKey(k: number): string {
  const y = Math.floor((k - 1) / 12);
  const m = k - y * 12;
  return `${String(m).padStart(2, '0')}/${y}`;
}

/** Primer y último mes (como `mesKey`) con dato en todo el índice — para
 * avisar si el periodo elegido cae fuera de lo cargado. */
export function rangoDisponible(idx: FacMensualIndex | null): { min: number; max: number } | null {
  if (!idx) return null;
  let min = Infinity, max = -Infinity;
  idx.forEach((pc) => pc.forEach((pa) => pa.forEach((pm) => pm.forEach((_v, k) => {
    if (k < min) min = k;
    if (k > max) max = k;
  }))));
  return Number.isFinite(min) ? { min, max } : null;
}
