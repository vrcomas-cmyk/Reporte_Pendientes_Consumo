import * as XLSX from 'xlsx';
import { roleOf, ROLE_LABEL } from '@/core/roleDetection';
import type { SheetRole } from '@/core/types';

export interface ReportSheetInfo {
  name: string;
  role: SheetRole | null;
  label: string;
}

/**
 * Lightweight peek at a report workbook: reads only the header row of every
 * sheet (`sheetRows: 1`) to detect each sheet's role, without parsing the
 * (potentially huge) bodies. Used to let the user pick which tabs to load
 * before the heavy processing runs.
 */
export async function peekReportSheets(file: File): Promise<ReportSheetInfo[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', sheetRows: 1 });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const first = (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })[0] as unknown[] | undefined) || [];
    const headers = first.map((h) => String(h ?? ''));
    const role = roleOf(headers);
    return { name, role, label: role ? ROLE_LABEL[role] : name };
  });
}
