import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/layout/report';
import { toast } from '@/store/toastStore';
import { cn } from '@/lib/utils';
import { emailLocal } from '@/lib/sesionLocal';
import { useTransmisionStore } from '@/store/transmisionStore';
import { cargarConfigTransmision, guardarConfigTransmision, leerPestanasLibro } from '@/services/enviosConfigService';
import { pestanasQueSeLeen, urlLibroValida, validarConfigTransmision, type ConfigTransmisionCfg, type LibroTxCfg, type PestanaLibro } from '@/core/enviosConfig';

type Modo = 'todas' | 'elegir';

interface EstadoLibro {
  /** Pestañas que devolvió «Leer pestañas» (undefined = aún no se leyó). */
  leidas?: PestanaLibro[];
  nombre?: string;
  cargando?: boolean;
  error?: string;
}

/** Administración → Envíos: libros de transmisión (URL y pestañas a leer) y libro histórico. Se guarda en la base y la función `envios` se lo pasa al Apps Script
 *  en cada consulta: cambiar de mes o agregar un libro NO requiere tocar el script. El token y la URL del Apps Script se configuran en Conectores / secretos. */
export function EnviosTab() {
  const [cfg, setCfg] = useState<ConfigTransmisionCfg>({ libros: [], histUrl: '' });
  const [estados, setEstados] = useState<Record<number, EstadoLibro>>({});
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);

  useEffect(() => {
    void cargarConfigTransmision()
      .then((c) => { setCfg(c); setCargado(true); })
      .catch((e) => { setCargado(true); toast.error('No se pudo cargar la configuración', e instanceof Error ? e.message : String(e)); });
  }, []);

  const cambiar = useCallback((fn: (c: ConfigTransmisionCfg) => ConfigTransmisionCfg) => { setCfg(fn); setSucio(true); }, []);
  const poner = (i: number, parcial: Partial<LibroTxCfg>) => cambiar((c) => ({ ...c, libros: c.libros.map((l, j) => (j === i ? { ...l, ...parcial } : l)) }));
  const estado = (i: number, e: EstadoLibro) => setEstados((s) => ({ ...s, [i]: { ...s[i], ...e } }));

  const leerPestanas = async (i: number) => {
    const url = cfg.libros[i]?.url ?? '';
    if (!urlLibroValida(url)) { estado(i, { error: 'Escribe primero una URL de Google Sheets válida.' }); return; }
    estado(i, { cargando: true, error: undefined });
    try {
      const r = await leerPestanasLibro(url);
      estado(i, { cargando: false, leidas: r.pestanas, nombre: r.nombre });
    } catch (e) {
      estado(i, { cargando: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const quitar = (i: number) => {
    cambiar((c) => ({ ...c, libros: c.libros.filter((_, j) => j !== i) }));
    setEstados({}); // los índices cambian: se vuelve a leer lo que haga falta
  };

  const problemas = validarConfigTransmision(cfg);

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarConfigTransmision(cfg, await emailLocal('admin'));
      setSucio(false);
      toast.success('Guardado', 'Transmisión usará estos libros y pestañas.');
      void useTransmisionStore.getState().cargar(true); // refresca el índice con la nueva configuración
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Envíos · Transmisión</CardTitle>
        <CardDescription>
          De aquí lee el portal los pedidos en transmisión (columna «Transmisión» de Seg. de pedidos). Cambia los libros o las pestañas cuando quieras: no hay que tocar el Apps Script.
          El libro de cada mes debe estar compartido con la cuenta dueña del Apps Script. La URL del Apps Script se pone en la pestaña Conectores («Apps Script · Envíos»).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!cargado && <p className="text-sm text-text-muted">Cargando…</p>}

        {cargado && (
          <>
            <section className="flex flex-col gap-3">
              <h3 className="font-display text-sm font-semibold">Libros de transmisión</h3>
              {cfg.libros.length === 0 && <p className="text-sm text-text-muted">Aún no hay libros. Agrega el libro donde están las pestañas mensuales de transmisión.</p>}

              {cfg.libros.map((libro, i) => {
                const st = estados[i] ?? {};
                const modo: Modo = libro.pestanas && libro.pestanas.length ? 'elegir' : 'todas';
                const urlOk = !libro.url.trim() || urlLibroValida(libro.url);
                const seLeen = st.leidas ? pestanasQueSeLeen(st.leidas, libro.pestanas) : null;
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={libro.url}
                        onChange={(e) => { poner(i, { url: e.target.value }); estado(i, { leidas: undefined, error: undefined }); }}
                        placeholder="https://docs.google.com/spreadsheets/d/…"
                        aria-label={`URL del libro ${i + 1}`}
                        aria-invalid={!urlOk}
                        className={cn('min-w-64 flex-1 font-mono text-xs', !urlOk && 'border-danger')}
                      />
                      <Button size="sm" variant="outline" disabled={st.cargando} onClick={() => void leerPestanas(i)}>
                        <RefreshCcw className={cn('size-3.5', st.cargando && 'animate-spin')} />{st.cargando ? 'Leyendo…' : 'Leer pestañas'}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Quitar el libro ${i + 1}`} onClick={() => quitar(i)}><Trash2 className="size-4" /></Button>
                    </div>
                    {!urlOk && <p className="text-xs text-danger">La URL debe ser de Google Sheets (https://docs.google.com/spreadsheets/d/…).</p>}
                    {st.error && <p className="text-xs text-danger">{st.error}</p>}

                    <div className="flex flex-wrap items-center gap-2">
                      <SegmentedControl<Modo>
                        ariaLabel="Qué pestañas leer"
                        value={modo}
                        onChange={(m) => poner(i, { pestanas: m === 'todas' ? null : (libro.pestanas?.length ? libro.pestanas : (st.leidas ?? []).filter((p) => p.transmision).slice(0, 3).map((p) => p.nombre)) })}
                        options={[
                          { value: 'todas', label: 'Todas las de transmisión', title: 'Lee todas las pestañas que tengan «Pedido SAP» y «Delivery»; los meses nuevos entran solos.' },
                          { value: 'elegir', label: 'Elegir pestañas', title: 'Lee solo las pestañas que marques (usa «Leer pestañas» para verlas).' },
                        ]}
                      />
                      {st.nombre && <span className="text-xs text-text-muted">Libro: {st.nombre}</span>}
                      {seLeen && <span className="text-xs text-text-muted">Se leerán {seLeen.length} {seLeen.length === 1 ? 'pestaña' : 'pestañas'}{modo === 'todas' ? ' (todas las de transmisión)' : ''}.</span>}
                    </div>

                    {modo === 'elegir' && (
                      st.leidas ? (
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                          {st.leidas.map((p) => {
                            const marcada = !!libro.pestanas?.includes(p.nombre);
                            return (
                              <label key={p.nombre} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-bg-inset">
                                <input
                                  type="checkbox"
                                  checked={marcada}
                                  onChange={() => poner(i, { pestanas: marcada ? (libro.pestanas ?? []).filter((n) => n !== p.nombre) : [...(libro.pestanas ?? []), p.nombre] })}
                                />
                                <span className="truncate">{p.nombre}</span>
                                <span className="ml-auto text-[11px] text-text-faint">{p.transmision ? `${p.filas} filas` : 'no es de transmisión'}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-text-muted">
                          Pestañas elegidas: {libro.pestanas?.length ? libro.pestanas.join(', ') : '(ninguna)'}. Pulsa «Leer pestañas» para ver y marcar las que tiene el libro.
                        </p>
                      )
                    )}
                  </div>
                );
              })}

              <div>
                <Button size="sm" variant="outline" disabled={cfg.libros.length >= 10} onClick={() => cambiar((c) => ({ ...c, libros: [...c.libros, { url: '', pestanas: null }] }))}>
                  <Plus className="size-3.5" />Agregar libro
                </Button>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="font-display text-sm font-semibold">Libro histórico <span className="font-normal text-text-muted">(opcional)</span></h3>
              <p className="text-xs text-text-muted">
                El que tiene la pestaña «Envio en transmision» (Pedido, Material, Lote). Es lo único que permite marcar QUÉ materiales van en una entrega en transmisión: las pestañas de
                transmisión no traen material. Sin él, el pedido igual se marca «en transmisión», pero sin detalle de materiales.
              </p>
              <Input
                value={cfg.histUrl}
                onChange={(e) => cambiar((c) => ({ ...c, histUrl: e.target.value }))}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                aria-label="URL del libro histórico"
                aria-invalid={!!cfg.histUrl.trim() && !urlLibroValida(cfg.histUrl)}
                className="font-mono text-xs"
              />
            </section>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              {problemas.length > 0 && sucio
                ? <span className="text-xs text-danger">{problemas[0]}</span>
                : <span className="text-xs text-text-faint">{sucio ? 'Cambios sin guardar.' : 'Sin cambios.'}</span>}
              <Button size="sm" className="ml-auto" disabled={guardando || !sucio || problemas.length > 0} onClick={() => void guardar()}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
