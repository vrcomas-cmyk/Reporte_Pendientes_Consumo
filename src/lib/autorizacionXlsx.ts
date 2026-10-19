import * as XLSX from 'xlsx';
import { toast } from '@/store/toastStore';
import { COL, TEXTO_INSTRUCCIONES, columnasDirector } from '@/core/autorizacionExcel';

/** Escribe el archivo para el director: hoja «Precios» (con «Precio autorizado» vacía) + hoja «Instrucciones». */
export function exportarParaDirector(filename: string, filas: Record<string, unknown>[], mostrarCosto: boolean): boolean {
  if (!filas.length) {
    toast.warning('No hay precios por autorizar para exportar');
    return false;
  }
  const columnas = columnasDirector(mostrarCosto);
  const ws = XLSX.utils.json_to_sheet(filas, { header: columnas });
  // Anchos legibles; el ID es largo pero no se edita.
  ws['!cols'] = columnas.map((c) => ({ wch: c === COL.id ? 38 : c === COL.descripcion ? 38 : c === COL.comentario ? 34 : c === COL.condicion || c === COL.grupo ? 24 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Precios');
  const wi = XLSX.utils.aoa_to_sheet(TEXTO_INSTRUCCIONES.map((t) => [t]));
  wi['!cols'] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wi, 'Instrucciones');
  try {
    XLSX.writeFile(wb, filename);
  } catch (e) {
    toast.error('No se pudo exportar', e instanceof Error ? e.message : String(e));
    return false;
  }
  toast.success(`Exportado: ${filename}`);
  return true;
}

/** Lee el archivo que regresó el director: la primera hoja que trae la columna «Precio autorizado» (o la primera hoja). Lanza si no se puede leer. */
export async function leerArchivoDirector(file: File): Promise<Record<string, unknown>[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const tiene = (nombre: string) => {
    const ws = wb.Sheets[nombre];
    if (!ws) return false;
    const [encabezados] = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    return (encabezados ?? []).some((h) => /precio\s+autorizado/i.test(String(h).normalize('NFD').replace(/[̀-ͯ]/g, '')));
  };
  const hoja = wb.SheetNames.find(tiene) ?? wb.SheetNames[0];
  const ws = hoja ? wb.Sheets[hoja] : undefined;
  if (!ws) throw new Error('El archivo no tiene hojas.');
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}
