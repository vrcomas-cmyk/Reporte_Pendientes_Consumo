import { llamarEnvios } from '@/services/enviosService';
import { historialDeRespuesta, indiceDeRespuesta, type HistorialMaterialesTx, type IndiceTx } from '@/core/transmision';

export interface IndiceTransmision {
  indice: IndiceTx;
  /** Cuándo se generó en el servidor (ISO). */
  generadoEn: string;
  /** Libros o pestañas que no se pudieron leer (el índice puede estar incompleto). */
  errores: string[];
}

/** Pedidos en transmisión (pedido normalizado → entregas). Lo valida `indiceDeRespuesta`: un cambio del Apps Script no puede romper la pantalla. */
export async function cargarIndiceTransmision(): Promise<IndiceTransmision> {
  const r = await llamarEnvios<{ indice?: unknown; generadoEn?: string; errores?: unknown }>('tx_indice');
  return {
    indice: indiceDeRespuesta(r.indice),
    generadoEn: typeof r.generadoEn === 'string' ? r.generadoEn : new Date().toISOString(),
    errores: Array.isArray(r.errores) ? r.errores.map(String) : [],
  };
}

/** Material y lote que el histórico asocia a unas entregas (para marcar qué materiales de un pedido van en ellas). */
export async function cargarHistorialTransmision(deliverys: string[]): Promise<HistorialMaterialesTx> {
  const r = await llamarEnvios<{ historial?: unknown }>('tx_historial', { deliverys });
  return historialDeRespuesta(r.historial);
}
