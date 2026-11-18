import { create } from 'zustand';
import { EnviosError } from '@/services/enviosService';
import { cargarHistorialTransmision, cargarIndiceTransmision } from '@/services/transmisionService';
import { normalizarClaveTx, type HistorialMaterialesTx, type IndiceTx } from '@/core/transmision';

/** Cuánto tiempo se reutiliza el índice antes de volver a pedirlo (el servidor además lo cachea 5 min). */
const REFRESCO_MS = 5 * 60_000;
const LS_KEY = 'transmision.indice.v1';

export type EstadoTransmision = 'idle' | 'cargando' | 'ok' | 'error' | 'sinPermiso';

interface TransmisionState {
  /** Pedidos en transmisión; null hasta la primera carga. */
  indice: IndiceTx | null;
  /** Material / lote por entrega, solo de las entregas que ya se consultaron (paneles de detalle). */
  historial: HistorialMaterialesTx;
  generadoEn: string | null;
  estado: EstadoTransmision;
  error: string | null;
  /** Libros / pestañas que el servidor no pudo leer en la última carga (el índice puede estar incompleto). */
  avisos: string[];
  ultimaCarga: number | null;
  cargar: (forzar?: boolean) => Promise<void>;
  cargarHistorial: (deliverys: string[]) => Promise<void>;
  reset: () => void;
}

function leerCache(): { indice: IndiceTx; generadoEn: string } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { indice?: IndiceTx; generadoEn?: string };
    return v.indice && typeof v.indice === 'object' ? { indice: v.indice, generadoEn: String(v.generadoEn ?? '') } : null;
  } catch { return null; }
}
function guardarCache(indice: IndiceTx, generadoEn: string): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ indice, generadoEn })); } catch { /* cuota llena o sin storage: solo se pierde el arranque rápido */ }
}

const solicitadas = new Set<string>(); // entregas cuyo histórico ya se pidió (no se repite la consulta)

const inicial = leerCache();

export const useTransmisionStore = create<TransmisionState>((set, get) => ({
  indice: inicial?.indice ?? null,
  historial: {},
  generadoEn: inicial?.generadoEn || null,
  estado: 'idle',
  error: null,
  avisos: [],
  ultimaCarga: null,

  cargar: async (forzar = false) => {
    const { estado, ultimaCarga } = get();
    if (estado === 'cargando') return;
    if (!forzar && ultimaCarga && Date.now() - ultimaCarga < REFRESCO_MS) return;
    set({ estado: 'cargando', error: null });
    try {
      const r = await cargarIndiceTransmision();
      set({ indice: r.indice, generadoEn: r.generadoEn, avisos: r.errores, estado: 'ok', ultimaCarga: Date.now() });
      guardarCache(r.indice, r.generadoEn);
    } catch (e) {
      // Con una carga anterior (caché) se sigue mostrando lo último que se sabía; solo se avisa.
      const sinPermiso = e instanceof EnviosError && e.sinPermiso;
      set({ estado: sinPermiso ? 'sinPermiso' : 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  cargarHistorial: async (deliverys) => {
    const nuevas = [...new Set(deliverys.map((d) => d.trim()).filter(Boolean))].filter((d) => !solicitadas.has(normalizarClaveTx(d)));
    if (nuevas.length === 0) return;
    nuevas.forEach((d) => solicitadas.add(normalizarClaveTx(d)));
    try {
      const h = await cargarHistorialTransmision(nuevas);
      set((s) => ({ historial: { ...s.historial, ...h } }));
    } catch {
      // Si falla, se podrá reintentar al volver a abrir el detalle.
      nuevas.forEach((d) => solicitadas.delete(normalizarClaveTx(d)));
    }
  },

  reset: () => {
    solicitadas.clear();
    try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
    set({ indice: null, historial: {}, generadoEn: null, estado: 'idle', error: null, avisos: [], ultimaCarga: null });
  },
}));
