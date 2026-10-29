import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, ClipboardCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { toast } from '@/store/toastStore';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { filasOfertablesDe } from '@/modules/analytics/filasOfertables';
import { CentrosFiltroBar } from '@/modules/analytics/panels/CentrosFiltroBar';
import { EjecutivoZonaFilter, type ModoEjecutivo } from '@/modules/sugerencias/EjecutivoZonaFilter';
import { useCentrosFiltroStore } from '@/store/centrosFiltroStore';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { agruparPorEjecutivo, aceptacionesPrevias, lineasOfertaPorPedido, ofertaDeLinea, textoAceptacionPrevia, type GrupoEjecutivo, type LineaOferta } from '@/core/ofertasEjecutivo';
import { descargarOfertaEjecutivo } from '@/lib/ofertaEjecutivoXlsx';
import * as XLSX from 'xlsx';
import { exportXlsxMultiSheet, libroDeHojas, stamp } from '@/lib/exportXlsx';
import { descargarZip, type ArchivoZip } from '@/lib/zipStore';
import { pickField } from '@/modules/analytics/helpers';
import type { ConsumoRow } from '@/core/types';
import { useFacFuenteStore } from '@/store/facFuenteStore';
import { condicionesDeMaterial } from '@/core/invCondicionLibros';
import { cn } from '@/lib/utils';
import { condicionesElegibles, hojaEnvios, type CaducidadMaxMeses, hojasReporteEjecutivo, type EnvioEjecutivo, nombreArchivoReporteEjecutivo, p50Mensual } from '@/core/reporteEjecutivo';
import { serieMatDest } from '@/core/resumenFac';
import { etiquetaCentro } from '@/lib/nombres';
import { useNombresStore } from '@/store/nombresStore';
import { supabase } from '@/lib/supabaseClient';

const VISTA_PREVIA = 80;
/** Gpo. Vdor. de un renglón de Consumo (con el mismo respaldo que el módulo Consumo cuando viene vacío). */
const zonaVendedorConsumo = (r: ConsumoRow): string => r.gpoVdor || pickField(r.raw, ['Gpo. Vdor.', 'Gpo.Vdor.', 'Grupo de vendedor']);
const CENTROS_INFORME =['1001', '1003', '1004', '1017', '1018', '1022', '1036'];

/** Pestaña «Generar ofertas»: elige centros y ejecutivos, genera la oferta (una línea por pedido × lote) y descarga un Excel por ejecutivo/zona. */
export function GenerarOfertas({ onRegistradas }: { onRegistradas: () => void }) {
  const a = useAnalytics();
  const centros = useCentrosFiltroStore((s) => s.centros);
  const nombresCentros = useNombresStore((s) => s.centros);
  // Reporte por ejecutivo: centros que se INFORMAN (columnas de inventario) y condiciones que se mandan; vacío = todos. Independientes de «Considerar centros».
  const [centrosInforme, setCentrosInforme] = usePersistedState<string[]>('ofertas.reporte.centrosInforme', []);
  const [condicionesSel, setCondicionesSel] = usePersistedState<string[]>('ofertas.reporte.condiciones', []);
  // Tope de meses de caducidad por condición, solo para lo que se manda (p. ej. Corta caducidad < 12 meses); vacío = sin tope.
  const [caducidadMax, setCaducidadMax] = usePersistedState<CaducidadMaxMeses>('ofertas.reporte.caducidadMax', {});
  const opcionesCondicion = useMemo(() => condicionesElegibles(a.invCondicionLibros), [a.invCondicionLibros]);
  const ofertas = useConocimientoStore((s) => s.ofertas);
  const registrarOfertasLote = useConocimientoStore((s) => s.registrarOfertasLote);
  const [zonas, setZonas] = useState<string[]>([]);
  const [modo, setModo] = usePersistedState<ModoEjecutivo>('ofertas.ejecModo', 'varios');
  const [incluirBloqueados, setIncluirBloqueados] = useState(false);
  const [generado, setGenerado] = useState<{ lineas: LineaOferta[]; centros: string[]; en: string } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [armandoTodos, setArmandoTodos] = useState(false);
  const [progresoTodos, setProgresoTodos] = useState('');

  const pedidos = useMemo(() => a.boSeg.map((i) => i.bo), [a.boSeg]);
  const hayPedidos = pedidos.length > 0;

  const generar = () => {
    setCalculando(true);
    // Cede el paso al navegador para pintar el estado «Generando…» antes del cálculo (miles de materiales).
    setTimeout(() => {
      const zonaSet = new Set(zonas);
      const delasZonas = zonas.length ? pedidos.filter((bo) => zonaSet.has(a.enrich.zonaDeEjecutivo(bo.gpoVdor))) : pedidos;
      const lineas = lineasOfertaPorPedido(delasZonas, (bo) => filasOfertablesDe(a, bo.materialBase || bo.materialSolicitado), {
        centros,
        ejecutivoDe: (g) => a.enrich.ejecutivoNombre(g),
        zonaDe: (g) => a.enrich.zonaDeEjecutivo(g),
        incluirBloqueados,
      });
      setGenerado({ lineas, centros: [...centros], en: new Date().toLocaleString('es-MX') });
      setCalculando(false);
    }, 30);
  };

  // El consumo de los clientes sale de la facturación de los libros: se pide mientras esta pestaña está abierta.
  useEffect(() => useFacFuenteStore.getState().pedir(), []);

  /** Arma las hojas de UNA zona. `ofertableDe` se comparte entre zonas (lo ofertable depende solo del material) para no recalcularlo por ejecutivo. */
  const armarReporte = (zona: string, ofertableDe: (m: string) => ReturnType<typeof filasOfertablesDe>) => {
    const consumoTodo = a.result?.consumo ?? [];
    const pedidosZona = pedidos.filter((bo) => a.enrich.zonaDeEjecutivo(bo.gpoVdor) === zona);
    const consumoZona = consumoTodo.filter((r) => a.enrich.zonaDeEjecutivo(zonaVendedorConsumo(r)) === zona);
    const gpo = pedidosZona[0]?.gpoVdor ?? (consumoZona[0] ? zonaVendedorConsumo(consumoZona[0]) : '');
    const ejecutivo = gpo ? a.enrich.ejecutivoNombre(gpo) : '';
    const hojas = hojasReporteEjecutivo({
      ejecutivo, zona, pedidos: pedidosZona, consumo: consumoZona, rssDisp: a.rssDisp, invCondicion: a.invCondicionLibros,
      condicionesDe: (m) => condicionesDeMaterial(m, { filas: a.invCondicionLibros, lotes: a.lotesLibros, detalle: a.detalleLotesLibros, sustituciones: a.sustitucionesLibros, invRevision: a.invRevisionLibros }),
      ofertableDe,
      etiquetaCentro: (c) => etiquetaCentro(c, nombresCentros, true),
      centrosInforme, centrosOferta: centros, condiciones: condicionesSel, caducidadMaxMeses: caducidadMax,
      p50De: (r) => p50Mensual(serieMatDest(a.facturacion.rf, r.destinatario, r.material), a.facturacion.rf?.curmes ?? ''),
    });
    return { ejecutivo, hojas, archivo: nombreArchivoReporteEjecutivo(ejecutivo, zona, stamp()) };
  };
  const ofertableCompartido = () => {
    const cache = new Map<string, ReturnType<typeof filasOfertablesDe>>();
    return (m: string) => { let r = cache.get(m); if (!r) { r = filasOfertablesDe(a, m); cache.set(m, r); } return r; };
  };

  const descargarReporteEjecutivo = () => {
    if (!zonas.length) { toast.warning('Elige al menos un ejecutivo/zona', 'El reporte se genera por ejecutivo. Para todos usa «Reporte de todos (ZIP)».'); return; }
    if (a.facturacionCalculando) { toast.info('Calculando el consumo…', 'Intenta de nuevo en unos segundos.'); return; }
    const ofertableDe = ofertableCompartido();
    zonas.forEach((zona, i) => setTimeout(() => {
      const r = armarReporte(zona, ofertableDe);
      void exportXlsxMultiSheet(r.archivo, r.hojas);
    }, i * 400));
  };

  /** Un Excel por ejecutivo con datos (pedidos o consumo), todos juntos en un ZIP para mandarlos por correo o WhatsApp. */
  const descargarReporteTodos = async () => {
    if (a.facturacionCalculando) { toast.info('Calculando el consumo…', 'Intenta de nuevo en unos segundos.'); return; }
    const zonasConDatos = [...new Set([
      ...pedidos.map((bo) => a.enrich.zonaDeEjecutivo(bo.gpoVdor)),
      ...(a.result?.consumo ?? []).map((r) => a.enrich.zonaDeEjecutivo(zonaVendedorConsumo(r))),
    ])].sort((x, y) => x.localeCompare(y, 'es', { numeric: true }));
    if (!zonasConDatos.length) { toast.warning('No hay datos para el reporte'); return; }
    setArmandoTodos(true);
    try {
      const ofertableDe = ofertableCompartido();
      const archivos: ArchivoZip[] = [];
      const usados = new Set<string>();
      const envios: EnvioEjecutivo[] = [];
      for (const [i, zona] of zonasConDatos.entries()) {
        // Cede el paso al navegador entre ejecutivos para que la pantalla no se trabe y se vea el avance.
        await new Promise((r) => setTimeout(r, 20));
        setProgresoTodos(`${i + 1}/${zonasConDatos.length}`);
        const r = armarReporte(zona, ofertableDe);
        const data = XLSX.write(libroDeHojas(r.hojas), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        let name = r.archivo;
        for (let n = 2; usados.has(name); n++) name = r.archivo.replace(/\.xlsx$/, `_${n}.xlsx`);
        usados.add(name);
        archivos.push({ name, data: new Uint8Array(data) });
        envios.push({ zona, ejecutivo: r.ejecutivo, correos: a.enrich.correosDeZona(zona), archivo: name });
      }
      // Lista para el envío masivo (combinar correspondencia): un renglón por ejecutivo/zona con su correo, sin repetidos.
      const lista = hojaEnvios(envios, new Date().toLocaleDateString('es-MX'));
      archivos.push({ name: 'Envios_Correo.xlsx', data: new Uint8Array(XLSX.write(libroDeHojas([lista]), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer) });
      descargarZip(`Reportes_Ejecutivos_${stamp()}.zip`, archivos);
      const sinCorreo = envios.filter((e) => !e.correos.length).length;
      toast.success(`ZIP con ${envios.length} reporte(s) + Envios_Correo.xlsx`, sinCorreo ? `${sinCorreo} ejecutivo(s)/zona(s) sin correo en el catálogo.` : 'Un Excel por ejecutivo/zona.');
    } catch (e) {
      toast.error('No se pudo generar el ZIP', e instanceof Error ? e.message : String(e));
    } finally { setArmandoTodos(false); setProgresoTodos(''); }
  };

  const grupos = useMemo(() => (generado ? agruparPorEjecutivo(generado.lineas) : []), [generado]);
  const alerta = (l: LineaOferta): string => {
    const previa = aceptacionesPrevias(ofertas, l.destinatario, l.materialOfertado)[0];
    return previa ? textoAceptacionPrevia(previa) : '';
  };

  const descargar = (g: GrupoEjecutivo) => descargarOfertaEjecutivo(g, { centros: generado?.centros ?? [], alerta });
  const descargarTodos = () => {
    // Un archivo por ejecutivo; el navegador puede pedir permiso para descargar varios.
    grupos.forEach((g, i) => setTimeout(() => descargarOfertaEjecutivo(g, { centros: generado?.centros ?? [], alerta }, true), i * 400));
    toast.success(`Descargando ${grupos.length} archivo(s)`, 'Si el navegador bloquea varias descargas, permítelas para este sitio.');
  };

  const registrar = async (ls: LineaOferta[]) => {
    setRegistrando(true);
    try {
      const por = (await supabase.auth.getUser()).data.user?.email ?? 'desconocido';
      const ahora = new Date().toISOString();
      const hechas = await registrarOfertasLote(ls.map((l) => ofertaDeLinea(l, por, ahora)));
      if (hechas) {
        toast.success(`${hechas} oferta(s) registradas como Ofertado`, ls.length - hechas > 0 ? `${ls.length - hechas} ya estaban registradas.` : undefined);
        onRegistradas();
      } else toast.info('Nada nuevo que registrar', 'Esas ofertas ya estaban registradas.');
    } finally { setRegistrando(false); }
  };

  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="flex flex-wrap items-start gap-3">
        <EjecutivoZonaFilter opciones={a.enrich.ejecutivosZona} seleccion={zonas} onChange={setZonas} modo={modo} onModo={setModo} />
        <label className="flex items-center gap-1.5 pt-2 text-xs text-text-muted">
          <input type="checkbox" checked={incluirBloqueados} onChange={(e) => setIncluirBloqueados(e.target.checked)} /> Incluir pedidos bloqueados
        </label>
        <Button onClick={generar} disabled={!hayPedidos || calculando}>
          {calculando ? <><Loader2 className="size-4 animate-spin" /> Generando…</> : 'Generar ofertas'}
        </Button>
        <Button variant="outline" onClick={descargarReporteEjecutivo} disabled={!hayPedidos} title="Excel por ejecutivo: pedidos, consumo de sus clientes, inventario disponible, materiales con condición y oportunidades">
          <Download className="size-4" /> Reporte por ejecutivo
        </Button>
        <Button variant="outline" onClick={() => void descargarReporteTodos()} disabled={!hayPedidos || armandoTodos} title="Un Excel por cada ejecutivo con datos, juntos en un ZIP para mandar por correo o WhatsApp">
          {armandoTodos ? <><Loader2 className="size-4 animate-spin" /> Armando {progresoTodos}…</> : <><Download className="size-4" /> Reporte de todos (ZIP)</>}
        </Button>
      </div>
      <CentrosFiltroBar centroPedido="" sufijo="los de cada pedido" />
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elevated px-2.5 py-2">
        <ChipsFiltro
          titulo="Centros a informar (Excel)" ayuda="Columnas de inventario de todas las hojas del Reporte por ejecutivo. No cambia qué se ofrece: eso lo define «Considerar centros»."
          opciones={CENTROS_INFORME} sel={centrosInforme} onChange={setCentrosInforme} etiqueta={(c) => etiquetaCentro(c, nombresCentros, true)}
        />
        <ChipsFiltro
          titulo="Condiciones a enviar (Excel)" ayuda="Solo se mandan las condiciones elegidas en Materiales con condición y Oportunidades. Sin selección = todas."
          opciones={opcionesCondicion} sel={condicionesSel} onChange={setCondicionesSel}
        />
        <CaducidadMaxFiltro condiciones={condicionesSel.length ? condicionesSel : opcionesCondicion} valor={caducidadMax} onChange={setCaducidadMax} />
      </div>

      {!hayPedidos ? (
        <EmptyState title="Sin pedidos cargados" description="Sincroniza Seg. de pedidos (y los libros de inventario) para poder generar ofertas." />
      ) : !generado ? (
        <p className="text-sm text-text-muted">{zonas.length ? `${zonas.length} zona(s) elegida(s).` : 'Todos los ejecutivos.'} Elige los centros que se tomarán en cuenta y pulsa «Generar ofertas».</p>
      ) : grupos.length === 0 ? (
        <EmptyState title="No hay material ofertable para esos pedidos" description="Prueba con otros centros o ejecutivos." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <p className="text-sm text-text-muted">
              <span className="font-medium text-text">{grupos.length}</span> ejecutivo(s) · <span className="tabular-nums">{formatNumber(generado.lineas.length)}</span> líneas · generado {generado.en}
              {generado.centros.length ? ` · centros ${generado.centros.join(', ')}` : ' · todos los centros'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={registrando} onClick={() => void registrar(generado.lineas)} title="Guarda todas las líneas como ofertas con estatus Ofertado (las ya registradas se omiten)">
                <ClipboardCheck className="size-4" /> Registrar todo como Ofertado
              </Button>
              <Button size="sm" onClick={descargarTodos}><Download className="size-4" /> Descargar todos</Button>
            </div>
          </div>
          <Table wrapperClassName="rounded-lg border border-border">
            <TableHeader>
              <TableRow>
                <TableHead></TableHead><TableHead>Ejecutivo</TableHead><TableHead>Zona</TableHead>
                <TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Clientes</TableHead><TableHead className="text-right">Líneas</TableHead><TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => {
                const k = `${g.ejecutivo}|${g.zona}`;
                const isOpen = abierto === k;
                return (
                  <Fragment key={k}>
                    <TableRow className="cursor-pointer" onClick={() => setAbierto(isOpen ? null : k)}>
                      <TableCell><ChevronDown className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></TableCell>
                      <TableCell className="font-medium">{g.ejecutivo}</TableCell>
                      <TableCell className="tabular-nums">{g.zona || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.pedidos}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.clientes}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.lineas.length}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" disabled={registrando} onClick={() => void registrar(g.lineas)}>Registrar</Button>
                          <Button size="sm" onClick={() => descargar(g)}><Download className="size-4" /> Excel</Button>
                        </span>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-bg-inset/40 p-0">
                          <VistaPrevia g={g} alerta={alerta} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

/** Chips de selección múltiple; sin ninguno elegido = todos. */
function ChipsFiltro({ titulo, ayuda, opciones, sel, onChange, etiqueta }: { titulo: string; ayuda: string; opciones: readonly string[]; sel: string[]; onChange: (v: string[]) => void; etiqueta?: (o: string) => string }) {
  const toggle = (o: string) => onChange(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-text-muted" title={ayuda}>{titulo}</span>
      {opciones.map((o) => (
        <button
          key={o} type="button" aria-pressed={sel.includes(o)} onClick={() => toggle(o)}
          className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors', sel.includes(o) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-faint hover:border-accent/50 hover:text-text')}
        >
          {etiqueta ? etiqueta(o) : o}
        </button>
      ))}
      {sel.length > 0 && <button type="button" onClick={() => onChange([])} className="text-[11px] text-accent hover:underline">Todos</button>}
    </div>
  );
}

/** Meses máximos de caducidad por condición para el Excel (vacío = sin tope). Solo afecta a lo que se manda, no a la regla de inventario. */
function CaducidadMaxFiltro({ condiciones, valor, onChange }: { condiciones: readonly string[]; valor: CaducidadMaxMeses; onChange: (v: CaducidadMaxMeses) => void }) {
  const poner = (c: string, txt: string) => {
    const n = Math.floor(Number(txt));
    const { [c]: _quita, ...resto } = valor;
    onChange(n > 0 ? { ...resto, [c]: n } : resto);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-text-muted" title="Solo se mandan los lotes que vencen en menos de esos meses. Vacío = sin límite. Aplica únicamente a lo que se envía en el Excel.">Caducidad máx. a enviar (meses)</span>
      {condiciones.map((c) => (
        <label key={c} className="flex items-center gap-1 text-[11px] text-text-faint">
          {c}
          <input
            type="number" min={1} inputMode="numeric" value={valor[c] ?? ''} onChange={(e) => poner(c, e.target.value)} placeholder="∞"
            className="w-12 rounded-md border border-border bg-bg px-1 py-0.5 text-right text-[11px] text-text"
            aria-label={`Meses máximos de caducidad para ${c}`}
          />
        </label>
      ))}
      {Object.keys(valor).length > 0 && <button type="button" onClick={() => onChange({})} className="text-[11px] text-accent hover:underline">Sin límite</button>}
    </div>
  );
}

function VistaPrevia({ g, alerta }: { g: GrupoEjecutivo; alerta: (l: LineaOferta) => string }) {
  const ls = g.lineas.slice(0, VISTA_PREVIA);
  return (
    <div className="p-3">
      <Table wrapperClassName="max-h-96 rounded-md border border-border bg-bg">
        <TableHeader>
          <TableRow>
            <TableHead>Pedido / Cliente</TableHead><TableHead>Solicitado</TableHead><TableHead>Ofertado</TableHead><TableHead>Condición</TableHead>
            <TableHead>Origen · Lote</TableHead><TableHead className="text-right">Disp.</TableHead><TableHead className="text-right">Precio</TableHead><TableHead>Alerta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ls.map((l, i) => {
            const al = alerta(l);
            return (
              <TableRow key={`${l.pedido}|${l.materialOfertado}|${l.lote}|${l.centroOrigen}|${i}`} className="text-xs">
                <TableCell><span className="font-medium tabular-nums">{l.pedido}</span><div className="max-w-52 truncate text-text-muted" title={l.razonSocial}>{l.destinatario} · {l.razonSocial}</div></TableCell>
                <TableCell><span className="tabular-nums">{l.materialSolicitado}</span><div className="max-w-44 truncate text-text-faint" title={l.descripcionSolicitada}>{l.descripcionSolicitada}</div></TableCell>
                <TableCell><span className="tabular-nums">{l.materialOfertado}</span> {l.relacion === 'Sustituto' && <span className="rounded border border-border px-1 text-[11px]">sustituto</span>}<div className="max-w-44 truncate text-text-faint" title={l.descripcionOfertada}>{l.descripcionOfertada}</div></TableCell>
                <TableCell>{l.condicion || '—'}</TableCell>
                <TableCell className="tabular-nums">{l.centroOrigen ? `${l.centroOrigen}/${l.almacenOrigen}` : l.almacenOrigen}{l.lote && <div className="text-text-faint">{l.lote}{l.caducidad ? ` · ${l.caducidad}` : ''}</div>}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(l.disponible)}</TableCell>
                <TableCell className="text-right tabular-nums" title={l.precio > 0 ? undefined : 'Sin precio autorizado para esta condición'}>{l.precio > 0 ? formatCurrency(l.precio) : '-'}</TableCell>
                <TableCell className="max-w-56 text-warning">{al}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {g.lineas.length > VISTA_PREVIA && <p className="mt-1 text-[11px] text-text-faint">Vista previa de {VISTA_PREVIA} de {g.lineas.length} líneas; el Excel trae todas.</p>}
    </div>
  );
}
