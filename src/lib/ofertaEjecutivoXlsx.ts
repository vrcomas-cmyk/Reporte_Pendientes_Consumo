import * as XLSX from 'xlsx';
import { toast } from '@/store/toastStore';
import type { GrupoEjecutivo } from '@/core/ofertasEjecutivo';
import { COLUMNAS_OFERTA, TEXTO_INSTRUCCIONES_OFERTA, matrizOferta, nombreArchivoOferta, type AlertaDeLinea } from '@/core/ofertaEjecutivoExcel';
import { stamp } from '@/lib/exportXlsx';

const ANCHOS = [10, 12, 12, 12, 30, 12, 10, 10, 14, 32, 10, 14, 32, 14, 22, 10, 10, 12, 12, 11, 11, 12, 40];

/** Libro de oferta de un ejecutivo (hoja «Oferta» + «Instrucciones»), en memoria. */
export function libroOferta(g: GrupoEjecutivo, opts: { centros: readonly string[]; alerta?: AlertaDeLinea; generadaEn?: string }): XLSX.WorkBook {
  const generadaEn = opts.generadaEn ?? new Date().toLocaleString('es-MX');
  const ws = XLSX.utils.aoa_to_sheet(matrizOferta(g, { centros: opts.centros, generadaEn, ...(opts.alerta ? { alerta: opts.alerta } : {}) }));
  ws['!cols'] = COLUMNAS_OFERTA.map((_, i) => ({ wch: ANCHOS[i] ?? 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Oferta');
  const wi = XLSX.utils.aoa_to_sheet(TEXTO_INSTRUCCIONES_OFERTA.map((t) => [t]));
  wi['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wi, 'Instrucciones');
  return wb;
}

/** Descarga el Excel de un ejecutivo. Devuelve el nombre del archivo, o null si falló. */
export function descargarOfertaEjecutivo(g: GrupoEjecutivo, opts: { centros: readonly string[]; alerta?: AlertaDeLinea }, silencioso = false): string | null {
  const filename = nombreArchivoOferta(g, stamp());
  try {
    XLSX.writeFile(libroOferta(g, opts), filename);
  } catch (e) {
    toast.error('No se pudo exportar', e instanceof Error ? e.message : String(e));
    return null;
  }
  if (!silencioso) toast.success(`Exportado: ${filename}`);
  return filename;
}
