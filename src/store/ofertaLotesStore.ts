import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Un lote seleccionado para ofertar a un cliente concreto (lote × cliente). */
export interface ItemOfertaLote {
  clave: string;
  material: string;
  desc: string;
  lote: string;
  centro: string;
  almacen: string;
  caducidad: string | null;
  disponible: number;
  cantidad: number;
  destinatario: string;
  cliente: string;
  ejecutivo: string;
  precioUltimo: number;
  precioP50: number;
  precioOferta: number;
  /** Código que el cliente SÍ compra, cuando se le ofrece este lote como sustituto suyo. */
  viaSustituto?: string;
}

export const claveItemOferta = (material: string, lote: string, centro: string, almacen: string, destinatario: string) =>
  [material, lote, centro, almacen, destinatario].join('|');

/** Selección de lotes a ofertar (Inv con Condición → candidatos). Persistida para no perderla al cambiar de lote/panel. */
interface OfertaLotesState {
  items: Record<string, ItemOfertaLote>;
  toggle: (it: ItemOfertaLote) => void;
  setCantidad: (clave: string, cantidad: number) => void;
  remove: (clave: string) => void;
  clear: () => void;
}

export const useOfertaLotesStore = create<OfertaLotesState>()(
  persist(
    (set) => ({
      items: {},
      toggle: (it) => set((s) => {
        const next = { ...s.items };
        if (next[it.clave]) delete next[it.clave]; else next[it.clave] = it;
        return { items: next };
      }),
      setCantidad: (clave, cantidad) => set((s) => (s.items[clave] ? { items: { ...s.items, [clave]: { ...s.items[clave], cantidad: Math.max(0, cantidad) } } } : s)),
      remove: (clave) => set((s) => {
        const next = { ...s.items };
        delete next[clave];
        return { items: next };
      }),
      clear: () => set({ items: {} }),
    }),
    { name: 'degasa-oferta-lotes' },
  ),
);
