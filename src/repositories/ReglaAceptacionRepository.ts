import type { ReglaAceptacion } from '@/core/types';

/** Abstracción sobre "dónde viven las reglas de aceptación" — mismo patrón
 * que OfertaRepository/ClienteConocimientoRepository. */
export interface ReglaAceptacionRepository {
  listReglas(): Promise<ReglaAceptacion[]>;
  upsertRegla(r: ReglaAceptacion): Promise<number>;
  /** Aplica la misma regla (sin `dest`) a varios destinatarios de una vez —
   * carga masiva por ejecutivo. */
  upsertReglasBulk(dests: string[], r: Omit<ReglaAceptacion, 'id' | 'dest'>): Promise<void>;
  removeRegla(id: number): Promise<void>;
}
