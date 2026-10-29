import { create } from 'zustand';
import { cargarPolitica, listarPropuestas, vigentes, type Propuesta } from '@/services/preciosService';
import { POLITICA_DEFECTO, type Politica } from '@/core/politicaPrecios';
import type { PrecioAutorizadoEntrada } from '@/core/precioAutorizado';

interface PreciosState {
  propuestas: Propuesta[];
  /** Política vigente: de ella salen los Status de Revision INCLUIDOS (cada Status incluido es una condición de Precios). */
  politica: Politica;
  cargado: boolean;
  load: () => Promise<void>;
}

export const usePreciosStore = create<PreciosState>((set) => ({
  propuestas: [],
  politica: POLITICA_DEFECTO,
  cargado: false,
  load: async () => {
    const [propuestas, politica] = await Promise.all([listarPropuestas(), cargarPolitica()]);
    set({ propuestas, politica, cargado: true });
  },
}));

/** Ofertas autorizadas, vigentes y aún válidas (> costo hoy), una por material + combinación de condiciones. */
export function autorizadosVigentes(propuestas: Propuesta[], costoDe: (material: string) => number): PrecioAutorizadoEntrada[] {
  return vigentes(propuestas, costoDe)
    .filter((p) => p.concepto === 'oferta' && p.condicion.trim() !== '')
    .map((p) => ({ material: p.material, combinacion: p.condicion, precio: p.precioPropuesto }));
}
