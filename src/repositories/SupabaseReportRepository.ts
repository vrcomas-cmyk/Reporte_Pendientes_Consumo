import { supabase } from '@/lib/supabaseClient';
import { LocalReportRepository } from './LocalReportRepository';
import type { ReportRepository } from './ReportRepository';
import type { AnalysisResult, HistoryEntry, LogEntry, AppSettings } from '@/core/types';
import { DEFAULT_SETTINGS } from '@/core/types';

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('No hay sesión activa');
  return data.user.id;
}

/** history/settings/logs live in Supabase (per-user, RLS-scoped); analyses
 * stay on LocalReportRepository — those are the large DuckDB/Parquet-bound
 * results, not metadata, and migrate separately (fase 3 del plan). */
export class SupabaseReportRepository implements ReportRepository {
  private local = new LocalReportRepository();

  saveAnalysis(result: AnalysisResult): Promise<number> {
    return this.local.saveAnalysis(result);
  }
  getLatestAnalysis(): Promise<AnalysisResult | null> {
    return this.local.getLatestAnalysis();
  }
  getAnalysis(id: number): Promise<AnalysisResult | null> {
    return this.local.getAnalysis(id);
  }

  async listHistory(): Promise<HistoryEntry[]> {
    const { data, error } = await supabase
      .from('degasa_history')
      .select('id, file_name, processed_at, duration_ms, row_count, kpis, r2_key')
      .order('processed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      processedAt: r.processed_at,
      durationMs: r.duration_ms,
      rowCount: r.row_count,
      kpis: r.kpis,
      r2Key: r.r2_key ?? undefined,
    }));
  }

  async addHistory(entry: HistoryEntry): Promise<number> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('degasa_history')
      .insert({
        user_id: userId,
        file_name: entry.fileName,
        processed_at: entry.processedAt,
        duration_ms: entry.durationMs,
        row_count: entry.rowCount,
        kpis: entry.kpis,
        r2_key: entry.r2Key ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as number;
  }

  async listLogs(limit = 500): Promise<LogEntry[]> {
    const { data, error } = await supabase
      .from('degasa_logs')
      .select('id, at, level, event, detail')
      .order('at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, at: r.at, level: r.level, event: r.event, detail: r.detail ?? undefined }));
  }

  async addLog(entry: LogEntry): Promise<number> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('degasa_logs')
      .insert({ user_id: userId, at: entry.at, level: entry.level, event: entry.event, detail: entry.detail })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as number;
  }

  async getSettings(): Promise<AppSettings> {
    const { data, error } = await supabase
      .from('degasa_settings')
      .select('short_expiry_days, low_stock_threshold')
      .maybeSingle();
    if (error) throw error;
    if (!data) return DEFAULT_SETTINGS;
    return { id: 'current', shortExpiryDays: data.short_expiry_days, lowStockThreshold: data.low_stock_threshold };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from('degasa_settings')
      .upsert({ user_id: userId, short_expiry_days: settings.shortExpiryDays, low_stock_threshold: settings.lowStockThreshold, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
}
