import { create } from 'zustand';
import { trasladoRepository } from '@/repositories';
import { toast } from '@/store/toastStore';
import { supabase } from '@/lib/supabaseClient';
import { usePedidosStore, hojasDeLibro } from '@/store/pedidosStore';
import { inventarioDesdeDisponibilidad } from '@/core/pedidos';
import { baseDeSeguimiento, evaluarTraslado, snapshotDeInventario, type SnapDisponibilidad } from '@/core/seguimientoTraslado';
import type { EstatusTraslado, Traslado } from '@/core/types';

/** Foto actual de Inventario · Disponibilidad (la última sincronizada); `null` si el libro no está cargado. La fecha es la de la descarga:
 * el reporte no trae una propia. */
export function snapshotDisponibilidadActual(): SnapDisponibilidad | null {
  const st = usePedidosStore.getState();
  const inv = inventarioDesdeDisponibilidad(hojasDeLibro(st.hojas, 'disponibilidad')[0]);
  const leidoEn = st.fuentes.disponibilidad?.leidoEn;
  return inv && leidoEn ? snapshotDeInventario(inv, leidoEn) : null;
}

const hayUsuario = async (): Promise<string> => (await supabase.auth.getUser()).data.user?.email ?? 'desconocido';

interface TrasladosState {
  traslados: Traslado[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Guarda el traslado como «Preparado». NO lo marca solicitado ni envía nada. */
  preparar: (t: Omit<Traslado, 'id' | 'estatus' | 'creadoEn' | 'creadoPor'>) => Promise<number | null>;
  /** Solo se llama cuando el usuario confirma que YA envió el correo a mano: pasa a «Solicitado» y guarda la línea base de Disponibilidad. */
  marcarSolicitado: (id: number) => Promise<void>;
  /** Corrección manual del estatus (p. ej. un «Pendiente de revisión» que el usuario resuelve). */
  fijarEstatus: (id: number, estatus: EstatusTraslado, nota?: string) => Promise<void>;
  actualizarCampos: (id: number, patch: Partial<Traslado>) => Promise<void>;
  /** Evalúa los traslados en seguimiento contra la última foto de Disponibilidad (si es más nueva que su base). Devuelve cuántos cambiaron. */
  aplicarDisponibilidad: () => Promise<number>;
}

export const useTrasladosStore = create<TrasladosState>((set, get) => {
  const parchar = async (id: number, patch: Partial<Traslado>, error: string) => {
    const prev = get().traslados;
    set({ traslados: prev.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    try {
      await trasladoRepository.updateTraslado(id, patch);
    } catch (err) {
      set({ traslados: prev });
      toast.fromError(err, error);
    }
  };

  return {
    traslados: [],
    hydrated: false,
    hydrate: async () => {
      try {
        set({ traslados: await trasladoRepository.listTraslados(), hydrated: true });
      } catch (err) {
        set({ hydrated: true });
        toast.fromError(err, 'No se pudieron cargar los traslados');
      }
    },

    preparar: async (t) => {
      const nuevo: Traslado = { ...t, estatus: 'preparado', creadoEn: new Date().toISOString(), creadoPor: await hayUsuario() };
      try {
        const id = await trasladoRepository.addTraslado(nuevo);
        set((s) => ({ traslados: [{ ...nuevo, id }, ...s.traslados] }));
        return id;
      } catch (err) {
        toast.fromError(err, 'No se pudo preparar el traslado');
        return null;
      }
    },

    marcarSolicitado: async (id) => {
      const t = get().traslados.find((x) => x.id === id);
      if (!t || t.estatus !== 'preparado') return;
      const snap = snapshotDisponibilidadActual();
      await parchar(id, {
        estatus: 'solicitado',
        solicitadoEn: new Date().toISOString(),
        solicitadoPor: await hayUsuario(),
        ...(snap ? baseDeSeguimiento(t, snap) : {}),
      }, 'No se pudo marcar el traslado como solicitado');
      if (!snap) toast.warning('Sin Disponibilidad cargada', 'Quedó Solicitado, pero sin línea base: sincroniza Inventario · Disponibilidad y confirma En curso / Recibido a mano.');
    },

    fijarEstatus: async (id, estatus, nota) => {
      await parchar(id, { estatus, ...(nota ? { notaRevision: nota } : {}) }, 'No se pudo actualizar el estatus del traslado');
    },

    actualizarCampos: async (id, patch) => parchar(id, patch, 'No se pudo actualizar el traslado'),

    aplicarDisponibilidad: async () => {
      const snap = snapshotDisponibilidadActual();
      if (!snap) return 0;
      let cambios = 0;
      for (const t of get().traslados) {
        if (t.id == null) continue;
        const r = evaluarTraslado(t, snap);
        if (!r) continue;
        // Una vez cerrado como recibido no se vuelve a evaluar; el resto se actualiza con cada foto nueva.
        await parchar(t.id, { ...r, baseLeidoEn: t.baseLeidoEn }, 'No se pudo actualizar el seguimiento del traslado');
        cambios += 1;
      }
      return cambios;
    },
  };
});

let iniciado = false;
/** Revisa los traslados cada vez que se descarga un Inventario · Disponibilidad nuevo (idempotente). */
export function iniciarSeguimientoTraslados(): void {
  if (iniciado) return;
  iniciado = true;
  let ultimo = usePedidosStore.getState().fuentes.disponibilidad?.leidoEn;
  usePedidosStore.subscribe((st) => {
    const actual = st.fuentes.disponibilidad?.leidoEn;
    if (actual && actual !== ultimo) {
      ultimo = actual;
      const t = useTrasladosStore.getState();
      if (t.hydrated) void t.aplicarDisponibilidad();
    }
  });
}
