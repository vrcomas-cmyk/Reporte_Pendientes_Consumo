import { reportRepository } from '@/repositories';
import { processReport } from './analysisService';
import type { AnalysisResult, CatalogSnapshot, ProcessingProgress, AppSettings, SheetRole } from '@/core/types';

/** Starts a report analysis job. Returns immediately with a promise (that
 * resolves once parsing/crossing/KPI calc + persistence finish) and a
 * cancel() callback the UI can invoke mid-flight. */
export function runAnalysis(
  file: File,
  catalog: CatalogSnapshot | null,
  settings: Pick<AppSettings, 'shortExpiryDays' | 'lowStockThreshold'>,
  onProgress?: (p: ProcessingProgress) => void,
  selectedRoles?: SheetRole[],
): { promise: Promise<AnalysisResult>; cancel: () => void } {
  let cancelFn: () => void = () => {};

  const promise = (async () => {
    const buffer = await file.arrayBuffer();
    const job = processReport(buffer, file.name, catalog, settings, { onProgress }, selectedRoles);
    cancelFn = job.cancel;

    await reportRepository.addLog({ at: new Date().toISOString(), level: 'info', event: 'analysis-start', detail: file.name });
    try {
      const result = await job.promise;
      await reportRepository.saveAnalysis(result);
      await reportRepository.addHistory({
        fileName: result.fileName,
        processedAt: result.processedAt,
        durationMs: result.durationMs,
        rowCount: result.rowCount,
        kpis: result.kpis,
      });
      await reportRepository.addLog({
        at: new Date().toISOString(),
        level: 'info',
        event: 'analysis-end',
        detail: `${result.fileName}: ${result.rowCount} filas en ${result.durationMs}ms`,
      });
      return result;
    } catch (e) {
      await reportRepository.addLog({
        at: new Date().toISOString(),
        level: e instanceof Error && e.message === 'cancelled' ? 'warn' : 'error',
        event: 'analysis-error',
        detail: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  })();

  return { promise, cancel: () => cancelFn() };
}

export async function getLatestAnalysis(): Promise<AnalysisResult | null> {
  return reportRepository.getLatestAnalysis();
}
