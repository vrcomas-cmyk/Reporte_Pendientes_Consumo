import { reportRepository } from '@/repositories';
import { processReport } from './analysisService';
import { uploadFileToR2 } from './r2Service';
import { logInfo, logWarn, logRejection } from '@/lib/logError';
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

    // Sube el xlsx original a R2 en paralelo al análisis. Es un respaldo, no
    // una dependencia del flujo: si falla (sin R2 configurado, red caída),
    // el análisis sigue normal y solo queda sin r2Key en el historial.
    const r2KeyPromise = uploadFileToR2(file).catch((e) => {
      void logWarn('r2-upload-failed', e instanceof Error ? e.message : String(e));
      return undefined;
    });

    void logInfo('analysis-start', file.name);
    try {
      const result = await job.promise;
      const r2Key = await r2KeyPromise;
      await reportRepository.saveAnalysis(result);
      reportRepository.addHistory({
        fileName: result.fileName,
        processedAt: result.processedAt,
        durationMs: result.durationMs,
        rowCount: result.rowCount,
        kpis: result.kpis,
        r2Key,
      }).catch(() => {});
      void logInfo('analysis-end', `${result.fileName}: ${result.rowCount} filas en ${result.durationMs}ms`);
      return result;
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') {
        void logWarn('analysis-cancelled', file.name);
      } else {
        void logRejection('error', 'analysis-error', e);
      }
      throw e;
    }
  })();

  return { promise, cancel: () => cancelFn() };
}

export async function getLatestAnalysis(): Promise<AnalysisResult | null> {
  return reportRepository.getLatestAnalysis();
}
