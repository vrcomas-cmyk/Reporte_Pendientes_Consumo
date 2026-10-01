export type NombresMap = Record<string, string>;

/** Parseo tolerante del JSON guardado en `degasa_connectors`: cualquier cosa
 * que no sea un objeto {codigo: nombre} cae a `{}` y se descartan nombres vacíos. */
export function parseNombres(raw: string | null | undefined): NombresMap {
  if (!raw) return {};
  try {
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: NombresMap = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** `1001 (Tijuana)` si `mostrar` está activo y hay nombre; si no, solo el código. */
export function etiquetaCentro(code: string, nombres: NombresMap, mostrar: boolean): string {
  const n = mostrar ? nombres[code] : undefined;
  return n ? `${code} (${n})` : code;
}

/** `1030 (Multicanal)` siempre que haya nombre, sin depender de ninguna preferencia. */
export function etiquetaAlmacen(code: string, nombres: NombresMap): string {
  const n = nombres[code];
  return n ? `${code} (${n})` : code;
}
