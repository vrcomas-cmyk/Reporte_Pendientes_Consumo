import { create } from 'zustand';
import { loadGruposExcluidos } from '@/services/gruposExcluidosService';
import { GRUPOS_EXCLUIDOS_DEFAULT } from '@/lib/gruposCliente';

interface GruposExcluidosState {
  /** Códigos Gpo. Cte. excluidos por defecto de los filtros de Grupo cliente. */
  codigos: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  invalidate: () => void;
}

/** Espejo en memoria de /admin → Filtros. Arranca con el default (18 =
 * GOBIERNO) para que funcione antes de hidratar o si Supabase falla; se
 * invalida cuando un admin guarda, igual que nombresStore. */
export const useGruposExcluidosStore = create<GruposExcluidosState>()((set, get) => ({
  codigos: [...GRUPOS_EXCLUIDOS_DEFAULT],
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      set({ codigos: await loadGruposExcluidos(), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  invalidate: () => {
    set({ hydrated: false });
    void get().hydrate();
  },
}));
