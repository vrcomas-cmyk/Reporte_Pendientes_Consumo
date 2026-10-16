import { create } from 'zustand';
import type { AlmacenesAsignados, DatosFacturacion } from '@/core/facturacionLibros';
import type { ConsumoRow, FacMensualCamRow, ResumenFacRow } from '@/core/types';
import type { RFIndex } from '@/core/resumenFac';

export type { DatosFacturacion };

/** Un libro trimestral de facturación de la carpeta de Drive ("1Q 2024", "2Q 2024"…). */
export interface InfoLibroFac {
  nombre: string;
  /** Filas ya agregadas del libro. */
  filas: number;
  /** `ultimaModificacion` del libro en Drive con la que se descargó. */
  modificado: string;
  /** Se bajó con precios mínimo / máximo de las líneas. */
  conPrecios?: boolean;
  /** Se bajó con el día de la línea más reciente. */
  conFechas?: boolean;
}

/** Índices YA calculados (leídos de la caché local) que corresponden EXACTAMENTE a `filas`: si `resumenFac` sigue siendo ese mismo arreglo
 * no hay que recalcular `rf` ni el consumo. Un sync que cambia datos pone esto en null. */
export interface PrecalculadosFac {
  filas: ResumenFacRow[];
  rf: RFIndex;
  consumo: ConsumoRow[];
}

/** Estado global del módulo "Facturación": las filas de Resumen_Fac armadas SOLO con los libros trimestrales de
 * Drive (independiente del reporte diario), el detalle de cada libro y el progreso del sync. Global y no por página
 * para que sobreviva a navegar, para que Carga y la barra superior muestren el avance y para que los paneles de
 * detalle lo lean desde cualquier lado. */
interface FacturacionState {
  resumenFac: ResumenFacRow[] | null;
  facMensualCam: FacMensualCamRow[] | null;
  almacenesAsignados: AlmacenesAsignados;
  libros: InfoLibroFac[];
  /** Ver `PrecalculadosFac`. */
  derivados: PrecalculadosFac | null;
  /** Cuándo se descargó por última vez (null si solo se restauró de la caché local). */
  leidoEn: string | null;
  /** True cuando ya se intentó restaurar la caché (distingue "vacío" de "aún no cargó"). */
  hidratado: boolean;
  syncing: boolean;
  progress: { mensaje: string; porcentaje: number } | null;
  error: string | null;
  /** Última vez que se revisó Drive con éxito (solo en memoria). */
  ultimaRevision: number | null;
  restaurar: (datos: DatosFacturacion | null, libros: InfoLibroFac[], derivados?: PrecalculadosFac | null) => void;
  start: () => void;
  setProgress: (mensaje: string, porcentaje: number) => void;
  completar: (datos: DatosFacturacion, libros: InfoLibroFac[]) => void;
  /** Drive se revisó y nada cambió: no se tocan los datos (misma referencia → no se recalcula nada), solo el estado del sync. */
  revisado: (libros: InfoLibroFac[]) => void;
  fallar: (mensaje: string) => void;
}

export const useFacturacionStore = create<FacturacionState>((set) => ({
  resumenFac: null,
  facMensualCam: null,
  almacenesAsignados: { renglones: 0, importe: 0 },
  libros: [],
  derivados: null,
  leidoEn: null,
  hidratado: false,
  syncing: false,
  progress: null,
  error: null,
  ultimaRevision: null,
  restaurar: (datos, libros, derivados = null) => set({ derivados, resumenFac: datos?.resumenFac ?? null, facMensualCam: datos?.facMensualCam ?? null, almacenesAsignados: datos?.almacenesAsignados ?? { renglones: 0, importe: 0 }, libros, hidratado: true }),
  start: () => set({ syncing: true, error: null, progress: { mensaje: 'Consultando libros de facturación…', porcentaje: 2 } }),
  setProgress: (mensaje, porcentaje) => set({ progress: { mensaje, porcentaje } }),
  completar: (datos, libros) => set({ derivados: null, resumenFac: datos.resumenFac, facMensualCam: datos.facMensualCam, almacenesAsignados: datos.almacenesAsignados, libros, leidoEn: new Date().toISOString(), syncing: false, progress: null, error: null, ultimaRevision: Date.now() }),
  revisado: (libros) => set({ libros, syncing: false, progress: null, error: null, ultimaRevision: Date.now() }),
  fallar: (mensaje) => set({ syncing: false, progress: null, error: mensaje }),
}));
