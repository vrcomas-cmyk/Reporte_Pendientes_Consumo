import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Centros que el usuario SÍ puede considerar al revisar inventario/fuentes en
 * el detalle de pedido (p. ej. 1017, 1018, 1022, 1031). Vacío = sin filtro.
 * Es un store (no `usePersistedState`) para que la barra, la tabla de fuentes
 * y el inventario de "otros centros" — componentes distintos — se sincronicen
 * al instante y el filtro se repita en todos los pedidos. */
interface CentrosFiltroState {
  centros: string[];
  toggle: (c: string) => void;
  clear: () => void;
}

export const useCentrosFiltroStore = create<CentrosFiltroState>()(
  persist(
    (set) => ({
      centros: [],
      toggle: (c) => set((s) => ({ centros: s.centros.includes(c) ? s.centros.filter((x) => x !== c) : [...s.centros, c] })),
      clear: () => set({ centros: [] }),
    }),
    { name: 'degasa-centros-filtro' },
  ),
);

/** ¿Un centro pasa el filtro? Siempre pasan: el centro del propio pedido, las
 * filas sin centro y todo cuando no hay centros elegidos. */
export function centroPasaFiltro(centro: string, centroPedido: string, elegidos: string[]): boolean {
  if (!elegidos.length || !centro) return true;
  return centro === centroPedido || elegidos.includes(centro);
}
