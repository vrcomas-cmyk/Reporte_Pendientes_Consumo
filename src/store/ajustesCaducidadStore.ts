import { create } from 'zustand';
import { claveAjuste, type AjusteCaducidad } from '@/core/ajusteCaducidad';
import {
  borrarAjusteCaducidad, guardarAjusteCaducidad, guardarCacheAjustes, leerCacheAjustes, listarAjustesCaducidad,
} from '@/services/ajustesCaducidadService';

interface AjustesState {
  /** Ajustes por `claveAjuste(material, lote)`. */
  ajustes: Record<string, AjusteCaducidad>;
  cargando: boolean;
  error: string | null;
  /** Lee la hoja de respaldo; si falla se queda con la copia local. */
  cargar: () => Promise<void>;
  /** Guarda el ajuste (optimista; si la hoja no lo acepta se revierte y se lanza el error). */
  guardar: (a: { material: string; lote: string; fecha: string; sistema: string; nota: string }) => Promise<void>;
  /** Quita el ajuste: el lote vuelve a la caducidad del sistema. */
  restaurar: (material: string, lote: string) => Promise<void>;
}

const aMapa = (lista: readonly AjusteCaducidad[]): Record<string, AjusteCaducidad> =>
  Object.fromEntries(lista.map((a) => [claveAjuste(a.material, a.lote), a]));

export const useAjustesCaducidadStore = create<AjustesState>((set, get) => ({
  ajustes: aMapa(leerCacheAjustes()),
  cargando: false,
  error: null,
  cargar: async () => {
    if (get().cargando) return;
    set({ cargando: true, error: null });
    try {
      const lista = await listarAjustesCaducidad();
      guardarCacheAjustes(lista);
      set({ ajustes: aMapa(lista), cargando: false });
    } catch (e) {
      set({ cargando: false, error: e instanceof Error ? e.message : 'No se pudieron leer los ajustes de caducidad.' });
    }
  },
  guardar: async (a) => {
    const k = claveAjuste(a.material, a.lote);
    const previo = get().ajustes[k];
    set((s) => ({ ajustes: { ...s.ajustes, [k]: { ...a, usuario: previo?.usuario ?? '', actualizado: '' } } }));
    try {
      const guardado = await guardarAjusteCaducidad(a);
      set((s) => ({ ajustes: { ...s.ajustes, [k]: guardado } }));
      guardarCacheAjustes(Object.values(get().ajustes));
    } catch (e) {
      set((s) => {
        const resto = { ...s.ajustes };
        if (previo) resto[k] = previo; else delete resto[k];
        return { ajustes: resto };
      });
      throw e;
    }
  },
  restaurar: async (material, lote) => {
    const k = claveAjuste(material, lote);
    const previo = get().ajustes[k];
    if (!previo) return;
    set((s) => { const resto = { ...s.ajustes }; delete resto[k]; return { ajustes: resto }; });
    try {
      await borrarAjusteCaducidad(material, lote);
      guardarCacheAjustes(Object.values(get().ajustes));
    } catch (e) {
      set((s) => ({ ajustes: { ...s.ajustes, [k]: previo } }));
      throw e;
    }
  },
}));
