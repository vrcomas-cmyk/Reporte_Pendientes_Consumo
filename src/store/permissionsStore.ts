import { create } from 'zustand';
import { UNRESTRICTED_PERMISSIONS, type EffectivePermissions } from '@/core/permissions';
import { loadEffectivePermissions } from '@/services/permissionsService';
import { repararSesion } from '@/lib/sesion';
import { toast } from '@/store/toastStore';

/** `cargando`: aún no hay respuesta · `ok`: permisos leídos del servidor · `degradado`: el servidor no respondió y se usan los últimos permisos buenos ·
 * `error`: no respondió y no hay copia (no se concede ningún módulo; la pantalla lo explica y reintenta sola). */
export type EstadoPermisos = 'cargando' | 'ok' | 'degradado' | 'error';

/** Cada cuánto se reintenta en segundo plano mientras no se hayan podido leer del servidor. */
const REINTENTO_MS = 20_000;

interface PermissionsState {
  /** Starts unrestricted (same behavior as before this feature existed) —
   * only narrows once `load()` resolves with a real, non-admin role. */
  perms: EffectivePermissions;
  loaded: boolean;
  estado: EstadoPermisos;
  load: (email: string) => Promise<void>;
  /** Reintento manual (botón de la pantalla de error). */
  reintentar: () => Promise<void>;
  reset: () => void;
}

let correo: string | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;
let enVuelo: Promise<void> | null = null;
let avisoDegradadoMostrado = false;

function detenerReintento() {
  if (temporizador) { clearTimeout(temporizador); temporizador = null; }
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  perms: UNRESTRICTED_PERMISSIONS,
  loaded: false,
  estado: 'cargando',
  load: async (email) => {
    correo = email;
    // Una lectura a la vez: el reintento automático y el manual no se pisan.
    if (enVuelo) return enVuelo;
    detenerReintento();
    enVuelo = (async () => {
      let res = await loadEffectivePermissions(email);
      // El servidor rechazó el token: se intenta renovar la sesión; si el servidor confirma que ya no vale se cierra la sesión local (useAuth muestra el inicio de sesión) y si se
      // renovó se vuelve a leer una vez. Así una sesión mala no deja al usuario «verificando» hasta que borre el caché.
      if (res.origen === 'sesion') {
        const rep = await repararSesion();
        if (correo !== email) return;
        if (rep === 'cerrada') { get().reset(); return; }
        if (rep === 'ok') res = await loadEffectivePermissions(email);
      }
      const { perms, origen } = res;
      // Si mientras tanto cerró sesión (reset) o entró otro usuario, este resultado ya no aplica.
      if (correo !== email) return;
      const estado: EstadoPermisos = origen === 'servidor' ? 'ok' : origen === 'cache' ? 'degradado' : 'error';
      set({ perms, loaded: true, estado });
      if (estado === 'ok') { avisoDegradadoMostrado = false; return; }
      if (estado === 'degradado' && !avisoDegradadoMostrado) {
        avisoDegradadoMostrado = true;
        toast.warning('Modo degradado', 'El servidor no responde: se usan tus últimos permisos guardados. Se reintentará solo.', 8000);
      }
      // Sigue sin poder leerse del servidor: reintenta en segundo plano hasta lograrlo (o hasta cerrar sesión).
      temporizador = setTimeout(() => { if (correo === email) void get().load(email); }, REINTENTO_MS);
    })().finally(() => { enVuelo = null; });
    return enVuelo;
  },
  reintentar: async () => {
    if (!correo) return;
    set({ estado: 'cargando' });
    await get().load(correo);
  },
  reset: () => {
    correo = null;
    enVuelo = null;
    avisoDegradadoMostrado = false;
    detenerReintento();
    set({ perms: UNRESTRICTED_PERMISSIONS, loaded: false, estado: 'cargando' });
  },
}));
