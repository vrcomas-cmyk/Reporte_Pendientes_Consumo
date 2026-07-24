// ---------------------------------------------------------------------------
// logError.ts · Single best-effort logger: writes one LogEntry to the
// report repository (Supabase per-user, with RLS) but NEVER rejects — a
// missing/expired session is treated as a no-op, never a thrown error.
// Replaces the three near-identical `logBestEffort` definitions that used
// to live in catalogService.ts, reportService.ts and solicitudService.ts.
// ---------------------------------------------------------------------------
import { reportRepository } from '@/repositories';
import type { LogEntry } from '@/core/types';

export type LogLevel = LogEntry['level'];

/** Best-effort log write — swallows network/session errors so the calling
 *  flow never breaks on a logging failure. Returns the void promise so
 *  callsites may `await` it if they care, but usually just fire-and-forget. */
export function logEvent(level: LogLevel, event: string, detail: string): Promise<void> {
  return reportRepository
    .addLog({ at: new Date().toISOString(), level, event, detail })
    .then(() => undefined)
    .catch(() => undefined);
}

/** Convenience wrappers mirroring a console-style API. */
export const logInfo = (event: string, detail = ''): Promise<void> => logEvent('info', event, detail);
export const logWarn = (event: string, detail = ''): Promise<void> => logEvent('warn', event, detail);
export const logError = (event: string, detail = ''): Promise<void> => logEvent('error', event, detail);

/** Same as {@link logEvent} but pulls a message out of an unknown rejection
 *  value — handy inside `.catch` chains where the rejection may be a string,
 *  an Error, or anything thrown by a third-party library. */
export function logRejection(level: LogLevel, event: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  return logEvent(level, event, detail);
}
