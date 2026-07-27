import { db } from './db';
import { encodeSnapshot, decodeSnapshot, putSnapshot } from './blobCodec';
import { rehydrateRaw } from './rawRehydrate';
import type { ReportRepository } from './ReportRepository';
import type { AnalysisResult, HistoryEntry, LogEntry, AppSettings } from '@/core/types';
import { DEFAULT_SETTINGS } from '@/core/types';

/** IndexedDB-backed ReportRepository. Only `saveAnalysis`/`getLatestAnalysis`/
 * `getAnalysis` are actually used today — history/logs/settings moved to
 * Supabase (fase 1); SupabaseReportRepository composes this class purely for
 * the analysis methods. Array fields of AnalysisResult are Parquet-encoded
 * (blobCodec/duckdbService) instead of raw JSON — see db.ts. */
export class LocalReportRepository implements ReportRepository {
  async saveAnalysis(result: AnalysisResult): Promise<number> {
    // Strip the per-row `raw` duplicate before Parquet encoding — every mapped
    // row carries a full copy of its source columns in `raw` for the few pages
    // that need to read dynamic/legacy columns by name. Persisting that inside
    // the (already large) Parquet arrays roughly doubles the snapshot size.
    // The store keeps `raw` live in memory for the current session; on restore,
    // `getLatestAnalysis`/`getAnalysis` rehydrate it from the dense-rows cache
    // (`sheetsCache`) which already holds the same source columns densely. See
    // repositories/rawRehydrate.ts and docs/apps-script-report-sheets.md §5.
    const { meta, blobs } = await encodeSnapshot(result, { stripField: 'raw' });
    const id = await putSnapshot(db.analyses, {
      id: result.id,
      processedAt: result.processedAt,
      meta,
      blobs,
    });
    return id as number;
  }

  async getLatestAnalysis(): Promise<AnalysisResult | null> {
    const rec = await db.analyses.orderBy('processedAt').last();
    if (!rec) return null;
    const result = await decodeSnapshot<AnalysisResult>(rec.meta, rec.blobs);
    return rehydrateRaw(result);
  }

  async getAnalysis(id: number): Promise<AnalysisResult | null> {
    const rec = await db.analyses.get(id);
    if (!rec) return null;
    const result = await decodeSnapshot<AnalysisResult>(rec.meta, rec.blobs);
    return rehydrateRaw(result);
  }

  async listHistory(): Promise<HistoryEntry[]> {
    throw new Error('listHistory: usa SupabaseReportRepository (fase 1) — LocalReportRepository ya no persiste history.');
  }

  async addHistory(): Promise<number> {
    throw new Error('addHistory: usa SupabaseReportRepository (fase 1) — LocalReportRepository ya no persiste history.');
  }

  async listLogs(): Promise<LogEntry[]> {
    throw new Error('listLogs: usa SupabaseReportRepository (fase 1) — LocalReportRepository ya no persiste logs.');
  }

  async addLog(): Promise<number> {
    throw new Error('addLog: usa SupabaseReportRepository (fase 1) — LocalReportRepository ya no persiste logs.');
  }

  async getSettings(): Promise<AppSettings> {
    return DEFAULT_SETTINGS;
  }

  async saveSettings(): Promise<void> {
    throw new Error('saveSettings: usa SupabaseReportRepository (fase 1) — LocalReportRepository ya no persiste settings.');
  }
}
