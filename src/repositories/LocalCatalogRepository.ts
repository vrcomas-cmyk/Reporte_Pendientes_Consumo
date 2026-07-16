import { db } from './db';
import type { CatalogRepository } from './CatalogRepository';
import type { CatalogSnapshot } from '@/core/types';

/** IndexedDB-backed implementation of CatalogRepository. The catalog is
 * cached under the fixed key 'current' — there is only ever one active
 * catalog snapshot, refreshed exclusively via an explicit user action. */
export class LocalCatalogRepository implements CatalogRepository {
  async getCached(): Promise<CatalogSnapshot | null> {
    const rec = await db.catalog.get('current');
    return rec ?? null;
  }

  async save(snapshot: CatalogSnapshot): Promise<void> {
    await db.catalog.put({ ...snapshot, id: 'current' });
  }

  async clear(): Promise<void> {
    await db.catalog.delete('current');
  }
}
