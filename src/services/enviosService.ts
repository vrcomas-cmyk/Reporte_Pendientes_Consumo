// ---------------------------------------------------------------------------
// enviosService.ts · Cliente de la función `envios` de Supabase (Transmisión; más adelante DRP y Mercancía sin cargo).
// El navegador manda SOLO su sesión: la URL y el token del Apps Script viven en el servidor (supabase/functions/envios, docs/apps-script-envios.md).
//
// No usa `supabase.functions.invoke`: el cliente de Supabase corta cualquier petición a los 15 s (ver lib/supabaseClient.ts) y la primera lectura de los libros de
// transmisión puede tardar más. Se llama con fetch directo y un tiempo de espera propio.
// ---------------------------------------------------------------------------
import { cabecerasProxy } from '@/services/datosProxy';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
const TIMEOUT_MS = 120_000;
const ESPERAS_REINTENTO_MS: readonly number[] = [1000, 3000];
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Error de la función `envios`, con lo que la pantalla necesita para decidir qué mostrar (sin permiso ≠ falla del servicio). */
export class EnviosError extends Error {
  readonly status: number;
  /** 401/403: la sesión expiró o el rol no tiene permiso del módulo. No se reintenta. */
  readonly sinPermiso: boolean;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.name = 'EnviosError';
    this.status = status;
    this.sinPermiso = status === 401 || status === 403;
  }
}

/** Mensaje claro para un estado HTTP (el servidor ya manda un texto, pero un 502 de la plataforma o un corte de red no). */
function mensajeDe(status: number, cuerpo: string | null): string {
  if (status === 401) return 'Tu sesión expiró: vuelve a iniciar sesión.';
  if (status === 403) return cuerpo || 'No tienes acceso a esta función.';
  if (status === 404 && cuerpo) return cuerpo;
  if (status === 503) return 'El servidor está saturado o no responde en este momento. Intenta de nuevo en unos minutos.';
  return cuerpo || `El servicio de Envíos no respondió bien (${status}).`;
}

/** Llama una acción de la función `envios` y devuelve su respuesta (`datos`). Lanza `EnviosError` si no se pudo. */
export async function llamarEnvios<T>(accion: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!SUPABASE_URL) throw new EnviosError('Falta configurar Supabase (VITE_SUPABASE_URL).', 500);
  const cab = await cabecerasProxy();
  let res: Response | null = null;
  // Si Supabase está saturado (503 = Auth/base no disponibles, o un corte de red) se reintenta hasta 2 veces. Todas las acciones son idempotentes (lecturas,
  // upsert y borrado por clave). Un timeout largo (120 s) NO se reintenta, y un 4xx tampoco: es un «no» real.
  for (let i = 0; i <= ESPERAS_REINTENTO_MS.length; i++) {
    const quedan = i < ESPERAS_REINTENTO_MS.length;
    try {
      res = await fetchWithTimeout(
        `${SUPABASE_URL}/functions/v1/envios`,
        { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, ...params }) },
        TIMEOUT_MS,
      );
    } catch (e) {
      const abortado = e instanceof DOMException && e.name === 'AbortError';
      if (!abortado && quedan) { await esperar(ESPERAS_REINTENTO_MS[i]); continue; }
      throw new EnviosError(abortado ? 'El servicio de Envíos tardó demasiado en responder.' : 'No se pudo contactar el servicio de Envíos (¿sin conexión, o la función `envios` aún no está desplegada?).', 0);
    }
    if (res.status === 503 && quedan) { await esperar(ESPERAS_REINTENTO_MS[i]); continue; }
    break;
  }
  if (!res) throw new EnviosError('No se pudo contactar el servicio de Envíos.', 0);
  let cuerpo: { ok?: boolean; datos?: unknown; error?: string } | null = null;
  try { cuerpo = await res.json(); } catch { /* respuesta sin JSON */ }
  if (!res.ok || !cuerpo?.ok) throw new EnviosError(mensajeDe(res.status, cuerpo?.error ?? null), res.status);
  return cuerpo.datos as T;
}
