import { Fragment, useMemo, useState } from 'react';
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
import { supabase } from '@/lib/supabaseClient';

const VISTA_PREVIA = 80;

/** Pestaña «Generar ofertas»: elige centros y ejecutivos, genera la oferta (una línea por pedido × lote) y descarga un Excel por ejecutivo/zona. */
export function GenerarOfertas({ onRegistradas }: { onRegistradas: () => void }) {
  const a = useAnalytics();
  const centros = useCentrosFiltroStore((s) => s.centros);
  const ofertas = useConocimientoStore((s) => s.ofertas);
  const registrarOfertasLote = useConocimientoStore((s) => s.registrarOfertasLote);
  const [zonas, setZonas] = useState<string[]>([]);
  const [modo, setModo] = usePersistedState<ModoEjecutivo>('ofertas.ejecModo', 'varios');
  const [incluirBloqueados, setIncluirBloqueados] = useState(false);
  const [generado, setGenerado] = useState<{ lineas: LineaOferta[]; centros: string[]; en: string } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

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
      </div>
      <CentrosFiltroBar centroPedido="" sufijo="los de cada pedido" />

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
