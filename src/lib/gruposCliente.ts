// Grupos de cliente excluidos por defecto en los filtros de los reportes
// (todos menos los que Administración marque, p. ej. 18 = GOBIERNO). Lógica
// pura — sin React ni Supabase — para poder probarla.

/** Etiqueta con la que los filtros de Grupo cliente listan a los clientes que
 * no tienen grupo asignado (ver `buildAnalisisPredicates`). */
export const SIN_GRUPO_CLIENTE = '(sin grupo)';

/** Código de grupo excluido mientras Administración no configure otro: 18 = GOBIERNO. */
export const GRUPOS_EXCLUIDOS_DEFAULT: readonly string[] = ['18'];

/** Comparación EXACTA del nombre de grupo (sin distinguir mayúsculas, acentos
 * ni espacios repetidos): "GOBIERNO" no coincide con "GOBIERNO DESCENTRALIZADO"
 * ni con "GOBIERNO A". */
const clave = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Nombres de grupo a excluir a partir de los CÓDIGOS configurados (Gpo. Cte.,
 * p. ej. "18"): `grupoCliente(código)` es el nombre del catálogo; sin catálogo
 * se usa el código tal cual (así lo listan los filtros cuando no hay nombre). */
export function nombresExcluidos(codigos: readonly string[], grupoCliente: (codigo: string) => string): string[] {
  return [...new Set(codigos.map((c) => (grupoCliente(c) || c).trim()).filter(Boolean))];
}

/** Selección por defecto: todos los grupos de `opciones` MENOS los excluidos.
 * Si ninguno de los excluidos está en `opciones`, devuelve `[]` (sin filtro:
 * no hay nada que quitar). */
export function gruposPorDefecto(opciones: string[], excluidos: readonly string[]): string[] {
  const ex = new Set(excluidos.map(clave));
  if (!ex.size || !opciones.some((o) => ex.has(clave(o)))) return [];
  return opciones.filter((o) => !ex.has(clave(o)));
}

/** ¿`seleccion` es exactamente el valor por defecto? */
export function esSeleccionPorDefecto(seleccion: string[], opciones: string[], excluidos: readonly string[]): boolean {
  const def = gruposPorDefecto(opciones, excluidos);
  return def.length > 0 && def.length === seleccion.length && def.every((g) => seleccion.includes(g));
}

/** Texto corto para el botón/chip del filtro. */
export function etiquetaGrupos(seleccion: string[], opciones: string[], excluidos: readonly string[]): string {
  if (!seleccion.length) return 'todos';
  if (esSeleccionPorDefecto(seleccion, opciones, excluidos)) {
    const quitados = opciones.filter((o) => !seleccion.includes(o));
    return `todos menos ${quitados.slice(0, 2).join(', ')}${quitados.length > 2 ? ` +${quitados.length - 2}` : ''}`;
  }
  return seleccion.length > 2 ? `${seleccion.slice(0, 2).join(', ')} +${seleccion.length - 2}` : seleccion.join(', ');
}

/** Lista de grupos de cliente para Administración → Filtros: los del catálogo (código → nombre), MÁS todo código que aparezca en otras fuentes (facturación, presupuesto…)
 * aunque no tenga nombre, y los ya excluidos que no estén en ninguna fuente. Antes solo salían los del catálogo y un grupo sin nombre (p. ej. del 28 al 32) no se podía
 * marcar. Un código con nombre en el catálogo conserva ese nombre; ordenados por código (numérico primero). */
export function listarGruposCliente(
  catalogo: Iterable<readonly [string, string]>,
  otrosCodigos: Iterable<string>,
  excluidos: readonly string[] = [],
): [string, string][] {
  const m = new Map<string, string>();
  for (const [code, nombre] of catalogo) {
    const c = String(code ?? '').trim();
    if (!c) continue;
    const n = String(nombre ?? '').trim();
    if (!m.has(c) || (!m.get(c) && n)) m.set(c, n);
  }
  for (const code of otrosCodigos) {
    const c = String(code ?? '').trim();
    if (c && !m.has(c)) m.set(c, '');
  }
  for (const code of excluidos) if (!m.has(code)) m.set(code, '');
  return [...m.entries()].sort(([a], [b]) => (Number(a) - Number(b)) || a.localeCompare(b));
}

/** Lo guardado en Administración → arreglo de códigos. `null` si no hay nada
 * válido (se usa el default). */
export function parseGruposExcluidos(raw: string | null | undefined): string[] | null {
  if (raw == null || raw.trim() === '') return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    return [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
  } catch {
    return null;
  }
}
