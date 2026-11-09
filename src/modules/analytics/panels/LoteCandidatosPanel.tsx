import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListChecks, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { KpiBand } from '@/components/layout/report';
import { Chip, StatePill } from '../ui';
import { Section } from './_shared';
import { CentrosFiltroBar } from './CentrosFiltroBar';
import { ResumenOfertaLotes } from './ResumenOfertaLotes';
import { consumoEnrich, ejecutivoDeCliente, matchesQuery, norm } from '../helpers';
import { bucketCaducidad } from '../caducidadBucket';
import { usePanelStore, type LoteRef, type Panel } from '@/store/panelStore';
import { centroPasaFiltro, useCentrosFiltroStore } from '@/store/centrosFiltroStore';
import { useCentrosOfertaStore } from '@/store/centrosOfertaStore';
import { claveItemOferta, useOfertaLotesStore, type ItemOfertaLote } from '@/store/ofertaLotesStore';
import { isEditableTarget } from '@/hooks/useKeybindings';
import { mesKey, mesLabel } from '@/core/resumenFac';
import { indiceSustitutos } from '@/core/invCondicionLibros';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn, formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { CENTERS } from '@/core/types';
import type { ConsumoRow, InvDetalleRow } from '@/core/types';
import {
  candidatosConSustitutos, cantidadSugerida, construirCandidato, loteAplicaACandidato, materialesDeCliente, modoDeCentro, reglaOferta,
  type AlcanceOferta, type Candidato, type CtxCandidatos,
} from '@/core/candidatosLote';
import type { Analytics } from '../AnalyticsContext';

const DIAS_MES = 30.44;

const mismoLote = (x: LoteRef, y: LoteRef) =>
  norm(x.material) === norm(y.material) && norm(x.lote) === norm(y.lote) && norm(x.centro) === norm(y.centro) && norm(x.almacen) === norm(y.almacen);

const precio = (n: number) => (n > 0 ? formatCurrency(n) : '—');
const vacio = <span className="text-text-faint">—</span>;

/** Días hasta la caducidad (negativo = vencido); null si no hay fecha válida. */
function diasA(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}

function CaducidadPill({ fecha }: { fecha: string | null | undefined }) {
  const dias = diasA(fecha);
  if (dias === null) return vacio;
  return <StatePill label={dias < 0 ? 'Vencido' : `${(dias / DIAS_MES).toFixed(1)} meses`} cls={bucketCaducidad(dias).cls} />;
}

const ALCANCE_PILL: Record<Exclude<AlcanceOferta, 'no'>, { label: string; cls: string; title: string }> = {
  mismo: { label: 'Mismo centro', cls: 'verde', title: 'Lote local: el cliente es del mismo centro del lote.' },
  compartido: { label: 'Varios centros', cls: 'vio', title: 'Lote de un centro compartido: se puede ofrecer a clientes de varios centros.' },
  excepcion: { label: 'Otro centro', cls: 'amb', title: 'Excepción: el lote es local y este cliente es de otro centro.' },
};

/** Regla de a quién se ofrece un lote según su centro: chips Local / Compartido por centro (editables y persistentes). */
function ReglaCentros({ centroLote, ocultos }: { centroLote: string; ocultos: number }) {
  const modos = useCentrosOfertaStore((s) => s.modos);
  const alternar = useCentrosOfertaStore((s) => s.alternar);
  const incluirOtros = useCentrosOfertaStore((s) => s.incluirOtros);
  const setIncluirOtros = useCentrosOfertaStore((s) => s.setIncluirOtros);
  const local = modoDeCentro(centroLote, modos) === 'local';
  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-elevated px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-medium text-text-muted" title="Un lote de centro Local solo se ofrece a clientes de ese mismo centro; uno Compartido se ofrece a clientes de varios centros. Clic en un centro para cambiarlo.">
          Regla de centros
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {CENTERS.map((c) => {
            const esLocal = modoDeCentro(c, modos) === 'local';
            return (
              <button
                key={c} type="button" onClick={() => alternar(c)} aria-pressed={esLocal}
                title={`${c}: ${esLocal ? 'Local (solo clientes de este centro)' : 'Compartido (varios centros)'} — clic para cambiar`}
                className={cn(
                  'rounded-md border px-2 py-1 text-[11px] font-medium tabular-nums transition-colors',
                  esLocal ? 'border-warning/50 bg-warning/10 text-warning' : 'border-info/40 bg-info/10 text-info',
                  c === centroLote && 'ring-2 ring-accent ring-offset-1 ring-offset-bg-elevated',
                )}
              >
                {c} · {esLocal ? 'Local' : 'Compartido'}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {local
          ? <>Este lote es del <b>{centroLote}</b> (<b>local</b>): se ofrece a clientes del {centroLote}.</>
          : <>Este lote es del <b>{centroLote}</b> (<b>compartido</b>): se puede ofrecer a clientes de varios centros.</>}
        {ocultos > 0 && <> <span className="text-warning">{ocultos} cliente(s) ocultos por esta regla.</span></>}
      </p>
      {local && (
        <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={incluirOtros} onChange={(e) => setIncluirOtros(e.target.checked)} className="size-4 cursor-pointer accent-[var(--accent)]" />
          Incluir clientes de otros centros (excepción)
        </label>
      )}
    </div>
  );
}

/** Panel — Candidatos a quienes ofrecer un lote (Inv con Condición → Por lote): clientes que compran el material o su sustituto, o lo tienen pendiente,
 * con su ejecutivo e historial (compras, precios, P50); regla de centros (lote local vs compartido); y selección de lotes a ofertar con resumen.
 * Teclado: ↑/↓ cambian de candidato, ←/→ de lote. */
export function LoteCandidatosPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'loteCandidatos' }>; a: Analytics; push: (p: Panel) => void }) {
  const replaceTop = usePanelStore((s) => s.replaceTop);
  const elegidos = useCentrosFiltroStore((s) => s.centros);
  const modos = useCentrosOfertaStore((s) => s.modos);
  const incluirOtros = useCentrosOfertaStore((s) => s.incluirOtros);
  const items = useOfertaLotesStore((s) => s.items);
  const toggle = useOfertaLotesStore((s) => s.toggle);
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [ejec, setEjec] = useState('');
  const [selDest, setSelDest] = useState('');
  const [incluirSust, setIncluirSust] = usePersistedState('loteCandidatos.incluirSust', true);

  const ref: LoteRef = useMemo(() => ({ material: panel.material, lote: panel.lote, centro: panel.centro, almacen: panel.almacen }), [panel.material, panel.lote, panel.centro, panel.almacen]);
  const ubic = useMemo(() => a.lotes.find((l) => mismoLote(l, ref)), [a.lotes, ref]);
  const desc = ubic?.textoBreve || a.enrich.matTexto(panel.material) || '';
  const loteLocal = modoDeCentro(panel.centro, modos) === 'local';
  const precioLote = (ubic?.precioOferta || a.enrich.matPrecioOferta(panel.material) || 0);

  // Navegación entre lotes de la tabla (←/→).
  const lista = panel.lista;
  const idx = lista ? lista.findIndex((x) => mismoLote(x, ref)) : -1;
  const anterior = idx > 0 ? lista![idx - 1] : undefined;
  const siguiente = idx >= 0 && lista && idx < lista.length - 1 ? lista[idx + 1] : undefined;
  const irALote = (l: LoteRef) => replaceTop({ ...panel, ...l });

  const consumo: ConsumoRow[] = a.result?.consumo ?? [];
  const ctx: CtxCandidatos = useMemo(() => {
    const ce = consumoEnrich(a.enrich);
    return {
      consumo, bo: a.bo, rf: a.rf,
      ejecutivoDe: (fila, dest) => (fila ? ce.ejec(fila) : '') || ejecutivoDeCliente(norm(dest), norm(panel.material), consumo, a.bo, a.enrich),
    };
  }, [consumo, a.bo, a.rf, a.enrich, panel.material]);

  // Sustitutos del material (hoja Sustituto): sus clientes también son candidatos, identificados con "Compra sustituto".
  const sustitutos = useMemo(() => {
    const idxS = indiceSustitutos(a.sustitucionesLibros);
    const m = norm(panel.material);
    for (const [k, v] of idxS) if (norm(k) === m) return v;
    return [];
  }, [a.sustitucionesLibros, panel.material]);
  const candidatos = useMemo(() => candidatosConSustitutos(panel.material, incluirSust ? sustitutos : [], ctx), [panel.material, incluirSust, sustitutos, ctx]);
  const nViaSust = candidatos.filter((c) => c.via).length;

  const pasa = (centroLote: string, centroCliente: string) => centroPasaFiltro(centroLote, centroCliente, elegidos);
  /** Alcance de ESTE lote para un cliente: regla local/compartido y, si es compartido, el filtro "Considerar centros". */
  const alcanceDe = (c: Candidato): AlcanceOferta => {
    const r = reglaOferta(panel.centro, c.centros, modos, incluirOtros);
    if (r === 'compartido' && !loteAplicaACandidato(panel.centro, c.centros, pasa)) return 'no';
    return r;
  };
  const conAlcance = useMemo(() => candidatos.map((c) => ({ c, alcance: alcanceDe(c) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidatos, panel.centro, modos, incluirOtros, elegidos]);
  const ocultosPorRegla = conAlcance.filter((x) => x.alcance === 'no').length;
  const ejecutivos = useMemo(() => [...new Set(candidatos.map((c) => c.ejecutivo).filter(Boolean))].sort(), [candidatos]);
  const visibles = useMemo(() => conAlcance.filter(({ c, alcance }) =>
    alcance !== 'no' && (!ejec || c.ejecutivo === ejec) && (!q || matchesQuery(q, `${c.razon} ${c.destinatario} ${c.ejecutivo}`)),
  ), [conAlcance, ejec, q]);

  // Al cambiar de lote se vuelve al primer candidato.
  const loteKey = `${panel.material}|${panel.lote}|${panel.centro}|${panel.almacen}`;
  useEffect(() => { setSelDest(''); }, [loteKey]);
  const activoX = visibles.find((x) => x.c.dest === selDest) ?? visibles[0];
  const activo = activoX?.c;
  const iActivo = activoX ? visibles.indexOf(activoX) : -1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isEditableTarget(e)) return;
      if (e.key === 'ArrowDown' && iActivo >= 0 && iActivo < visibles.length - 1) { e.preventDefault(); setSelDest(visibles[iActivo + 1].c.dest); }
      else if (e.key === 'ArrowUp' && iActivo > 0) { e.preventDefault(); setSelDest(visibles[iActivo - 1].c.dest); }
      else if (e.key === 'ArrowRight' && siguiente) { e.preventDefault(); irALote(siguiente); }
      else if (e.key === 'ArrowLeft' && anterior) { e.preventDefault(); irALote(anterior); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iActivo, visibles, anterior, siguiente, panel]);
  useEffect(() => { document.querySelector('[data-cand-sel="true"]')?.scrollIntoView({ block: 'nearest' }); }, [activo?.dest]);

  // Otros lotes que le sirven al candidato activo (materiales que compra o tiene pendientes), según la regla de centros de CADA lote.
  const otros = useMemo(() => {
    if (!activo) return [];
    const centrosCliente = [...new Set([
      ...consumo.filter((r) => norm(r.destinatario) === activo.dest).map((r) => r.centro),
      ...a.bo.filter((it) => norm(it.bo.destinatario) === activo.dest).map((it) => it.bo.centroPedido),
    ].filter(Boolean))];
    const centros = centrosCliente.length ? centrosCliente : activo.centros;
    const mats = new Set(materialesDeCliente(activo.destinatario, consumo, a.bo).map(norm));
    // Cliente que compra el sustituto: lo que se le ofrece es el material de este lote.
    if (activo.via) mats.add(norm(panel.material));
    const infoPorMat = new Map<string, Candidato>();
    const info = (mat: string) => {
      const k = norm(mat);
      let c = infoPorMat.get(k);
      if (!c && activo.via && k === norm(panel.material)) c = activo;
      if (!c) {
        c = construirCandidato(activo.destinatario, mat,
          consumo.filter((r) => norm(r.destinatario) === activo.dest && norm(r.material) === k),
          a.bo.filter((it) => norm(it.bo.destinatario) === activo.dest && norm(it.bo.materialBase) === k && it.bo.cantidadPendiente > 0), ctx);
        infoPorMat.set(k, c);
      }
      return c;
    };
    return a.lotes
      .filter((l) => l.cantidadDisp > 0 && mats.has(norm(l.material)) && !mismoLote(l, ref))
      .map((l) => {
        const alcance = reglaOferta(l.centro, centros, modos, incluirOtros);
        return { l, c: info(l.material), alcance: alcance === 'compartido' && !loteAplicaACandidato(l.centro, centros, pasa) ? ('no' as const) : alcance };
      })
      .filter((x) => x.alcance !== 'no')
      .sort((x, y) => (x.l.fechaCaducidad || '9999').localeCompare(y.l.fechaCaducidad || '9999') || x.l.material.localeCompare(y.l.material));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, consumo, a.bo, a.lotes, ref, ctx, elegidos, panel.material, modos, incluirOtros]);

  const mkItem = (l: InvDetalleRow, c: Candidato): ItemOfertaLote => ({
    clave: claveItemOferta(l.material, l.lote, l.centro, l.almacen, c.destinatario),
    material: l.material, desc: l.textoBreve, lote: l.lote, centro: l.centro, almacen: l.almacen,
    caducidad: l.fechaCaducidad || null, disponible: l.cantidadDisp, cantidad: cantidadSugerida(c, l.cantidadDisp),
    destinatario: c.destinatario, cliente: c.razon, ejecutivo: c.ejecutivo,
    precioUltimo: c.precioUltimo, precioP50: c.precioP50, precioOferta: l.precioOferta || a.enrich.matPrecioOferta(l.material) || 0,
    viaSustituto: c.via && norm(l.material) === norm(panel.material) ? c.via.material : undefined,
  });
  const nSel = Object.keys(items).length;
  const claveDe = (c: Candidato) => (ubic ? claveItemOferta(ubic.material, ubic.lote, ubic.centro, ubic.almacen, c.destinatario) : '');
  const nSelEsteLote = visibles.filter(({ c }) => items[claveDe(c)]).length;
  const mesActual = a.curmes;
  const hace = (mes: string) => (mes && mesActual ? mesKey(mesActual) - mesKey(mes) : null);

  const dias = diasA(ubic?.fechaCaducidad);
  const bucket = dias === null ? null : bucketCaducidad(dias);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" title="Lote anterior (←)" disabled={!anterior} onClick={() => anterior && irALote(anterior)} className="rounded-md border border-border p-1 disabled:opacity-30"><ChevronLeft className="size-3.5" /></button>
          <span className="min-w-12 text-center text-[11px] tabular-nums text-text-faint" title="Posición en la lista de la tabla">{idx >= 0 && lista ? `${idx + 1} / ${lista.length}` : '—'}</span>
          <button type="button" title="Lote siguiente (→)" disabled={!siguiente} onClick={() => siguiente && irALote(siguiente)} className="rounded-md border border-border p-1 disabled:opacity-30"><ChevronRight className="size-3.5" /></button>
          <span className="ml-2 flex items-center gap-1 text-[11px] text-text-faint">
            <kbd className="rounded border border-border bg-bg-inset px-1 font-sans">←</kbd><kbd className="rounded border border-border bg-bg-inset px-1 font-sans">→</kbd> lote
            <kbd className="ml-1 rounded border border-border bg-bg-inset px-1 font-sans">↑</kbd><kbd className="rounded border border-border bg-bg-inset px-1 font-sans">↓</kbd> candidato
          </span>
        </div>
        <Button size="sm" variant={nSel ? 'default' : 'outline'} className="gap-1.5" onClick={() => setResumenAbierto(true)}>
          <ListChecks className="size-3.5" /> Resumen de ofertas ({nSel})
        </Button>
      </div>

      <h2 className="font-display text-lg font-semibold">
        <Chip onClick={() => push({ type: 'material', material: panel.material })}>{panel.material}</Chip> · Lote {panel.lote || '—'}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{desc}</p>

      <KpiBand
        className="mt-3"
        distribuir
        titulo={`Lote · centro ${panel.centro} · alm. ${panel.almacen || '—'}`}
        principal={{ etiqueta: 'Disponible', valor: formatNumber(ubic?.cantidadDisp ?? 0), sub: 'piezas libres del lote' }}
        metricas={[
          { etiqueta: 'Caduca', valor: dias === null ? '—' : dias < 0 ? 'Vencido' : `${(dias / DIAS_MES).toFixed(1)} meses`, sub: ubic?.fechaCaducidad ? `${formatFechaCaducidad(ubic.fechaCaducidad)}${bucket ? ` · ${bucket.rango}` : ''}` : undefined, tono: dias !== null && dias <= 90 ? 'danger' : undefined },
          { etiqueta: 'Se ofrece a', valor: loteLocal ? `Solo centro ${panel.centro}` : 'Varios centros', sub: loteLocal ? 'lote local' : 'lote compartido' },
          { etiqueta: 'Candidatos', valor: formatNumber(visibles.length), sub: nSelEsteLote ? `${nSelEsteLote} para ofertar` : `de ${candidatos.length} con historial` },
          { etiqueta: 'Precio oferta', valor: precio(precioLote) },
        ]}
      />

      <ReglaCentros centroLote={panel.centro} ocultos={ocultosPorRegla} />
      {!loteLocal && <CentrosFiltroBar centroPedido="" sufijo="+ el centro de cada cliente" />}

      {sustitutos.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
          <span className="font-medium text-text-muted">Sustitutos:</span>
          {sustitutos.map((s) => <span key={s.material} title={s.texto}><Chip onClick={() => push({ type: 'material', material: s.material })}>{s.material}</Chip></span>)}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={incluirSust} onChange={(e) => setIncluirSust(e.target.checked)} className="size-4 cursor-pointer accent-[var(--accent)]" />
            Incluir clientes de sustitutos{incluirSust ? ` (${nViaSust})` : ''}
          </label>
        </div>
      )}

      {/* Tabla a la izquierda y, al lado, el porqué del candidato activo (fijo): así se ve al moverse con ↑/↓ sin bajar la página. */}
      <div className="grid gap-x-4 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
      <Section title={`Candidatos · ${visibles.length}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="relative w-64"><Search className="absolute left-2.5 top-2 size-3.5 text-text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o ejecutivo…" className="h-8 w-full rounded-md border border-border bg-bg-elevated pl-8 pr-2 text-xs outline-none focus:border-accent" /></div>
          <Select value={ejec} onChange={(e) => setEjec(e.target.value)} className="h-8 w-auto text-xs">
            <option value="">Ejecutivo (todos)</option>
            {ejecutivos.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
          <span className="text-[11px] text-text-faint">Clic = ver el porqué y otros lotes · doble clic = ficha del cliente</span>
        </div>
        {visibles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-text-muted">
            <p className="font-medium text-text">No hay candidatos para este lote con los filtros actuales.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {candidatos.length === 0 && <li>Nadie ha comprado este material{sustitutos.length ? ' ni sus sustitutos' : ''} y no hay pedidos pendientes. {sustitutos.length === 0 && 'Este material no tiene sustitutos en la hoja Sustituto.'}</li>}
              {ocultosPorRegla > 0 && <li>{ocultosPorRegla} cliente(s) quedan fuera por la regla de centros: el lote es {loteLocal ? `local del ${panel.centro}` : 'de un centro compartido con filtro de centros'}.{loteLocal ? ' Activa “Incluir clientes de otros centros” si es una excepción.' : ''}</li>}
              {candidatos.length > 0 && (q || ejec) && <li>La búsqueda o el filtro de ejecutivo no coincide con ninguno.</li>}
              {sustitutos.length > 0 && !incluirSust && <li>Los clientes de sustitutos están desactivados.</li>}
            </ul>
          </div>
        ) : (
          <Table className="tabular-nums" wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader>
              <TableRow className="[&>th]:border-b [&>th]:border-border [&>th]:text-center [&>th]:text-[11px] [&>th]:font-semibold [&>th]:text-text-faint">
                <TableHead colSpan={2} className="!text-left">Cliente</TableHead>
                <TableHead colSpan={2}>Compras de este material</TableHead>
                <TableHead colSpan={2}>Precio unitario</TableHead>
                <TableHead colSpan={3}>Demanda</TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="w-12">Ofertar</TableHead><TableHead>Cliente · ejecutivo · centros</TableHead>
                <TableHead>Última</TableHead><TableHead>Penúltima</TableHead>
                <TableHead className="text-right" title="Precio de la última compra; debajo, el de la penúltima.">Último</TableHead>
                <TableHead className="text-right" title="Mediana del precio del cliente ponderada por cantidad; debajo, su mínimo y máximo.">P50</TableHead>
                <TableHead className="text-right" title="Cantidad en pedidos abiertos de este material.">Pendiente</TableHead>
                <TableHead className="text-right" title="Mediana de la cantidad mensual (12 meses cerrados).">P50 pzas/mes</TableHead>
                <TableHead className="text-right">Consumo mes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map(({ c, alcance }) => {
                const esActivo = c === activo;
                const antig = hace(c.ultimoMes);
                const atenuado = alcance === 'excepcion';
                return (
                  <TableRow
                    key={c.dest}
                    data-cand-sel={esActivo ? 'true' : undefined}
                    tabIndex={0}
                    aria-selected={esActivo}
                    className={cn('cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent', esActivo ? 'bg-accent-soft ring-1 ring-inset ring-accent/40' : c.via && 'bg-warning/5', atenuado && 'opacity-60')}
                    onClick={() => setSelDest(c.dest)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelDest(c.dest); } }}
                    onDoubleClick={() => push({ type: 'clienteDetalle', dest: c.destinatario, material: panel.material })}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox" disabled={!ubic} checked={!!items[claveDe(c)]} onChange={() => ubic && toggle(mkItem(ubic, c))}
                        aria-label={`Ofertar a ${c.razon}`} className="size-4 cursor-pointer accent-[var(--accent)]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className={cn('max-w-64 truncate', esActivo ? 'font-semibold text-text' : 'font-medium')}>{c.razon}</div>
                      <div className="text-[11px] text-text-muted">{c.ejecutivo || 'Sin ejecutivo'} · <span className="tabular-nums">{c.centros.join(', ') || 'sin centro'}</span></div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {c.via && <span title={`${c.via.material} ${c.via.texto} — sus compras, precios y pendientes son de este código`}><StatePill label={`Compra sustituto ${c.via.material}`} cls="amb" /></span>}
                        {alcance === 'excepcion' && <span title={ALCANCE_PILL.excepcion.title}><StatePill label={ALCANCE_PILL.excepcion.label} cls="amb" /></span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {c.ultimoMes ? <>{mesLabel(c.ultimoMes)}<div className="text-[11px] text-text-faint">{formatNumber(c.cantUltima)} pzas</div>
                        {antig !== null && <StatePill label={antig <= 0 ? 'este mes' : `hace ${antig} m`} cls={antig <= 3 ? 'verde' : antig <= 6 ? 'amb' : 'rojo'} />}</> : vacio}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {c.penultimoMes ? <>{mesLabel(c.penultimoMes)}<div className="text-[11px] text-text-faint">{formatNumber(c.cantPenultima)} pzas</div></> : vacio}
                    </TableCell>
                    <TableCell className="text-right">{precio(c.precioUltimo)}<div className="text-[11px] text-text-faint">{c.precioPenultimo > 0 ? `antes ${formatCurrency(c.precioPenultimo)}` : ''}</div></TableCell>
                    <TableCell className="text-right font-medium">{precio(c.precioP50)}<div className="text-[11px] font-normal text-text-faint">{c.precioMin > 0 || c.precioMax > 0 ? `${precio(c.precioMin)} – ${precio(c.precioMax)}` : ''}</div></TableCell>
                    <TableCell className={cn('text-right', c.pendiente > 0 ? 'font-semibold text-danger' : 'text-text-faint')}>{c.pendiente > 0 ? formatNumber(c.pendiente) : '—'}</TableCell>
                    <TableCell className="text-right">{c.p50Cant > 0 ? formatNumber(c.p50Cant) : '—'}</TableCell>
                    <TableCell className="text-right">{c.consumoActual > 0 ? formatNumber(c.consumoActual) : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      {activo && activoX && ubic ? (
        <div className="xl:sticky xl:top-2">
        <Section title={`¿Por qué ${activo.razon}?`}>
          <div className="flex flex-wrap items-center gap-1.5">
            {activo.via
              ? <StatePill label={`Compra el sustituto ${activo.via.material}`} cls="amb" />
              : activo.ultimoMes ? <StatePill label="Compra este material" cls="verde" /> : null}
            {activo.pendiente > 0 && <StatePill label={`Pedido pendiente · ${formatNumber(activo.pendiente)} pzas`} cls="rojo" />}
            {activo.p50Cant > 0 && <StatePill label={`Mediana ${formatNumber(activo.p50Cant)} pzas/mes`} cls="azul" />}
            <span title={activoX.alcance === 'no' ? '' : ALCANCE_PILL[activoX.alcance].title}>
              {activoX.alcance !== 'no' && <StatePill label={ALCANCE_PILL[activoX.alcance].label} cls={ALCANCE_PILL[activoX.alcance].cls} />}
            </span>
          </div>
          {activo.via && <p className="mt-2 text-xs text-text-muted">Este cliente no compra {panel.material}, compra <b>{activo.via.material}</b> ({activo.via.texto || 'sustituto'}). Los precios y cantidades son de ese código; este lote se le ofrece como sustituto.</p>}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {[
              { k: 'Precio oferta del lote', v: precio(precioLote), sub: activo.precioP50 > 0 && precioLote > 0 ? `${precioLote >= activo.precioP50 ? '+' : ''}${(((precioLote / activo.precioP50) - 1) * 100).toFixed(1)}% vs su P50` : undefined },
              { k: 'Último precio del cliente', v: precio(activo.precioUltimo), sub: activo.precioPenultimo > 0 ? `antes ${formatCurrency(activo.precioPenultimo)}` : undefined },
              { k: 'Precio P50 del cliente', v: precio(activo.precioP50), sub: activo.precioMin > 0 || activo.precioMax > 0 ? `${precio(activo.precioMin)} – ${precio(activo.precioMax)}` : undefined },
              { k: 'Cantidad sugerida', v: `${formatNumber(cantidadSugerida(activo, ubic.cantidadDisp))} pzas`, sub: `de ${formatNumber(ubic.cantidadDisp)} disponibles` },
            ].map((x) => (
              <div key={x.k} className="rounded-lg border border-border bg-bg-elevated px-3 py-2">
                <dt className="text-[11px] text-text-faint">{x.k}</dt>
                <dd className="font-semibold tabular-nums">{x.v}</dd>
                {x.sub && <div className="text-[11px] text-text-muted">{x.sub}</div>}
              </div>
            ))}
          </dl>
          <Button size="sm" variant={items[claveDe(activo)] ? 'default' : 'outline'} className="mt-3" onClick={() => toggle(mkItem(ubic, activo))}>
            {items[claveDe(activo)] ? 'Quitar de las ofertas' : 'Ofertar este lote a este cliente'}
          </Button>
        </Section>
        </div>
      ) : <div />}
      </div>

      {activo && (
        <Section title={`Otros lotes para ${activo.razon} · ${otros.length}`} ancho>
          <p className="mb-2 text-xs text-text-faint">Lotes con disponible de los materiales que compra o tiene pendientes, que se le pueden ofrecer según la regla de centros de cada lote.</p>
          {otros.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-text-muted">No hay otros lotes disponibles para este cliente con la regla de centros actual.</p>
          ) : (
            <Table className="tabular-nums" wrapperClassName="max-h-80 rounded-lg border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Ofertar</TableHead><TableHead>Material</TableHead><TableHead>Lote</TableHead><TableHead>Centro / Alm.</TableHead>
                  <TableHead>Alcance</TableHead><TableHead className="text-right">Disp.</TableHead><TableHead>Caduca</TableHead>
                  <TableHead className="text-right">Pend. cliente</TableHead><TableHead className="text-right">Últ. precio</TableHead><TableHead className="text-right">Precio P50</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otros.map(({ l, c, alcance }, i) => {
                  const it = mkItem(l, c);
                  return (
                    <TableRow key={`${it.clave}|${i}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') irALote({ material: l.material, lote: l.lote, centro: l.centro, almacen: l.almacen }); }} className={cn('cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent', alcance === 'excepcion' && 'opacity-60')} onClick={() => irALote({ material: l.material, lote: l.lote, centro: l.centro, almacen: l.almacen })} title="Clic = ver los candidatos de este lote">
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={!!items[it.clave]} onChange={() => toggle({ ...it, destinatario: activo.destinatario })} aria-label={`Ofertar lote ${l.lote}`} className="size-4 cursor-pointer accent-[var(--accent)]" />
                      </TableCell>
                      <TableCell><span className="font-mono text-xs">{l.material}</span><div className="max-w-56 truncate text-[11px] text-text-faint">{l.textoBreve}</div></TableCell>
                      <TableCell className="text-xs">{l.lote || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{l.centro} · {l.almacen || '—'}</TableCell>
                      <TableCell>{alcance !== 'no' && <span title={ALCANCE_PILL[alcance].title}><StatePill label={ALCANCE_PILL[alcance].label} cls={ALCANCE_PILL[alcance].cls} /></span>}</TableCell>
                      <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs"><CaducidadPill fecha={l.fechaCaducidad} /><div className="text-[11px] text-text-faint">{formatFechaCaducidad(l.fechaCaducidad)}</div></TableCell>
                      <TableCell className={cn('text-right', c.pendiente > 0 ? 'text-danger' : 'text-text-faint')}>{c.pendiente > 0 ? formatNumber(c.pendiente) : '—'}</TableCell>
                      <TableCell className="text-right">{precio(c.precioUltimo)}</TableCell>
                      <TableCell className="text-right">{precio(c.precioP50)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Section>
      )}

      <ResumenOfertaLotes open={resumenAbierto} onOpenChange={setResumenAbierto} />
    </div>
  );
}
