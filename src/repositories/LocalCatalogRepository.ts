import { db } from './db';
import { encodeSnapshot, decodeSnapshot, putSnapshot } from './blobCodec';
import type { CatalogRepository } from './CatalogRepository';
import type { CatalogSnapshot } from '@/core/types';

/** IndexedDB-backed implementation of CatalogRepository. The catalog is
 * cached under the fixed key 'current' — there is only ever one active
 * catalog snapshot, refreshed exclusively via an explicit user action.
 * Array fields (invConsolidado, invDetalle, materiales, ...) are stored
 * Parquet-encoded (via blobCodec/duckdbService), not raw JSON — that's
 * what actually hits IndexedDB's size limits on a large catalog. */
export class LocalCatalogRepository implements CatalogRepository {
  async getCached(): Promise<CatalogSnapshot | null> {
    const rec = await db.catalog.get('current');
    if (!rec) return null;
    return decodeSnapshot<CatalogSnapshot>(rec.meta, rec.blobs);
  }

  async save(snapshot: CatalogSnapshot): Promise<void> {
    const { meta, blobs } = await encodeSnapshot({ ...snapshot, id: 'current' });
    await putSnapshot(db.catalog, { id: 'current', meta, blobs });
  }

  async clear(): Promise<void> {
    await db.catalog.delete('current');
  }
}
