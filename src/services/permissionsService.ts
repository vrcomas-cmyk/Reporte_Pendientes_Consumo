import { supabase } from '@/lib/supabaseClient';
import { computeEffectivePermissions, type EffectivePermissions, type PermissionRow, type RoleRow } from '@/core/permissions';

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
      return computeEffectivePermissions(role, []);
    }

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

    return computeEffectivePermissions(role, rows);
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
