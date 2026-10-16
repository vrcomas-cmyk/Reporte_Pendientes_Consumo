import { create } from 'zustand';

const KEY = 'tiles-ocultos';

function leer(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function guardar(v: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

interface TilesOcultosState {
  /** Claves (label) de las tarjetas StatTile ocultas por el usuario — globales: aplican en todos los detalles y módulos. */
  ocultos: string[];
  ocultar: (k: string) => void;
  mostrar: (k: string) => void;
  mostrarTodos: () => void;
}

export const useTilesOcultosStore = create<TilesOcultosState>()((set, get) => ({
  ocultos: leer(),
  ocultar: (k) => { if (get().ocultos.includes(k)) return; const n = [...get().ocultos, k]; guardar(n); set({ ocultos: n }); },
  mostrar: (k) => { const n = get().ocultos.filter((x) => x !== k); guardar(n); set({ ocultos: n }); },
  mostrarTodos: () => { guardar([]); set({ ocultos: [] }); },
}));
