/// <reference lib="webworker" />
import * as XLSX from 'xlsx';
import { mapEjecutivo, mapMaterial, mapInvConsolidado, mapInvDetalle } from '@/core/mappers';
import { roleOf } from '@/core/roleDetection';
import { buildAnalysisResult, findSheetByRole } from '@/core/buildAnalysisResult';
import type { CatalogSnapshot, AnalysisResult, AppSettings, SheetRole, DetectedSheet } from '@/core/types';

// This worker never blocks the UI thread: all xlsx parsing and aggregation
// happens here, with incremental progress reported via postMessage. Both
// catalog loads and daily-report processing go through it.

export type WorkerRequest =
  | { id: string; type: 'parse-catalog'; buffer: ArrayBuffer; fileName: string }
  | { id: string; type: 'process-report'; buffer: ArrayBuffer; fileName: string; catalog: CatalogSnapshot | null; settings: Pick<AppSettings, 'shortExpiryDays' | 'lowStockThreshold'>; selectedRoles?: SheetRole[] };

export type WorkerResponse =
  | { id: string; type: 'progress'; phase: string; percent: number; message: string }
  | { id: string; type: 'catalog-result'; catalog: CatalogSnapshot }
  | { id: string; type: 'report-result'; result: AnalysisResult }
  | { id: string; type: 'error'; message: string }
  | { id: string; type: 'cancelled' };

const cancelled = new Set<string>();

function post(msg: WorkerResponse) {
  (self as unknown as Worker).postMessage(msg);
}

function progress(id: string, phase: string, percent: number, message: string) {
  post({ id, type: 'progress', phase, percent, message });
}

/** Some exports truncate the `!ref` range; recompute it from actual cells
 * before converting to JSON, mirroring the legacy fixRange() workaround. */
function fixRange(ws: XLSX.WorkSheet) {
  const cells = Object.keys(ws).filter((k) => k[0] !== '!');
  if (!cells.length) return;
  const r = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
  for (const k of cells) {
    const a = XLSX.utils.decode_cell(k);
    if (a.r < r.s.r) r.s.r = a.r;
    if (a.c < r.s.c) r.s.c = a.c;
    if (a.r > r.e.r) r.e.r = a.r;
    if (a.c > r.e.c) r.e.c = a.c;
  }
  ws['!ref'] = XLSX.utils.encode_range(r);
}

function readWorkbookSheets(buf: ArrayBuffer): Record<string, Record<string, unknown>[]> {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    fixRange(ws);
    out[name] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) as Record<string, unknown>[];
  }
  return out;
}

/** Reads only the header row of a worksheet (cheap; used against a
 * `sheetRows: 1` workbook to detect each sheet's role without parsing its
 * full body). */
function firstRowHeaders(ws: XLSX.WorkSheet): string[] {
  const first = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })[0] as unknown[] | undefined;
  return (first || []).map((h) => String(h ?? ''));
}

async function handleParseCatalog(req: Extract<WorkerRequest, { type: 'parse-catalog' }>) {
  const { id, buffer, fileName } = req;
  try {
    progress(id, 'parsing', 10, 'Leyendo libro de catálogo...');
    const sheets = readWorkbookSheets(buffer);
    if (cancelled.has(id)) return post({ id, type: 'cancelled' });

    progress(id, 'detecting', 40, 'Detectando hojas...');
    const ejecutivosRows = findSheetByRole(sheets, 'ejecutivos');
    const materialesRows = findSheetByRole(sheets, 'materiales');
    const invConsolidadoRows = findSheetByRole(sheets, 'invConsolidado');
    const invDetalleRows = findSheetByRole(sheets, 'invDetalle');

    progress(id, 'crossing', 70, 'Normalizando catálogo...');
    const catalog: CatalogSnapshot = {
      id: 'current',
      fileName,
      loadedAt: new Date().toISOString(),
      ejecutivos: ejecutivosRows.map(mapEjecutivo),
      materiales: materialesRows.map(mapMaterial),
      invConsolidado: invConsolidadoRows.map(mapInvConsolidado),
      invDetalle: invDetalleRows.map(mapInvDetalle),
    };

    progress(id, 'done', 100, 'Catálogo listo.');
    post({ id, type: 'catalog-result', catalog });
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

async function handleProcessReport(req: Extract<WorkerRequest, { type: 'process-report' }>) {
  const { id, buffer, fileName, catalog, settings, selectedRoles } = req;
  const start = Date.now();
  try {
    // Pass 1 (cheap): read only the header row of every sheet to detect roles,
    // without parsing the (potentially huge) sheet bodies.
    progress(id, 'detecting', 10, 'Detectando hojas del reporte...');
    const head = XLSX.read(buffer, { type: 'array', sheetRows: 1 });
    const roleByName = new Map<string, SheetRole | null>();
    for (const name of head.SheetNames) roleByName.set(name, roleOf(firstRowHeaders(head.Sheets[name])));
    if (cancelled.has(id)) return post({ id, type: 'cancelled' });

    // Only fully parse the sheets whose role is recognized AND selected by the
    // user (all selected when `selectedRoles` is omitted). Skipping an unselected
    // heavy sheet (e.g. ~80k-row Consumo) avoids its entire parse cost.
    const wantRole = (r: SheetRole | null): r is SheetRole => r != null && (!selectedRoles || selectedRoles.includes(r));
    const namesToParse = head.SheetNames.filter((n) => wantRole(roleByName.get(n) ?? null));

    progress(id, 'parsing', 25, `Leyendo ${namesToParse.length} hoja(s) seleccionada(s)...`);
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false, sheets: namesToParse });
    const sheets: Record<string, Record<string, unknown>[]> = {};
    for (const name of namesToParse) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      fixRange(ws);
      sheets[name] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) as Record<string, unknown>[];
    }
    if (cancelled.has(id)) return post({ id, type: 'cancelled' });

    // Detected-sheets report covers every sheet in the file (parsed or not),
    // flagging which were actually loaded.
    const sheetsDetected: DetectedSheet[] = head.SheetNames.map((name) => ({
      name,
      role: roleByName.get(name) ?? null,
      rowCount: sheets[name]?.length ?? 0,
      headers: firstRowHeaders(head.Sheets[name]),
      loaded: !!sheets[name],
    }));

    progress(id, 'crossing', 45, 'Cruzando reporte contra catálogo...');
    progress(id, 'kpis', 75, 'Calculando KPIs...');
    const result = buildAnalysisResult({ sheets, sheetsDetected, catalog, settings, fileName, startedAt: start, selectedRoles });
    if (cancelled.has(id)) return post({ id, type: 'cancelled' });

    progress(id, 'done', 100, 'Análisis completado.');
    post({ id, type: 'report-result', result });
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    cancelled.delete(id);
  }
}

self.addEventListener('message', (ev: MessageEvent<WorkerRequest | { id: string; type: 'cancel' }>) => {
  const data = ev.data;
  if (data.type === 'cancel') {
    cancelled.add(data.id);
    return;
  }
  if (data.type === 'parse-catalog') void handleParseCatalog(data);
  else if (data.type === 'process-report') void handleProcessReport(data);
});
