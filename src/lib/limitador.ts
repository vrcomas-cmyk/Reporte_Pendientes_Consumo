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

/** Limitador de concurrencia ADAPTATIVO: arranca con `inicial` tareas a la vez; cuando una falla (servidor saturado, timeout, 5xx) el tope baja a la MITAD (mínimo `min`) y cada
 * `exitosParaSubir` éxitos seguidos sube de uno en uno (hasta `max`). Así una carga grande no sigue martillando con el mismo paralelismo a un servidor que ya está respondiendo
 * mal (eso lo empeora y lo prolonga), y vuelve a acelerar sola cuando se recupera. Mismo contrato que `crearLimitador`; `tope` muestra el valor actual. */
export interface LimitadorAdaptativo {
  <T>(fn: () => Promise<T>): Promise<T>;
  readonly tope: number;
}

export function crearLimitadorAdaptativo(opts: { inicial: number; max: number; min: number; exitosParaSubir?: number }): LimitadorAdaptativo {
  const { max, min } = opts;
  const exitosParaSubir = opts.exitosParaSubir ?? 8;
  let tope = Math.min(max, Math.max(min, opts.inicial));
  let activos = 0;
  let racha = 0;
  const cola: (() => void)[] = [];
  const avanzar = () => {
    while (activos < tope) {
      const inicio = cola.shift();
      if (!inicio) return;
      activos++;
      inicio();
    }
  };
  const limitar = <T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      cola.push(() => {
        fn()
          .then(
            (v) => {
              racha++;
              if (racha >= exitosParaSubir && tope < max) { tope++; racha = 0; }
              resolve(v);
            },
            (e) => {
              racha = 0;
              tope = Math.max(min, Math.floor(tope / 2));
              reject(e);
            },
          )
          .finally(() => {
            activos--;
            avanzar();
          });
      });
      avanzar();
    });
  Object.defineProperty(limitar, 'tope', { get: () => tope });
  return limitar as LimitadorAdaptativo;
}

/** Peticiones simultáneas al Apps Script en TODA la app (libros de Seg pedidos/Disponibilidad/Inv_Condicion y libros de facturación comparten este tope). Antes eran 6 fijas;
 * ahora arranca en 4 (cada petición es una invocación de la función `datos`), baja a la mitad si algo falla y sube hasta 6 mientras todo responde bien. */
export const MAX_PETICIONES_APPS_SCRIPT = 6;
export const limitadorAppsScript = crearLimitadorAdaptativo({ inicial: 4, max: MAX_PETICIONES_APPS_SCRIPT, min: 2 });
