/** Orden de columnas elegido por el usuario. `guardado` vacío = el orden base. Las columnas que el orden guardado no conoce (p. ej. una
 * columna nueva) quedan al final, en su orden base. */
export function ordenarColumnas(base: readonly string[], guardado: readonly string[]): string[] {
  if (!guardado.length) return [...base];
  const pos = new Map(guardado.map((k, i) => [k, i]));
  const enBase = new Map(base.map((k, i) => [k, i]));
  return [...base].sort((a, b) => (pos.get(a) ?? 1e6 + (enBase.get(a) ?? 0)) - (pos.get(b) ?? 1e6 + enBase.get(b)!));
}

/** Mueve `de` a la posición de `a` (si va hacia la derecha queda después de `a`; hacia la izquierda, antes). */
export function moverColumna(actual: readonly string[], de: string, a: string): string[] {
  const iDe = actual.indexOf(de);
  const iA = actual.indexOf(a);
  if (iDe < 0 || iA < 0 || de === a) return [...actual];
  const lista = actual.filter((k) => k !== de);
  lista.splice(iDe < iA ? lista.indexOf(a) + 1 : lista.indexOf(a), 0, de);
  return lista;
}

/** Coloca `key` en la posición `pos` (1 = primera; se acota al rango válido) y recorre las demás: la que estaba ahí y las siguientes pasan a la siguiente
 * posición. Es lo que se escribe en el menú «Columnas» (poner la 10 como 1 → la 10 va primero y la que era 1 pasa a ser la 2). */
export function colocarColumna(actual: readonly string[], key: string, pos: number): string[] {
  if (!actual.includes(key) || !Number.isFinite(pos)) return [...actual];
  const destino = Math.min(Math.max(Math.trunc(pos), 1), actual.length) - 1;
  const lista = actual.filter((k) => k !== key);
  lista.splice(destino, 0, key);
  return lista;
}

/** Firma corta del orden (cambia el orden → cambia la firma): los anchos de columna guardados van por posición, así que cada orden tiene los suyos. */
export function firmaOrden(orden: readonly string[]): string {
  if (!orden.length) return 'base';
  let h = 5381;
  for (const c of orden.join('|')) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}
