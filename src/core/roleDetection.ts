import type { SheetRole } from './types';

/** Normalizes a header string for signature matching: trims, collapses
 *  whitespace, drops accents/case. Adapted from the legacy `norm()` helper
 *  in js/utils.js of the previous app (not copied literally). */
export function normHeader(h: string): string {
  return String(h)
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Detects the "role" of a sheet by its header signature, the same idea as
 * the legacy `roleOf()` in js/data.js — reimplemented in TS with a role enum
 * and support for both the catalog workbook and the daily report workbook. */
export function roleOf(headers: string[]): SheetRole | null {
  const H = new Set(headers.map(normHeader));
  const has = (...cols: string[]) => cols.every((c) => H.has(normHeader(c)));

  if (has('Zona', 'Ejecutivo', 'Correo Electrónico')) return 'ejecutivos';
  if (has('Material', 'Texto breve de material', 'Condicion') && H.has(normHeader('Cajas por Pallet')))
    return 'materiales';
  if (has('Sector', 'Grupo', 'Condicion', 'Material', 'Inv Suma')) return 'invConsolidado';
  if (has('Material', 'Centro', 'Almacén', 'Lote', 'FechaCaducidad', 'CantidadDisp') && H.has(normHeader('Precio oferta')))
    return 'invDetalle';
  if (has('Material base', 'Fuente', 'Pedido')) return 'sugerencias';
  if (has('Cantidad_Pendiente', 'Suma inventario', 'Centro', 'Almacen')) return 'resumenSinSugerencias';
  if (has('Consumo_actual', 'Ultimo mes facturacion')) return 'reporteConsumo';
  if (has('Mes y año', 'Importe facturado', 'Material')) return 'resumenFac';
  if (has('Condicion', 'Material') && H.has(normHeader('Disponible 1031-1030')) && !H.has(normHeader('Inv Suma')))
    return 'inventarioCondicion';
  if (has('Material', 'Centro', 'Almacén', 'Lote', 'FechaCaducidad', 'CantidadDisp')) return 'lotesCortaCaducidad';
  return null;
}

export const ROLE_LABEL: Record<SheetRole, string> = {
  ejecutivos: 'Ejecutivos',
  materiales: 'Materiales',
  invConsolidado: 'Inventario Consolidado',
  invDetalle: 'Inventario Detalle',
  sugerencias: 'Todas las Sugerencias',
  resumenSinSugerencias: 'Resumen Sin Sugerencias',
  reporteConsumo: 'Reporte de Consumo',
  resumenFac: 'Resumen de Facturación',
  inventarioCondicion: 'Inventario por Condición',
  lotesCortaCaducidad: 'Detalle Lotes Corta Caducidad',
};
