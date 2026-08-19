import { create } from 'zustand';
import { oportunidadRepository, clienteConocimientoRepository, ofertaRepository, reglaAceptacionRepository } from '@/repositories';
import { toast } from '@/store/toastStore';
import { norm } from '@/lib/text';
import { ESTADOS_OPORTUNIDAD, PROXIMO_PASO, type Oportunidad, type Interaccion, type EstadoOportunidad, type ClienteConocimiento, type Observacion, type Oferta, type ReglaAceptacion } from '@/core/types';

interface ConocimientoState {
  oportunidades: Oportunidad[];
  interacciones: Interaccion[];
  clientes: ClienteConocimiento[];
  /** dest normalizado -> ficha CON métricas derivadas de `ofertas` fundidas
   * encima (tiempoRespuestaPromDias/tasaAceptacion) — lookup O(1) desde el
   * motor de scoring y los paneles, sin recorrer arrays en cada render. */
  clientesByDest: Map<string, ClienteConocimiento>;
  observaciones: Observacion[];
  ofertas: Oferta[];
  reglas: ReglaAceptacion[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addOportunidad: (o: Oportunidad) => Promise<void>;
  updateOportunidad: (id: number, patch: Partial<Oportunidad>) => Promise<void>;
  setEstado: (id: number, estado: EstadoOportunidad, resumen?: string) => Promise<void>;
  addInteraccion: (i: Interaccion) => Promise<void>;
  upsertCliente: (c: ClienteConocimiento) => Promise<void>;
  addObservacion: (o: Observacion) => Promise<void>;
  removeObservacion: (id: number) => Promise<void>;
  addOferta: (o: Oferta) => Promise<void>;
  registrarResultado: (id: number, patch: Pick<Oferta, 'resultado'> & Partial<Oferta>) => Promise<void>;
  upsertRegla: (r: ReglaAceptacion) => Promise<void>;
  upsertClientesBulk: (clientes: ClienteConocimiento[]) => Promise<void>;
  removeRegla: (id: number) => Promise<void>;
}

/** Métricas derivadas del historial de ofertas de un cliente (req. 3: campos
 * "automáticos" de la ficha). Puro, sin I/O — se recalcula al vuelo cada vez
 * que cambian `clientes` u `ofertas`, nunca se persiste. */
function deriveMetrics(dest: string, ofertas: Oferta[]): { tiempoRespuestaPromDias?: number; tasaAceptacion?: number } {
  const propias = ofertas.filter((o) => norm(o.dest) === norm(dest));
  const resueltas = propias.filter((o) => o.resultado !== 'pendiente');
  const tasaAceptacion = resueltas.length
    ? resueltas.filter((o) => o.resultado === 'aceptada' || o.resultado === 'parcial').length / resueltas.length
    : undefined;
  const conRespuesta = propias.filter((o) => o.fechaRespuesta);
  const tiempoRespuestaPromDias = conRespuesta.length
    ? Math.round(
        conRespuesta.reduce((acc, o) => acc + (new Date(o.fechaRespuesta!).getTime() - new Date(o.fechaOferta).getTime()) / 86400000, 0) / conRespuesta.length,
      )
    : undefined;
  return { tiempoRespuestaPromDias, tasaAceptacion };
}

function byDest(clientes: ClienteConocimiento[], ofertas: Oferta[]): Map<string, ClienteConocimiento> {
  return new Map(clientes.map((c) => [norm(c.dest), { ...c, ...deriveMetrics(c.dest, ofertas) }]));
}

/** Espejo en memoria del conocimiento del módulo Oportunidades — mismo patrón
 * optimista que solicitudStore: muta local primero, persiste en background,
 * revierte con un toast si falla. Regla clave (req. 10 del plan): todo cambio
 * de estado de una Oportunidad, y ahora todo registro/resultado de Oferta,
 * empuja automáticamente una Interaccion, así el conocimiento se captura sin
 * depender de la disciplina del usuario. */
export const useConocimientoStore = create<ConocimientoState>()((set, get) => ({
  oportunidades: [],
  interacciones: [],
  clientes: [],
  clientesByDest: new Map(),
  observaciones: [],
  ofertas: [],
  reglas: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [oportunidades, interacciones, clientes, observaciones, ofertas, reglas] = await Promise.all([
      oportunidadRepository.listOportunidades(),
      oportunidadRepository.listInteracciones(),
      clienteConocimientoRepository.listClientes(),
      clienteConocimientoRepository.listObservaciones(),
      ofertaRepository.listOfertas(),
      reglaAceptacionRepository.listReglas(),
    ]);

    // Migración única (fusión "ficha = regla global"): las reglas globales que
    // vivían en `reglasAceptacion` (material === null) se fusionan en la ficha
    // del cliente y se eliminan. Las excepciones por material se quedan como
    // overrides. Si un día no queda ninguna global, este bloque no hace nada.
    const globales = reglas.filter((r) => r.material == null);
    let clientesFinal = clientes;
    let reglasFinal = reglas;
    if (globales.length) {
      const porDest = new Map(clientes.map((c) => [norm(c.dest), c]));
      for (const g of globales) {
        const base = porDest.get(norm(g.dest));
        const migrada: ClienteConocimiento = base ? { ...base } : {
          dest: g.dest, razonSocial: g.dest, condicionesAceptadas: [], estadoMaterial: 'indistinto',
          caducidadMinimaDias: null, activa: true, descuentoHabitualPct: null,
          contactoNombre: '', contactoTelefono: '', contactoCorreo: '', canalPreferido: '', notasComerciales: '',
          actualizadoEn: '', actualizadoPor: '',
        };
        if (g.condiciones.length) migrada.condicionesAceptadas = g.condiciones;
        if (g.estadoMaterial !== 'indistinto') migrada.estadoMaterial = g.estadoMaterial;
        if (g.caducidadMinimaMeses != null) migrada.caducidadMinimaDias = Math.round(g.caducidadMinimaMeses * 30);
        migrada.activa = g.activa !== false;
        migrada.actualizadoEn = new Date().toISOString();
        migrada.actualizadoPor = 'migracion-global';
        try { await clienteConocimientoRepository.upsertCliente(migrada); } catch { /* la ficha previa gana */ }
        if (g.id != null) {
          try { await reglaAceptacionRepository.removeRegla(g.id); } catch { /* se reintenta en el próximo hydrate */ }
        }
        porDest.set(norm(g.dest), migrada);
      }
      clientesFinal = [...porDest.values()];
      reglasFinal = reglas.filter((r) => r.material != null);
    }

    set({ oportunidades, interacciones, clientes: clientesFinal, clientesByDest: byDest(clientesFinal, ofertas), observaciones, ofertas, reglas: reglasFinal, hydrated: true });
  },

  addOportunidad: async (o) => {
    const prev = get().oportunidades;
    set({ oportunidades: [o, ...prev] });
    try {
      const id = await oportunidadRepository.addOportunidad(o);
      set((s) => ({ oportunidades: s.oportunidades.map((x) => (x === o ? { ...x, id } : x)) }));
      toast.success('Oportunidad creada', `${o.material} — ahora puedes ofertarla.`);
    } catch (err) {
      set({ oportunidades: prev });
      toast.fromError(err, 'No se pudo crear la oportunidad');
    }
  },

  updateOportunidad: async (id, patch) => {
    const prev = get().oportunidades;
    const now = new Date().toISOString();
    const fullPatch = { ...patch, actualizadaEn: now };
    set({ oportunidades: prev.map((o) => (o.id === id ? { ...o, ...fullPatch } : o)) });
    try {
      await oportunidadRepository.updateOportunidad(id, fullPatch);
      toast.success('Oportunidad actualizada', undefined, 2000);
    } catch (err) {
      set({ oportunidades: prev });
      toast.fromError(err, 'No se pudo guardar la oportunidad');
    }
  },

  setEstado: async (id, estado, resumen) => {
    const prev = get().oportunidades;
    const target = prev.find((o) => o.id === id);
    if (!target) return;
    const now = new Date().toISOString();
    // Cierre = deja de ser trabajo activo (colocada total, sin interesados) —
    // marca `cerradaEn` para el KPI "Colocación 90d"; reabrir (volver a un
    // estado activo) lo limpia, así no queda una fecha de cierre fantasma.
    const esCierre = estado === 'colocada-total' || estado === 'sin-interesados';
    const cerradaEn = esCierre ? now : undefined;
    set({ oportunidades: prev.map((o) => (o.id === id ? { ...o, estado, actualizadaEn: now, cerradaEn } : o)) });
    try {
      await oportunidadRepository.updateOportunidad(id, { estado, actualizadaEn: now, cerradaEn });
      await get().addInteraccion({
        dest: '', oportunidadId: id, material: target.material, tipo: 'cambio-estado',
        resumen: resumen ?? `Estado cambiado a "${estado}".`, fecha: now, creadoPor: '',
      });
      const label = ESTADOS_OPORTUNIDAD.find((e) => e.key === estado)?.label ?? estado;
      toast.success(`${target.material} → ${label}`, PROXIMO_PASO[estado], 5000);
    } catch (err) {
      set({ oportunidades: prev });
      toast.fromError(err, 'No se pudo actualizar el estado');
    }
  },

  addInteraccion: async (i) => {
    const prev = get().interacciones;
    set({ interacciones: [i, ...prev] });
    try {
      const id = await oportunidadRepository.addInteraccion(i);
      set((s) => ({ interacciones: s.interacciones.map((x) => (x === i ? { ...x, id } : x)) }));
    } catch (err) {
      set({ interacciones: prev });
      toast.fromError(err, 'No se pudo registrar la interacción');
    }
  },

  upsertCliente: async (c) => {
    const prev = get().clientes;
    const ofertas = get().ofertas;
    const optimistic = prev.some((x) => norm(x.dest) === norm(c.dest))
      ? prev.map((x) => (norm(x.dest) === norm(c.dest) ? c : x))
      : [c, ...prev];
    set({ clientes: optimistic, clientesByDest: byDest(optimistic, ofertas) });
    try {
      const id = await clienteConocimientoRepository.upsertCliente(c);
      set((s) => {
        const withId = s.clientes.map((x) => (norm(x.dest) === norm(c.dest) ? { ...x, id } : x));
        return { clientes: withId, clientesByDest: byDest(withId, s.ofertas) };
      });
    } catch (err) {
      set({ clientes: prev, clientesByDest: byDest(prev, ofertas) });
      toast.fromError(err, 'No se pudo guardar la ficha del cliente');
    }
  },

  addObservacion: async (o) => {
    const prev = get().observaciones;
    set({ observaciones: [o, ...prev] });
    try {
      const id = await clienteConocimientoRepository.addObservacion(o);
      set((s) => ({ observaciones: s.observaciones.map((x) => (x === o ? { ...x, id } : x)) }));
    } catch (err) {
      set({ observaciones: prev });
      toast.fromError(err, 'No se pudo guardar la observación');
    }
  },

  removeObservacion: async (id) => {
    const prev = get().observaciones;
    set({ observaciones: prev.filter((o) => o.id !== id) });
    try {
      await clienteConocimientoRepository.removeObservacion(id);
    } catch (err) {
      set({ observaciones: prev });
      toast.fromError(err, 'No se pudo eliminar la observación');
    }
  },

  addOferta: async (o) => {
    const prevOfertas = get().ofertas;
    const clientes = get().clientes;
    set({ ofertas: [o, ...prevOfertas], clientesByDest: byDest(clientes, [o, ...prevOfertas]) });
    try {
      const id = await ofertaRepository.addOferta(o);
      set((s) => {
        const ofertas = s.ofertas.map((x) => (x === o ? { ...x, id } : x));
        return { ofertas, clientesByDest: byDest(s.clientes, ofertas) };
      });
      await get().addInteraccion({
        dest: o.dest, oportunidadId: o.oportunidadId, material: o.material, tipo: 'oferta',
        resumen: `Oferta registrada: ${o.cantidadOfertada} unid. a $${o.precioOfertado}.`, fecha: o.fechaOferta, creadoPor: o.creadoPor,
      });
    } catch (err) {
      set({ ofertas: prevOfertas, clientesByDest: byDest(clientes, prevOfertas) });
      toast.fromError(err, 'No se pudo registrar la oferta');
    }
  },

  registrarResultado: async (id, patch) => {
    const prevOfertas = get().ofertas;
    const target = prevOfertas.find((o) => o.id === id);
    if (!target) return;
    const clientes = get().clientes;
    const fechaRespuesta = patch.fechaRespuesta ?? new Date().toISOString();
    const fullPatch = { ...patch, fechaRespuesta };
    const nextOfertas = prevOfertas.map((o) => (o.id === id ? { ...o, ...fullPatch } : o));
    set({ ofertas: nextOfertas, clientesByDest: byDest(clientes, nextOfertas) });
    try {
      await ofertaRepository.updateOferta(id, fullPatch);
      const resultadoLabel = { aceptada: 'Aceptó', rechazada: 'Rechazó', parcial: 'Aceptó parcialmente', pendiente: 'Pendiente' }[patch.resultado];
      await get().addInteraccion({
        dest: target.dest, oportunidadId: target.oportunidadId, material: target.material, tipo: 'oferta',
        resumen: `${resultadoLabel} la oferta de ${target.material}${patch.motivoRechazo ? ` (${patch.motivoRechazo})` : ''}.`,
        fecha: fechaRespuesta, creadoPor: target.creadoPor,
      });
    } catch (err) {
      set({ ofertas: prevOfertas, clientesByDest: byDest(clientes, prevOfertas) });
      toast.fromError(err, 'No se pudo actualizar el resultado de la oferta');
    }
  },

  upsertRegla: async (r) => {
    // La regla GLOBAL de un cliente vive en su ficha (upsertCliente); aquí
    // solo se guardan excepciones por material. Filas globales nuevas se
    // ignoran — la ficha es la única fuente de la regla global.
    if (r.material == null) return;
    const prev = get().reglas;
    const optimistic = prev.some((x) => norm(x.dest) === norm(r.dest) && (x.material ?? null) === (r.material ?? null))
      ? prev.map((x) => (norm(x.dest) === norm(r.dest) && (x.material ?? null) === (r.material ?? null) ? r : x))
      : [r, ...prev];
    set({ reglas: optimistic });
    try {
      const id = await reglaAceptacionRepository.upsertRegla(r);
      set((s) => ({ reglas: s.reglas.map((x) => (x === r ? { ...x, id } : x)) }));
    } catch (err) {
      set({ reglas: prev });
      toast.fromError(err, 'No se pudo guardar la excepción por material');
    }
  },

  upsertClientesBulk: async (clientes) => {
    for (const c of clientes) await get().upsertCliente(c);
  },

  removeRegla: async (id) => {
    const prev = get().reglas;
    set({ reglas: prev.filter((r) => r.id !== id) });
    try {
      await reglaAceptacionRepository.removeRegla(id);
    } catch (err) {
      set({ reglas: prev });
      toast.fromError(err, 'No se pudo eliminar la regla');
    }
  },
}));
