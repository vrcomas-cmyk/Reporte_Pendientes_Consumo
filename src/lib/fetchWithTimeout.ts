/** fetch() con timeout: aborta el request tras `ms` milisegundos para que un
 * endpoint colgado (Apps Script, API de reportes, R2...) no deje la UI
 * esperando para siempre. El aborto lanza un AbortError DOMException, que el
 * llamador debe tratar como un fallo de red normal. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000): Promise<Response> {
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
        throw new Error('No se pudo contactar la función de datos de Supabase (`datos`). Pide a un administrador que la despliegue con `supabase functions deploy datos --no-verify-jwt` y que defina el secret DATOS_APPS_TOKEN. Ver docs/acceso-por-roles.md.');
      }
      throw e;
    }
  } finally {
    clearTimeout(timer);
  }
}