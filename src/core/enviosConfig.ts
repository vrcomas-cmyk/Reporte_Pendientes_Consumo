// ---------------------------------------------------------------------------
// enviosConfig.ts · Configuración de «Envíos» que un administrador edita desde la app (Administración → Envíos). Pura: sin red ni disco.
//
// Se guarda como JSON en `degasa_connectors` (clave `envios_cfg_transmision`, solo la lee un admin). La función `envios` de Supabase la vuelve a validar al
// leerla (supabase/functions/envios/acceso.ts → `configTransmision`) y se la pasa al Apps Script: el navegador no manda URLs de libros al script.
// Aquí el análisis es TOLERANTE (no descarta lo que está mal escrito) para que el admin lo vea y lo corrija en pantalla antes de guardar.
// ---------------------------------------------------------------------------

/** Clave de `degasa_connectors` donde vive la configuración de Transmisión. El prefijo `envios_cfg_` la oculta del listado genérico de Conectores. */
export const PREFIJO_CFG_ENVIOS = 'envios_cfg_';
export const CLAVE_CFG_TRANSMISION = `${PREFIJO_CFG_ENVIOS}transmision`;

export interface LibroTxCfg {
  url: string;
  /** null = todas las pestañas de transmisión que tenga el libro (los meses nuevos entran solos). */
  pestanas: string[] | null;
}
export interface ConfigTransmisionCfg { libros: LibroTxCfg[]; histUrl: string }

export const CONFIG_TRANSMISION_VACIA: ConfigTransmisionCfg = { libros: [], histUrl: '' };

/** Misma regla que valida el servidor: una URL https de Google Sheets (docs.google.com/spreadsheets/d/<id>). */
export function urlLibroValida(url: unknown): boolean {
  const u = String(url ?? '').trim();
  return u.length <= 400 && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/.test(u);
}

const texto = (v: unknown): string => String(v ?? '').trim();

/** Lee lo guardado. Vacío o ilegible → configuración vacía (la pantalla invita a configurarla). */
export function parseConfigTransmision(raw: string | null | undefined): ConfigTransmisionCfg {
  if (!raw || !raw.trim()) return { libros: [], histUrl: '' };
  try {
    const o = JSON.parse(raw) as { libros?: unknown; histUrl?: unknown };
    const libros = Array.isArray(o.libros)
      ? o.libros.map((l): LibroTxCfg => {
          const p = (l as { pestanas?: unknown } | null)?.pestanas;
          const pestanas = Array.isArray(p) ? [...new Set(p.map(texto).filter(Boolean))] : [];
          return { url: texto((l as { url?: unknown } | null)?.url), pestanas: pestanas.length ? pestanas : null };
        })
      : [];
    return { libros, histUrl: texto(o.histUrl) };
  } catch {
    return { libros: [], histUrl: '' };
  }
}

/** Problemas que impiden guardar (mensajes para el admin). [] si está bien. El libro histórico es opcional: sin él, Transmisión funciona pero sin materiales por entrega. */
export function validarConfigTransmision(c: ConfigTransmisionCfg): string[] {
  const problemas: string[] = [];
  if (c.libros.length === 0) problemas.push('Agrega al menos un libro de transmisión.');
  if (c.libros.length > 10) problemas.push('Máximo 10 libros de transmisión.');
  c.libros.forEach((l, i) => {
    if (!urlLibroValida(l.url)) problemas.push(`Libro ${i + 1}: la URL debe ser de Google Sheets (https://docs.google.com/spreadsheets/d/…).`);
  });
  const urls = c.libros.map((l) => texto(l.url)).filter(Boolean);
  if (new Set(urls).size !== urls.length) problemas.push('Hay un libro repetido.');
  if (c.histUrl.trim() && !urlLibroValida(c.histUrl)) problemas.push('El libro histórico debe ser una URL de Google Sheets.');
  return problemas;
}

/** JSON que se guarda: recortado, sin pestañas repetidas y con `null` (= todas) cuando no se eligió ninguna. */
export function serializarConfigTransmision(c: ConfigTransmisionCfg): string {
  return JSON.stringify({
    libros: c.libros.map((l) => ({ url: texto(l.url), pestanas: l.pestanas?.length ? [...new Set(l.pestanas.map(texto).filter(Boolean))] : null })),
    histUrl: texto(c.histUrl),
  });
}

export interface PestanaLibro { nombre: string; /** Tiene «Pedido SAP» y «Delivery»: es una pestaña de transmisión. */ transmision: boolean; filas: number }

/** Valida la respuesta de `tx_pestanas`: un cambio del Apps Script no debe romper la pantalla. */
export function pestanasDeRespuesta(raw: unknown): { nombre: string; pestanas: PestanaLibro[] } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { nombre?: unknown; pestanas?: unknown };
  const pestanas = Array.isArray(o.pestanas)
    ? o.pestanas
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({ nombre: texto(p.nombre), transmision: p.transmision === true, filas: Number(p.filas) || 0 }))
        .filter((p) => p.nombre)
    : [];
  return { nombre: texto(o.nombre), pestanas };
}

/** Qué pestañas se leerán de un libro según lo elegido: las marcadas, o — si no hay selección (`null`) — todas las de transmisión que tenga. */
export function pestanasQueSeLeen(pestanas: readonly PestanaLibro[], elegidas: readonly string[] | null): string[] {
  if (elegidas && elegidas.length) return pestanas.filter((p) => elegidas.includes(p.nombre)).map((p) => p.nombre);
  return pestanas.filter((p) => p.transmision).map((p) => p.nombre);
}
