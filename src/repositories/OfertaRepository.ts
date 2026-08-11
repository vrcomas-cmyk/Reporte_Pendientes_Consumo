import type { Oferta } from '@/core/types';

/** Abstracción sobre "dónde vive el registro de ofertas" — mismo patrón que
 * OportunidadRepository/ClienteConocimientoRepository. */
export interface OfertaRepository {
  listOfertas(): Promise<Oferta[]>;
  addOferta(o: Oferta): Promise<number>;
  updateOferta(id: number, patch: Partial<Oferta>): Promise<void>;
}
