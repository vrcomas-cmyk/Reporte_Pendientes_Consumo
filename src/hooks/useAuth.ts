import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { usePermissionsStore } from '@/store/permissionsStore';

/** `unavailable`: Supabase no respondió (saturado/caído). NO es "no autorizado":
 * no se cierra la sesión y se ofrece reintentar. */
export type AuthStatus = 'loading' | 'signed-out' | 'not-allowed' | 'unavailable' | 'signed-in';

const CACHE_KEY = 'degasa_allowed_cache_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BACKOFF_MS = [1000, 3000, 7000];

function leerCache(email: string): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const c = JSON.parse(raw) as { email?: string; ts?: number };
    return c.email === email.toLowerCase() && typeof c.ts === 'number' && Date.now() - c.ts < CACHE_TTL_MS;
  } catch { return false; }
}
function guardarCache(email: string) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ email: email.toLowerCase(), ts: Date.now() })); } catch { /* storage no disponible */ }
}
function borrarCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
}

const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

type Resultado = 'allowed' | 'denied' | 'error';

async function consultarAllowed(email: string): Promise<Resultado> {
  for (let i = 0; i <= BACKOFF_MS.length; i++) {
    try {
      const { data, error } = await supabase
        .from('degasa_allowed_users')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (!error) return data ? 'allowed' : 'denied';
    } catch { /* timeout / red: se reintenta */ }
    if (i < BACKOFF_MS.length) await esperar(BACKOFF_MS[i]);
  }
  return 'error';
}

/** Gates access behind Google OAuth + the degasa_allowed_users invite list.
 * Un login que no está en la lista se cierra de inmediato, pero un fallo de
 * Supabase (saturación, timeout) NUNCA se interpreta como "no autorizado":
 * se reintenta con backoff y, si hay una verificación reciente en caché,
 * se entra en modo degradado. */
export function useAuth(): { status: AuthStatus; session: Session | null; signInWithGoogle: () => void; signOut: () => void; retry: () => void } {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Estado POR EJECUCIÓN del efecto (no useRef): con StrictMode el efecto se monta dos veces y un marcador "en vuelo"
    // de la ejecución cancelada dejaba a la segunda esperando para siempre (spinner infinito).
    let enVuelo: string | null = null;
    let yaVerificado: string | null = null;

    async function checkAllowed(s: Session | null) {
      if (!s) {
        enVuelo = null;
        yaVerificado = null;
        usePermissionsStore.getState().reset();
        if (!cancelled) { setSession(null); setStatus('signed-out'); }
        return;
      }
      const email = s.user.email;
      if (!email) {
        if (!cancelled) { setSession(null); setStatus('not-allowed'); }
        return;
      }
      // Un refresh de token / evento duplicado de la misma sesión no revalida.
      if (yaVerificado === email) { if (!cancelled) setSession(s); return; }
      // Deduplica: getSession + INITIAL_SESSION disparan dos checks a la vez.
      if (enVuelo === email) return;
      enVuelo = email;
      // Verificación reciente en caché: se entra de inmediato y la lista se
      // revalida en segundo plano. Así una base lenta no bloquea el login.
      const conCache = leerCache(email);
      const entrar = () => {
        yaVerificado = email;
        setSession(s);
        setStatus('signed-in');
        void usePermissionsStore.getState().load(email);
      };
      if (conCache) entrar();
      try {
        const res = await consultarAllowed(email);
        if (cancelled) return;
        if (res === 'denied') {
          yaVerificado = null;
          borrarCache();
          void supabase.auth.signOut();
          usePermissionsStore.getState().reset();
          setSession(null);
          setStatus('not-allowed');
          return;
        }
        if (res === 'error' && !conCache) {
          // Sin caché: no podemos confirmar acceso, pero tampoco expulsamos.
          setSession(null);
          setStatus('unavailable');
          return;
        }
        if (res === 'allowed') guardarCache(email);
        if (!conCache) entrar();
      } catch {
        if (!cancelled && !conCache) { setSession(null); setStatus('unavailable'); }
      } finally {
        if (enVuelo === email) enVuelo = null;
      }
    }

    // Si el callback de OAuth vuelve con un error (p.ej. el dominio no está
    // en la lista de Redirect URLs de Supabase), la sesión nunca se crea y
    // getSession()/onAuthStateChange se quedarían esperando para siempre.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search);
    if (params.get('error') || params.get('error_description')) {
      if (!cancelled) setStatus('not-allowed');
      window.history.replaceState(null, '', window.location.pathname);
      return () => { cancelled = true; };
    }

    setStatus('loading');
    supabase.auth.getSession()
      .then(({ data }) => checkAllowed(data.session))
      .catch(() => { if (!cancelled) setStatus('unavailable'); });
    // El callback NO debe hacer await de otros métodos de Supabase (deadlock del
    // lock de auth): se difiere y se ignora TOKEN_REFRESHED.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED') return;
      setTimeout(() => { void checkAllowed(s); }, 0);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [intento]);

  const retry = useCallback(() => {
    setIntento(n => n + 1);
  }, []);

  return {
    status,
    session,
    retry,
    // redirectTo explícito: este proyecto de Supabase es compartido con otras
    // apps (app-seg-pendientes, etc.) y su "Site URL" apunta a una de ellas —
    // sin esto, Supabase cae de vuelta a esa app en vez de regresar aquí.
    signInWithGoogle: () => { supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } } }); },
    signOut: () => { borrarCache(); supabase.auth.signOut(); },
  };
}
