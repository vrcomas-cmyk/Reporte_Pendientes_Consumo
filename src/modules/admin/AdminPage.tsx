import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { PESOS_DEFAULT, CRITERIO_LABELS, type CriterioKey } from '@/core/scoring';
import { loadScoringWeights, saveScoringWeight, SCORING_WEIGHT_PREFIX } from '@/services/scoringWeightsService';
import { useScoringWeightsStore } from '@/store/scoringWeightsStore';
import { loadNombres, saveNombres, NOMBRES_PREFIX, type NombresKind } from '@/services/nombresService';
import { useNombresStore } from '@/store/nombresStore';
import { loadGruposExcluidos, saveGruposExcluidos, FILTROS_PREFIX } from '@/services/gruposExcluidosService';
import { useGruposExcluidosStore } from '@/store/gruposExcluidosStore';
import { useDataStore } from '@/store/dataStore';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { CENTERS } from '@/core/types';
import type { NombresMap } from '@/lib/nombres';

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
          <TabsTrigger value="compatibilidad">Compatibilidad</TabsTrigger>
          <TabsTrigger value="nombres">Nombres</TabsTrigger>
          <TabsTrigger value="filtros">Filtros</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios"><UsuariosTab /></TabsContent>
        <TabsContent value="roles"><PermissionsTab subjectType="role" /></TabsContent>
        <TabsContent value="overrides"><PermissionsTab subjectType="user" /></TabsContent>
        <TabsContent value="conectores"><ConectoresTab /></TabsContent>
        <TabsContent value="compatibilidad"><PesosTab /></TabsContent>
        <TabsContent value="nombres"><NombresTab /></TabsContent>
        <TabsContent value="filtros"><FiltrosTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compatibilidad: pesos del motor de scoring de Oportunidades (fase 5). Cada
// fila es una regla del `core/scoring.ts`; el peso vive en `degasa_connectors`
// (mismo mecanismo genérico key/value que Conectores, ver scoringWeightsService).
// ---------------------------------------------------------------------------
function PesosTab() {
  const [drafts, setDrafts] = useState<Partial<Record<CriterioKey, number>>>({});
  const [busyKey, setBusyKey] = useState<CriterioKey | null>(null);
  const invalidate = useScoringWeightsStore((s) => s.invalidate);

  const reload = useCallback(async () => {
    setDrafts(await loadScoringWeights());
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const handleSave = async (key: CriterioKey) => {
    setBusyKey(key);
    try {
      const { data } = await supabase.auth.getUser();
      await saveScoringWeight(key, drafts[key] ?? PESOS_DEFAULT[key], data.user?.email ?? 'admin');
      invalidate();
      toast.success('Guardado', 'El peso se actualizó — ya afecta el próximo ranking.');
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally { setBusyKey(null); }
  };

  const criterios = Object.keys(PESOS_DEFAULT) as CriterioKey[];
  const suma = criterios.filter((k) => (drafts[k] ?? PESOS_DEFAULT[k]) > 0).reduce((acc, k) => acc + (drafts[k] ?? PESOS_DEFAULT[k]), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compatibilidad — pesos del score</CardTitle>
        <CardDescription>
          Cada criterio suma (o resta, si es negativo) puntos al score de un cliente para un material. El score final se normaliza a 100
          sobre la suma de los pesos positivos ({suma}) — no hace falta que sumen exactamente 100.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {criterios.map((key) => (
          <div key={key} className="flex items-center gap-3">
            <label className="flex-1 text-sm text-text">{CRITERIO_LABELS[key]}</label>
            <Input
              type="number"
              value={drafts[key] ?? PESOS_DEFAULT[key]}
              onChange={(e) => setDrafts((d) => ({ ...d, [key]: Number(e.target.value) }))}
              className="w-24 text-right font-mono text-sm"
            />
            <Button size="sm" disabled={busyKey === key} onClick={() => handleSave(key)}>Guardar</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Nombres: alias de centros y almacenes (1001 = Tijuana, 1030 = Multicanal…).
// Se guardan como JSON en `degasa_connectors` (ver nombresService). Los
// códigos se precargan de los datos cargados y se pueden agregar otros.
// ---------------------------------------------------------------------------
function NombresTab() {
  const a = useAnalytics();
  const invalidate = useNombresStore((s) => s.invalidate);
  const [drafts, setDrafts] = useState<Record<NombresKind, NombresMap>>({ centros: {}, almacenes: {} });
  const [busy, setBusy] = useState<NombresKind | null>(null);

  useEffect(() => {
    void loadNombres().then(setDrafts).catch((e) => toast.error('No se pudieron cargar los nombres', e instanceof Error ? e.message : String(e)));
  }, []);

  const codigos = (kind: NombresKind): string[] => {
    const set = new Set<string>(Object.keys(drafts[kind]));
    if (kind === 'centros') {
      CENTERS.forEach((c) => set.add(c));
      a.rss?.centros.forEach((c) => set.add(c));
    } else {
      ['1030', '1031', '1032', '1060'].forEach((c) => set.add(c));
      a.rss?.mats.forEach((mo) => mo.centros.forEach((co) => co.alm.forEach((al) => { if (al.alm && al.alm !== '—') set.add(al.alm); })));
    }
    return [...set].sort();
  };

  const handleSave = async (kind: NombresKind) => {
    setBusy(kind);
    try {
      const { data } = await supabase.auth.getUser();
      await saveNombres(kind, drafts[kind], data.user?.email ?? 'admin');
      invalidate();
      toast.success('Guardado', kind === 'centros' ? 'Los nombres de centros ya están activos.' : 'Los nombres de almacenes ya están activos.');
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const bloque = (kind: NombresKind, titulo: string, descripcion: string) => (
    <NombresCard
      key={kind} titulo={titulo} descripcion={descripcion} codigos={codigos(kind)} valores={drafts[kind]} busy={busy === kind}
      onChange={(code, v) => setDrafts((d) => ({ ...d, [kind]: { ...d[kind], [code]: v } }))}
      onSave={() => handleSave(kind)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {bloque('centros', 'Nombres de centros', 'Los usuarios pueden alternar en Inventario entre ver solo el código (1001) o código + nombre (1001 (Tijuana)).')}
      {bloque('almacenes', 'Nombres de almacenes', 'Siempre se muestran junto al código en el desglose por almacén: 1030 (Multicanal).')}
    </div>
  );
}

function NombresCard({ titulo, descripcion, codigos, valores, busy, onChange, onSave }: {
  titulo: string; descripcion: string; codigos: string[]; valores: NombresMap; busy: boolean;
  onChange: (code: string, v: string) => void; onSave: () => void;
}) {
  const [nuevo, setNuevo] = useState('');
  const agregar = () => {
    const code = nuevo.trim();
    if (!code) return;
    onChange(code, valores[code] ?? ' ');
    setNuevo('');
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {codigos.map((code) => (
          <div key={code} className="flex items-center gap-3">
            <label className="w-24 font-mono text-sm text-text">{code}</label>
            <Input value={valores[code] ?? ''} onChange={(e) => onChange(code, e.target.value)} placeholder="Sin nombre" className="max-w-xs" />
          </div>
        ))}
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <Input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Agregar código…" className="w-24 font-mono text-sm" />
          <Button size="sm" variant="outline" onClick={agregar} disabled={!nuevo.trim()}>Agregar</Button>
          <Button size="sm" className="ml-auto" disabled={busy} onClick={onSave}>Guardar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Filtros: grupos de cliente que los reportes EXCLUYEN por defecto en su filtro
// de Grupo cliente (Consumo, Análisis, Análisis Directivo, Incremento — no
// Pedidos/Sugerencias). Por defecto: 18 = GOBIERNO. El usuario siempre puede
// incluirlos a mano en el filtro. Se guardan por CÓDIGO (Gpo. Cte.) como JSON
// en `degasa_connectors` (ver gruposExcluidosService).
// ---------------------------------------------------------------------------
function FiltrosTab() {
  const catalog = useDataStore((s) => s.catalog);
  const invalidate = useGruposExcluidosStore((s) => s.invalidate);
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [cargado, setCargado] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadGruposExcluidos()
      .then((c) => { setExcluidos(c); setCargado(true); })
      .catch((e) => toast.error('No se pudo cargar la configuración', e instanceof Error ? e.message : String(e)));
  }, []);

  // Un grupo por código (Gpo. Cte.) del catálogo de Ejecutivos, más los códigos
  // ya configurados que el catálogo cargado no traiga.
  const grupos = (() => {
    const m = new Map<string, string>();
    for (const e of catalog?.ejecutivos ?? []) {
      const code = String(e.gpoCte ?? '').trim();
      if (code && !m.has(code)) m.set(code, String(e.grupoCliente ?? '').trim());
    }
    for (const code of excluidos) if (!m.has(code)) m.set(code, '');
    return [...m.entries()].sort(([a], [b]) => (Number(a) - Number(b)) || a.localeCompare(b));
  })();

  const toggle = (code: string) => setExcluidos((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  const handleSave = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      await saveGruposExcluidos(excluidos, data.user?.email ?? 'admin');
      invalidate();
      toast.success('Guardado', 'Los reportes ya excluyen esos grupos por defecto.');
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grupos de cliente excluidos por defecto</CardTitle>
        <CardDescription>
          Al entrar a Consumo, Análisis, Análisis Directivo e Incremento, el filtro de Grupo cliente parte en «todos menos» los grupos marcados aquí
          (por defecto 18 = GOBIERNO). Se excluye solo el grupo marcado — «GOBIERNO» no incluye a «GOBIERNO DESCENTRALIZADO» ni a «GOBIERNO A». Cada persona
          puede incluirlos a mano desde el filtro; Pedidos/Sugerencias no se ve afectado.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {!cargado && <p className="text-sm text-text-muted">Cargando…</p>}
        {cargado && grupos.length === 0 && <p className="text-sm text-text-muted">No hay grupos de cliente: carga el catálogo para listarlos.</p>}
        {grupos.map(([code, nombre]) => (
          <label key={code} className="flex cursor-pointer items-center gap-3 rounded px-1.5 py-1 text-sm hover:bg-bg-inset">
            <input type="checkbox" checked={excluidos.includes(code)} onChange={() => toggle(code)} />
            <span className="w-10 font-mono text-text-muted">{code}</span>
            <span>{nombre || <span className="text-text-faint">(sin nombre en el catálogo)</span>}</span>
          </label>
        ))}
        <div className="mt-2 flex items-center gap-3 border-t border-border pt-3">
          <span className="text-xs text-text-faint">{excluidos.length ? `${excluidos.length} grupo(s) excluido(s)` : 'Ninguno excluido: los reportes parten en «todos».'}</span>
          <Button size="sm" className="ml-auto" disabled={busy || !cargado} onClick={handleSave}>Guardar</Button>
        </div>
      </CardContent>
    </Card>
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

  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const handleRemove = async (userEmail: string) => {
    try {
      await removeUser(userEmail);
      await reload();
      toast.success('Removido', `${userEmail} ya no tiene acceso.`);
    } catch (e) {
      toast.error('No se pudo remover', e instanceof Error ? e.message : String(e));
    } finally {
      setPendingRemove(null);
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
              <Select
                value={u.roleId ?? ''}
                onChange={(e) => handleRoleChange(u.email, e.target.value)}
                className="h-8 w-auto text-xs"
              >
                <option value="">Sin restricción</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setPendingRemove(u.email)}>Quitar</Button>
            </div>
          ))}
          {!users.length && <div className="px-3 py-4 text-xs text-text-faint">Sin invitados todavía.</div>}
        </div>
      </CardContent>
      <ConfirmDialog
        open={pendingRemove !== null}
        title="¿Quitar acceso a este usuario?"
        description={pendingRemove ? `${pendingRemove} ya no podrá entrar con Google hasta que lo vuelvas a invitar.` : undefined}
        confirmLabel="Quitar acceso"
        onConfirm={() => pendingRemove && handleRemove(pendingRemove)}
        onCancel={() => setPendingRemove(null)}
      />
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

  const [confirmDeleteRole, setConfirmDeleteRole] = useState(false);

  const handleDeleteRole = async () => {
    if (!subjectId) return;
    try {
      await deleteRole(subjectId);
      setRoles((prev) => prev.filter((r) => r.id !== subjectId));
      setSubjectId('');
    } catch (e) {
      toast.error('No se pudo borrar el rol', e instanceof Error ? e.message : String(e));
    } finally {
      setConfirmDeleteRole(false);
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
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-auto">
                <option value="">Elige un rol…</option>
                {roles.filter((r) => !r.isAdmin).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Nuevo rol…" className="max-w-40" />
              <Button size="sm" variant="outline" onClick={handleCreateRole} disabled={!newRoleName.trim()}>Crear rol</Button>
              {subjectId && <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={() => setConfirmDeleteRole(true)}>Borrar rol</Button>}
            </>
          ) : (
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-auto">
              <option value="">Elige un usuario…</option>
              {users.map((u) => <option key={u.email} value={u.email}>{u.email}</option>)}
            </Select>
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
      {subjectType === 'role' && (
        <ConfirmDialog
          open={confirmDeleteRole}
          title="¿Borrar este rol?"
          description={`Todos los permisos configurados para "${roles.find((r) => r.id === subjectId)?.name ?? ''}" se pierden, y cualquier usuario con este rol asignado queda sin restricciones (acceso total) hasta que le asignes otro.`}
          confirmLabel="Borrar rol"
          onConfirm={handleDeleteRole}
          onCancel={() => setConfirmDeleteRole(false)}
        />
      )}
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
    // Los pesos del score (fase 5) viven en la misma tabla pero tienen su
    // propia pestaña "Compatibilidad" con mejor UX (números, no URLs) — se
    // excluyen aquí para no duplicar la edición en dos lugares.
    const rows = (await listConnectors()).filter((r) => !r.key.startsWith(SCORING_WEIGHT_PREFIX) && !r.key.startsWith(NOMBRES_PREFIX) && !r.key.startsWith(FILTROS_PREFIX));
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
