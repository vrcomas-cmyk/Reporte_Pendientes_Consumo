import type { AnalysisResult, HistoryEntry, LogEntry, AppSettings } from '@/core/types';

/** Abstraction over "where analysis results / history / logs / settings
 * live". LocalRepository backs it with IndexedDB (dexie); a future
 * SupabaseRepository/ApiRepository could sync the same data to a server. */
export interface ReportRepository {
  saveAnalysis(result: AnalysisResult): Promise<number>;
  getLatestAnalysis(): Promise<AnalysisResult | null>;
  getAnalysis(id: number): Promise<AnalysisResult | null>;

  listHistory(): Promise<HistoryEntry[]>;
  addHistory(entry: HistoryEntry): Promise<number>;

  listLogs(limit?: number): Promise<LogEntry[]>;
  addLog(entry: LogEntry): Promise<number>;

  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
}
