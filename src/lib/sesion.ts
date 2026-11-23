// ---------------------------------------------------------------------------
// sesion.ts · Autorreparación de la sesión de Supabase. Si la sesión guardada en el navegador ya no vale (el servidor la perdió, se revocó, el token venció y no se pudo
// renovar), la app la repara sola o cierra la sesión local y pide entrar de nuevo, en lugar de quedarse «verificando» hasta que el usuario borre el caché.
// ---------------------------------------------------------------------------
import { supabase } from '@/lib/supabaseClient';

/** Claves de localStorage que dependen de la sesión y se limpian al cerrarla localmente. */
const CLAVES_DE_SESION = ['degasa_allowed_cache_v1', 'degasa_perms_cache_v1'];

const CODIGOS_DE_SESION = new Set([
  'PGRST301', 'PGRST303', 'bad_jwt', 'invalid_jwt', 'session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'invalid_grant',
]);

/** ¿El error significa «esta sesión / este token ya no vale»? (JWT vencido o inválido, sesión inexistente, refresh token inválido, 401/403 de Auth.)
 *  Un corte de red, un timeout o un 5xx NO lo son: ahí la sesión puede seguir siendo buena y se reintenta. */
export function esErrorDeSesion(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { status, code, message, name } = e as { status?: unknown; code?: unknown; message?: unknown; name?: unknown };
  if (name === 'AbortError' || name === 'AuthRetryableFetchError') return false;
  if (typeof code === 'string' && CODIGOS_DE_SESION.has(code)) return true;
  if (name === 'AuthSessionMissingError' || name === 'AuthInvalidTokenResponseError') return true;
  if (status === 401 || status === 403) return true;
  return typeof message === 'string' && /jwt (is )?(expired|invalid)|session (not found|missing|expired)|invalid refresh token|refresh token (not found|already used)/i.test(message);
}

/** Cierra la sesión SOLO en este navegador (sin llamar al servidor: puede no responder) y limpia las copias locales que dependían de ella.
 *  La app lo nota por el evento SIGNED_OUT y muestra el inicio de sesión. */
export async function cerrarSesionLocal(): Promise<void> {
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ya sin sesión o storage no disponible */ }
  try { for (const k of CLAVES_DE_SESION) localStorage.removeItem(k); } catch { /* storage no disponible */ }
}

export type ResultadoReparacion = 'ok' | 'cerrada' | 'incierto';

let enVuelo: Promise<ResultadoReparacion> | null = null;

/** Intenta renovar la sesión. `ok` = renovada (se puede reintentar la petición), `cerrada` = el servidor confirmó que ya no vale y se cerró la sesión local (la app pedirá
 *  entrar de nuevo), `incierto` = no se pudo saber (red, timeout, servidor saturado): no se toca nada. Si decenas de peticiones fallan a la vez con 401, comparten UNA sola
 *  renovación (varias en paralelo gastarían el refresh token), y el resultado se recuerda unos segundos. */
export function repararSesion(): Promise<ResultadoReparacion> {
  if (!enVuelo) {
    enVuelo = (async (): Promise<ResultadoReparacion> => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session) return 'ok';
        if (error && esErrorDeSesion(error)) { await cerrarSesionLocal(); return 'cerrada'; }
        return 'incierto';
      } catch (e) {
        if (esErrorDeSesion(e)) { await cerrarSesionLocal(); return 'cerrada'; }
        return 'incierto';
      }
    })().finally(() => { setTimeout(() => { enVuelo = null; }, 5000); });
  }
  return enVuelo;
}
