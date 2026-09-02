import { create } from 'zustand';
import type { AlertaColocacion, LoteOfertable } from '@/core/matchingOfertas';
import type { CondicionEspecial } from '@/core/types';
import type { Estado } from '@/core/resumenFac';

// Cross-report navigation modeled as a simple stack of panel descriptors,
// replacing the legacy navOpen/navPush/backBtn modal history. The top of the
// stack is the panel currently shown inside a closable Sheet; `back` pops one
// level, `open` resets the stack, `close` clears it.
export type Panel =
  | { type: 'sugDetalle'; boKey: string }
  // `lista` (opcional): pedidos distintos en el orden/filtro de la tabla al
  // abrir el detalle — habilita ◀/▶ para recorrerlos sin perder ese orden
  // (ver PedidoPanel). Ausente cuando se abre desde un lugar que no tiene
  // una lista clara (p.ej. AnalisisPage) — los controles simplemente no aparecen.
  | { type: 'pedido'; pedido: string; boKey?: string; lista?: string[] }
  | { type: 'evol'; kind: 'solic' | 'dest'; key: string }
  // Todos los pedidos pendientes (BO) de un ejecutivo — destino del chip
  // "Ejecutivo" en PedidoPanel, análogo a `evol` para solicitante/destinatario
  // pero sobre pedidos en vez de facturación (no hay índice de facturación
  // por ejecutivo).
  | { type: 'ejecutivoPedidos'; gpoVdor: string }
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
  // Detalle de una celda del reporte "Inv Condición" (InvConsolidado): a
  // diferencia de `celda` (que prioriza el desglose de Resumen Sin
  // Sugerencias), este SIEMPRE muestra el desglose por lote desde
  // "InvDetalle" — misma fuente/sincronización que el reporte, sin mezclar
  // con RSS que puede venir de otro spreadsheet desfasado en el tiempo.
  | { type: 'invCondCelda'; material: string; centro: string }
  | { type: 'materialTotales'; material: string }
  // Client-centric detail (Consumo row click): open orders + consumption history for one
  // destinatario, as opposed to the material-centric 'material' panel.
  // `material` (opcional): cuando se abre desde una fila de Consumo, precarga
  // la tarjeta de contexto del material de esa fila (último/penúltimo mes,
  // importe, precio, tendencia) además del resumen 360 del cliente.
  | { type: 'clienteDetalle'; dest: string; material?: string }
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
  // "Clientes que compran pero no cumplen su regla" (ronda 6): la fila de la
  // bandeja es compacta (1 línea por material); el detalle completo de
  // clientes candidatos por rotación vive aquí, igual que `materialColocacion`
  // lleva su propio snapshot precomputado.
  | {
      type: 'materialSinRegla'; material: string; descripcion: string;
      clientes: { dest: string; razonSocial: string; estado: Estado; ultimoMesFacturacion: string }[];
    }
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
