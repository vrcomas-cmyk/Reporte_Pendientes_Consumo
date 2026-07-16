import { create } from 'zustand';

// Cross-report navigation modeled as a simple stack of panel descriptors,
// replacing the legacy navOpen/navPush/backBtn modal history. The top of the
// stack is the panel currently shown inside a closable Sheet; `back` pops one
// level, `open` resets the stack, `close` clears it.
export type Panel =
  | { type: 'sugDetalle'; boKey: string }
  | { type: 'pedido'; pedido: string }
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
  | { type: 'clienteDetalle'; dest: string };

interface PanelState {
  stack: Panel[];
  open: (p: Panel) => void;
  push: (p: Panel) => void;
  back: () => void;
  close: () => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  stack: [],
  open: (p) => set({ stack: [p] }),
  push: (p) => set((s) => ({ stack: [...s.stack, p] })),
  back: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  close: () => set({ stack: [] }),
}));
