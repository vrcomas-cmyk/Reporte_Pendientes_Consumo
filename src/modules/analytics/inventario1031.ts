import { norm } from './helpers';
import type { Analytics } from './AnalyticsContext';

export interface PuntoSolicitar { titulo: string; centro: string; almacen: string; cantidad: number; nota?: string }

/** Inventario de un almacén del Centro 1031 para un material — ÚNICA fuente de
 * "Inventario principales" y de "Solicitar desde inventario" en todos los
 * módulos. Orden: Resumen Sin (`invAlm` del centro 1031) → "Disponible
 * 1031-1030/1032" de Inv Condición/catálogo → suma de lotes (InvDetalle) del
 * centro 1031 y ese almacén. */
export function invAlmacen1031(a: Analytics, material: string, alm: string): number {
  const mat = norm(material);
  const co = a.rss?.mats.get(mat)?.centros.get('1031');
  if (co) return co.invAlm[alm] || 0;
  let filas = a.invCondicion.filter((r) => norm(r.material) === mat);
  if (!filas.length) filas = a.invConsolidadoCatalog.filter((r) => norm(r.material) === mat);
  if (filas.length && (alm === '1030' || alm === '1032')) {
    return filas.reduce((s, r) => s + ((alm === '1030' ? r.disponible31_30 : r.disponible31_32) || 0), 0);
  }
  return a.lotes
    .filter((l) => norm(l.material) === mat && norm(l.centro) === '1031' && norm(l.almacen) === alm)
    .reduce((s, l) => s + l.cantidadDisp, 0);
}

/** Puntos de "Solicitar desde inventario": Centro 1031 / Alm 1030 y 1032 (más
 * Centro 1018 para Suturas). `otros1018` = inventario del centro 1018. */
export function puntosSolicitarInventario(a: Analytics, material: string, otros1018 = 0): PuntoSolicitar[] {
  const esSuturas = a.enrich.matSector(material) === 'Suturas';
  return [
    { titulo: 'Centro 1031 / Alm 1030', centro: '1031', almacen: '1030', cantidad: invAlmacen1031(a, material, '1030') },
    { titulo: 'Centro 1031 / Alm 1032', centro: '1031', almacen: '1032', cantidad: invAlmacen1031(a, material, '1032'), nota: 'Corta caducidad' },
    ...(esSuturas ? [{ titulo: 'Centro 1018 (Suturas)', centro: '1018', almacen: '', cantidad: otros1018 }] : []),
  ];
}
