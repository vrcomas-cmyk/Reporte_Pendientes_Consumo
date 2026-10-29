import { create } from 'zustand';
import type { AmbitoPend } from '@/core/resumenSin';

/** De dónde leen el inventario (`a.rss`) los paneles de detalle (celda, material, totales…): del reporte "Resumen Sin
 * Sugerencias" (`'sin'`), de los libros de Disponibilidad (`'disp'`) o de los libros de Inv con Condición (`'libros'`: además
 * `invCondicion` y `lotes`). Lo fija el módulo Inventario que esté abierto, para
 * que sus paneles muestren los MISMOS datos que la tabla desde la que se abrieron. */
export type RssFuente = 'sin' | 'disp' | 'libros';

interface RssFuenteState {
  fuente: RssFuente;
  setFuente: (f: RssFuente) => void;
  /** Alcance del pendiente elegido en Inv con Condición, para que el detalle de celda muestre el mismo número que la tabla. */
  ambitoPend: AmbitoPend;
  setAmbitoPend: (a: AmbitoPend) => void;
}

export const useRssFuenteStore = create<RssFuenteState>((set) => ({
  fuente: 'sin', setFuente: (fuente) => set({ fuente }),
  ambitoPend: 'condicion', setAmbitoPend: (ambitoPend) => set({ ambitoPend }),
}));
