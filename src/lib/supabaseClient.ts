import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local');
}

const SUPABASE_TIMEOUT_MS = 15_000;

/** fetch con timeout propio (no reusa fetchWithTimeout: ese importa datosProxy,
 * que a su vez importa este módulo → import circular). Evita que un Supabase
 * saturado deje consultas/refresh de token colgados para siempre. */
function fetchConTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  // Respeta una señal externa (p.ej. la del propio cliente) además del timeout.
  const externa = init.signal;
  if (externa) {
    if (externa.aborted) controller.abort();
    else externa.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(url, key, { global: { fetch: fetchConTimeout } });
