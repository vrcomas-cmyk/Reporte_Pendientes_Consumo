import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/store/toastStore';
import { MODULE_COLUMNS, MODULE_DETAILS } from '@/core/permissionsRegistry';
import type { PermissionRow, RoleRow } from '@/core/permissions';
import {
  listRoles, createRole, deleteRole, listModules, listAllowedUsers, inviteUser, setUserRole, removeUser,
  listPermissionsFor, setPermission, clearPermission, listConnectors, setConnectorValue,
  type ModuleRow, type AllowedUserRow, type ConnectorRow,
} from '@/services/permissionsService';
import { invalidateConnectorsCache } from '@/services/connectorsService';
import { supabase } from '@/lib/supabaseClient';

export function AdminPage() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Administración</h2>
        <p className="text-sm text-text-muted">Usuarios invitados, roles/permisos por módulo y conectores del portal.</p>
      </div>
      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="roles">Roles y permisos</TabsTrigger>
          <TabsTrigger value="overrides">Overrides por usuario</TabsTrigger>
          <TabsTrigger value="conectores">Conectores</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios"><UsuariosTab /></TabsContent>
        <TabsContent value="roles"><PermissionsTab subjectType="role" /></TabsContent>
        <TabsContent value="overrides"><PermissionsTab subjectType="user" /></TabsContent>
        <TabsContent value="conectores"><ConectoresTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usuarios: the invite list (degasa_allowed_users) + role assignment.
// ---------------------------------------------------------------------------
function UsuariosTab() {
  const [users, setUsers] = useState<AllowedUserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [u, r] = await Promise.all([listAllowedUsers(), listRoles()]);
    setUsers(u);
    setRoles(r);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await inviteUser(email.trim().toLowerCase(), null);
      setEmail('');
      await reload();
      toast.success('Invitado', `${email} ya puede entrar con Google.`);
    } catch (e) {
      toast.error('No se pudo invitar', e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const handleRoleChange = async (userEmail: string, roleId: string) => {
    try {
      await setUserRole(userEmail, roleId || null);
      await reload();
    } catch (e) {
      toast.error('No se pudo cambiar el rol', e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemove = async (userEmail: string) => {
    try {
      await removeUser(userEmail);
      await reload();
      toast.success('Removido', `${userEmail} ya no tiene acceso.`);
    } catch (e) {
      toast.error('No se pudo remover', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuarios invitados</CardTitle>
        <CardDescription>Un rol sin asignar equivale a acceso total (sin restricciones) — asígnalo para empezar a limitar módulos.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@dominio.com" className="max-w-xs" />
          <Button size="sm" disabled={busy || !email.trim()} onClick={handleInvite}>Invitar</Button>
        </div>
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {users.map((u) => (
            <div key={u.email} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{u.email}</span>
              <select
                value={u.roleId ?? ''}
                onChange={(e) => handleRoleChange(u.email, e.target.value)}
                className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs"
              >
                <option value="">Sin restricción</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => handleRemove(u.email)}>Quitar</Button>
            </div>
          ))}
          {!users.length && <div className="px-3 py-4 text-xs text-text-faint">Sin invitados todavía.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Roles y permisos / Overrides por usuario: same UI, different subject.
// `subjectType='role'` edits a role's baseline; `subjectType='user'` edits a
// single email's overrides (which win over their role for the same key).
// ---------------------------------------------------------------------------
function PermissionsTab({ subjectType }: { subjectType: 'role' | 'user' }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [users, setUsers] = useState<AllowedUserRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [newRoleName, setNewRoleName] = useState('');

  useEffect(() => {
    void Promise.all([listRoles(), listAllowedUsers(), listModules()]).then(([r, u, m]) => {
      setRoles(r);
      setUsers(u);
      setModules(m);
    });
  }, []);

  const reloadRows = useCallback(async (id: string) => {
    if (!id) { setRows([]); return; }
    setRows(await listPermissionsFor(subjectType, id));
  }, [subjectType]);
  useEffect(() => { void reloadRows(subjectId); }, [subjectId, reloadRows]);

  const rowFor = (moduleKey: string, scope: 'module' | 'column' | 'detail', itemKey: string) =>
    rows.find((r) => r.moduleKey === moduleKey && r.scope === scope && r.itemKey === itemKey);

  const toggle = async (moduleKey: string, scope: 'module' | 'column' | 'detail', itemKey: string, nextAllowed: boolean, isDefault: boolean) => {
    try {
      if (isDefault) {
        await clearPermission(subjectType, subjectId, moduleKey, scope, itemKey);
      } else {
        await setPermission({ subjectType, subjectId, moduleKey, scope, itemKey, allowed: nextAllowed });
      }
      await reloadRows(subjectId);
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const r = await createRole(newRoleName.trim());
      setNewRoleName('');
      setRoles((prev) => [...prev, r].sort((a, b) => a.name.localeCompare(b.name)));
      setSubjectId(r.id);
    } catch (e) {
      toast.error('No se pudo crear el rol', e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteRole = async () => {
    if (!subjectId) return;
    try {
      await deleteRole(subjectId);
      setRoles((prev) => prev.filter((r) => r.id !== subjectId));
      setSubjectId('');
    } catch (e) {
      toast.error('No se pudo borrar el rol', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{subjectType === 'role' ? 'Roles' : 'Overrides por usuario'}</CardTitle>
        <CardDescription>
          {subjectType === 'role'
            ? 'Módulos: apagado = no lo ve. Columnas/detalles: encendido = lo ve (por defecto visible).'
            : 'Un override reemplaza, solo para ese usuario, lo que diga su rol para ese módulo/columna/detalle.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {subjectType === 'role' ? (
            <>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
                <option value="">Elige un rol…</option>
                {roles.filter((r) => !r.isAdmin).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Nuevo rol…" className="max-w-40" />
              <Button size="sm" variant="outline" onClick={handleCreateRole} disabled={!newRoleName.trim()}>Crear rol</Button>
              {subjectId && <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={handleDeleteRole}>Borrar rol</Button>}
            </>
          ) : (
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
              <option value="">Elige un usuario…</option>
              {users.map((u) => <option key={u.email} value={u.email}>{u.email}</option>)}
            </select>
          )}
        </div>

        {subjectId && (
          <div className="flex flex-col gap-3">
            {modules.map((m) => {
              const moduleRow = rowFor(m.key, 'module', '');
              const moduleAllowed = subjectType === 'role' ? (moduleRow?.allowed ?? false) : (moduleRow ? moduleRow.allowed : null);
              const columns = MODULE_COLUMNS[m.key] ?? [];
              const details = MODULE_DETAILS[m.key] ?? [];
              return (
                <div key={m.key} className="rounded-md border border-border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={moduleAllowed === true}
                      ref={(el) => { if (el) el.indeterminate = moduleAllowed === null; }}
                      onChange={(e) => toggle(m.key, 'module', '', e.target.checked, subjectType === 'user' && !e.target.checked && moduleAllowed === null)}
                    />
                    {m.label}
                    {subjectType === 'user' && moduleRow && (
                      <button type="button" className="text-[11px] text-accent" onClick={() => toggle(m.key, 'module', '', false, true)}>quitar override</button>
                    )}
                  </label>
                  {(columns.length > 0 || details.length > 0) && (subjectType === 'role' ? moduleAllowed : true) && (
                    <div className="mt-2 flex flex-col gap-1 pl-6">
                      {columns.map((c) => {
                        const r = rowFor(m.key, 'column', c.key);
                        const visible = r ? r.allowed : true;
                        return (
                          <label key={c.key} className="flex items-center gap-2 text-xs text-text-muted">
                            <input type="checkbox" checked={visible} onChange={(e) => toggle(m.key, 'column', c.key, e.target.checked, e.target.checked && subjectType === 'role')} />
                            Columna: {c.label}
                            {r && <button type="button" className="text-[10px] text-accent" onClick={() => toggle(m.key, 'column', c.key, true, true)}>default</button>}
                          </label>
                        );
                      })}
                      {details.map((d) => {
                        const r = rowFor(m.key, 'detail', d.key);
                        const visible = r ? r.allowed : true;
                        return (
                          <label key={d.key} className="flex items-center gap-2 text-xs text-text-muted">
                            <input type="checkbox" checked={visible} onChange={(e) => toggle(m.key, 'detail', d.key, e.target.checked, e.target.checked && subjectType === 'role')} />
                            Detalle: {d.label}
                            {r && <button type="button" className="text-[10px] text-accent" onClick={() => toggle(m.key, 'detail', d.key, true, true)}>default</button>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Conectores: admin-editable URLs that replace the build-time VITE_* env
// vars (see connectorsService.ts). Editing here takes effect for every
// browser tab on next load of the relevant service — no redeploy needed.
// ---------------------------------------------------------------------------
function ConectoresTab() {
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await listConnectors();
    setConnectors(rows);
    setDrafts(Object.fromEntries(rows.map((r) => [r.key, r.value ?? ''])));
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const handleSave = async (key: string) => {
    setBusyKey(key);
    try {
      const { data } = await supabase.auth.getUser();
      await setConnectorValue(key, drafts[key] ?? '', data.user?.email ?? 'admin');
      invalidateConnectorsCache();
      await reload();
      toast.success('Guardado', 'El conector se actualizó — ya está activo.');
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally { setBusyKey(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conectores</CardTitle>
        <CardDescription>
          URLs de Apps Script y similares. Vacío = usa la variable de entorno del build (VITE_*) como respaldo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connectors.map((c) => (
          <div key={c.key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">{c.label}</label>
            <div className="flex items-center gap-2">
              <Input
                value={drafts[c.key] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [c.key]: e.target.value }))}
                placeholder="https://…"
                className="flex-1 font-mono text-xs"
              />
              <Button size="sm" disabled={busyKey === c.key} onClick={() => handleSave(c.key)}>Guardar</Button>
            </div>
            {c.updatedAt && <span className="text-[11px] text-text-faint">Actualizado {new Date(c.updatedAt).toLocaleString('es-MX')}</span>}
          </div>
        ))}
        {!connectors.length && <div className="text-xs text-text-faint">Corre la migración 0002 en Supabase para ver los conectores aquí.</div>}
      </CardContent>
    </Card>
  );
}
