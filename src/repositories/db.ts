import Dexie, { type Table } from 'dexie';
import type { SolicitudDRP } from '@/core/types';

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

/** Cached dense rows of the four Google Sheets report tabs, kept separately
 * from `analyses` so the report-sheets sync can append new rows delta-style
 * without round-tripping through the encoded `AnalysisResult` snapshot. Keyed
 * by tab name (e.g. "Reporte de Consumo"); one row per tab. The `rows` array
 * holds the *entire* current tab content (previous delta + freshly fetched
 * rows), so a delta sync only asks Apps Script for the rows since the last
 * sync (offset === rows.length) and appends them here. `rowCount` is the
 * latest total row count reported by the Apps Script response (used to
 * detect a tab being truncated/replaced and force a full re-fetch). */
export interface SheetsCacheRow {
  tab: string;
  headers: string[];
  rows: unknown[][];
  rowCount: number;
  syncedAt: string;
}

export class DegasaDb extends Dexie {
  catalog!: Table<SnapshotRow, string>;
  analyses!: Table<SnapshotRow, number>;
  /** DRP requests: small flat rows (16 sheet columns + local sync metadata),
   * stored as plain JSON — no blobCodec/Parquet here, unlike catalog/analyses,
   * since there are no large array fields to worry about. */
  solicitudes!: Table<SolicitudDRP, number>;
  /** Dense rows cache for the Google Sheets report tabs (delta sync). */
  sheetsCache!: Table<SheetsCacheRow, string>;

  constructor() {
    super('degasa-portal');
    this.version(2).stores({
      catalog: 'id',
      analyses: '++id, processedAt',
    }).upgrade(() => {
      // noop: v2 baseline — catalog/analyses stores defined here, no data migration.
    });
    this.version(3).stores({
      catalog: 'id',
      analyses: '++id, processedAt',
      solicitudes: '++id, sync, sourceKey, fechaSolicitud',
    }).upgrade(() => {
      // noop: v3 adds the `solicitudes` store, no existing rows need rewriting.
    });
    this.version(4).stores({
      catalog: 'id',
      analyses: '++id, processedAt',
      solicitudes: '++id, sync, sourceKey, fechaSolicitud',
      sheetsCache: 'tab',
    }).upgrade(() => {
      // noop: v4 adds the `sheetsCache` store, no existing rows need rewriting.
    });
  }
}

export const db = new DegasaDb();
