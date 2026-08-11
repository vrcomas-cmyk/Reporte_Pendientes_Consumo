import type { ClienteConocimiento, Observacion } from '@/core/types';

/** Abstracción sobre "dónde vive la ficha de conocimiento del cliente" —
 * mismo patrón swap-without-touching-UI que OportunidadRepository. Fuente de
 * verdad: Supabase (conocimiento del equipo); Dexie cachea para offline. */
export interface ClienteConocimientoRepository {
  listClientes(): Promise<ClienteConocimiento[]>;
  upsertCliente(c: ClienteConocimiento): Promise<number>;
  listObservaciones(): Promise<Observacion[]>;
  addObservacion(o: Observacion): Promise<number>;
  removeObservacion(id: number): Promise<void>;
}
