import * as XLSX from 'xlsx';
import { toast } from '@/store/toastStore';

/**
 * Exporta un arreglo de objetos planos { Columna: valor } a un archivo .xlsx.
 * Recibe las filas ya filtradas/ordenadas tal como se ven en la tabla.
 */
export async function exportXlsx(filename: string, rows: Record<string, unknown>[], sheetName = 'Datos'): Promise<boolean> {
  if (!rows || !rows.length) {
    toast.warning('No hay filas para exportar');
    return false;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  try {
    XLSX.writeFile(wb, filename);
  } catch (e) {
    toast.error('No se pudo exportar', e instanceof Error ? e.message : String(e));
    return false;
  }
  toast.success(`Exportado: ${filename}`);
  return true;
}

/**
 * Exporta varias hojas en un solo libro. Útil para vistas con múltiples
 * tablas (p.ej. Análisis) donde no existe una única tabla filtrable.
 */
export async function exportXlsxMultiSheet(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]): Promise<boolean> {
  const withData = sheets.filter((s) => s.rows && s.rows.length);
  if (!withData.length) {
    toast.warning('No hay filas para exportar');
    return false;
  }
  const wb = XLSX.utils.book_new();
  withData.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  try {
    XLSX.writeFile(wb, filename);
  } catch (e) {
    toast.error('No se pudo exportar', e instanceof Error ? e.message : String(e));
    return false;
  }
  toast.success(`Exportado: ${filename}`);
  return true;
}

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
