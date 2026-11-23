// ---------------------------------------------------------------------------
// cacheSWR.ts · Caché con vigencia (TTL) para lecturas casi estáticas de Supabase (configuración, políticas, ajustes).
//
// Sin esto cada F5 repetía las mismas consultas aunque nada hubiera cambiado. Con esto:
//   · dentro de la vigencia se responde de la copia local, sin red;
//   · fuera de la vigencia se pide al servidor y se renueva la copia;
//   · si el servidor falla o está saturado se devuelve la última copia buena (no se rompe la pantalla);
//   · varias lecturas simultáneas de la misma clave comparten UNA sola petición.
// La copia es por USUARIO (RLS puede mostrarle a cada uno cosas distintas) y se borra al cerrar sesión. Quien edita el dato debe llamar `invalidarCache`.
// ---------------------------------------------------------------------------
import { sesionLocal } from '@/lib/sesionLocal';

/** Prefijo de las claves de localStorage. `sesionService` borra todo lo que empiece así al cerrar sesión. */
export const PREFIJO_CACHE = 'degasa_swr_v1:';

interface Entrada<T> { ts: number; v: T }

const enVuelo = new Map<string, Promise<unknown>>();

async function claveDe(clave: string): Promise<string> {
  const s = await sesionLocal();
  return `${PREFIJO_CACHE}${s?.id ?? 'anon'}:${clave}`;
}

function leer<T>(k: string): Entrada<T> | null {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entrada<T>;
    return e && typeof e.ts === 'number' && 'v' in e ? e : null;
  } catch {
    return null;
  }
}

function guardar<T>(k: string, v: T): void {
  try { localStorage.setItem(k, JSON.stringify({ ts: Date.now(), v } satisfies Entrada<T>)); } catch { /* sin almacenamiento o lleno: solo se pierde la copia */ }
}

/** Lee `clave` de la copia local si sigue vigente (`ttlMs`); si no, ejecuta `fetcher` y renueva la copia. `forzar` se salta la vigencia (p. ej. pantallas de administración). */
export async function leerConCache<T>(clave: string, fetcher: () => Promise<T>, opts: { ttlMs: number; forzar?: boolean }): Promise<T> {
  const k = await claveDe(clave);
  const copia = leer<T>(k);
  if (copia && !opts.forzar && Date.now() - copia.ts < opts.ttlMs) return copia.v;
  const previo = enVuelo.get(k) as Promise<T> | undefined;
  if (previo) return previo;
  const p = (async () => {
    try {
      const v = await fetcher();
      guardar(k, v);
      return v;
    } catch (e) {
      if (copia) return copia.v; // el servidor no respondió: la última copia buena
      throw e;
    }
  })().finally(() => { enVuelo.delete(k); });
  enVuelo.set(k, p);
  return p;
}

/** Descarta la copia de `clave` (llamar tras guardar/editar ese dato). */
export async function invalidarCache(clave: string): Promise<void> {
  const k = await claveDe(clave);
  try { localStorage.removeItem(k); } catch { /* noop */ }
}

/** Borra TODAS las copias de este navegador (cierre de sesión). */
export function limpiarCachesSwr(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIJO_CACHE)) localStorage.removeItem(k);
  } catch { /* storage bloqueado */ }
}
