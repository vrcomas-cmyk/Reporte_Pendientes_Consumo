import type { CatalogSnapshot } from '@/core/types';

/** Abstraction over "where the catalog lives". Today only a LocalRepository
 * (xlsx + IndexedDB) implements this; a future SupabaseRepository/
 * ApiRepository could implement the same interface without UI changes. */
export interface CatalogRepository {
  getCached(): Promise<CatalogSnapshot | null>;
  save(snapshot: CatalogSnapshot): Promise<void>;
  clear(): Promise<void>;
}
