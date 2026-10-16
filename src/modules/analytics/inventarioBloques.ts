import { CENTERS } from '@/core/types';
import { invGen } from '@/core/resumenSin';
import { norm } from './helpers';
import { invAlmacen1031 } from './inventario1031';
import { detalle12Cerrados, ayudaPromedio12 } from './promedio12';
import type { Analytics } from './AnalyticsContext';

export const ALMACENES_PRINCIPALES = ['1030', '1031', '1032', '1060'] as const;

export interface BloqueInv {
  clave: string; etiqueta: string; cantidad: number; transito?: number;
  /** Solo "Otros centros": consumo promedio mensual (12 meses cerrados) de los almacenes 1030+1031+1060 de ese centro, y su ayuda. */
  promedio?: number; ayudaPromedio?: string;
}

export interface InventarioBloques {
  /** Centro cuyo inventario se muestra en "Principales". */
  centro: string;
  /** 1) Almacenes 1030/1031/1032/1060 del centro que se revisa. */
  principales: BloqueInv[];
  /** 2) Otros centros: cada uno con sus almacenes 1030+1031+1060 sumados (sin el centro revisado). */
  otrosCentros: BloqueInv[];
  /** 3) Centro 1031 · almacén 1030 y 1032. */
  centro1031: BloqueInv[];
}

/** Inventario de un almacén de un centro: Resumen Sin (`invAlm`) o, si no hay, la suma de lotes (InvDetalle). */
function invAlmacenCentro(a: Analytics, material: string, centro: string, alm: string): number {
  const mat = norm(material);
  const co = a.rss?.mats.get(mat)?.centros.get(norm(centro));
  if (co) return co.invAlm[alm] || 0;
  if (norm(centro) === '1031') return invAlmacen1031(a, material, alm);
  return a.lotes
    .filter((l) => norm(l.material) === mat && norm(l.centro) === norm(centro) && norm(l.almacen) === alm)
    .reduce((s, l) => s + l.cantidadDisp, 0);
}

/** Las tres vistas de inventario de UN material que se muestran siempre igual en los detalles.
 * `centro` = centro del cliente/pedido/celda que se está revisando (por defecto 1031).
 * `centrosPermitidos` (filtro "Considerar centros") acota solo "Otros centros". */
export function inventarioBloques(a: Analytics, material: string, centro = '1031', centrosPermitidos: readonly string[] = []): InventarioBloques {
  const mat = norm(material);
  const mo = a.rss?.mats.get(mat);
  let filas = a.invCondicion.filter((r) => norm(r.material) === mat);
  if (!filas.length) filas = a.invConsolidadoCatalog.filter((r) => norm(r.material) === mat);
  const principales = ALMACENES_PRINCIPALES.map((alm) => ({ clave: alm, etiqueta: `Alm ${alm}`, cantidad: invAlmacenCentro(a, material, centro, alm) }));
  // El 1031 no es columna de CENTERS: entra como "otro centro" cuando el revisado es otro.
  const otrosCentros = [...CENTERS, '1031' as string]
    .filter((c) => norm(c) !== norm(centro) && (!centrosPermitidos.length || centrosPermitidos.includes(c)))
    .map((c) => {
      const co = mo?.centros.get(c);
      const cantidad = mo ? invGen(co) : filas.reduce((s, r) => s + (r.invByCenter[c] || 0), 0);
      const transito = mo ? co?.transito || 0 : filas.reduce((s, r) => s + (r.transitoByCenter?.[c] || 0), 0);
      // Promedio de 12 meses cerrados de los mismos almacenes que suman la cantidad (1030+1031+1060).
      const proms = ['1030', '1031', '1060'].map((alm) => detalle12Cerrados(a, material, c, alm));
      const promedio = proms.reduce((s, p) => s + p.promedio, 0);
      return { clave: c, etiqueta: `Centro ${c}`, cantidad, transito, promedio, ayudaPromedio: ayudaPromedio12(proms[0]) + ' · suma de los almacenes 1030+1031+1060' };
    });
  const centro1031 = (['1030', '1032'] as const).map((alm) => ({ clave: alm, etiqueta: `1031 · Alm ${alm}`, cantidad: invAlmacen1031(a, material, alm) }));
  return { centro, principales, otrosCentros, centro1031 };
}
