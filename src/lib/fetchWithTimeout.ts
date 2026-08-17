/** fetch() con timeout: aborta el request tras `ms` milisegundos para que un
 * endpoint colgado (Apps Script, API de reportes, R2...) no deje la UI
 * esperando para siempre. El aborto lanza un AbortError DOMException, que el
 * llamador debe tratar como un fallo de red normal. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}