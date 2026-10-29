import { supabase } from '@/lib/supabaseClient';
import { computeEffectivePermissions, DATOS_ABIERTOS, type DatosUsuario, type EffectivePermissions, type PermissionRow, type RoleRow } from '@/core/permissions';

export interface ModuleRow { key: string; label: string; sortOrder: number }
export interface AllowedUserRow { email: string; displayName: string | null; roleId: string | null; roleName: string | null }

/** Fetches the signed-in user's role + every permission row that applies to
 * them (their role's rows, plus any user-level override for their email —
 * overrides are appended last so `computeEffectivePermissions`'s last-write-
 * wins per (module,scope,item) naturally lets them win). Never throws — a
 * missing migration (tables not created yet) or any other fetch error falls
 * back to unrestricted, same as before this feature existed, so it can never
 * newly lock someone out just because /admin hasn't been set up yet. */
export async function loadEffectivePermissions(email: string): Promise<EffectivePermissions> {
  try {
    const { data: userRow, error: userErr } = await supabase
      .from('degasa_allowed_users')
      .select('role_id, degasa_roles(id, name, is_admin)')
      .eq('email', email)
      .maybeSingle();
    if (userErr) throw userErr;

    const roleData = userRow?.degasa_roles as unknown as { id: string; name: string; is_admin: boolean } | null | undefined;
    const role: RoleRow | null = roleData ? { id: roleData.id, name: roleData.name, isAdmin: roleData.is_admin } : null;

    if (!role || role.isAdmin) {
      return computeEffectivePermissions(role, [], { ...DATOS_ABIERTOS, email });
    }
    const datos = await loadDatosUsuario(email, role.id);

    const { data: permRows, error: permErr } = await supabase
      .from('degasa_permissions')
      .select('subject_type, subject_id, module_key, scope, item_key, allowed')
      .or(`and(subject_type.eq.role,subject_id.eq.${role.id}),and(subject_type.eq.user,subject_id.eq.${email})`);
    if (permErr) throw permErr;

    const rows: PermissionRow[] = (permRows ?? []).map((r) => ({
      subjectType: r.subject_type as 'role' | 'user',
      subjectId: r.subject_id,
      moduleKey: r.module_key,
      scope: r.scope as 'module' | 'column' | 'detail',
      itemKey: r.item_key ?? '',
      allowed: r.allowed,
    }));
    // Role rows first, user-override rows last, so overrides win.
    rows.sort((a, b) => (a.subjectType === b.subjectType ? 0 : a.subjectType === 'user' ? 1 : -1));

    return computeEffectivePermissions(role, rows, datos);
  } catch {
    return computeEffectivePermissions(null, []);
  }
}

export async function listRoles(): Promise<RoleRow[]> {
  const { data, error } = await supabase.from('degasa_roles').select('id, name, is_admin').order('name');
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, isAdmin: r.is_admin }));
}

export async function createRole(name: string): Promise<RoleRow> {
  const { data, error } = await supabase.from('degasa_roles').insert({ name }).select('id, name, is_admin').single();
  if (error) throw error;
  return { id: data.id, name: data.name, isAdmin: data.is_admin };
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabase.from('degasa_roles').delete().eq('id', id);
  if (error) throw error;
}

export async function listModules(): Promise<ModuleRow[]> {
  const { data, error } = await supabase.from('degasa_modules').select('key, label, sort_order').order('sort_order');
  if (error) throw error;
  return (data ?? []).map((m) => ({ key: m.key, label: m.label, sortOrder: m.sort_order }));
}

export async function listAllowedUsers(): Promise<AllowedUserRow[]> {
  const { data, error } = await supabase
    .from('degasa_allowed_users')
    .select('email, display_name, role_id, degasa_roles(name)')
    .order('email');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    email: r.email,
    displayName: r.display_name ?? null,
    roleId: r.role_id ?? null,
    roleName: (r.degasa_roles as unknown as { name: string } | null)?.name ?? null,
  }));
}

export async function inviteUser(email: string, roleId: string | null): Promise<void> {
  const { error } = await supabase.from('degasa_allowed_users').insert({ email, role_id: roleId });
  if (error) throw error;
}

export async function setUserRole(email: string, roleId: string | null): Promise<void> {
  const { error } = await supabase.from('degasa_allowed_users').update({ role_id: roleId }).eq('email', email);
  if (error) throw error;
}

export async function removeUser(email: string): Promise<void> {
  const { error } = await supabase.from('degasa_allowed_users').delete().eq('email', email);
  if (error) throw error;
}

/** Fetches every permission row for a given subject (a role, or a single
 * user's overrides) — used by the admin Roles/Overrides tabs to render the
 * current toggle state before the admin changes anything. */
export async function listPermissionsFor(subjectType: 'role' | 'user', subjectId: string): Promise<PermissionRow[]> {
  const { data, error } = await supabase
    .from('degasa_permissions')
    .select('subject_type, subject_id, module_key, scope, item_key, allowed')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    subjectType: r.subject_type as 'role' | 'user',
    subjectId: r.subject_id,
    moduleKey: r.module_key,
    scope: r.scope as 'module' | 'column' | 'detail',
    itemKey: r.item_key ?? '',
    allowed: r.allowed,
  }));
}

/** Upserts a single permission row (module grant, or column/detail deny). */
export async function setPermission(row: PermissionRow): Promise<void> {
  const { error } = await supabase.from('degasa_permissions').upsert(
    {
      subject_type: row.subjectType,
      subject_id: row.subjectId,
      module_key: row.moduleKey,
      scope: row.scope,
      item_key: row.itemKey,
      allowed: row.allowed,
    },
    { onConflict: 'subject_type, subject_id, module_key, scope, item_key' },
  );
  if (error) throw error;
}

/** Deletes a permission row, reverting that (module/column/detail) back to
 * its default (module: not granted; column/detail: visible). */
export async function clearPermission(
  subjectType: 'role' | 'user',
  subjectId: string,
  moduleKey: string,
  scope: 'module' | 'column' | 'detail',
  itemKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('degasa_permissions')
    .delete()
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .eq('module_key', moduleKey)
    .eq('scope', scope)
    .eq('item_key', itemKey);
  if (error) throw error;
}

export interface ConnectorRow { key: string; label: string; value: string | null; updatedAt: string | null }

export async function listConnectors(): Promise<ConnectorRow[]> {
  const { data, error } = await supabase.from('degasa_connectors').select('key, label, value, updated_at').order('label');
  if (error) throw error;
  return (data ?? []).map((c) => ({ key: c.key, label: c.label, value: c.value, updatedAt: c.updated_at }));
}

export async function setConnectorValue(key: string, value: string, updatedBy: string): Promise<void> {
  const { error } = await supabase
    .from('degasa_connectors')
    .update({ value, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('key', key);
  if (error) throw error;
}

/** Registra en la base los módulos del menú que aún no existen (solo admin por RLS). No pisa etiqueta ni orden de los que ya están. */
export async function registrarModulos(modulos: readonly ModuleRow[]): Promise<void> {
  if (!modulos.length) return;
  const { error } = await supabase.from('degasa_modules')
    .upsert(modulos.map((m) => ({ key: m.key, label: m.label, sort_order: m.sortOrder })), { onConflict: 'key', ignoreDuplicates: true });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Acceso a datos (migración 0026): campos del rol + zonas / excepciones del usuario. Tolerante: si la migración aún no se aplicó, no restringe nada
// (el servidor es quien manda; esto solo acomoda la interfaz).
// ---------------------------------------------------------------------------
type DatosRolBD = {
  restringir_zona: boolean | null; ver_costo: boolean | null; ver_precio_otras_zonas: boolean | null;
  condiciones_permitidas: string[] | null; caducidad_max_meses: Record<string, number> | null; ver_regla_cc_1032: boolean | null;
};
const COLUMNAS_DATOS_ROL = 'restringir_zona, ver_costo, ver_precio_otras_zonas, condiciones_permitidas, caducidad_max_meses, ver_regla_cc_1032';

const datosDeRol = (email: string, r: DatosRolBD | null, zonasManual: string[], o: Partial<DatosUsuario> | null): DatosUsuario => ({
  email,
  restringirZona: o?.restringirZona ?? r?.restringir_zona ?? false,
  zonasManual,
  verCosto: o?.verCosto ?? r?.ver_costo ?? true,
  verPrecioOtrasZonas: o?.verPrecioOtrasZonas ?? r?.ver_precio_otras_zonas ?? true,
  condicionesPermitidas: o?.condicionesPermitidas !== undefined ? o.condicionesPermitidas : (r?.condiciones_permitidas ?? null),
  caducidadMaxMeses: o?.caducidadMaxMeses !== undefined ? o.caducidadMaxMeses : (r?.caducidad_max_meses ?? null),
  verReglaCC1032: o?.verReglaCC1032 ?? r?.ver_regla_cc_1032 ?? true,
});

export async function loadDatosUsuario(email: string, roleId: string): Promise<DatosUsuario> {
  try {
    const [rol, usuario] = await Promise.all([
      supabase.from('degasa_roles').select(COLUMNAS_DATOS_ROL).eq('id', roleId).maybeSingle(),
      supabase.from('degasa_allowed_users').select('zonas_manual, datos_override').eq('email', email).maybeSingle(),
    ]);
    if (rol.error || usuario.error) return { ...DATOS_ABIERTOS, email };
    return datosDeRol(email, rol.data as DatosRolBD | null, (usuario.data?.zonas_manual as string[] | null) ?? [], (usuario.data?.datos_override as Partial<DatosUsuario> | null) ?? null);
  } catch {
    return { ...DATOS_ABIERTOS, email };
  }
}

/** Campos de acceso a datos de un rol, para editarlos en Administración. */
export async function getRoleDatos(roleId: string): Promise<DatosUsuario> {
  const { data, error } = await supabase.from('degasa_roles').select(COLUMNAS_DATOS_ROL).eq('id', roleId).maybeSingle();
  if (error) throw error;
  return datosDeRol('', data as DatosRolBD | null, [], null);
}

export async function saveRoleDatos(roleId: string, d: DatosUsuario): Promise<void> {
  const { error } = await supabase.from('degasa_roles').update({
    restringir_zona: d.restringirZona, ver_costo: d.verCosto, ver_precio_otras_zonas: d.verPrecioOtrasZonas,
    condiciones_permitidas: d.condicionesPermitidas, caducidad_max_meses: d.caducidadMaxMeses && Object.keys(d.caducidadMaxMeses).length ? d.caducidadMaxMeses : null,
    ver_regla_cc_1032: d.verReglaCC1032,
  }).eq('id', roleId);
  if (error) throw error;
}

export async function getUserZonas(email: string): Promise<string[]> {
  const { data, error } = await supabase.from('degasa_allowed_users').select('zonas_manual').eq('email', email).maybeSingle();
  if (error) throw error;
  return (data?.zonas_manual as string[] | null) ?? [];
}

export async function setUserZonas(email: string, zonas: string[]): Promise<void> {
  const { error } = await supabase.from('degasa_allowed_users').update({ zonas_manual: zonas.length ? zonas : null }).eq('email', email);
  if (error) throw error;
}

/** Zonas asignadas a mano de todos los usuarios, en una sola consulta (email en minúsculas → zonas). */
export async function listZonasManuales(): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.from('degasa_allowed_users').select('email, zonas_manual');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [String(r.email).toLowerCase(), (r.zonas_manual as string[] | null) ?? []]));
}

/** ¿Este usuario está limitado a su zona por una excepción propia (independiente de su rol)? `null` = sin excepción, manda el rol. */
export async function getUserRestringirZona(email: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('degasa_allowed_users').select('datos_override').eq('email', email).maybeSingle();
  if (error) throw error;
  const v = (data?.datos_override as { restringirZona?: unknown } | null)?.restringirZona;
  return typeof v === 'boolean' ? v : null;
}

/** Fija (o quita, con `null`) la excepción «limitar a su zona» de un usuario sin tocar el resto de su `datos_override`. */
export async function setUserRestringirZona(email: string, valor: boolean | null): Promise<void> {
  const { data, error } = await supabase.from('degasa_allowed_users').select('datos_override').eq('email', email).maybeSingle();
  if (error) throw error;
  const { restringirZona: _antes, ...resto } = ((data?.datos_override as Record<string, unknown> | null) ?? {});
  const nuevo = valor === null ? resto : { ...resto, restringirZona: valor };
  const { error: e2 } = await supabase.from('degasa_allowed_users').update({ datos_override: Object.keys(nuevo).length ? nuevo : null }).eq('email', email);
  if (e2) throw e2;
}
