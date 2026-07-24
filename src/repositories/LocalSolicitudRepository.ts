import { db } from './db';
import type { SolicitudRepository } from './SolicitudRepository';
import type { SolicitudDRP } from '@/core/types';

/** IndexedDB-backed SolicitudRepository. Rows are plain JSON (no
 * Parquet/blobCodec — see db.ts) since a DRP request has no large array
 * fields. */
export class LocalSolicitudRepository implements SolicitudRepository {
  async add(solicitud: SolicitudDRP): Promise<number> {
    const id = await db.solicitudes.put(solicitud);
    return id as number;
  }

  async list(): Promise<SolicitudDRP[]> {
    return db.solicitudes.orderBy('fechaSolicitud').reverse().toArray();
  }

  async update(id: number, patch: Partial<SolicitudDRP>): Promise<void> {
    await db.solicitudes.update(id, patch);
  }

  async remove(id: number): Promise<void> {
    await db.solicitudes.delete(id);
  }
}
