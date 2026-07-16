import type { WorkerRequest, WorkerResponse } from '@/workers/analysisWorker';
import type { CatalogSnapshot, AnalysisResult, AppSettings, ProcessingProgress, SheetRole } from '@/core/types';

// Orchestration layer: owns the worker lifecycle, exposes promise-based APIs
// to the UI/store, and coordinates repositories are handled by callers
// (this module never touches IndexedDB directly).

function makeWorker(): Worker {
  return new Worker(new URL('../workers/analysisWorker.ts', import.meta.url), { type: 'module' });
}

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) worker = makeWorker();
  return worker;
}

let seq = 0;
function nextId() {
  seq += 1;
  return `job-${Date.now()}-${seq}`;
}

export interface RunOptions {
  onProgress?: (p: ProcessingProgress) => void;
  signal?: { cancelled: boolean };
}

function runJob<TResult>(
  req: WorkerRequest,
  extract: (msg: Extract<WorkerResponse, { type: 'catalog-result' | 'report-result' }>) => TResult,
  opts: RunOptions = {},
): { promise: Promise<TResult>; cancel: () => void } {
  const w = getWorker();
  let settle: { resolve: (v: TResult) => void; reject: (e: Error) => void } | null = null;

  const promise = new Promise<TResult>((resolve, reject) => {
    settle = { resolve, reject };
  });

  const onMessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    if (msg.id !== req.id) return;
    if (msg.type === 'progress') {
      opts.onProgress?.({ phase: msg.phase as ProcessingProgress['phase'], percent: msg.percent, message: msg.message });
      return;
    }
    if (msg.type === 'catalog-result' || msg.type === 'report-result') {
      cleanup();
      settle?.resolve(extract(msg));
      return;
    }
    if (msg.type === 'cancelled') {
      cleanup();
      settle?.reject(new Error('cancelled'));
      return;
    }
    if (msg.type === 'error') {
      cleanup();
      settle?.reject(new Error(msg.message));
    }
  };

  const cleanup = () => w.removeEventListener('message', onMessage);
  w.addEventListener('message', onMessage);
  w.postMessage(req, [req.buffer]);

  const cancel = () => {
    w.postMessage({ id: req.id, type: 'cancel' });
  };

  return { promise, cancel };
}

export function parseCatalog(buffer: ArrayBuffer, fileName: string, opts: RunOptions = {}) {
  const id = nextId();
  return runJob<CatalogSnapshot>(
    { id, type: 'parse-catalog', buffer, fileName },
    (msg) => (msg as Extract<WorkerResponse, { type: 'catalog-result' }>).catalog,
    opts,
  );
}

export function processReport(
  buffer: ArrayBuffer,
  fileName: string,
  catalog: CatalogSnapshot | null,
  settings: Pick<AppSettings, 'shortExpiryDays' | 'lowStockThreshold'>,
  opts: RunOptions = {},
  selectedRoles?: SheetRole[],
) {
  const id = nextId();
  return runJob<AnalysisResult>(
    { id, type: 'process-report', buffer, fileName, catalog, settings, selectedRoles },
    (msg) => (msg as Extract<WorkerResponse, { type: 'report-result' }>).result,
    opts,
  );
}
