// Snapshot nocturno de las pestañas pesadas ("Reporte de Consumo",
// "Resumen_Fac") — generado por un disparador de tiempo de Apps Script (ver
// `docs/apps-script-report-sheets.md` §8), exportado a CSV gzip y subido a
// R2 bajo el prefijo `snapshots/`. Reemplaza, para esas dos pestañas, la vía
// en vivo de `reportSheetsService.ts` (que sigue existiendo, como respaldo
// y como override manual desde Carga): en vez de ~98 páginas de Apps Script
// en serie/paralelo para Resumen_Fac, el portal baja unos pocos MB ya
// comprimidos y los decodifica con DuckDB-wasm — el mismo motor que ya usa
// `duckdbService.ts`/`facturacionService.ts` para Parquet, aquí sobre CSV.
import { supabase } from '@/lib/supabaseClient';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { csvGzToTabRows } from './duckdbService';
import type { TabRows } from '@/workers/analysisWorker';

export interface SnapshotTabEntry {
  tab: string;
  version: string;
  rowCount: number;
  generatedAt: string;
  /** Un solo archivo, o varias partes para pestañas grandes (Resumen_Fac) —
   * ver SNAPSHOT_CHUNK_ROWS en el Apps Script. Se concatenan en orden. */
  parts: string[];
}

export interface SnapshotManifest {
  tabs: SnapshotTabEntry[];
}

const MANIFEST_KEY = 'snapshots/manifest.json';

/** Resuelve una URL de descarga prefirmada bajo el prefijo `snapshots/` —
 * modo `snapshot-download` de la Edge Function, de solo lectura y sin el
 * candado de prefijo por-usuario que usa el modo `download` normal (ver
 * `supabase/functions/r2-presign/index.ts`). Requiere sesión de Supabase
 * (igual que el resto del portal), a diferencia de la subida (que hace Apps
 * Script con un secreto compartido, sin sesión de usuario). */
async function getSnapshotDownloadUrl(key: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('r2-presign', {
    body: { mode: 'snapshot-download', key },
  });
  if (error || !data) throw error ?? new Error(`No se pudo obtener la URL de descarga del snapshot "${key}"`);
  return data.url;
}

/** Manifiesto (~1 KB): qué versión de cada pestaña hay disponible en R2 y
 * cuándo se generó. `reportSheetsService.ts` lo usa para decidir si vale la
 * pena bajar el snapshot en vez de ir en vivo a Apps Script. Nunca lanza —
 * cualquier fallo (sin snapshot desplegado todavía, R2 caído, etc.) se trata
 * como "no hay snapshot disponible" y el llamador cae a la vía en vivo. */
export async function fetchSnapshotManifest(): Promise<SnapshotManifest | null> {
  try {
    const url = await getSnapshotDownloadUrl(MANIFEST_KEY);
    const res = await fetchWithTimeout(url, {}, 15_000);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray((data as SnapshotManifest).tabs)) return null;
    return data as SnapshotManifest;
  } catch {
    return null;
  }
}

/** Descarga y decodifica el snapshot de una pestaña (todas sus partes, en
 * orden) a la misma forma densa `{ headers, rows, rowCount }` que produce la
 * vía en vivo — así nada aguas abajo (`buildFromSheetsInWorker`,
 * `sheetsCache`, `buildAnalysisResult`) necesita saber de dónde vinieron los
 * datos. Lanza si alguna parte falla; el llamador decide si cae a la vía en
 * vivo o reporta el error de la pestaña. */
export async function fetchTabSnapshot(entry: SnapshotTabEntry): Promise<TabRows> {
  let headers: string[] = [];
  const rows: unknown[][] = [];
  for (const key of entry.parts) {
    const url = await getSnapshotDownloadUrl(key);
    const res = await fetchWithTimeout(url, {}, 60_000);
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar "${key}"`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const part = await csvGzToTabRows(buf);
    headers = part.headers;
    rows.push(...part.rows);
  }
  return { headers, rows, rowCount: entry.rowCount ?? rows.length };
}
