import type { SolicitudDRP } from '@/core/types';

/** Abstraction over "where DRP requests live". LocalSolicitudRepository backs
 *  it with IndexedDB (dexie) — same swap-without-touching-UI pattern as
 *  CatalogRepository/ReportRepository. */
export interface SolicitudRepository {
  add(solicitud: SolicitudDRP): Promise<number>;
  list(): Promise<SolicitudDRP[]>;
  update(id: number, patch: Partial<SolicitudDRP>): Promise<void>;
  remove(id: number): Promise<void>;
}
