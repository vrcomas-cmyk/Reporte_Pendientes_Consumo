import type { SolicitudDRP } from '@/core/types';
import { formatFechaCaducidad } from '@/lib/utils';

/**
 * Single source of truth for the "DRP" Google Sheet's data columns: this is
 * what gets sent to Apps Script (drpService) and what the backup xlsx export
 * (SolicitudesPage) writes. Keys are the exact Sheet header names.
 *
 * "No. UD", "Delivery" and "Estatus" are intentionally NOT included — those
 * three are filled by formulas the other user maintains in the Sheet, and the
 * Apps Script `doPost` only overwrites the columns present in this object
 * (appendRow-by-header-name), leaving the rest blank for the formulas.
 */
export function toDrpRow(sol: SolicitudDRP): Record<string, unknown> {
  return {
    'Fecha solicitud': sol.fechaSolicitud.slice(0, 10),
    'Centro Origen': sol.centroOrigen,
    'Almacén Origen': sol.almacenOrigen,
    'Centro Destino': sol.centroDestino,
    'Almacén Destino': sol.almacenDestino,
    'Código': sol.codigo,
    'Descripción': sol.descripcion,
    Cantidad: sol.cantidad,
    UM: sol.um,
    Lote: sol.lote,
    'Fecha Caducidad': formatFechaCaducidad(sol.fechaCaducidad),
    Comentarios: sol.comentarios,
    Pedidos: sol.pedidos,
  };
}
