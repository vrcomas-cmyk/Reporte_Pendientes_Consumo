import Dexie, { type Table } from 'dexie';
import type { CatalogSnapshot, AnalysisResult, HistoryEntry, LogEntry, AppSettings } from '@/core/types';

/** Single Dexie database for the whole app. Object stores map 1:1 to the
 * domain concepts persisted on-device: the catalog snapshot (loaded once,
 * refreshed only on demand), analysis results (one per processed report),
 * a lightweight history index, an event log, and user settings. */
export class DegasaDb extends Dexie {
  catalog!: Table<CatalogSnapshot, string>;
  analyses!: Table<AnalysisResult, number>;
  history!: Table<HistoryEntry, number>;
  logs!: Table<LogEntry, number>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('degasa-portal');
    this.version(1).stores({
      catalog: 'id',
      analyses: '++id, processedAt',
      history: '++id, processedAt',
      logs: '++id, at, level',
      settings: 'id',
    });
  }
}

export const db = new DegasaDb();
