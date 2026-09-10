import type { IncrementoSnapshot } from '@/core/types';

/** Abstraction over "where the incremento-de-costos snapshot lives" — same
 * shape as CatalogRepository, mirrored for consistency even though today
 * there's only one (local/Dexie) implementation. */
export interface IncrementoRepository {
  getCached(): Promise<IncrementoSnapshot | null>;
  save(snapshot: IncrementoSnapshot): Promise<void>;
  clear(): Promise<void>;
}
