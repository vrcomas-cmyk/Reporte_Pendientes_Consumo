import { create } from 'zustand';
import type { AlertaColocacion, LoteOfertable } from '@/core/matchingOfertas';
import type { CondicionEspecial } from '@/core/types';

// Cross-report navigation modeled as a simple stack of panel descriptors,
// replacing the legacy navOpen/navPush/backBtn modal history. The top of the
// stack is the panel currently shown inside a closable Sheet; `back` pops one
// level, `open` resets the stack, `close` clears it.
export type Panel =
  | { type: 'sugDetalle'; boKey: string }
  | { type: 'pedido'; pedido: string; boKey?: string }
  | { type: 'evol'; kind: 'solic' | 'dest'; key: string }
  | { type: 'codigoEvol'; kind: 'solic' | 'dest'; key: string; material: string }
  | { type: 'material'; material: string }
  | { type: 'consumoMaterial'; dest: string; material: string }
  | { type: 'clientesMes'; material: string; mes: string }
  // #18: month click on the aggregated "Facturación mensual (filtro)" chart — carries a
  // pre-computed snapshot of the rows matching the mes under the currently active Consumo filters
  // (generalizes legacy openClientesMes beyond a single material).
  | { type: 'mesClientesFiltro'; mes: string; rows: { razon: string; solic: string; dest: string; material: string; cant: number; imp: number }[] }
  | { type: 'sector'; sector: string }
  | { type: 'grupo'; grupo: string }
  | { type: 'celda'; material: string; centro: string }
  | { type: 'materialTotales'; material: string }
  // Client-centric detail (Consumo row click): open orders + consumption history for one
  // destinatario, as opposed to the material-centric 'material' panel.
  | { type: 'clienteDetalle'; dest: string }
  // Módulo Oportunidades Comerciales (fase 1): vista 360 de un material dentro
  // del panel lateral persistente, con pestañas (req. 7 del plan) en vez de
  // navegar a otra página — el tab activo viaja en el propio descriptor, así
  // "Atrás" reabre exactamente el mismo tab.
  | { type: 'materialHub'; material: string; tab?: MaterialHubTab; lote?: string; condicion?: string }
  | { type: 'oportunidad'; id: number }
  // Enfoque "código A tiene 3 lotes, N clientes califican" de las alertas de
  // colocación (agrupadas por material en vez de por cliente↔material) —
  // snapshot de los clientes candidatos ya resueltos, igual que
  // `mesClientesFiltro` lleva sus `rows` precomputadas.
  | { type: 'materialColocacion'; material: string; descripcion: string; clientes: AlertaColocacion[]; lotes: LoteOfertable[] }
  // Fase 2: ficha de conocimiento de un cliente (mini-CRM) — mismo criterio de
  // tab-en-el-descriptor que materialHub, así "Atrás" no pierde la pestaña.
  // `prefill*` (fase 3): contexto opcional de un material/oportunidad concreta
  // desde donde se abrió la ficha — precarga el formulario de la pestaña
  // Ofertas sin tener que volver a buscar el material. `prefillCondicion*`
  // (ronda 4): el lote concreto que ESE cliente aceptaría, calculado en
  // MaterialColocacionPanel — conecta el "Ofertar" con la condición real del
  // material en vez de que el usuario la escriba de cero en OfertaForm.
  | {
      type: 'clienteConocimiento'; dest: string; razonSocial?: string; tab?: 'resumen' | 'ficha' | 'timeline' | 'ofertas';
      prefillMaterial?: string; prefillOportunidadId?: number; prefillLote?: string;
      prefillCondicion?: CondicionEspecial; prefillCondicionTexto?: string; prefillFechaCaducidad?: string | null;
    };

export type MaterialHubTab = 'resumen' | 'inventario' | 'pedidos' | 'consumo' | 'ventas' | 'notas' | 'historial' | 'compatibilidad' | 'ofrecer';

interface PanelState {
  stack: Panel[];
  open: (p: Panel) => void;
  push: (p: Panel) => void;
  /** Reemplaza el panel en el TOPE del stack en vez de apilar uno nuevo —
   * usar para cambios que modifican el mismo panel (p.ej. cambiar de tab
   * dentro de materialHub/clienteConocimiento). `push` es solo para navegar
   * a un panel distinto (drill-down real) donde "Atrás" debe volver al
   * anterior. Confundir ambos fue la causa de un bug real: cada clic de tab
   * apilaba una entrada nueva, así que "Atrás" retrocedía tab por tab en vez
   * de cerrar, y el reflow resultante (stack creciendo sin límite con clics
   * rápidos) disparaba "Maximum update depth exceeded". */
  replaceTop: (p: Panel) => void;
  back: () => void;
  close: () => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  stack: [],
  open: (p) => set({ stack: [p] }),
  push: (p) => set((s) => ({ stack: [...s.stack, p] })),
  replaceTop: (p) => set((s) => (s.stack.length ? { stack: [...s.stack.slice(0, -1), p] } : { stack: [p] })),
  back: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  close: () => set({ stack: [] }),
}));
