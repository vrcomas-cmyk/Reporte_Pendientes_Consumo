import type { InvDetalleRow } from '@/core/types';
import { formatFechaCaducidad } from '@/lib/utils';
import { norm } from '@/lib/text';

/** Key for matching a lote against a (material, centro) pair of an exported table. */
export const loteKey = (material: string, centro: string) => `${norm(material)}||${norm(centro)}`;

/**
 * Construye las filas de la hoja "Detalle Lotes" que acompaña a una exportación.
 * `incluir` decide qué lotes entran (por material, o por material+centro cuando
 * la tabla exportada distingue centros). Devuelve [] si no hay lotes que agregar,
 * caso en que la hoja simplemente no se añade al libro.
 */
export function buildLotesSheet(
  lotes: InvDetalleRow[],
  incluir: (l: InvDetalleRow) => boolean,
  /** Precio de respaldo cuando el lote no trae `precioOferta` (p. ej. el precio autorizado de su condición). */
  precioDe?: (l: InvDetalleRow) => number,
): Record<string, unknown>[] {
  return lotes
    .filter(incluir)
    .sort((a, b) =>
      norm(a.material).localeCompare(norm(b.material)) ||
      norm(a.centro).localeCompare(norm(b.centro)) ||
      norm(a.fechaCaducidad).localeCompare(norm(b.fechaCaducidad)))
    .map((l) => {
      const precio = l.precioOferta && l.precioOferta > 0 ? l.precioOferta : (precioDe?.(l) ?? 0);
      return {
      Material: l.material,
      Descripción: l.textoBreve,
      Centro: l.centro,
      Almacén: l.almacen,
      Lote: l.lote,
      Caducidad: formatFechaCaducidad(l.fechaCaducidad),
      Cantidad: l.cantidadDisp,
      'Precio lote': precio > 0 ? precio : '',
      };
    });
}
