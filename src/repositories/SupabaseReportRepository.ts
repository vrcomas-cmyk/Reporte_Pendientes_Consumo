import { supabase } from '@/lib/supabaseClient';
import { idLocal, sesionLocal } from '@/lib/sesionLocal';
import { ColaLogs } from '@/lib/colaLogs';
import { invalidarCache, leerConCache } from '@/lib/cacheSWR';
import { LocalReportRepository } from './LocalReportRepository';
import type { ReportRepository } from './ReportRepository';
import type { AnalysisResult, HistoryEntry, LogEntry, AppSettings } from '@/core/types';
import { DEFAULT_SETTINGS } from '@/core/types';

/** Id del usuario de la sesión LOCAL (sin petición a Auth): el servidor valida el token y RLS comprueba que `user_id` sea el suyo. */
const requireUserId = idLocal;

/** Cola de logs: se envían juntos (ver `colaLogs.ts`). Sin sesión no hay a dónde escribir (RLS): se descartan. */
const colaLogs = new ColaLogs(async (lote) => {
  const usuario = await sesionLocal();
  if (!usuario) return;
  const { error } = await supabase.from('degasa_logs').insert(lote.map((e) => ({ user_id: usuario.id, at: e.at, level: e.level, event: e.event, detail: e.detail })));
  if (error) throw error;
});
// Al ocultar o cerrar la pestaña se intenta enviar lo pendiente (mejor esfuerzo: el navegador puede cancelar la petición).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void colaLogs.vaciar(); });
  window.addEventListener('pagehide', () => { void colaLogs.vaciar(); });
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

  /** Encola el log; se envía en bloque más tarde. Devuelve 0: el id real ya no se conoce (nadie lo usa). */
  addLog(entry: LogEntry): Promise<number> {
    colaLogs.agregar({ at: entry.at, level: entry.level, event: entry.event, detail: entry.detail });
    return Promise.resolve(0);
  }

  /** Los ajustes casi nunca cambian: se leen de la copia local (30 min) en vez de consultar en cada F5; guardarlos descarta la copia. */
  async getSettings(): Promise<AppSettings> {
    return leerConCache('settings', async () => {
      const { data, error } = await supabase
        .from('degasa_settings')
        .select('short_expiry_days, low_stock_threshold')
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS;
      return { id: 'current' as const, shortExpiryDays: data.short_expiry_days, lowStockThreshold: data.low_stock_threshold };
    }, { ttlMs: 30 * 60_000 });
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from('degasa_settings')
      .upsert({ user_id: userId, short_expiry_days: settings.shortExpiryDays, low_stock_threshold: settings.lowStockThreshold, updated_at: new Date().toISOString() });
    if (error) throw error;
    await invalidarCache('settings');
  }
}
