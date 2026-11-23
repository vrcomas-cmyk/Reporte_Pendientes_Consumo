/** Fallo de red contra el proxy de datos (la petición ni siquiera llegó): se reintenta. */
class ErrorRedProxy extends Error {}

/** Esperas entre reintentos de una lectura al proxy de datos cuando Supabase está saturado (502/503/504 o corte de red). Dos reintentos como máximo. */
const ESPERAS_PROXY_MS: readonly number[] = [500, 1500];
const ESTADOS_REINTENTABLES = new Set([502, 503, 504]);

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const esAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Un intento: fetch() con timeout propio, con la sesión del usuario si la URL es del proxy. */
async function intentar(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // Las llamadas al proxy de datos (Edge Function) llevan la sesión del usuario; las demás no se tocan.
    const { esUrlProxy, cabecerasProxy } = await import('@/services/datosProxy');
    const headers = esUrlProxy(url) ? { ...(init.headers as Record<string, string> | undefined), ...(await cabecerasProxy()) } : init.headers;
    try {
      return await fetch(url, { ...init, ...(headers ? { headers } : {}), signal: controller.signal });
    } catch (e) {
      // Un fallo de red contra el proxy casi siempre es que la función `datos` no está desplegada o rechazó la llamada (sin cabeceras CORS); no es el Apps Script.
      if (esUrlProxy(url) && e instanceof TypeError) {
        throw new ErrorRedProxy('No se pudo contactar la función de datos de Supabase (`datos`). Pide a un administrador que la despliegue con `supabase functions deploy datos --no-verify-jwt` y que defina el secret DATOS_APPS_TOKEN. Ver docs/acceso-por-roles.md.');
      }
      throw e;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** fetch() con timeout: aborta el request tras `ms` milisegundos para que un
 * endpoint colgado (Apps Script, API de reportes, R2...) no deje la UI
 * esperando para siempre. El aborto lanza un AbortError DOMException, que el
 * llamador debe tratar como un fallo de red normal.
 *
 * Las LECTURAS (GET) al proxy de datos se reintentan hasta 2 veces con espera creciente + algo de azar cuando Supabase responde 502/503/504 (la función
 * `datos` contesta 503 si Auth no está disponible) o la red falla / se agota el tiempo: una caída breve no debe tumbar una carga de decenas de bloques.
 * No se reintenta 401/403/4xx: son un «no» real. `esperasMs` solo cambia en las pruebas. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000, esperasMs: readonly number[] = ESPERAS_PROXY_MS): Promise<Response> {
  const { esUrlProxy } = await import('@/services/datosProxy');
  const reintentable = esUrlProxy(url) && (init.method ?? 'GET').toUpperCase() === 'GET';
  const espera = reintentable ? esperasMs : [];
  for (let i = 0; ; i++) {
    const quedan = i < espera.length;
    try {
      const res = await intentar(url, init, ms);
      if (quedan && ESTADOS_REINTENTABLES.has(res.status)) {
        await esperar(espera[i] + Math.random() * 300);
        continue;
      }
      return res;
    } catch (e) {
      if (!quedan || !(e instanceof ErrorRedProxy || esAbort(e))) throw e;
      await esperar(espera[i] + Math.random() * 300);
    }
  }
}
