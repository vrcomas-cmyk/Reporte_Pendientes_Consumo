import { create } from 'zustand';
import type { HojaIndexada, LibroClave } from '@/core/pedidos';

/** Última descarga de un libro de Google Sheets (Seg pedidos, Disponibilidad o Inv_Condicion). */
export interface InfoFuente {
  /** Nombre del libro en Drive. */
  nombre: string;
  /** `ultimaModificacion` del libro en Drive cuando se descargó. */
  modificado: string;
  leidoEn: string;
  filas: number;
}

/** Estado global del módulo "Seg. de pedidos": las hojas ya indexadas (restauradas de la caché de
 * IndexedDB y/o recién descargadas de Google Sheets), la última descarga de cada libro y el progreso del
 * sync. Global y no por página para que sobreviva a navegar fuera y de vuelta, y para que el detalle de
 * material y las analíticas lo lean desde cualquier lado. Descargar un libro REEMPLAZA por completo sus
 * hojas (`reemplazarLibro`); si la descarga falla, se conservan las anteriores. */
interface PedidosState {
  /** Hojas indexadas por `<libro>:<hoja>`. */
  hojas: Record<string, HojaIndexada>;
  fuentes: Partial<Record<LibroClave, InfoFuente>>;
  /** True cuando ya se intentó restaurar la caché (distingue "vacío" de "aún no cargó"). */
  hidratado: boolean;
  syncing: boolean;
  progress: { mensaje: string; porcentaje: number } | null;
  error: string | null;
  /** Última vez que se consultó el manifiesto con éxito (solo en memoria). */
  ultimaRevision: number | null;
  restaurar: (hojas: HojaIndexada[], fuentes: Partial<Record<LibroClave, InfoFuente>>) => void;
  /** Reemplaza todas las hojas de un libro por las nuevas. */
  reemplazarLibro: (libro: LibroClave, hojas: HojaIndexada[], fuente: InfoFuente) => void;
  start: () => void;
  setProgress: (mensaje: string, porcentaje: number) => void;
  finish: (error?: string) => void;
}

export const usePedidosStore = create<PedidosState>((set) => ({
  hojas: {},
  fuentes: {},
  hidratado: false,
  syncing: false,
  progress: null,
  error: null,
  ultimaRevision: null,
  restaurar: (hojas, fuentes) => set({ hojas: Object.fromEntries(hojas.map((h) => [`${h.libro}:${h.hoja}`, h])), fuentes, hidratado: true }),
  reemplazarLibro: (libro, hojas, fuente) =>
    set((s) => {
      const restantes = Object.fromEntries(Object.entries(s.hojas).filter(([, h]) => h.libro !== libro));
      const nuevas = Object.fromEntries(hojas.map((h) => [`${h.libro}:${h.hoja}`, h]));
      return { hojas: { ...restantes, ...nuevas }, fuentes: { ...s.fuentes, [libro]: fuente } };
    }),
  start: () => set({ syncing: true, progress: null, error: null }),
  setProgress: (mensaje, porcentaje) => set({ progress: { mensaje, porcentaje } }),
  finish: (error) => set({ syncing: false, error: error ?? null, progress: null, ultimaRevision: error ? null : Date.now() }),
}));

/** Hojas de un libro, en el orden en que se guardaron. */
export function hojasDeLibro(hojas: Record<string, HojaIndexada>, libro: HojaIndexada['libro']): HojaIndexada[] {
  return Object.values(hojas).filter((h) => h.libro === libro);
}
