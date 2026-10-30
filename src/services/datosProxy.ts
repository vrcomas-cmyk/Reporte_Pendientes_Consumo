// ---------------------------------------------------------------------------
// datosProxy.ts · El navegador no llama a los Apps Script: pide la Edge Function `datos` de Supabase (con su sesión), que valida al usuario, llama
// al Apps Script con un token secreto y recorta la respuesta según su rol (supabase/functions/datos, docs/acceso-por-roles.md).
// Activo por omisión: los Apps Script exigen un token que solo conoce la función, así que una llamada directa desde el navegador ya no funciona
// (ni para admins). `VITE_DATOS_PROXY=off` lo apaga, solo para trabajar contra un Apps Script que aún no exija token.
// ---------------------------------------------------------------------------
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');

/** ¿Los datos pasan por el proxy? */
export const datosProxyActivo = (): boolean => import.meta.env.VITE_DATOS_PROXY !== 'off' && !!SUPABASE_URL;

export const DATOS_PROXY_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/datos` : '';

/** URL del proxy para un conector (misma forma que la del Apps Script: se le agregan los parámetros con `?`). */
export const urlProxy = (conector: string): string => `${DATOS_PROXY_BASE}/${conector}`;

export const esUrlProxy = (url: string): boolean => !!DATOS_PROXY_BASE && url.startsWith(`${DATOS_PROXY_BASE}/`);

/** Cabeceras con la sesión del usuario para una llamada al proxy. */
export async function cabecerasProxy(): Promise<Record<string, string>> {
  const { supabase } = await import('@/lib/supabaseClient');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Tu sesión expiró: vuelve a iniciar sesión para cargar los datos.');
  return { Authorization: `Bearer ${token}`, apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '' };
}
