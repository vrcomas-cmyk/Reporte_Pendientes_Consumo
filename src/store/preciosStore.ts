import { create } from 'zustand';
import { listarPropuestas, vigentes, type Propuesta } from '@/services/preciosService';
import { etiquetaCombinacion, type PrecioAutorizado } from '@/core/enrich';
import { norm } from '@/lib/text';

interface PreciosState {
  propuestas: Propuesta[];
  cargado: boolean;
  load: () => Promise<void>;
}

export const usePreciosStore = create<PreciosState>((set) => ({
  propuestas: [],
  cargado: false,
  load: async () => set({ propuestas: await listarPropuestas(), cargado: true }),
}));

/** Precios de oferta autorizados y aún válidos (> costo vigente), por material normalizado — lo que consume `preciosPorCondicion`. */
export function autorizadosPorMaterial(propuestas: Propuesta[], costoDe: (material: string) => number): Map<string, PrecioAutorizado[]> {
  const out = new Map<string, PrecioAutorizado[]>();
  for (const p of vigentes(propuestas, costoDe)) {
    if (p.concepto !== 'oferta') continue;
    const k = norm(p.material);
    const arr = out.get(k) ?? [];
    arr.push({ condicion: etiquetaCombinacion(p.condicion), precio: p.precioPropuesto });
    out.set(k, arr);
  }
  return out;
}
