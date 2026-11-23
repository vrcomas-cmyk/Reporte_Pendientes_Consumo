import { supabase } from '@/lib/supabaseClient';
import { computeEffectivePermissions, DATOS_ABIERTOS, deserializarPermisos, serializarPermisos, type DatosUsuario, type EffectivePermissions, type PermissionRow, type RoleRow } from '@/core/permissions';

export interface ModuleRow { key: string; label: string; sortOrder: number }
export interface AllowedUserRow { email: string; displayName: string | null; roleId: string | null; roleName: string | null }

/** De dónde salieron los permisos: `servidor` (lectura buena), `cache` (el servidor no respondió y se usaron los últimos permisos buenos de este
 * mismo usuario → modo degradado) o `error` (no respondió y no hay copia: no se concede nada). */
export type OrigenPermisos = 'servidor' | 'cache' | 'error';
export interface ResultadoPermisos { perms: EffectivePermissions; origen: OrigenPermisos }

const CACHE_PERMISOS_KEY = 'degasa_perms_cache_v1';
const CACHE_PERMISOS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BACKOFF_PERMISOS_MS: readonly number[] = [1000, 3000, 7000];
/** Con copia local no se hace esperar al usuario: si el servidor no contesta en este plazo se entra con la copia y se reintenta en segundo plano. */
const PLAZO_CON_CACHE_MS = 8000;

export function leerCachePermisos(email: string): EffectivePermissions | null {
  try {
    const raw = localStorage.getItem(CACHE_PERMISOS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { email?: string; ts?: number; perms?: unknown };
    if (c.email !== email.toLowerCase() || typeof c.ts !== 'number' || Date.now() - c.ts > CACHE_PERMISOS_TTL_MS) return null;
    return deserializarPermisos(c.perms);
  } catch { return null; }
}
export function guardarCachePermisos(email: string, perms: EffectivePermissions): void {
  try { localStorage.setItem(CACHE_PERMISOS_KEY, JSON.stringify({ email: email.toLowerCase(), ts: Date.now(), perms: serializarPermisos(perms) })); } catch { /* storage no disponible */ }
}
export function borrarCachePermisos(): void {
  try { localStorage.removeItem(CACHE_PERMISOS_KEY); } catch { /* noop */ }
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rechazarEn = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('plazo agotado')), ms));

/** Carga los permisos del usuario con sesión: su rol + cada fila de permiso que le aplica (las del rol, más las excepciones propias — van al final para que
 * `computeEffectivePermissions` deje ganar al usuario). Nunca lanza.
 *
 * Si Supabase no responde (saturado/caído) NO se interpreta como «sin acceso»: se reintenta con backoff y, si hay una copia vigente de los últimos permisos
 * buenos de este mismo usuario, se usa (`origen: 'cache'`). Sin copia queda fail-closed (`origen: 'error'`: ningún módulo), pero la pantalla lo dice tal cual
 * y ofrece reintentar. El acceso real a los datos lo impone el servidor, no esta copia. */
export async function loadEffectivePermissions(email: string, opts: { esperas?: readonly number[]; plazoMs?: number } = {}): Promise<ResultadoPermisos> {
  const copia = leerCachePermisos(email);
  const esperas = opts.esperas ?? (copia ? [] : BACKOFF_PERMISOS_MS);
  const plazoMs = opts.plazoMs ?? (copia ? PLAZO_CON_CACHE_MS : 0);
  for (let i = 0; i <= esperas.length; i++) {
    try {
      const perms = await (plazoMs > 0 ? Promise.race([leerPermisosDelServidor(email), rechazarEn(plazoMs)]) : leerPermisosDelServidor(email));
      guardarCachePermisos(email, perms);
      return { perms, origen: 'servidor' };
    } catch { /* timeout / red / error del servidor: se reintenta */ }
    if (i < esperas.length) await esperar(esperas[i]);
  }
  if (copia) return { perms: copia, origen: 'cache' };
  return { perms: computeEffectivePermissions({ id: '__sin_acceso__', name: 'Sin acceso (error al cargar)', isAdmin: false }, []), origen: 'error' };
}

/** Una lectura de los permisos desde Supabase; LANZA ante cualquier error (el que decide qué hacer es `loadEffectivePermissions`). */
async function leerPermisosDelServidor(email: string): Promise<EffectivePermissions> {
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
    .or(`and(subject_type.eq.role,subject_id.eq.${role.id}),and(subject_type.eq.user,subject_id.eq."${email.replace(/["\\]/g, '')}")`);
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

/** Guarda el valor de un conector / ajuste. Antes solo hacía `update`: si la fila no existía (migración sin aplicar) o la política de seguridad la ocultaba,
 * el `update` tocaba 0 filas SIN dar error y la pantalla decía «Guardado» aunque no se hubiera guardado nada. Ahora comprueba cuántas filas tocó; si fueron 0, la
 * crea (`label` es el nombre que verá el admin) y, si tampoco puede (p. ej. no es administrador), lanza el error para que se vea. */
export async function setConnectorValue(key: string, value: string, updatedBy: string, label?: string): Promise<void> {
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from('degasa_connectors')
    .update({ value, updated_at: ahora, updated_by: updatedBy })
    .eq('key', key)
    .select('key');
  if (error) throw error;
  if (data && data.length > 0) return;
  const { error: errInsert } = await supabase
    .from('degasa_connectors')
    .insert({ key, label: label ?? key, value, updated_at: ahora, updated_by: updatedBy });
  if (errInsert) throw new Error(`No se pudo guardar «${key}»: ${errInsert.message}`);
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
