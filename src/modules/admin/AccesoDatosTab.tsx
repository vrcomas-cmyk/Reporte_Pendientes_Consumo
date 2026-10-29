import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/store/toastStore';
import { DATOS_ABIERTOS, type DatosUsuario, type RoleRow } from '@/core/permissions';
import { SECCIONES_CONDICION } from '@/core/pedidos';
import { getRoleDatos, getUserZonas, listAllowedUsers, listRoles, listZonasManuales, saveRoleDatos, setUserZonas, getUserRestringirZona, setUserRestringirZona, type AllowedUserRow } from '@/services/permissionsService';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { normCode } from '@/core/enrich';
import { StatePill } from '@/modules/analytics/ui';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

/** Respaldo cuando «Inv con Condición» aún no está cargado: las pestañas fijas de Inv_Condicion más Sustituto. */
const CONDICIONES_BASE = [...SECCIONES_CONDICION, 'Sustituto'];

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Casilla({ marcado, onChange, titulo, ayuda }: { marcado: boolean; onChange: (v: boolean) => void; titulo: string; ayuda: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="font-medium">{titulo}</span><span className="block text-xs text-text-muted">{ayuda}</span></span>
    </label>
  );
}

/** Ejecutivos considerados: los del catálogo (zona, nombre, correos) con los usuarios de la app que quedan en su zona, ya sea por su correo o por
 * una zona asignada a mano, y si su rol los limita a esa zona. Es la misma resolución que hace el servidor, para ver quién ve qué antes de compartir el link. */
function EjecutivosConsiderados({ roles, users, restringidos }: { roles: RoleRow[]; users: AllowedUserRow[]; restringidos: Set<string> }) {
  const { enrich } = useAnalytics();
  const [manuales, setManuales] = useState<Map<string, string[]>>(new Map());
  const [q, setQ] = useState('');
  useEffect(() => { void listZonasManuales().then(setManuales).catch(() => undefined); }, [users]);

  const filas = useMemo(() => {
    const usuariosDe = (zona: string) => users.filter((u) => {
      const e = u.email.toLowerCase();
      return (manuales.get(e) ?? []).map(normCode).includes(zona) || enrich.correosDeZona(zona).some((c) => c.toLowerCase() === e);
    });
    return enrich.ejecutivosZona.map((z) => ({ zona: z, correos: enrich.correosDeZona(z.zona), usuarios: usuariosDe(z.zona) }));
  }, [enrich, users, manuales]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? filas.filter((f) => `${f.zona.zona3} ${f.zona.nombre} ${f.zona.gerenciaVentas} ${f.zona.gerenteVentas} ${f.zona.canalVentas} ${f.zona.oficinaVentas} ${f.correos.join(' ')} ${f.usuarios.map((u) => u.email).join(' ')}`.toLowerCase().includes(t)) : filas;
  }, [filas, q]);

  // Usuarios cuyo rol los limita a su zona pero no quedan en ninguna: no verían nada.
  const sinZona = users.filter((u) => u.roleId && restringidos.has(u.roleId) && !filas.some((f) => f.usuarios.some((x) => x.email === u.email)));
  const conCorreo = filas.filter((f) => f.correos.length).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ejecutivos considerados ({filas.length})</CardTitle>
        <CardDescription>Del catálogo de ejecutivos: {conCorreo} con correo. Un usuario de la app ve la zona de su ejecutivo si su correo coincide, o la que le asignes abajo.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {sinZona.length > 0 && (
          <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-muted">
            Sin zona (no verán pedidos ni facturación): {sinZona.map((u) => u.email).join(', ')}. Su correo no está en el catálogo de ejecutivos; asígnales zona abajo.
          </p>
        )}
        <Input className="max-w-xs" placeholder="Buscar zona, ejecutivo, gerente o correo…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejecutivo" />
        {filas.length === 0 ? (
          <p className="text-sm text-text-muted">Aún no hay catálogo de ejecutivos cargado: sincroniza el catálogo desde Carga.</p>
        ) : (
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead>Zona</TableHead><TableHead>Ejecutivo</TableHead><TableHead>Gerencia de Ventas</TableHead><TableHead>Gerente de Ventas</TableHead><TableHead>Canal Ventas</TableHead><TableHead>Oficina Ventas</TableHead><TableHead>Correo(s)</TableHead><TableHead>Usuarios de la app en esta zona</TableHead></TableRow></TableHeader>
            <TableBody>
              {visibles.map((f) => (
                <TableRow key={f.zona.zona}>
                  <TableCell className="tabular-nums">{f.zona.zona3}</TableCell>
                  <TableCell>{f.zona.vacante ? <StatePill label={f.zona.etiqueta} cls="amb" /> : f.zona.nombre || '—'}</TableCell>
                  <TableCell className="text-xs">{f.zona.gerenciaVentas || <span className="text-text-faint">—</span>}</TableCell>
                  <TableCell className="text-xs">{f.zona.gerenteVentas || <span className="text-text-faint">—</span>}</TableCell>
                  <TableCell className="text-xs">{f.zona.canalVentas || <span className="text-text-faint">—</span>}</TableCell>
                  <TableCell className="text-xs">{f.zona.oficinaVentas || <span className="text-text-faint">—</span>}</TableCell>
                  <TableCell className="text-xs">{f.correos.length ? f.correos.join(', ') : <span className="text-text-faint">sin correo</span>}</TableCell>
                  <TableCell className="text-xs">
                    {f.usuarios.length === 0 ? <span className="text-text-faint">—</span> : f.usuarios.map((u) => (
                      <div key={u.email}>{u.email} <span className="text-text-faint">· {u.roleName ?? 'sin rol'}</span> {u.roleId && restringidos.has(u.roleId) && <StatePill label="solo su zona" cls="verde" />}</div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-[11px] text-text-faint">{roles.length ? `${roles.filter((r) => restringidos.has(r.id)).length} rol(es) limitado(s) a su zona.` : ''}</p>
      </CardContent>
    </Card>
  );
}

/** Administración › Acceso a datos: qué DATOS recibe cada rol (no solo qué pantallas ve). Lo aplica el servidor en la función `datos`, así que un recorte aquí
 * también cubre lo que se copia o descarga. Sin guardar nada, un rol sigue viendo lo mismo que hoy. */
export function AccesoDatosTab() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [users, setUsers] = useState<AllowedUserRow[]>([]);
  const [rolId, setRolId] = useState('');
  const [d, setD] = useState<DatosUsuario>(DATOS_ABIERTOS);
  const [busy, setBusy] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [zonasTxt, setZonasTxt] = useState('');
  /** Excepción propia del usuario elegido: true = limitado a su zona aunque su rol no lo limite. */
  const [limiteUsuario, setLimiteUsuario] = useState<boolean | null>(null);
  /** Roles (no admin) limitados a su zona. */
  const [restringidos, setRestringidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    void Promise.all([listRoles(), listAllowedUsers()]).then(async ([r, u]) => {
      setRoles(r); setUsers(u);
      const datos = await Promise.all(r.filter((x) => !x.isAdmin).map(async (x) => [x.id, (await getRoleDatos(x.id)).restringirZona] as const));
      setRestringidos(new Set(datos.filter(([, v]) => v).map(([id]) => id)));
    }).catch((e) => toast.error('No se pudo cargar', msg(e)));
  }, []);
  useEffect(() => {
    if (!rolId) return;
    void getRoleDatos(rolId).then(setD).catch((e) => toast.error('No se pudo leer el rol', msg(e)));
  }, [rolId]);
  useEffect(() => {
    if (!usuario) { setZonasTxt(''); setLimiteUsuario(null); return; }
    void getUserRestringirZona(usuario).then(setLimiteUsuario).catch(() => setLimiteUsuario(null));
    void getUserZonas(usuario).then((z) => setZonasTxt(z.join(', '))).catch((e) => toast.error('No se pudieron leer las zonas', msg(e)));
  }, [usuario]);

  // Las condiciones salen de lo que se ve en «Inventario con condición» (cada parte de «Liz/Lento mov» es una condición: Lento mov, Revision Liz, Marcas propias…),
  // con cuántos materiales tiene cada una; las ya permitidas siempre aparecen para poder quitarlas.
  const { invCondicionLibros } = useAnalytics();
  const opciones = useMemo(() => {
    const cuenta = new Map<string, Set<string>>();
    for (const r of invCondicionLibros) {
      for (const parte of r.condicion.split('/').map((x) => x.trim()).filter(Boolean)) {
        if (!cuenta.has(parte)) cuenta.set(parte, new Set());
        cuenta.get(parte)!.add(r.material);
      }
    }
    const nombres = new Set<string>(cuenta.size ? cuenta.keys() : CONDICIONES_BASE);
    for (const c of d.condicionesPermitidas ?? []) nombres.add(c);
    return { cargado: cuenta.size > 0, lista: [...nombres].sort((x, y) => x.localeCompare(y, 'es')).map((c) => ({ nombre: c, materiales: cuenta.get(c)?.size ?? null })) };
  }, [invCondicionLibros, d.condicionesPermitidas]);

  const rol = roles.find((r) => r.id === rolId);
  const todasCondiciones = d.condicionesPermitidas === null;
  const permitidas = useMemo(() => new Set(d.condicionesPermitidas ?? []), [d.condicionesPermitidas]);
  const poner = (p: Partial<DatosUsuario>) => setD((x) => ({ ...x, ...p }));
  const alternarCondicion = (c: string) => {
    const set = new Set(permitidas);
    if (set.has(c)) set.delete(c); else set.add(c);
    poner({ condicionesPermitidas: [...set] });
  };
  const ponerTope = (c: string, txt: string) => {
    const n = Math.floor(Number(txt));
    const { [c]: _quita, ...resto } = d.caducidadMaxMeses ?? {};
    poner({ caducidadMaxMeses: n > 0 ? { ...resto, [c]: n } : (Object.keys(resto).length ? resto : null) });
  };

  const guardar = async () => {
    if (!rolId) return;
    setBusy(true);
    try {
      await saveRoleDatos(rolId, d);
      setRestringidos((s) => { const n = new Set(s); if (d.restringirZona) n.add(rolId); else n.delete(rolId); return n; });
      toast.success('Guardado', 'Aplica en la siguiente carga de datos de esos usuarios.');
    } catch (e) { toast.error('No se pudo guardar', msg(e)); } finally { setBusy(false); }
  };
  const cambiarLimiteUsuario = async (v: boolean) => {
    if (!usuario) return;
    setBusy(true);
    try {
      await setUserRestringirZona(usuario, v ? true : null);
      setLimiteUsuario(v ? true : null);
      toast.success(v ? 'Usuario limitado a su zona' : 'Excepción quitada', 'Aplica en su siguiente carga de datos.');
    } catch (e) { toast.error('No se pudo guardar', msg(e)); } finally { setBusy(false); }
  };
  const guardarZonas = async () => {
    if (!usuario) return;
    setBusy(true);
    try {
      await setUserZonas(usuario, zonasTxt.split(/[;,\s]+/).map((z) => z.trim()).filter(Boolean));
      toast.success('Zonas guardadas');
    } catch (e) { toast.error('No se pudieron guardar', msg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="mt-4 grid gap-4">
      <EjecutivosConsiderados roles={roles} users={users} restringidos={restringidos} />
      <Card>
        <CardHeader>
          <CardTitle>Datos que ve cada rol</CardTitle>
          <CardDescription>Se aplica en el servidor antes de enviar los datos: lo que no se permite no llega al navegador, ni se puede copiar o descargar. Los administradores siempre ven todo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Select value={rolId} onChange={(e) => setRolId(e.target.value)} aria-label="Rol">
            <option value="">Elige un rol…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isAdmin ? ' (admin)' : ''}</option>)}
          </Select>

          {rol && rol.isAdmin && <p className="text-sm text-text-muted">Este rol es administrador: no tiene restricciones de datos.</p>}
          {rol && !rol.isAdmin && (
            <>
              <div className="grid gap-3">
                <Casilla marcado={d.restringirZona} onChange={(v) => poner({ restringirZona: v })} titulo="Ver solo su zona en Seg pedidos, Facturación y Consumo" ayuda="La zona sale del catálogo de ejecutivos por su correo (o la que le asignes abajo). En Comodato (libros) recibe solo los renglones de su zona." />
                <Casilla marcado={d.verPrecioOtrasZonas} onChange={(v) => poner({ verPrecioOtrasZonas: v })} titulo="Ver precio e importes de otras zonas" ayuda="Apagado: de los pedidos de otras zonas solo ve cliente, material, cantidad y pendiente (para el pendiente de Inventario), y de su facturación solo la cantidad, sin cliente ni importe." />
                <Casilla marcado={d.verCosto} onChange={(v) => poner({ verCosto: v })} titulo="Ver costos" ayuda="Apagado: las columnas de costo y margen no se envían." />
                <Casilla marcado={d.verReglaCC1032} onChange={(v) => poner({ verReglaCC1032: v })} titulo="Ver la regla «almacén 1032 con más de 12 meses = Corta caducidad»" ayuda="Apagado: no recibe los lotes del 1032 con más de 12 meses de vigencia." />
              </div>

              <div className="grid gap-2">
                <Casilla marcado={todasCondiciones} onChange={(v) => poner({ condicionesPermitidas: v ? null : [] })} titulo="Ver todas las condiciones" ayuda="Apagado: elige abajo las condiciones que puede ver y, si quieres, hasta cuántos meses de caducidad." />
                {!todasCondiciones && (
                  <div className="grid gap-1.5 rounded-lg border border-border p-3">
                    {!opciones.cargado && <p className="text-xs text-text-muted">«Inv con Condición» aún no está cargado en este navegador: se muestran las condiciones base. Sincroniza Seg. de pedidos para ver todas las que existen.</p>}
                    {opciones.lista.map(({ nombre: c, materiales }) => (
                      <div key={c} className="flex flex-wrap items-center gap-3 text-sm">
                        <label className="flex min-w-56 items-center gap-2"><input type="checkbox" checked={permitidas.has(c)} onChange={() => alternarCondicion(c)} />{c}{materiales !== null && <span className="text-xs text-text-faint">{materiales} materiales</span>}</label>
                        {permitidas.has(c) && (
                          <label className="flex items-center gap-1.5 text-xs text-text-muted">
                            Caducidad máx. (meses)
                            <Input type="number" min={1} className="w-20" placeholder="sin tope" value={d.caducidadMaxMeses?.[c] ?? ''} onChange={(e) => ponerTope(c, e.target.value)} aria-label={`Meses máximos de caducidad de ${c}`} />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div><Button onClick={() => void guardar()} disabled={busy}>Guardar rol</Button></div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zonas por usuario</CardTitle>
          <CardDescription>Opcional. Si un usuario no aparece en el catálogo de ejecutivos con su correo, o necesita ver más de una zona, asígnaselas aquí (códigos separados por coma). Tienen prioridad sobre las del catálogo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={usuario} onChange={(e) => setUsuario(e.target.value)} aria-label="Usuario" className="max-w-xs">
            <option value="">Elige un usuario…</option>
            {users.map((u) => <option key={u.email} value={u.email}>{u.email}</option>)}
          </Select>
          <Input className="w-64" placeholder="p. ej. 101, 102" value={zonasTxt} onChange={(e) => setZonasTxt(e.target.value)} disabled={!usuario} aria-label="Zonas" />
          <Button variant="outline" onClick={() => void guardarZonas()} disabled={!usuario || busy}>Guardar zonas</Button>
          {usuario && (() => {
            const u = users.find((x) => x.email === usuario);
            const rolLimita = !!u?.roleId && restringidos.has(u.roleId);
            const aplica = rolLimita || limiteUsuario === true;
            return (
              <div className="w-full">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={limiteUsuario === true} disabled={busy || rolLimita} onChange={(e) => void cambiarLimiteUsuario(e.target.checked)} />
                  <span><span className="font-medium">Limitar a este usuario a su zona</span><span className="block text-xs text-text-muted">{rolLimita ? `Ya lo limita su rol «${u?.roleName}».` : `Solo a este usuario, aunque su rol${u?.roleName ? ` «${u.roleName}»` : ''} no lo limite (otros con ese rol siguen igual).`}</span></span>
                </label>
                {!aplica && zonasTxt.trim() && (
                  <p className="mt-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-muted">La zona está asignada pero NO se está aplicando: ni su rol ni una excepción lo limitan a su zona, así que ve todos los registros. Activa la casilla de arriba o «Ver solo su zona» en un rol.</p>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
