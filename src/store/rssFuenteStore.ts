import { create } from 'zustand';

/** De dónde leen el inventario (`a.rss`) los paneles de detalle (celda, material, totales…): del reporte "Resumen Sin
 * Sugerencias" (`'sin'`), de los libros de Disponibilidad (`'disp'`) o de los libros de Inv con Condición (`'libros'`: además
 * `invCondicion` y `lotes`). Lo fija el módulo Inventario que esté abierto, para
 * que sus paneles muestren los MISMOS datos que la tabla desde la que se abrieron. */
export type RssFuente = 'sin' | 'disp' | 'libros';

interface RssFuenteState {
  fuente: RssFuente;
  setFuente: (f: RssFuente) => void;
}

export const useRssFuenteStore = create<RssFuenteState>((set) => ({ fuente: 'sin', setFuente: (fuente) => set({ fuente }) }));
