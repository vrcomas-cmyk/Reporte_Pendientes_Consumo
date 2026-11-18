// acceso.ts · Reglas de acceso de la función `envios` (puras, sin Deno ni red, para poder probarlas con vitest como `datos/accesoDatos.ts`).
//
// Qué decide esta función antes de tocar el Apps Script:
//   1) ¿La acción existe? (lista blanca: nada que no esté aquí llega al Apps Script)
//   2) ¿Los parámetros son válidos? (se reenvían SOLO los permitidos, recortados)
//   3) ¿El usuario tiene permiso del módulo de esa acción? (misma regla que el cliente: `core/permissions.ts`)
//   4) ¿El origen del navegador está permitido? (CORS por lista, no `*`)

/** Módulos del portal (degasa_modules.key) que protegen las acciones de esta función. */
/** `admin` no es un módulo del menú: marca las acciones de configuración, que solo puede usar un ADMINISTRADOR de verdad (no basta ser «usuario sin rol»). */
export type ModuloEnvios = 'transmision' | 'solicitudes' | 'sin-cargo' | 'admin';

/** Un libro de Google Sheets es válido si es una URL https de docs.google.com/spreadsheets/d/<id>: así la función nunca le pasa al Apps Script una URL arbitraria. */
export function urlLibroValida(url: unknown): boolean {
  const u = String(url ?? '').trim();
  return u.length <= 400 && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/.test(u);
}

/** Configuración de Transmisión que un admin guarda en la app (Administración → Envíos): libros de transmisión (con las pestañas a leer, o todas) y el libro histórico. */
export interface LibroTx {
  url: string;
  /** null = todas las pestañas de transmisión que haya (incluye los meses nuevos). */
  pestanas: string[] | null;
}
export interface ConfigTransmision { libros: LibroTx[]; histUrl: string }

const MAX_LIBROS = 10;
const MAX_PESTANAS = 80;
const MAX_LARGO_PESTANA = 100;

/** Valida y sanea la configuración guardada (llega como JSON de `degasa_connectors`). null si no hay ningún libro válido. Lo que no es una URL de Google Sheets se descarta. */
export function configTransmision(raw: unknown): ConfigTransmision | null {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (!o || typeof o !== 'object') return null;
  const crudos = (o as { libros?: unknown }).libros;
  if (!Array.isArray(crudos)) return null;
  const libros: LibroTx[] = [];
  for (const l of crudos.slice(0, MAX_LIBROS)) {
    const url = String((l as { url?: unknown } | null)?.url ?? '').trim();
    if (!urlLibroValida(url)) continue;
    const p = (l as { pestanas?: unknown }).pestanas;
    const pestanas = Array.isArray(p)
      ? [...new Set(p.map((x) => String(x ?? '').trim()).filter((x) => x && x.length <= MAX_LARGO_PESTANA))].slice(0, MAX_PESTANAS)
      : [];
    libros.push({ url, pestanas: pestanas.length ? pestanas : null });
  }
  if (!libros.length) return null;
  const hist = String((o as { histUrl?: unknown }).histUrl ?? '').trim();
  return { libros, histUrl: urlLibroValida(hist) ? hist : '' };
}

interface DefAccion {
  modulo: ModuloEnvios;
  /** Parámetros que se reenvían al Apps Script (los demás se descartan). Devuelve null si algo es inválido. */
  parametros: (body: Record<string, unknown>) => Record<string, unknown> | null;
}

const MAX_ENTREGAS = 3000;
const MAX_LARGO_ENTREGA = 24;

const sinParametros = (): Record<string, unknown> => ({});

/** Lista blanca de acciones. Las fases 2 y 3 agregan aquí `drp_*` y `sc_*` con su módulo. */
export const ACCIONES: Readonly<Record<string, DefAccion>> = {
  // Índice de pedidos en transmisión (pedido → entregas). Sin parámetros.
  tx_indice: { modulo: 'transmision', parametros: sinParametros },
  // (Solo administradores) pestañas de un libro de Google Sheets, para elegir cuáles leer desde Administración → Envíos.
  tx_pestanas: {
    modulo: 'admin',
    parametros: (b) => (urlLibroValida(b.url) ? { url: String(b.url).trim() } : null),
  },
  // Materiales / lotes que el histórico asocia a unas entregas. `deliverys`: hasta 3000, texto corto.
  tx_historial: {
    modulo: 'transmision',
    parametros: (b) => {
      const d = b.deliverys;
      if (!Array.isArray(d)) return null;
      const lista = [...new Set(d.map((x) => String(x ?? '').trim()).filter((x) => x && x.length <= MAX_LARGO_ENTREGA))];
      if (lista.length === 0 || lista.length > MAX_ENTREGAS) return null;
      return { deliverys: lista };
    },
  },
};

export function moduloDeAccion(accion: unknown): ModuloEnvios | null {
  return typeof accion === 'string' && Object.prototype.hasOwnProperty.call(ACCIONES, accion) ? ACCIONES[accion].modulo : null;
}

/** Parámetros ya saneados de una acción, o null si la acción no existe o sus parámetros no son válidos. */
export function parametrosDeAccion(accion: unknown, body: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof accion !== 'string' || !Object.prototype.hasOwnProperty.call(ACCIONES, accion)) return null;
  return ACCIONES[accion].parametros(body);
}

/** Fila de `degasa_permissions` que importa aquí. */
export interface FilaPermiso { subject_type: string; scope: string; module_key: string; allowed: boolean }

/** ¿Puede el usuario usar un módulo? Igual que `canViewModule` del cliente:
 *  · sin rol, o rol administrador → sí (sin restricciones);
 *  · cualquier otro rol → solo si el módulo está concedido explícitamente; las filas del USUARIO ganan a las del rol (por eso `filas` debe venir con las del usuario al final). */
export function moduloPermitido(esAdmin: boolean, tieneRol: boolean, filas: readonly FilaPermiso[], modulo: string): boolean {
  if (modulo === 'admin') return esAdmin; // configuración: solo un administrador, aunque «sin rol» no tenga restricciones en los módulos
  if (esAdmin || !tieneRol) return true;
  let concedido = false;
  for (const f of filas) {
    if (f.scope === 'module' && f.module_key === modulo) concedido = !!f.allowed;
  }
  return concedido;
}

/** Ordena las filas con las del rol primero y las del usuario al final (para que ganen en `moduloPermitido`). */
export function ordenarPermisos(filas: readonly FilaPermiso[]): FilaPermiso[] {
  return [...filas].sort((a, b) => (a.subject_type === b.subject_type ? 0 : a.subject_type === 'user' ? 1 : -1));
}

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Origen que se devuelve en `Access-Control-Allow-Origin`, o '' si no está permitido. `permitidos` viene del secret ALLOWED_ORIGINS (separado por comas).
 *  Siempre se permite localhost para desarrollo; sin lista, los demás orígenes quedan bloqueados (seguro por omisión). */
export function origenPermitido(origen: string | null | undefined, permitidos: readonly string[]): string {
  const o = (origen ?? '').trim().replace(/\/$/, '');
  if (!o) return '';
  if (LOCAL.test(o)) return o;
  return permitidos.map((p) => p.trim().replace(/\/$/, '')).includes(o) ? o : '';
}

export function listaDeOrigenes(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
