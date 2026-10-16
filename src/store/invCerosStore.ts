import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** "Ocultar inventarios en 0" de los detalles: un solo interruptor persistente para todos los bloques de inventario. */
interface InvCerosState { ocultar: boolean; setOcultar: (v: boolean) => void }

export const useInvCerosStore = create<InvCerosState>()(
  persist(
    (set) => ({ ocultar: false, setOcultar: (v) => set({ ocultar: v }) }),
    { name: 'degasa-inv-ceros' },
  ),
);
