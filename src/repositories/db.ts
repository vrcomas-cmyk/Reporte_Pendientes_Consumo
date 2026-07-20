import Dexie, { type Table } from 'dexie';

/** Row shape for catalog/analysis snapshots: array-valued fields (the bulk
 * of the data — resumenFac, sugerencias, invDetalle, ...) are stored
 * Parquet-encoded via blobCodec, not as raw JSON — that's what actually
 * blows up IndexedDB storage. `meta` carries everything else (scalars,
 * small computed fields) as plain JSON. See DuckDBCatalogRepository /
 * DuckDBAnalysisStore. history/logs/settings moved to Supabase (fase 1). */
export interface SnapshotRow {
  id?: number | string;
  processedAt?: string;
  meta: Record<string, unknown>;
  blobs: Record<string, Uint8Array>;
}

export class DegasaDb extends Dexie {
  catalog!: Table<SnapshotRow, string>;
  analyses!: Table<SnapshotRow, number>;

  constructor() {
    super('degasa-portal');
    this.version(2).stores({
      catalog: 'id',
      analyses: '++id, processedAt',
    });
  }
}

export const db = new DegasaDb();
