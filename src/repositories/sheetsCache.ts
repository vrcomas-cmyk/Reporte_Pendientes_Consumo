import { db, type SheetsCacheRow } from './db';

/** Dense-rows IndexedDB cache for the four Google Sheets report tabs. Lives
 * separately from `analyses` so the report-sheets sync can append just the
 * new rows from Apps Script (offset === rows.length) and merge them here,
 * avoided a full re-fetch of an ~80k-row "Reporte de Consumo" tab every time
 * a few rows land. See `reportSheetsService.syncReportSheets` for the use.
 *
 * Keyed by tab name (`"Reporte de Consumo"`, …); one row per tab. `rowCount`
 * mirrors the most recent total rowCount reported by the Apps Script response
 * and is what `syncReportSheets` checks to detect a tab being truncated or
 * replaced (rowCount dropping below the cached `rows.length`), in which case
 * the whole tab is re-fetched and this cache rewritten. */

export async function getCachedTab(tab: string): Promise<SheetsCacheRow | undefined> {
  return db.sheetsCache.get(tab);
}

export async function getAllCachedTabs(): Promise<SheetsCacheRow[]> {
  return db.sheetsCache.toArray();
}

export async function putCachedTab(row: SheetsCacheRow): Promise<void> {
  await db.sheetsCache.put(row);
}

export async function clearCachedTabs(): Promise<void> {
  await db.sheetsCache.clear();
}
