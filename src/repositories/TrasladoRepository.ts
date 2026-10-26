import type { Traslado } from '@/core/types';

/** Solicitudes de traslado del módulo «Ofertas y traslados» (conocimiento del equipo: Supabase con espejo local). */
export interface TrasladoRepository {
  listTraslados(): Promise<Traslado[]>;
  addTraslado(t: Traslado): Promise<number>;
  updateTraslado(id: number, patch: Partial<Traslado>): Promise<void>;
}
