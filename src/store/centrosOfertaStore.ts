import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ModoCentro = 'local' | 'compartido';

/** Regla de a quién se puede ofrecer un lote según SU centro: `local` = solo a clientes de ese mismo centro (casi siempre, p. ej. 1004);
 * `compartido` = a clientes de varios centros (p. ej. 1018). Lo que no está en `modos` es compartido. Editable en pantalla y persistida. */
interface CentrosOfertaState {
  modos: Record<string, ModoCentro>;
  /** Excepción puntual: mostrar también a clientes de otros centros para lotes locales (no persistido). */
  incluirOtros: boolean;
  setModo: (centro: string, modo: ModoCentro) => void;
  alternar: (centro: string) => void;
  setIncluirOtros: (v: boolean) => void;
}

export const MODOS_POR_OMISION: Record<string, ModoCentro> = { '1004': 'local' };

export const useCentrosOfertaStore = create<CentrosOfertaState>()(
  persist(
    (set) => ({
      modos: MODOS_POR_OMISION,
      incluirOtros: false,
      setModo: (centro, modo) => set((s) => ({ modos: { ...s.modos, [centro]: modo } })),
      alternar: (centro) => set((s) => ({ modos: { ...s.modos, [centro]: s.modos[centro] === 'local' ? 'compartido' : 'local' } })),
      setIncluirOtros: (v) => set({ incluirOtros: v }),
    }),
    { name: 'degasa-centros-oferta', partialize: (s) => ({ modos: s.modos }) },
  ),
);
