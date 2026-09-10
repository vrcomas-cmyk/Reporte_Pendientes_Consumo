import { db } from './db';
import type { IncrementoRepository } from './IncrementoRepository';
import type { IncrementoSnapshot } from '@/core/types';

/** IndexedDB-backed implementation of IncrementoRepository. Cached under the
 * fixed key 'current', same one-active-snapshot convention as
 * LocalCatalogRepository — plain JSON, no blobCodec (the Sheet is small). */
export class LocalIncrementoRepository implements IncrementoRepository {
  async getCached(): Promise<IncrementoSnapshot | null> {
    const rec = await db.incrementoCostos.get('current');
    return rec ?? null;
  }

  async save(snapshot: IncrementoSnapshot): Promise<void> {
    await db.incrementoCostos.put({ ...snapshot, id: 'current' });
  }

  async clear(): Promise<void> {
    await db.incrementoCostos.delete('current');
  }
}
