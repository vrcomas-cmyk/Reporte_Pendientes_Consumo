import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { loadNombres } from '@/services/nombresService';
import type { NombresMap } from '@/lib/nombres';

interface NombresState {
  centros: NombresMap;
  almacenes: NombresMap;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  invalidate: () => void;
}

/** Espejo en memoria de los nombres de centros/almacenes configurados en
 * /admin → Nombres. Se hidrata al montar la app y se invalida cuando un admin
 * guarda, igual que scoringWeightsStore. Si Supabase falla, quedan vacíos y
 * la UI muestra solo códigos. */
export const useNombresStore = create<NombresState>()((set, get) => ({
  centros: {},
  almacenes: {},
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const n = await loadNombres();
      set({ centros: n.centros, almacenes: n.almacenes, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  invalidate: () => {
    set({ hydrated: false });
    void get().hydrate();
  },
}));

interface VistaCentrosState {
  mostrarNombres: boolean;
  setMostrarNombres: (v: boolean) => void;
}

/** Preferencia por usuario (local): ver los centros como `1001` o `1001 (Tijuana)`.
 * Es un store (no usePersistedState) para que la tabla y los paneles se
 * sincronicen al instante. */
export const useVistaCentrosStore = create<VistaCentrosState>()(
  persist(
    (set) => ({ mostrarNombres: false, setMostrarNombres: (v) => set({ mostrarNombres: v }) }),
    { name: 'degasa-vista-centros' },
  ),
);
