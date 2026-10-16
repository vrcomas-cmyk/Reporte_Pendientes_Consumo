/** Cálculos pesados SIN trabar la pantalla: se escriben como generadores que ceden el paso (`yield` con el avance 0-1) cada cierto
 * número de filas, y se ejecutan por tramos cortos devolviéndole el control al navegador entre uno y otro. El resultado es el mismo
 * que corriéndolos de golpe (`correrSincrono`). */

/** Corre un generador completo, de golpe (pruebas y llamadas que no necesitan ceder el paso). */
export function correrSincrono<T>(g: Generator<number, T>): T {
  let paso = g.next();
  while (!paso.done) paso = g.next();
  return paso.value;
}

// Ceder el paso con un MessageChannel: a diferencia de `setTimeout(0)` no se estrangula (≥4 ms por tramo, y 1 s/tramo en una pestaña
// en segundo plano), así el cálculo avanza parejo aunque la pestaña no esté al frente.
const canal = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const cederPaso = (): Promise<void> =>
  new Promise((resolve) => {
    if (!canal) { setTimeout(resolve, 0); return; }
    canal.port1.onmessage = () => resolve();
    canal.port2.postMessage(null);
  });

/** Corre un generador por tramos de `ms` milisegundos, cediendo el paso al navegador entre tramos (la pantalla sigue respondiendo).
 *  `cancelado()` detiene el cálculo (devuelve null) — p. ej. si los datos cambiaron mientras se calculaba. */
export async function correrPorTramos<T>(
  g: Generator<number, T>,
  opciones: { ms?: number; cancelado?: () => boolean; onProgreso?: (fraccion: number) => void } = {},
): Promise<T | null> {
  const { ms = 12, cancelado, onProgreso } = opciones;
  let inicio = performance.now();
  for (;;) {
    const paso = g.next();
    if (paso.done) return paso.value;
    if (cancelado?.()) return null;
    if (performance.now() - inicio >= ms) {
      onProgreso?.(paso.value);
      await cederPaso();
      if (cancelado?.()) return null;
      inicio = performance.now();
    }
  }
}
