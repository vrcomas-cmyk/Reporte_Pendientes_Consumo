// ---------------------------------------------------------------------------
// pedidosService.ts · Sync del módulo "Seg. de pedidos": descarga CRUDAS las hojas de 3 libros de Google
// Sheets —Seg pedidos, Disponibilidad e Inv_Condicion— desde un Apps Script propio de solo lectura
// (docs/apps-script-pedidos.md) y las guarda en IndexedDB. No transforma nada: los cálculos y relaciones
// se hacen al mostrar (src/core/pedidos.ts).
//
// Independiente de `reportSheetsService` (otro Sheet, otras pestañas): no comparte caché, ni guardia de
// concurrencia, ni lo toca.
//
// Descargar un libro REEMPLAZA por completo lo que había de él (nada se acumula). Convención del repo: el
// dato viejo se conserva hasta que un libro llega COMPLETO y con la forma esperada; una respuesta rara
// lanza error — nunca se trata como "0 filas" (así un despliegue viejo del script no pisa datos buenos).
// ---------------------------------------------------------------------------
import { FUENTES_PEDIDOS, LIBROS_BASE_PEDIDOS, indexarHoja, libroSinHojas, validarHojaCruda, type HojaCruda, type LibroClave } from '@/core/pedidos';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { logInfo, logWarn } from '@/lib/logError';
import type { FuentePedidosRow } from '@/repositories/db';
import { getAllCachedPedidos, getFuentesPedidos, idHoja, putFuentePedidos, reemplazarHojasDeLibro } from '@/repositories/pedidosCache';
import { CONNECTOR_KEYS, getConnector } from '@/services/connectorsService';
import { usePedidosStore, type InfoFuente } from '@/store/pedidosStore';
import { limitadorAppsScript } from '@/lib/limitador';

const PEDIDOS_URL_ENV = import.meta.env.VITE_PEDIDOS_URL as string | undefined;

const MANIFEST_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 60_000;
const PAGE_SIZE = 5_000;
const FETCH_RETRIES = 3;
const RETRY_BASE_MS = 1_500;

interface HojaManifiesto {
  nombre: string;
  totalRows: number;
}

interface LibroManifiesto {
  clave: LibroClave;
  nombre: string;
  ultimaModificacion: string;
  chunkSize?: number;
  hojas: HojaManifiesto[];
}

interface PaginaHoja {
  columnas: string[];
  rows: string[][];
}

const etiquetaDe = (clave: LibroClave): string => FUENTES_PEDIDOS.find((f) => f.clave === clave)?.etiqueta ?? clave;

const infoDeFila = (f: FuentePedidosRow): InfoFuente => ({ nombre: f.nombre, modificado: f.modificado, leidoEn: f.leidoEn, filas: f.filas });

/** True si hay una URL configurada (conector de Admin o variable de entorno). */
export async function pedidosConfigurado(): Promise<boolean> {
  return !!(await getConnector(CONNECTOR_KEYS.pedidosSheetsUrl, PEDIDOS_URL_ENV));
}

export async function requireUrl(): Promise<string> {
  const url = await getConnector(CONNECTOR_KEYS.pedidosSheetsUrl, PEDIDOS_URL_ENV);
  if (!url) throw new Error('Falta configurar el conector "Apps Script · Seg. de pedidos" (Admin) o VITE_PEDIDOS_URL.');
  return url;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Backoff exponencial con jitter: varias páginas que fallan a la vez no deben reintentar al mismo tiempo. */
export async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < FETCH_RETRIES) {
        const delay = RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * RETRY_BASE_MS;
        void logWarn('pedidos-sync-retry', `${label} (intento ${attempt + 1}/${FETCH_RETRIES}, espera ${Math.round(delay)}ms): ${e instanceof Error ? e.message : String(e)}`);
        await sleep(delay);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Un Apps Script roto (error de sintaxis, archivos duplicados en el proyecto, sin permiso de acceso o sin
 * nueva versión desplegada) responde una página HTML sin cabeceras CORS: el navegador lo reporta como
 * "bloqueado por CORS" (TypeError) o como JSON inválido (SyntaxError) — nada de eso es el problema real. */
export function explicarFalla(e: unknown): Error {
  if (e instanceof TypeError || e instanceof SyntaxError) {
    return new Error(
      'El Apps Script de Seg. de pedidos no respondió JSON. Abre la URL /exec en el navegador: si ves una página de error, ' +
      'corrígela (p. ej. archivos duplicados en el proyecto) y publica una nueva versión; si pide iniciar sesión, ' +
      'despliega con acceso para quien use la app. Ver docs/apps-script-pedidos.md.',
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}

function errorDeScript(data: unknown): string | null {
  if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === false) {
    return String((data as { error?: unknown }).error ?? 'Error desconocido del Apps Script.');
  }
  return null;
}

function assertManifiesto(data: unknown): LibroManifiesto[] {
  const err = errorDeScript(data);
  if (err) throw new Error(err);
  const relacion = (data as { relacion?: unknown } | null)?.relacion;
  if (!Array.isArray(relacion)) {
    throw new Error('Formato de respuesta inesperado en el manifiesto — ¿el Apps Script tiene desplegada la última versión? (ver docs/apps-script-pedidos.md)');
  }
  return relacion as LibroManifiesto[];
}

function assertPagina(libro: string, hoja: string, data: unknown): PaginaHoja {
  const err = errorDeScript(data);
  if (err) throw new Error(err);
  const { columnas, rows } = (data ?? {}) as Partial<PaginaHoja>;
  if (!Array.isArray(columnas) || !Array.isArray(rows)) {
    throw new Error(`Formato de respuesta inesperado en "${libro} / ${hoja}" — ¿el Apps Script tiene desplegada la última versión? (ver docs/apps-script-pedidos.md)`);
  }
  return { columnas, rows };
}

async function fetchManifiesto(): Promise<LibroManifiesto[]> {
  const url = `${await requireUrl()}?action=relacion`;
  return withRetries('manifiesto', async () => {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-store' }, MANIFEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status} al consultar los libros de Seg. de pedidos.`);
      return assertManifiesto(await res.json());
    } catch (e) {
      throw explicarFalla(e);
    }
  });
}

async function fetchPagina(libro: LibroClave, hoja: string, offset: number, limit: number): Promise<PaginaHoja> {
  const params = new URLSearchParams({ action: 'hoja', libro, hoja, offset: String(offset), limit: String(limit) });
  const url = `${await requireUrl()}?${params.toString()}`;
  return withRetries(`"${libro} / ${hoja}" offset=${offset}`, () => limitadorAppsScript(async () => {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-store' }, PAGE_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status} al leer "${libro} / ${hoja}".`);
      return assertPagina(libro, hoja, await res.json());
    } catch (e) {
      throw explicarFalla(e);
    }
  }));
}

/** Restaura las hojas y la última descarga de cada libro desde IndexedDB (sin red) para pintar al instante. */
export async function restaurarPedidos(): Promise<void> {
  const store = usePedidosStore.getState();
  try {
    const [filas, fuentes] = await Promise.all([getAllCachedPedidos(), getFuentesPedidos()]);
    store.restaurar(
      filas.map((fila) => indexarHoja(fila)),
      Object.fromEntries(fuentes.map((f) => [f.clave, infoDeFila(f)])),
    );
  } catch (e) {
    void logWarn('pedidos-cache-restore', e instanceof Error ? e.message : String(e));
    store.restaurar([], {});
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface ResultadoSyncPedidos {
  /** Libros que se descargaron (y reemplazaron). */
  descargados: LibroClave[];
  /** Libros que no cambiaron en Drive y se dejaron como estaban (solo sin `forzar`). */
  sinCambios: LibroClave[];
  fallidos: string[];
}

let inFlight: { clave: string; promesa: Promise<ResultadoSyncPedidos> } | null = null;

/** Consulta el manifiesto y descarga COMPLETOS los libros, reemplazando lo anterior de cada uno.
 * Sin `forzar` se omiten los libros cuya `ultimaModificacion` en Drive no cambió (revisión automática al
 * abrir el módulo); con `forzar` se borra y se vuelve a traer todo (botón "Sincronizar"). A lo sumo un sync
 * a la vez: una segunda llamada se une a la actual. */
export function syncPedidos(opts: { forzar?: boolean; /** Libros a sincronizar; por omisión los de Seg. de pedidos e inventarios (no el de comodato). */ libros?: readonly LibroClave[] } = {}): Promise<ResultadoSyncPedidos> {
  const libros = opts.libros ?? LIBROS_BASE_PEDIDOS;
  const clave = `${opts.forzar === true ? 'f' : ''}:${[...libros].sort().join(',')}`;
  // El mismo sync en curso se comparte; uno distinto espera a que termine el actual (comparten el estado de progreso).
  if (inFlight && inFlight.clave === clave) return inFlight.promesa;
  const previo = inFlight?.promesa.catch(() => undefined) ?? Promise.resolve();
  const promesa: Promise<ResultadoSyncPedidos> = previo.then(() => runSync(opts.forzar === true, libros)).finally(() => {
    if (inFlight?.promesa === promesa) inFlight = null;
  });
  inFlight = { clave, promesa };
  return promesa;
}

async function descargarLibro(libro: LibroManifiesto, avance: (recibidas: number) => void): Promise<HojaCruda[]> {
  const limit = libro.chunkSize || PAGE_SIZE;
  let falla: Error | null = null;

  // Todas las hojas del libro (y todas sus páginas) se piden a la vez: las hojas chicas ya no esperan a las grandes y el
  // limitador global (`limitadorAppsScript`) reparte los lugares sin saturar el script.
  const hojas = await Promise.all((libro.hojas ?? []).map(async (hoja): Promise<HojaCruda> => {
    const total = Math.max(hoja.totalRows, 1); // una hoja vacía igual pide la página 0 para sus encabezados
    const offsets: number[] = [];
    for (let o = 0; o < total; o += limit) offsets.push(o);
    let columnas: string[] | null = null;
    const paginas = await Promise.all(offsets.map(async (offset) => {
      if (falla) return [] as string[][];
      try {
        const pagina = await fetchPagina(libro.clave, hoja.nombre, offset, limit);
        columnas = columnas ?? pagina.columnas;
        avance(pagina.rows.length);
        return pagina.rows;
      } catch (e) {
        falla = falla ?? (e instanceof Error ? e : new Error(String(e)));
        throw falla;
      }
    }));
    if (!columnas) throw new Error(`"${libro.nombre} / ${hoja.nombre}" llegó sin encabezados.`);
    return {
      libro: libro.clave,
      hoja: hoja.nombre,
      nombreLibro: libro.nombre,
      ultimaModificacion: libro.ultimaModificacion,
      columnas,
      rows: paginas.flat(),
      sincronizadoEn: new Date().toISOString(),
    };
  }));
  return hojas;
}

async function runSync(forzar: boolean, libros: readonly LibroClave[]): Promise<ResultadoSyncPedidos> {
  const store = usePedidosStore.getState();
  store.start();

  try {
    store.setProgress('Consultando libros en Google Drive…', 5);
    const manifiesto = (await fetchManifiesto()).filter((l) => libros.includes(l.clave) && FUENTES_PEDIDOS.some((f) => f.clave === l.clave));
    const guardadas = await getFuentesPedidos();
    const descargados: LibroClave[] = [];
    const sinCambios: LibroClave[] = [];
    const fallidos: string[] = [];

    // Sin `forzar`, un libro se omite solo si no cambió y ya tenemos TODAS sus hojas.
    const hojasActuales = Object.values(usePedidosStore.getState().hojas);
    // Un libro sin ninguna pestaña legible no se da por sincronizado: se avisa (antes quedaba «completo» con 0 filas, en silencio).
    for (const libro of manifiesto) {
      if (libroSinHojas(libro)) fallidos.push(`${etiquetaDe(libro.clave)}: el Apps Script no encontró ninguna pestaña para este libro («${libro.nombre}»). Revisa la pestaña en Drive o actualiza el Apps Script.`);
    }
    const pendientes = manifiesto.filter((libro) => {
      if (libroSinHojas(libro)) return false;
      const previa = guardadas.find((g) => g.clave === libro.clave);
      const completo = (libro.hojas ?? []).every((h) => hojasActuales.some((x) => x.libro === libro.clave && x.hoja === h.nombre));
      const igual = previa?.modificado === libro.ultimaModificacion && completo;
      if (!forzar && igual) sinCambios.push(libro.clave);
      return forzar || !igual;
    });

    const esperadas = pendientes.reduce((suma, l) => suma + (l.hojas ?? []).reduce((s, h) => s + h.totalRows, 0), 0);
    let recibidas = 0;

    // Los libros se bajan a la vez y cada uno se valida, se guarda e indexa en cuanto termina (sin esperar a los demás).
    await Promise.all(pendientes.map(async (libro) => {
      try {
        const hojas = await descargarLibro(libro, (n) => {
          recibidas += n;
          const pct = esperadas > 0 ? Math.min(100, Math.round((recibidas / esperadas) * 100)) : 0;
          usePedidosStore.getState().setProgress(
            `${etiquetaDe(libro.clave)} — ${recibidas.toLocaleString('es-MX')} / ${esperadas.toLocaleString('es-MX')} filas`,
            10 + Math.round(pct * 0.85),
          );
        });
        const invalido = hojas.map(validarHojaCruda).find((m) => m !== null);
        if (invalido) throw new Error(invalido);

        // Solo con el libro completo y válido se reemplaza lo anterior.
        const leidoEn = new Date().toISOString();
        const filas = hojas.reduce((suma, h) => suma + h.rows.length, 0);
        // La caché es secundaria: si falla (cuota), el libro igual queda en memoria.
        await reemplazarHojasDeLibro(libro.clave, hojas.map((h) => ({ ...h, id: idHoja(h.libro, h.hoja) })))
          .then(() => putFuentePedidos({ clave: libro.clave, nombre: libro.nombre, modificado: libro.ultimaModificacion, leidoEn, filas }))
          .catch((e) => logWarn('pedidos-cache-put', e instanceof Error ? e.message : String(e)));
        usePedidosStore.getState().reemplazarLibro(
          libro.clave,
          hojas.map((h) => indexarHoja(h)),
          { nombre: libro.nombre, modificado: libro.ultimaModificacion, leidoEn, filas },
        );
        descargados.push(libro.clave);
      } catch (e) {
        fallidos.push(`${etiquetaDe(libro.clave)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }));

    const warning = fallidos.length > 0 ? `No se pudo sincronizar: ${fallidos.join('; ')}. Se conservan los datos anteriores de esos libros.` : undefined;
    if (descargados.length > 0) void logInfo('pedidos-sync', `${descargados.map(etiquetaDe).join(', ')} reemplazados`);
    if (fallidos.length > 0) void logWarn('pedidos-sync-partial', fallidos.join(' | '));
    usePedidosStore.getState().finish(warning);
    return { descargados, sinCambios, fallidos };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    usePedidosStore.getState().finish(message);
    throw e;
  }
}
