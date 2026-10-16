/** Limitador de concurrencia: a lo sumo `max` tareas a la vez; el resto espera en cola FIFO. */
export function crearLimitador(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let activos = 0;
  const cola: (() => void)[] = [];
  const avanzar = () => {
    while (activos < max) {
      const inicio = cola.shift();
      if (!inicio) return;
      activos++;
      inicio();
    }
  };
  return <T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      cola.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            activos--;
            avanzar();
          });
      });
      avanzar();
    });
}

/** Peticiones simultáneas al Apps Script en TODA la app (libros de Seg pedidos/Disponibilidad/Inv_Condicion y libros de
 * facturación comparten este tope): suficiente paralelismo para no esperar en fila, sin saturar el script (más peticiones a la
 * vez solo producen 404/429). Las descargas se encolan en orden y se reparten entre ellas por turnos. */
export const MAX_PETICIONES_APPS_SCRIPT = 6;
export const limitadorAppsScript = crearLimitador(MAX_PETICIONES_APPS_SCRIPT);
