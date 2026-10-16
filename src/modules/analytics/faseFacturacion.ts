import { useFacturacionStore } from '@/store/facturacionStore';

/** En qué punto está la facturación de los libros: el mensaje que se muestra donde falta, en vez de un "no cargada" que no dice nada. */
export type FaseFacturacion = 'restaurando' | 'descargando' | 'calculando' | 'error' | 'vacia' | 'lista';

export function faseFacturacion(e: {
  /** Ya se intentó leer la caché local. */
  hidratado: boolean;
  /** Se está bajando/revisando Drive. */
  sincronizando: boolean;
  /** Hay filas de facturación cargadas. */
  hayFilas: boolean;
  /** Se están armando los índices. */
  calculando: boolean;
  /** Los índices ya están. */
  listos: boolean;
  /** Error de la descarga o del cálculo (null si no hubo). */
  error: string | null;
}): FaseFacturacion {
  if (e.listos) return 'lista';
  if (e.error) return 'error';
  if (!e.hidratado) return 'restaurando';
  if (e.calculando) return 'calculando';
  if (e.sincronizando && !e.hayFilas) return 'descargando';
  return 'vacia';
}

/** Texto corto de la fase (para las celdas y chips donde falta la facturación). */
export function textoFase(fase: FaseFacturacion, error: string | null, porcentaje: number | null): string {
  switch (fase) {
    case 'restaurando': return 'Leyendo facturación guardada…';
    case 'descargando': return porcentaje == null ? 'Descargando facturación…' : `Descargando facturación… ${Math.round(porcentaje)}%`;
    case 'calculando': return 'Calculando facturación…';
    case 'error': return `Error de facturación: ${error ?? 'desconocido'}`;
    case 'vacia': return 'Facturación no cargada';
    case 'lista': return '';
  }
}

/** Fase y texto actuales de la facturación de los libros (para mostrarlos en los módulos que dependen de ella). */
export function useFaseFacturacion(a: { facturacionCalculando: boolean; facturacionError: string | null; facturacion: { rf: unknown } }): { fase: FaseFacturacion; texto: string; /** Avance de la descarga (0-100) o null. */ porcentaje: number | null } {
  const hidratado = useFacturacionStore((s) => s.hidratado);
  const sincronizando = useFacturacionStore((s) => s.syncing);
  const hayFilas = useFacturacionStore((s) => !!s.resumenFac?.length);
  const errorStore = useFacturacionStore((s) => s.error);
  const porcentaje = useFacturacionStore((s) => s.progress?.porcentaje ?? null);
  const error = a.facturacionError ?? errorStore;
  const fase = faseFacturacion({ hidratado, sincronizando, hayFilas, calculando: a.facturacionCalculando, listos: a.facturacion.rf !== null, error });
  return { fase, texto: textoFase(fase, error, porcentaje), porcentaje };
}
