import { create } from 'zustand';
import type { ModoBloqueo } from '@/core/resumenDisponibilidad';

const CLAVE = 'invDisp.pendienteBloqueo';
const VALIDOS: readonly ModoBloqueo[] = ['liberados', 'todos', 'bloqueados'];

function leer(): ModoBloqueo {
  try {
    const v = localStorage.getItem(CLAVE);
    return VALIDOS.includes(v as ModoBloqueo) ? (v as ModoBloqueo) : 'liberados';
  } catch {
    return 'liberados';
  }
}

interface PendienteBloqueoState {
  /** Qué pendiente cuenta en Inventario · Disponibilidad: solo el liberado (por omisión), liberado + bloqueado, o solo el bloqueado. */
  modo: ModoBloqueo;
  setModo: (m: ModoBloqueo) => void;
}

export const usePendienteBloqueoStore = create<PendienteBloqueoState>((set) => ({
  modo: leer(),
  setModo: (modo) => {
    try { localStorage.setItem(CLAVE, modo); } catch { /* sin almacenamiento: queda solo en memoria */ }
    set({ modo });
  },
}));
