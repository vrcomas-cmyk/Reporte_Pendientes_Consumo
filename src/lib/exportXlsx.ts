import * as XLSX from 'xlsx';

/**
 * Exporta un arreglo de objetos planos { Columna: valor } a un archivo .xlsx.
 * Recibe las filas ya filtradas/ordenadas tal como se ven en la tabla.
 */
export function exportXlsx(filename: string, rows: Record<string, unknown>[], sheetName = 'Datos') {
  if (!rows || !rows.length) {
    window.alert('No hay filas para exportar.');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

/**
 * Exporta varias hojas en un solo libro. Útil para vistas con múltiples
 * tablas (p.ej. Análisis) donde no existe una única tabla filtrable.
 */
export function exportXlsxMultiSheet(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const withData = sheets.filter((s) => s.rows && s.rows.length);
  if (!withData.length) {
    window.alert('No hay filas para exportar.');
    return;
  }
  const wb = XLSX.utils.book_new();
  withData.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
