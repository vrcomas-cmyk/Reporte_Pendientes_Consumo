import { db } from './db';
import { encodeSnapshot, decodeSnapshot, putSnapshot } from './blobCodec';
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
    const { meta, blobs } = await encodeSnapshot(result);
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
    return decodeSnapshot<AnalysisResult>(rec.meta, rec.blobs);
  }

  async getAnalysis(id: number): Promise<AnalysisResult | null> {
    const rec = await db.analyses.get(id);
    if (!rec) return null;
    return decodeSnapshot<AnalysisResult>(rec.meta, rec.blobs);
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
