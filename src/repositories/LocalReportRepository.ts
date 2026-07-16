import { db } from './db';
import type { ReportRepository } from './ReportRepository';
import type { AnalysisResult, HistoryEntry, LogEntry, AppSettings } from '@/core/types';

const DEFAULT_SETTINGS: AppSettings = { id: 'current', shortExpiryDays: 90, lowStockThreshold: 5 };

/** IndexedDB-backed implementation of ReportRepository (analyses, history,
 * logs, settings) via dexie. */
export class LocalReportRepository implements ReportRepository {
  async saveAnalysis(result: AnalysisResult): Promise<number> {
    const id = await db.analyses.add(result);
    return id as number;
  }

  async getLatestAnalysis(): Promise<AnalysisResult | null> {
    const rec = await db.analyses.orderBy('processedAt').last();
    return rec ?? null;
  }

  async getAnalysis(id: number): Promise<AnalysisResult | null> {
    const rec = await db.analyses.get(id);
    return rec ?? null;
  }

  async listHistory(): Promise<HistoryEntry[]> {
    return db.history.orderBy('processedAt').reverse().toArray();
  }

  async addHistory(entry: HistoryEntry): Promise<number> {
    const id = await db.history.add(entry);
    return id as number;
  }

  async listLogs(limit = 500): Promise<LogEntry[]> {
    return db.logs.orderBy('at').reverse().limit(limit).toArray();
  }

  async addLog(entry: LogEntry): Promise<number> {
    const id = await db.logs.add(entry);
    return id as number;
  }

  async getSettings(): Promise<AppSettings> {
    const rec = await db.settings.get('current');
    return rec ?? DEFAULT_SETTINGS;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await db.settings.put({ ...settings, id: 'current' });
  }
}
