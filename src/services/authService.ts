import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export type AuthStatus = 'loading' | 'signed-out' | 'not-allowed' | 'signed-in';

/** Gates access behind Google OAuth + the degasa_allowed_users invite list.
 * A Google login that succeeds but isn't on the list is signed back out
 * immediately — RLS already isolates data per user, but the product intent
 * here is invite-only, not "anyone with a Google account". */
export function useAuth(): { status: AuthStatus; session: Session | null; signInWithGoogle: () => void; signOut: () => void } {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAllowed(s: Session | null) {
      if (!s) {
        if (!cancelled) { setSession(null); setStatus('signed-out'); }
        return;
      }
      try {
        const { data, error } = await supabase
          .from('degasa_allowed_users')
          .select('email')
          .eq('email', s.user.email)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          await supabase.auth.signOut();
          setSession(null);
          setStatus('not-allowed');
          return;
        }
        setSession(s);
        setStatus('signed-in');
      } catch {
        // Red caída, Supabase inalcanzable, etc. — nunca dejar el gate
        // atascado en "loading" (spinner infinito): volver a la pantalla
        // de login para que el usuario pueda reintentar.
        if (!cancelled) { setSession(null); setStatus('signed-out'); }
      }
    }

    // Si el callback de OAuth vuelve con un error (p.ej. el dominio no está
    // en la lista de Redirect URLs de Supabase), la sesión nunca se crea y
    // getSession()/onAuthStateChange se quedarían esperando para siempre.
    // Detectarlo explícito en la URL evita el spinner infinito.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search);
    if (params.get('error') || params.get('error_description')) {
      if (!cancelled) setStatus('not-allowed');
      window.history.replaceState(null, '', window.location.pathname);
      return () => { cancelled = true; };
    }

    supabase.auth.getSession()
      .then(({ data }) => checkAllowed(data.session))
      .catch(() => { if (!cancelled) { setSession(null); setStatus('signed-out'); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => checkAllowed(s));
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return {
    status,
    session,
    // redirectTo explícito: este proyecto de Supabase es compartido con otras
    // apps (app-seg-pendientes, etc.) y su "Site URL" apunta a una de ellas —
    // sin esto, Supabase cae de vuelta a esa app en vez de regresar aquí.
    signInWithGoogle: () => { supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); },
    signOut: () => { supabase.auth.signOut(); },
  };
}
