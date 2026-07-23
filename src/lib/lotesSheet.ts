import type { InvDetalleRow } from '@/core/types';
import { formatFechaCaducidad } from '@/lib/utils';

const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();

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
): Record<string, unknown>[] {
  return lotes
    .filter(incluir)
    .sort((a, b) =>
      norm(a.material).localeCompare(norm(b.material)) ||
      norm(a.centro).localeCompare(norm(b.centro)) ||
      norm(a.fechaCaducidad).localeCompare(norm(b.fechaCaducidad)))
    .map((l) => ({
      Material: l.material,
      Descripción: l.textoBreve,
      Centro: l.centro,
      Almacén: l.almacen,
      Lote: l.lote,
      Caducidad: formatFechaCaducidad(l.fechaCaducidad),
      Cantidad: l.cantidadDisp,
      'Precio lote': l.precioOferta && l.precioOferta > 0 ? l.precioOferta : '',
    }));
}
