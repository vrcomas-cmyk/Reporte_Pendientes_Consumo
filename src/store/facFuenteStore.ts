import { create } from 'zustand';

/** True mientras el módulo "Facturación" está abierto: los paneles de detalle (PanelHost) leen entonces el consumo y la
 * facturación armados con los libros de Drive, los mismos que muestra su tabla. También evita calcular esos índices
 * (cientos de miles de filas) cuando ningún módulo los necesita.
 *
 * `demanda`: otros módulos que SÍ necesitan esa facturación aunque no sea la tabla de Facturación (p. ej. la Tendencia de
 * Inventario · Disponibilidad) la piden con `pedir()` mientras están abiertos; devuelve la función para soltarla. */
interface FacFuenteState {
  activo: boolean;
  setActivo: (v: boolean) => void;
  demanda: number;
  pedir: () => () => void;
}

export const useFacFuenteStore = create<FacFuenteState>((set) => ({
  activo: false,
  setActivo: (activo) => set({ activo }),
  demanda: 0,
  pedir: () => {
    set((s) => ({ demanda: s.demanda + 1 }));
    let soltada = false;
    return () => {
      if (soltada) return;
      soltada = true;
      set((s) => ({ demanda: Math.max(0, s.demanda - 1) }));
    };
  },
}));
