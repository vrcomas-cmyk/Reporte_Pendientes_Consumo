// ---------------------------------------------------------------------------
// permissions.ts · Pure types + helpers for the effective (role + user
// override) permission set. See permissionsService.ts for how this gets
// computed from Supabase, and permissionsStore.ts for how it's held/read.
// ---------------------------------------------------------------------------

export interface RoleRow { id: string; name: string; isAdmin: boolean }

export interface PermissionRow {
  subjectType: 'role' | 'user';
  subjectId: string;
  moduleKey: string;
  scope: 'module' | 'column' | 'detail';
  itemKey: string;
  allowed: boolean;
}

/** Qué DATOS recibe el usuario (los recorta el servidor en la función `datos`; aquí solo se lee para acomodar la interfaz). Por omisión no restringe nada. */
export interface DatosUsuario {
  email: string;
  /** Solo ve su(s) zona(s); lo de otras zonas llega recortado (sin precio ni cliente según el caso). */
  restringirZona: boolean;
  /** Zonas asignadas a mano; se suman a las del catálogo de ejecutivos por correo. */
  zonasManual: string[];
  verCosto: boolean;
  verPrecioOtrasZonas: boolean;
  /** null = todas las condiciones. */
  condicionesPermitidas: string[] | null;
  /** null = sin tope; { 'Corta caducidad': 12 } = solo lotes que vencen en menos de 12 meses. */
  caducidadMaxMeses: Record<string, number> | null;
  verReglaCC1032: boolean;
}

export const DATOS_ABIERTOS: DatosUsuario = {
  email: '', restringirZona: false, zonasManual: [], verCosto: true, verPrecioOtrasZonas: true,
  condicionesPermitidas: null, caducidadMaxMeses: null, verReglaCC1032: true,
};

export interface EffectivePermissions {
  /** True when the signed-in user's role has `isAdmin` — bypasses every
   * check below entirely (also the default when auth is disabled/no role
   * assigned yet, so rolling this out never locks out an existing invite). */
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  /** null = unrestricted (every module allowed) — admins, or a user with no
   * role assigned. Otherwise: exactly the modules explicitly granted. */
  allowedModules: Set<string> | null;
  /** moduleKey -> set of column item_keys explicitly hidden. */
  hiddenColumns: Map<string, Set<string>>;
  /** moduleKey -> set of detail item_keys explicitly hidden. */
  hiddenDetails: Map<string, Set<string>>;
  /** Acceso a datos (zona, costo, condiciones, caducidad). */
  datos: DatosUsuario;
}

export const UNRESTRICTED_PERMISSIONS: EffectivePermissions = {
  isAdmin: true,
  roleId: null,
  roleName: null,
  allowedModules: null,
  hiddenColumns: new Map(),
  hiddenDetails: new Map(),
  datos: DATOS_ABIERTOS,
};

export function canViewModule(perms: EffectivePermissions, moduleKey: string): boolean {
  if (perms.isAdmin || !perms.allowedModules) return true;
  return perms.allowedModules.has(moduleKey);
}

export function isColumnHidden(perms: EffectivePermissions, moduleKey: string, columnKey: string): boolean {
  if (perms.isAdmin) return false;
  return perms.hiddenColumns.get(moduleKey)?.has(columnKey) ?? false;
}

export function isDetailHidden(perms: EffectivePermissions, moduleKey: string, detailKey: string): boolean {
  if (perms.isAdmin) return false;
  return perms.hiddenDetails.get(moduleKey)?.has(detailKey) ?? false;
}

/** Builds an `EffectivePermissions` from the raw role + grant rows. Shared by
 * permissionsService (real Supabase data) and its tests. Override rows
 * (subjectType 'user') always win over the role's rows for the same
 * (moduleKey, scope, itemKey) — callers should put override rows LAST so a
 * plain last-write-wins per key does the right thing. */
export function computeEffectivePermissions(
  role: RoleRow | null,
  rows: PermissionRow[],
  datos: DatosUsuario = DATOS_ABIERTOS,
): EffectivePermissions {
  if (!role || role.isAdmin) {
    return { ...UNRESTRICTED_PERMISSIONS, roleId: role?.id ?? null, roleName: role?.name ?? null, isAdmin: !role || role.isAdmin, datos: { ...DATOS_ABIERTOS, email: datos.email } };
  }

  const moduleGrants = new Map<string, boolean>();
  const columnDenies = new Map<string, Map<string, boolean>>();
  const detailDenies = new Map<string, Map<string, boolean>>();

  for (const r of rows) {
    if (r.scope === 'module') {
      moduleGrants.set(r.moduleKey, r.allowed);
    } else {
      const target = r.scope === 'column' ? columnDenies : detailDenies;
      let m = target.get(r.moduleKey);
      if (!m) { m = new Map(); target.set(r.moduleKey, m); }
      m.set(r.itemKey, r.allowed);
    }
  }

  const allowedModules = new Set<string>();
  moduleGrants.forEach((allowed, key) => { if (allowed) allowedModules.add(key); });

  const hiddenColumns = new Map<string, Set<string>>();
  columnDenies.forEach((items, moduleKey) => {
    const hidden = new Set<string>();
    items.forEach((allowed, itemKey) => { if (!allowed) hidden.add(itemKey); });
    if (hidden.size) hiddenColumns.set(moduleKey, hidden);
  });

  const hiddenDetails = new Map<string, Set<string>>();
  detailDenies.forEach((items, moduleKey) => {
    const hidden = new Set<string>();
    items.forEach((allowed, itemKey) => { if (!allowed) hidden.add(itemKey); });
    if (hidden.size) hiddenDetails.set(moduleKey, hidden);
  });

  // Sin permiso de ver costos, el detalle «costo» de Inventario se oculta también en pantalla (el servidor ya no manda los costos).
  if (!datos.verCosto) {
    const d = new Set(hiddenDetails.get('inventario') ?? []);
    d.add('costo');
    hiddenDetails.set('inventario', d);
  }

  return { isAdmin: false, roleId: role.id, roleName: role.name, allowedModules, hiddenColumns, hiddenDetails, datos };
}
