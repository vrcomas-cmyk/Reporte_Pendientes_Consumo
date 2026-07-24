import { create } from 'zustand';
import { solicitudRepository } from '@/repositories';
import type { SolicitudDRP } from '@/core/types';

interface SolicitudState {
  list: SolicitudDRP[];
  /** sourceKey -> true, for O(1) "ya solicitada" badge lookups from any
   * report table without scanning `list` per row. */
  sourceKeys: Set<string>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (sol: SolicitudDRP) => void;
  update: (id: number, patch: Partial<SolicitudDRP>) => void;
  remove: (id: number) => void;
}

/** In-memory mirror of the `solicitudes` Dexie store, so report pages can
 * show a live "ya solicitada" badge and SolicitudesPage a live table without
 * each re-querying IndexedDB. Call `hydrate()` once on app mount. */
export const useSolicitudStore = create<SolicitudState>()((set, get) => ({
  list: [],
  sourceKeys: new Set(),
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    const list = await solicitudRepository.list();
    set({ list, sourceKeys: new Set(list.map((s) => s.sourceKey)), hydrated: true });
  },
  add: (sol) => set((s) => ({
    list: [sol, ...s.list],
    sourceKeys: new Set(s.sourceKeys).add(sol.sourceKey),
  })),
  update: (id, patch) => set((s) => ({
    list: s.list.map((sol) => (sol.id === id ? { ...sol, ...patch } : sol)),
  })),
  remove: (id) => set((s) => {
    const removed = s.list.find((sol) => sol.id === id);
    const list = s.list.filter((sol) => sol.id !== id);
    const sourceKeys = new Set(s.sourceKeys);
    // Only drop the key if no other request still uses it.
    if (removed && !list.some((sol) => sol.sourceKey === removed.sourceKey)) sourceKeys.delete(removed.sourceKey);
    return { list, sourceKeys };
  }),
}));
