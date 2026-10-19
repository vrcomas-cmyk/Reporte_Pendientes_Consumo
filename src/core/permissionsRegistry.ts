// ---------------------------------------------------------------------------
// permissionsRegistry.ts · Static catalog of what each module exposes for
// column/detail-level hiding. Module keys must match the route path (minus
// the leading slash; '/' -> 'dashboard') and the `degasa_modules.key` rows
// from the 0002 migration — the admin UI's Roles/Overrides tabs read this to
// know which toggles to render for a given module.
//
// Extending this to a new module/column is a two-step manual process: add an
// entry here (so the admin UI can toggle it), then read `isColumnHidden`/
// `isDetailHidden` at the actual render site in that module's page — see
// SugerenciasPage.tsx's `fuente` column/detail for the reference example.
// ---------------------------------------------------------------------------

export interface RegistryItem { key: string; label: string }

export const MODULE_COLUMNS: Record<string, RegistryItem[]> = {
  sugerencias: [
    { key: 'fuente', label: 'Fuente (fuente alterna de abasto)' },
    { key: 'precio', label: 'Precio' },
  ],
  oportunidades: [
    { key: 'precio', label: 'Precio oferta (vista lista y exportación)' },
  ],
};

export const MODULE_DETAILS: Record<string, RegistryItem[]> = {
  inventario: [
    { key: 'costo', label: 'Costo del material (en todos los paneles de detalle)' },
  ],
  sugerencias: [
    { key: 'fuente', label: 'Detalle de fuente (lote/centro sugerido/disponible)' },
  ],
  oportunidades: [
    { key: 'scoreExplain', label: 'Desglose del score de compatibilidad ("¿Por qué?")' },
  ],
};

// ---------------------------------------------------------------------------
// Qué módulos mostrar en Administración → Roles y permisos.
// ---------------------------------------------------------------------------

/** Clave de módulo de una ruta del menú ('/' → 'dashboard', '/seg-pedidos' → 'seg-pedidos'). */
export const moduloDeRuta = (ruta: string): string => {
  const r = (ruta.split('?')[0] ?? ruta).replace(/^\/+|\/+$/g, '');
  return r === '' ? 'dashboard' : r;
};

/** `normal` = módulo activo; `retirado` = ya no tiene pantalla (modo «solo libros») pero aún controla columnas/detalles que se ven en otros módulos;
 * `oculto` = retirado y sin ningún control: no aporta nada, no se lista. */
export type EstadoModuloAdmin = 'normal' | 'retirado' | 'oculto';

export interface ModuloAdmin<T> {
  modulo: T;
  estado: Exclude<EstadoModuloAdmin, 'oculto'>;
  /** Para los retirados: qué sigue controlando. */
  nota?: string;
}

/**
 * Separa los módulos de la base según la app actual:
 *  · los retirados SIN controles se ocultan;
 *  · los retirados CON controles (columnas o detalles) se muestran marcados como «retirados», con la nota de lo que aún controlan;
 *  · `faltantes` = módulos que SÍ están en el menú pero no existen en la base (no se les puede dar acceso a un rol hasta aplicar la migración).
 */
export function clasificarModulosAdmin<T extends { key: string }>(
  modulos: readonly T[],
  opts: { retirados: ReadonlySet<string>; enMenu: Iterable<string> },
): { visibles: ModuloAdmin<T>[]; ocultos: T[]; faltantes: string[] } {
  const visibles: ModuloAdmin<T>[] = [];
  const ocultos: T[] = [];
  for (const m of modulos) {
    if (!opts.retirados.has(m.key)) { visibles.push({ modulo: m, estado: 'normal' }); continue; }
    const controles = [...(MODULE_COLUMNS[m.key] ?? []), ...(MODULE_DETAILS[m.key] ?? [])];
    if (!controles.length) { ocultos.push(m); continue; }
    visibles.push({ modulo: m, estado: 'retirado', nota: `Sin pantalla en el modo «solo libros»; se conserva porque controla: ${controles.map((c) => c.label).join('; ')}.` });
  }
  const enBase = new Set(modulos.map((m) => m.key));
  const faltantes = [...new Set(opts.enMenu)].filter((k) => !enBase.has(k));
  return { visibles, ocultos, faltantes };
}

// ---------------------------------------------------------------------------
// La lista de módulos sale del CÓDIGO (el menú), no solo de la base: un módulo nuevo aparece en Roles y permisos aunque nadie haya corrido su
// migración. La base solo guarda las claves (para las llaves foráneas de los permisos), y se registran solas al abrir Administración.
// ---------------------------------------------------------------------------

export interface ModuloBase { key: string; label: string; sortOrder: number }

/**
 * Une los módulos de la base con los del menú de la app (todos, incluidos los retirados). Devuelve la lista completa ordenada y los `nuevos`:
 * los que están en el menú y no en la base (hay que registrarlos). Lo ya registrado conserva su etiqueta y orden; los nuevos toman su lugar del menú.
 */
export function unirModulos(base: readonly ModuloBase[], menu: readonly { key: string; label: string }[]): { todos: ModuloBase[]; nuevos: ModuloBase[] } {
  const enBase = new Set(base.map((m) => m.key));
  const vistos = new Set<string>();
  const nuevos: ModuloBase[] = [];
  menu.forEach((m, i) => {
    if (enBase.has(m.key) || vistos.has(m.key)) return;
    vistos.add(m.key);
    nuevos.push({ key: m.key, label: m.label, sortOrder: i });
  });
  const todos = [...base, ...nuevos].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'));
  return { todos, nuevos };
}
