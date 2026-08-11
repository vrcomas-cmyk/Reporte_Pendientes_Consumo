import { create } from 'zustand';
import { loadScoringWeights } from '@/services/scoringWeightsService';
import type { CriterioKey } from '@/core/scoring';

interface ScoringWeightsState {
  pesos: Partial<Record<CriterioKey, number>>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  invalidate: () => void;
}

/** Espejo en memoria de los pesos del motor de compatibilidad — se hidrata
 * una vez al montar la app (igual que conocimientoStore) y se invalida
 * cuando un admin guarda un cambio en /admin → Compatibilidad, para que el
 * siguiente ranking ya use el valor nuevo sin recargar la página. */
export const useScoringWeightsStore = create<ScoringWeightsState>()((set, get) => ({
  pesos: {},
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    const pesos = await loadScoringWeights();
    set({ pesos, hydrated: true });
  },
  invalidate: () => {
    set({ hydrated: false });
    void get().hydrate();
  },
}));
