// usuarioCache.ts · Validación de la sesión del usuario SIN llamar a Auth en cada petición (puro, sin Deno ni red: se prueba con vitest).
//
// Antes cada petición a la función llamaba `auth.getUser(token)`. Una pantalla de Carga son decenas de peticiones en paralelo → decenas de llamadas a
// `/auth/v1/user`, que agravaban la saturación de Auth; y cualquier fallo de Auth se contestaba como 401, igual que un token inválido, así que el navegador
// no sabía que debía reintentar. Ahora:
//   · un token ya validado se recuerda (en la memoria del isolate) como máximo 60 s y nunca más allá de su `exp`;
//   · el fallo de Auth se distingue: 4xx → token inválido (401); red / 5xx / 429 → Auth no disponible (503 con Retry-After).
// Este archivo está duplicado en `datos/` y `envios/` (cada función se despliega sola); si cambias uno, cambia el otro.

const TTL_MS = 60_000;
const MAX_ENTRADAS = 500;

export type ResultadoAuth =
  | { ok: true; email: string }
  | { ok: false; motivo: 'invalido' | 'no-disponible' };

/** Segundos (epoch) del claim `exp` de un JWT, o null si no se puede leer. Solo decodifica; NO verifica la firma (eso lo hace Auth). */
export function expDeJwt(token: string): number | null {
  try {
    const parte = token.split(".")[1];
    if (!parte) return null;
    const json = atob(parte.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parte.length / 4) * 4, "="));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

/** ¿El error de Auth significa «el token no vale» (4xx salvo 429) o «Auth no está disponible» (sin respuesta, 5xx, 429)? */
export function motivoDeErrorAuth(error: { status?: number } | null | undefined): "invalido" | "no-disponible" {
  const s = error?.status;
  if (typeof s !== "number" || s === 0 || s === 429 || s >= 500) return "no-disponible";
  return "invalido";
}

export class CacheUsuarios {
  private mapa = new Map<string, { email: string; hasta: number }>();
  private ttlMs: number;
  private max: number;
  private ahora: () => number;

  constructor(ttlMs: number = TTL_MS, max: number = MAX_ENTRADAS, ahora: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.ahora = ahora;
  }

  get(token: string): string | null {
    const e = this.mapa.get(token);
    if (!e) return null;
    if (e.hasta <= this.ahora()) { this.mapa.delete(token); return null; }
    return e.email;
  }

  /** Recuerda el token hasta `min(ahora + ttl, exp)`. Un token ya vencido no se guarda. */
  set(token: string, email: string, expSegundos: number | null): void {
    const tope = expSegundos === null ? Infinity : expSegundos * 1000;
    const hasta = Math.min(this.ahora() + this.ttlMs, tope);
    if (hasta <= this.ahora()) return;
    if (this.mapa.size >= this.max) {
      // Primero se tiran los vencidos; si sigue lleno, el más antiguo (los Map conservan el orden de inserción).
      for (const [k, v] of this.mapa) if (v.hasta <= this.ahora()) this.mapa.delete(k);
      if (this.mapa.size >= this.max) { const primero = this.mapa.keys().next().value; if (primero !== undefined) this.mapa.delete(primero); }
    }
    this.mapa.set(token, { email, hasta });
  }

  get tamano(): number { return this.mapa.size; }
}

/** Valida el token con la caché y, si no está, con `consultarAuth` (la llamada real a `auth.getUser`). Nunca lanza. */
export async function validarSesion(
  token: string,
  cache: CacheUsuarios,
  consultarAuth: (token: string) => Promise<{ email: string | null; error: { status?: number } | null }>,
): Promise<ResultadoAuth> {
  if (!token) return { ok: false, motivo: "invalido" };
  const enCache = cache.get(token);
  if (enCache) return { ok: true, email: enCache };
  try {
    const { email, error } = await consultarAuth(token);
    if (error) return { ok: false, motivo: motivoDeErrorAuth(error) };
    if (!email) return { ok: false, motivo: "invalido" };
    const correo = email.toLowerCase();
    cache.set(token, correo, expDeJwt(token));
    return { ok: true, email: correo };
  } catch {
    return { ok: false, motivo: "no-disponible" };
  }
}
