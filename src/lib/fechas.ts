// Fecha sortable/comparable a partir de texto crudo del Sheet — nunca se
// normaliza al importar, así que esto prueba las formas que de hecho llegan
// (dd/mm/yyyy, mm/yyyy, yyyy-mm-dd…) antes de caer a Date.parse y finalmente
// "no parseable ordena primero". Compartido por el ordenamiento de fecha de
// Consumo y por el filtro de periodo (`enRango`) de Consumo/Pedidos/Solicitudes.
export function dateSortValue(s: string): number {
  if (!s) return -Infinity;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]).getTime();
  const my = /^(\d{1,2})[/-](\d{4})$/.exec(s);
  if (my) return new Date(+my[2], +my[1] - 1, 1).getTime();
  const t = Date.parse(s);
  return Number.isNaN(t) ? -Infinity : t;
}

/** true si `valor` (texto crudo, cualquiera de las formas de arriba) cae
 * dentro de [desde, hasta] — límites en formato `yyyy-mm-dd` (lo que da un
 * <input type="date">), o '' si ese lado del rango no está fijado.
 * `mesCompleto`: cuando `valor` es un mes sin día (ej. "ultimoMesFacturacion"
 * de Consumo), compara contra el mes completo para que "hasta marzo" incluya
 * todo marzo, no solo el día 1.
 * Un valor no parseable (`dateSortValue` = -Infinity) siempre pasa el filtro
 * cuando hay un rango activo — sin esto, un formato raro del Sheet
 * desaparecería la fila del reporte sin aviso. */
/** "yyyy-mm-dd" (de un <input type="date">) -> misma escala que `mesKey` de
 * resumenFac.ts (año*12+mes), para acotar ventanas de agregación mensual
 * (series de facturación/consumo) al mismo rango que ya filtra las filas. */
export function isoToMesKey(iso: string): number | null {
  if (!iso) return null;
  const [y, m] = iso.split('-').map(Number);
  if (!y || !m) return null;
  return y * 12 + m;
}

export function enRango(valor: string, desde: string, hasta: string, mesCompleto = false): boolean {
  if (!desde && !hasta) return true;
  const t = dateSortValue(valor);
  if (t === -Infinity) return true;
  if (desde) {
    const d = new Date(desde);
    if (t < d.getTime()) return false;
  }
  if (hasta) {
    const h = new Date(hasta);
    if (mesCompleto) h.setMonth(h.getMonth() + 1);
    else h.setDate(h.getDate() + 1); // hasta es inclusivo
    if (t >= h.getTime()) return false;
  }
  return true;
}
