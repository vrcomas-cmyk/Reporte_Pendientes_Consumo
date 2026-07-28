import { useMemo, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableCell, SortableTableHead } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useSort } from '@/hooks/useSort';
import { formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, TrendBadge, Chip, Ranking, StatTile, ZoomControl, useZoom, ColumnFilterBar, passesFilters, DebouncedSearch, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { ESTADOS } from '@/core/resumenFac';
import { norm, num, matchesQuery } from '@/modules/analytics/helpers';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { buildFromSugerencia, buildFromInventarioCentro } from '@/services/solicitudService';
import { useSolicitarDialog, type LoteOption } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden, isDetailHidden } from '@/core/permissions';
import type { Sugerencia } from '@/core/types';

const INV_COLS = ['1030', '1031', '1032'] as const;

type BORow = (ReturnType<typeof useAnalytics>['bo'])[number];
/** One "Desagrupar" row: a BO item plus the specific fuente (alternate supply
 * source) it represents, or `null` for the BO's own row when it has none. */
interface RawRow { it: BORow; f: Sugerencia | null; key: string }

export function SugerenciasPage() {
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const perms = usePermissionsStore((s) => s.perms);
  const precioOculto = isColumnHidden(perms, 'sugerencias', 'precio');
  // "Desagrupar" and the "Fuentes" count/detail only exist to expose fuente
  // (alternate supply source) data — when that detail is hidden for this
  // role, skip the whole thing instead of trying to redact it column by
  // column inside a view whose entire point is showing it.
  const fuenteOculto = isDetailHidden(perms, 'sugerencias', 'fuente');
  // Sugerencias picks its lote inside the dialog (BOItem.fuentes may hold
  // several), so the sourceKey isn't known ahead of time — match by BO key
  // prefix instead of the full `sug|${boKey}|${lote}` string.
  const sugSolicitadas = useMemo(() => {
    const set = new Set<string>();
    for (const s of solicitudesList) {
      if (s.origen !== 'sugerencias') continue;
      const parts = s.sourceKey.split('|');
      set.add(parts.slice(1, -1).join('|'));
    }
    return set;
  }, [solicitudesList]);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [fuente, setFuente] = useState('');
  const [centroValido, setCentroValido] = useState(false);
  const [quick, setQuick] = useState<ActiveFilter[]>([]);
  const [sectorOpen, setSectorOpen] = useState(false);
  const [openSector, setOpenSector] = useState<string | null>(null);
  const [agrupadoState, setAgrupado] = useState(true);
  const agrupado = fuenteOculto || agrupadoState;
  const zoom = useZoom();

  const e = a.enrich;
  const grupoCli = (b: BORow['bo']) => e.grupoCliente(b.gpoCte) || norm(b.gpoCte);
  const ejec = (b: BORow['bo']) => e.ejecutivoNombre(b.gpoVdor);

  // For fuente "Corta caducidad": centro sugerido debe ser 1031/1022/1017, o
  // igualar al centro del pedido. Cualquier otra fuente (o ninguna) pasa siempre.
  const CENTROS_CORTA = ['1031', '1022', '1017'];
  const centroPasa = (b: BORow['bo'], f: Sugerencia | null) => {
    if (!f) return true;
    if (!/corta/i.test(f.fuente)) return true;
    return CENTROS_CORTA.includes(f.centroSugerido) || f.centroSugerido === b.centroPedido;
  };

  const filterCols: FilterColumn<BORow>[] = useMemo(() => [
    { key: 'material', label: 'Material', get: (it) => it.bo.materialBase },
    { key: 'grupocli', label: 'Grupo cliente', get: (it) => grupoCli(it.bo) },
    { key: 'ejecutivo', label: 'Ejecutivo', get: (it) => ejec(it.bo) },
    { key: 'centro', label: 'Centro', get: (it) => it.bo.centroPedido },
    { key: 'sector', label: 'Sector', get: (it) => e.matSector(it.bo.materialBase) },
    ...(fuenteOculto ? [] : [
      { key: 'fuente', label: 'Fuente', getMany: (it: BORow) => it.fuentes.map((f) => f.fuente).filter(Boolean) },
      { key: 'centrosug', label: 'Centro Sugerido', getMany: (it: BORow) => it.fuentes.map((f) => f.centroSugerido).filter(Boolean) },
    ]),
  ], [e, fuenteOculto]);

  const filtered = useMemo(() => {
    return a.bo.filter((it) => {
      const b = it.bo;
      if (estado && it.status.key !== estado) return false;
      if (fuente === 'si' && !it.fuentes.length) return false;
      if (fuente === 'no' && it.fuentes.length) return false;
      if (centroValido && it.fuentes.length && !it.fuentes.some((f) => centroPasa(b, f))) return false;
      if (!passesFilters(it, filterCols, quick)) return false;
      if (q) {
        const hay = `${b.materialBase} ${b.descripcionSolicitada} ${b.pedido} ${b.razonSocial} ${b.solicitante} ${b.destinatario}`;
        if (!matchesQuery(q, hay)) return false;
      }
      return true;
    });
  }, [a.bo, q, estado, fuente, centroValido, quick, filterCols]);

  const kpis = useMemo(() => {
    const isBloq = (it: (typeof filtered)[number]) => it.bo.bloqueado !== '';
    const pendTot = filtered.reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);
    const pendBloq = filtered.filter(isBloq).reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);
    const impTot = filtered.reduce((s, it) => s + num(it.bo.cantidadPendiente) * num(it.bo.precio), 0);
    const conF = filtered.filter((it) => it.fuentes.length).length;
    const rkMap = new Map<string, { code: string; desc: string; val: number }>();
    filtered.forEach((it) => {
      const m = norm(it.bo.materialBase);
      if (!m) return;
      const cur = rkMap.get(m) || { code: m, desc: it.bo.descripcionSolicitada, val: 0 };
      cur.val += num(it.bo.cantidadPendiente) * num(it.bo.precio);
      rkMap.set(m, cur);
    });
    const rk = [...rkMap.values()].filter((x) => x.val > 0).sort((x, y) => y.val - x.val).slice(0, 10);
    return { pendTot, pendBloq, impTot, conF, rk };
  }, [filtered]);

  // #11 Pendiente por sector, drilldown a grupo de artículo. Based on the deduplicated
  // BO dataset already in `filtered` (one origen row per group, fuentes excluded).
  const porSector = useMemo(() => {
    const secMap = new Map<string, { sector: string; qty: number; imp: number; grupos: Map<string, { grupo: string; qty: number; imp: number }> }>();
    filtered.forEach((it) => {
      const b = it.bo;
      const sector = e.matSector(b.materialBase) || 'Sin sector';
      const grupo = e.matGrupo(b.materialBase) || 'Sin grupo';
      const qty = num(b.cantidadPendiente);
      const imp = qty * num(b.precio);
      if (!qty) return;
      let s = secMap.get(sector);
      if (!s) { s = { sector, qty: 0, imp: 0, grupos: new Map() }; secMap.set(sector, s); }
      s.qty += qty; s.imp += imp;
      let g = s.grupos.get(grupo);
      if (!g) { g = { grupo, qty: 0, imp: 0 }; s.grupos.set(grupo, g); }
      g.qty += qty; g.imp += imp;
    });
    return [...secMap.values()].sort((x, y) => y.imp - x.imp);
  }, [filtered, e]);

  // #12 Tránsito sub-index: join ResumenSin's RSSCentro.alm by Centro + almacén + material.
  const transitoFor = (centro: string, alm: string, material: string): number => {
    const rss = a.rss;
    if (!rss) return 0;
    const mo = rss.mats.get(norm(material));
    if (!mo) return 0;
    const co = mo.centros.get(norm(centro));
    if (!co) return 0;
    return co.alm.get(alm)?.transito || 0;
  };

  const addQuick = (field: string, value: string) => {
    if (!value || quick.some((f) => f.col === field && f.value === value)) return;
    setQuick([...quick, { col: field, value }]);
  };

  const COL_COUNT = 19;
  const COL_COUNT_RAW = 22;
  const sortAcc = useMemo(() => ({
    grupocli: (it: (typeof filtered)[number]) => grupoCli(it.bo),
    pedido: (it: (typeof filtered)[number]) => it.bo.pedido,
    fecha: (it: (typeof filtered)[number]) => it.bo.fecha,
    cliente: (it: (typeof filtered)[number]) => it.bo.razonSocial,
    ejecutivo: (it: (typeof filtered)[number]) => ejec(it.bo),
    centro: (it: (typeof filtered)[number]) => it.bo.centroPedido,
    material: (it: (typeof filtered)[number]) => it.bo.materialBase,
    sector: (it: (typeof filtered)[number]) => e.matSector(it.bo.materialBase),
    cantped: (it: (typeof filtered)[number]) => num(it.bo.cantidadPedido),
    pend: (it: (typeof filtered)[number]) => num(it.bo.cantidadPendiente),
    precio: (it: (typeof filtered)[number]) => num(it.bo.precio),
    consumo: (it: (typeof filtered)[number]) => num(it.consumoProm),
    inv1030: (it: (typeof filtered)[number]) => num(it.bo.invByCenter['1030'] || 0),
    inv1031: (it: (typeof filtered)[number]) => num(it.bo.invByCenter['1031'] || 0),
    inv1032: (it: (typeof filtered)[number]) => num(it.bo.invByCenter['1032'] || 0),
    inv1060: (it: (typeof filtered)[number]) => num(it.bo.invByCenter['1060'] || 0),
    bloq: (it: (typeof filtered)[number]) => it.bo.bloqueado,
    estado: (it: (typeof filtered)[number]) => it.status.label,
    tendencia: (it: (typeof filtered)[number]) => it.tend.txt,
    fuentes: (it: (typeof filtered)[number]) => it.fuentes.length,
  }), [e, grupoCli, ejec]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(sorted.length);

  // "Desagrupado": the exact same BO dataset as "Agrupar" (`filtered` — same
  // search/estado/fuente-toggle/column-chip filters), just exploded into one
  // row per fuente (alternate supply source); a BO with none still gets a
  // single row (f: null) so nothing disappears.
  const flatRaw = useMemo(() => {
    const rows: RawRow[] = [];
    filtered.forEach((it) => {
      const fuentesOk = centroValido ? it.fuentes.filter((f) => centroPasa(it.bo, f)) : it.fuentes;
      if (fuentesOk.length) {
        fuentesOk.forEach((f, idx) => rows.push({ it, f, key: `${it.k}|${idx}` }));
      } else {
        rows.push({ it, f: null, key: it.k });
      }
    });
    return rows;
  }, [filtered, centroValido]);
  const sortAccRaw = useMemo(() => ({
    pedido: (r: RawRow) => r.it.bo.pedido,
    fecha: (r: RawRow) => r.it.bo.fecha,
    cliente: (r: RawRow) => r.it.bo.razonSocial,
    ejecutivo: (r: RawRow) => ejec(r.it.bo),
    centro: (r: RawRow) => r.it.bo.centroPedido,
    material: (r: RawRow) => r.it.bo.materialBase,
    sector: (r: RawRow) => e.matSector(r.it.bo.materialBase),
    cantped: (r: RawRow) => num(r.it.bo.cantidadPedido),
    pend: (r: RawRow) => num(r.it.bo.cantidadPendiente),
    precio: (r: RawRow) => num(r.it.bo.precio),
    consumo: (r: RawRow) => num(r.it.consumoProm),
    inv1030: (r: RawRow) => num(r.it.bo.invByCenter['1030'] || 0),
    inv1031: (r: RawRow) => num(r.it.bo.invByCenter['1031'] || 0),
    inv1032: (r: RawRow) => num(r.it.bo.invByCenter['1032'] || 0),
    inv1060: (r: RawRow) => num(r.it.bo.invByCenter['1060'] || 0),
    bloq: (r: RawRow) => r.it.bo.bloqueado,
    estado: (r: RawRow) => r.it.status.label,
    tendencia: (r: RawRow) => r.it.tend.txt,
    fuente: (r: RawRow) => r.f?.fuente ?? '',
    matsug: (r: RawRow) => r.f?.materialSugerido ?? '',
    centrosug: (r: RawRow) => r.f?.centroSugerido ?? '',
    disponible: (r: RawRow) => (r.f ? num(r.f.disponible) : -1),
  }), [e, ejec]);
  const { sorted: sortedRaw, sortKey: sortKeyRaw, dir: dirRaw, toggleSort: toggleSortRaw } = useSort(flatRaw, sortAccRaw);
  const { scrollRef: scrollRefRaw, items: itemsRaw, paddingTop: paddingTopRaw, paddingBottom: paddingBottomRaw } = useRowVirtualizer(sortedRaw.length);
  // Matches `buildFromSugerencia`'s own `sourceKey` convention exactly, so
  // "ya solicitado" reflects this specific fuente, not just the parent BO.
  const rawSolicitadas = useMemo(() => {
    const set = new Set<string>();
    for (const s of solicitudesList) {
      if (s.origen !== 'sugerencias') continue;
      set.add(s.sourceKey);
    }
    return set;
  }, [solicitudesList]);

  if (!a.result || !a.bo.length) {
    return <EmptyState title="No hay sugerencias. Carga catálogo y procesa un reporte." action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const exportar = () => {
    const rowsX = filtered.map((it) => {
      const b = it.bo;
      return {
        'Grupo de cliente': grupoCli(b), 'Código grupo': b.gpoCte,
        Pedido: b.pedido, OC: b.oc, Fecha: b.fecha,
        'Razón social': b.razonSocial, Solicitante: b.solicitante, Destinatario: b.destinatario,
        Ejecutivo: ejec(b), Centro: b.centroPedido, Almacén: b.almacen,
        'Material base': b.materialBase, Descripción: b.descripcionSolicitada, Sector: e.matSector(b.materialBase), 'Grupo art.': e.matGrupo(b.materialBase),
        'Cant. pedida': num(b.cantidadPedido), Pendiente: num(b.cantidadPendiente), Precio: num(b.precio), 'Consumo prom.': num(it.consumoProm),
        'Inv 1030': num(b.invByCenter['1030'] || 0), 'Inv 1031': num(b.invByCenter['1031'] || 0), 'Inv 1032': num(b.invByCenter['1032'] || 0), 'Inv 1060': num(b.invByCenter['1060'] || 0),
        Bloqueado: b.bloqueado, Estado: it.status.label, Tendencia: it.tend.txt, Fuentes: it.fuentes.length,
      };
    });
    void exportXlsx(`sugerencias_${stamp()}.xlsx`, rowsX, 'Sugerencias');
  };

  const exportarRaw = () => {
    const rowsX = flatRaw.map(({ it, f }) => {
      const b = it.bo;
      return {
        Pedido: b.pedido, OC: b.oc, Fecha: b.fecha,
        'Razón social': b.razonSocial, Solicitante: b.solicitante, Destinatario: b.destinatario,
        Ejecutivo: ejec(b), Centro: b.centroPedido, Almacén: b.almacen,
        'Material base': b.materialBase, Descripción: b.descripcionSolicitada, Sector: e.matSector(b.materialBase), 'Grupo art.': e.matGrupo(b.materialBase),
        'Cant. pedida': num(b.cantidadPedido), Pendiente: num(b.cantidadPendiente), Precio: num(b.precio), 'Consumo prom.': num(it.consumoProm),
        'Inv 1030': num(b.invByCenter['1030'] || 0), 'Inv 1031': num(b.invByCenter['1031'] || 0), 'Inv 1032': num(b.invByCenter['1032'] || 0), 'Inv 1060': num(b.invByCenter['1060'] || 0),
        Bloqueado: b.bloqueado, Estado: it.status.label, Tendencia: it.tend.txt,
        Fuente: f?.fuente || '', 'Material sugerido': f?.materialSugerido || '', 'Descripción sugerida': f?.descripcionSugerida || '',
        'Centro sugerido': f?.centroSugerido || '', 'Almacén sugerido': f?.almacenSugerido || '',
        Disponible: f ? num(f.disponible) : '', Lote: f?.lote || '', 'Fecha caducidad': f?.fechaCaducidad || '',
        'Meses vigencia lote': f ? num(f.mesesVigenciaLote) : '',
      };
    });
    void exportXlsx(`sugerencias_detalle_${stamp()}.xlsx`, rowsX, 'Sugerencias (detalle)');
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Sugerencias</h2>
          <p className="text-sm text-text-muted">
            {agrupado
              ? <>Órdenes pendientes deduplicadas (BO) · {formatNumber(filtered.length)} renglones</>
              : <>Detalle por fuente, sin agrupar · {formatNumber(flatRaw.length)} renglones</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!fuenteOculto && (
            <div className="inline-flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
              <button onClick={() => setAgrupado(true)} className={`rounded px-2 py-1 ${agrupado ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}`}>Agrupar</button>
              <button onClick={() => setAgrupado(false)} className={`rounded px-2 py-1 ${!agrupado ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}`}>Desagrupar</button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={agrupado ? exportar : exportarRaw}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
        </div>
      </div>

      {agrupado && (
      <div className="flex flex-wrap items-start gap-3">
        <div className="inline-grid grid-cols-2 content-start gap-2">
          <StatTile compact label="Renglones BO" value={formatNumber(filtered.length)} />
          <StatTile compact label="Cant. pendiente" value={formatNumber(kpis.pendTot)} sub={<>🟢 {formatNumber(kpis.pendTot - kpis.pendBloq)} · 🟡 {formatNumber(kpis.pendBloq)}</>} />
          <StatTile compact label="Importe pendiente" value={formatCurrency(kpis.impTot)} />
          {!fuenteOculto && <StatTile compact label="Con fuentes" value={formatNumber(kpis.conF)} />}
        </div>
        <Ranking title="Top 10 material por importe pendiente" items={kpis.rk} money wide onRow={(m) => open({ type: 'material', material: m })} className="min-w-[420px] flex-1" />
      </div>
      )}

      {agrupado && (
      <div className="rounded-xl border border-border">
        <button onClick={() => setSectorOpen(!sectorOpen)} className="flex w-full items-center justify-between p-3 text-sm font-medium">
          <span>Pendiente por sector · {porSector.length} sectores</span>
          <ChevronDown className={`size-4 transition-transform ${sectorOpen ? 'rotate-180' : ''}`} />
        </button>
        {sectorOpen && (
          <div className="border-t border-border p-3">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-text-faint"><th className="pb-1"></th><th className="pb-1">Sector</th><th className="pb-1 text-right">Pendiente</th><th className="pb-1 text-right">Importe</th></tr></thead>
              <tbody>
                {porSector.map((s) => (
                  <>
                    <tr key={s.sector} className="cursor-pointer border-t border-border/60 hover:bg-bg-inset" onClick={() => setOpenSector(openSector === s.sector ? null : s.sector)}>
                      <td className="w-6"><ChevronDown className={`size-3.5 transition-transform ${openSector === s.sector ? 'rotate-180' : ''}`} /></td>
                      <td className="py-1">{s.sector}</td>
                      <td className="py-1 text-right">{formatNumber(s.qty)}</td>
                      <td className="py-1 text-right">{formatCurrency(s.imp)}</td>
                    </tr>
                    {openSector === s.sector && [...s.grupos.values()].sort((x, y) => y.imp - x.imp).map((g) => (
                      <tr key={s.sector + g.grupo} className="border-t border-border/40 bg-bg-inset/40 text-xs text-text-muted">
                        <td></td>
                        <td className="py-1 pl-4">{g.grupo}</td>
                        <td className="py-1 text-right">{formatNumber(g.qty)}</td>
                        <td className="py-1 text-right">{formatCurrency(g.imp)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearch onChange={setQ} placeholder="Buscar material, pedido, cliente…" />
        <select value={estado} onChange={(ev) => setEstado(ev.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Estado (todos)</option>
          {ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {!fuenteOculto && (
          <select value={fuente} onChange={(ev) => setFuente(ev.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
            <option value="">Fuentes</option><option value="si">Con fuentes</option><option value="no">Sin fuentes</option>
          </select>
        )}
        {!fuenteOculto && (
          <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm" title="Para fuente Corta caducidad, exige centro sugerido 1031/1022/1017 o igual al centro del pedido. Otras fuentes no se filtran.">
            <input type="checkbox" checked={centroValido} onChange={(ev) => setCentroValido(ev.target.checked)} />
            Centro válido (Corta cad.)
          </label>
        )}
      </div>

      <ColumnFilterBar columns={filterCols} rows={a.bo} active={quick} onChange={setQuick} />

      <div className="flex justify-end"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>

      {agrupado ? (
      <Card className="min-h-[640px] shrink-0 overflow-hidden">
        <div ref={scrollRef} className="h-[640px] overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                {([
                  ['pedido', 'Pedido/OC'], ['fecha', 'Fecha'], ['cliente', 'Cliente'], ['ejecutivo', 'Ejecutivo / Grupo cli.'],
                  ['centro', 'Centro/Alm'], ['material', 'Material'], ['sector', 'Sector/Grupo'],
                ] as const).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKey} dir={dir} onSort={toggleSort}>{l}</SortableTableHead>)}
                {([
                  ['cantped', 'Cant.ped.'], ['pend', 'Pend.'], ...(precioOculto ? [] : [['precio', 'Precio'] as const]), ['consumo', 'Consumo'],
                  ['inv1030', '1030'], ['inv1031', '1031'], ['inv1032', '1032'], ['inv1060', '1060'],
                ] as const).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">{l}</SortableTableHead>)}
                {([
                  ['bloq', 'Bloq.'], ['estado', 'Estado'], ['tendencia', 'Tendencia'],
                ] as const).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKey} dir={dir} onSort={toggleSort}>{l}</SortableTableHead>)}
                {!fuenteOculto && <SortableTableHead sortKey="fuentes" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Fuentes</SortableTableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && (
                <tr><td style={{ height: paddingTop }} colSpan={COL_COUNT} /></tr>
              )}
              {items.map((vi) => {
                const it = sorted[vi.index];
                const b = it.bo;
                const isBloqueado = !!b.bloqueado;
                const condicionesMat = e.matCondiciones(b.materialBase).join(', ');
                const invOpciones: { centro: string; almacen: string; cantidad: number }[] = [
                  { centro: '1031', almacen: '1030', cantidad: num(b.invByCenter['1030'] || 0) },
                  { centro: '1031', almacen: '1032', cantidad: num(b.invByCenter['1032'] || 0) },
                  ...(e.matSector(b.materialBase) === 'Suturas' ? [{ centro: '1018', almacen: '', cantidad: num(b.invByCenter['1018'] || 0) }] : []),
                ].filter((o) => o.cantidad > 0);
                const loteOptions: LoteOption[] = [
                  ...invOpciones.map((o) => ({
                    key: `inv|${o.centro}|${o.almacen}`,
                    label: `Inventario · Centro ${o.centro}${o.almacen ? ` / Alm ${o.almacen}` : ''} · ${formatNumber(o.cantidad)}`,
                    draft: buildFromInventarioCentro(b, it.k, o.centro, o.almacen || o.centro, o.cantidad, e),
                    condicion: condicionesMat,
                  })),
                  ...it.fuentes.map((f, idx) => ({
                    key: `fuente|${idx}|${f.lote}`,
                    label: `Lote ${f.lote || '—'} · Centro ${f.centroSugerido || '—'} · ${formatNumber(num(f.cantidadOfertar))} ${e.matUm(f.materialSugerido) || ''}`.trim(),
                    draft: buildFromSugerencia(b, it.k, f, e),
                    condicion: condicionesMat,
                  })),
                ];
                const onSolicitar = () => solicitar.abrir(
                  loteOptions[0]?.draft ?? buildFromSugerencia(b, it.k, it.fuentes[0] ?? null, e),
                  loteOptions.length ? loteOptions : undefined,
                );
                const copyItems = [
                  { label: 'Material', value: b.materialBase },
                  { label: 'Pedido', value: b.pedido },
                  { label: 'Cliente', value: b.razonSocial },
                  { label: 'Centro', value: b.centroPedido },
                ];
                return (
                  <SolicitarContextMenu
                    key={it.k}
                    onSolicitar={onSolicitar}
                    solicitado={sugSolicitadas.has(it.k)}
                    label={b.materialBase}
                    onVerDetalle={() => open({ type: 'sugDetalle', boKey: it.k })}
                    copyItems={copyItems}
                  >
                  <TableRow title="Doble clic para ver detalle" className={`cursor-pointer ${isBloqueado ? 'bg-amber-400/20 hover:bg-amber-400/30' : ''}`} onDoubleClick={() => open({ type: 'sugDetalle', boKey: it.k })}>
                    <TableCell><Chip onClick={() => open({ type: 'pedido', pedido: b.pedido })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{b.fecha || '—'}</TableCell>
                    <TableCell className="max-w-64 truncate">{b.razonSocial}<div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: b.solicitante })}>S {b.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: b.destinatario })}>D {b.destinatario}</Chip></div></TableCell>
                    <TableCell><Chip onClick={() => addQuick('ejecutivo', ejec(b))} title="Filtrar por ejecutivo">{ejec(b) || '—'}</Chip><div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', grupoCli(b))} title="Filtrar por grupo">{grupoCli(b) || '—'}</Chip></div></TableCell>
                    <TableCell>{b.centroPedido}{b.almacen ? ` / ${b.almacen}` : ''}</TableCell>
                    <TableCell><Chip onClick={() => open({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{b.descripcionSolicitada}</div>{!precioOculto && e.matPrecioOferta(b.materialBase) > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Of. {formatCurrency(e.matPrecioOferta(b.materialBase))}</div>}</TableCell>
                    <TableCell>{e.matSector(b.materialBase) || '—'}<div className="text-[11px] text-text-faint">{e.matGrupo(b.materialBase)}</div></TableCell>
                    <TableCell className="text-right">{formatNumber(b.cantidadPedido)}</TableCell>
                    <TableCell className="text-right">{formatNumber(b.cantidadPendiente)}</TableCell>
                    {!precioOculto && <TableCell className="text-right">{formatCurrency(b.precio)}</TableCell>}
                    <TableCell className="text-right">{formatNumber(it.consumoProm)}</TableCell>
                    {INV_COLS.map((alm) => {
                      const invVal = num(b.invByCenter[alm] || 0);
                      const tr = transitoFor(b.centroPedido, alm, b.materialBase);
                      return (
                        <TableCell key={alm} className="text-right">
                          {formatNumber(invVal)}
                          {tr > 0 && <div className="text-[10px] text-emerald-500">↻+{formatNumber(tr)}</div>}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">{formatNumber(b.invByCenter['1060'] || 0)}</TableCell>
                    <TableCell>{b.bloqueado ? <StatePill label={b.bloqueado} cls="amb" /> : '—'}</TableCell>
                    <TableCell><StatePill label={it.status.label} cls={it.status.cls} /></TableCell>
                    <TableCell><TrendBadge t={it.tend} /></TableCell>
                    {!fuenteOculto && <TableCell className="text-right">{it.fuentes.length || '—'}</TableCell>}
                  </TableRow>
                  </SolicitarContextMenu>
                );
              })}
              {paddingBottom > 0 && (
                <tr><td style={{ height: paddingBottom }} colSpan={COL_COUNT} /></tr>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      ) : (
      <Card className="min-h-[640px] shrink-0 overflow-hidden">
        <div ref={scrollRefRaw} className="h-[640px] overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                {([
                  ['pedido', 'Pedido/OC'], ['fecha', 'Fecha'], ['cliente', 'Cliente'], ['ejecutivo', 'Ejecutivo / Grupo cli.'],
                  ['centro', 'Centro/Alm'], ['material', 'Material'], ['sector', 'Sector/Grupo'],
                ] as const).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>{l}</SortableTableHead>)}
                {([
                  ['cantped', 'Cant.ped.'], ['pend', 'Pend.'], ...(precioOculto ? [] : [['precio', 'Precio'] as const]), ['consumo', 'Consumo'],
                  ['inv1030', '1030'], ['inv1031', '1031'], ['inv1032', '1032'], ['inv1060', '1060'],
                ] as const).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw} className="text-right justify-end">{l}</SortableTableHead>)}
                {([
                  ['bloq', 'Bloq.'], ['estado', 'Estado'], ['tendencia', 'Tendencia'],
                ] as const).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>{l}</SortableTableHead>)}
                <SortableTableHead sortKey="fuente" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>Fuente</SortableTableHead>
                <SortableTableHead sortKey="matsug" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>Material sugerido</SortableTableHead>
                <SortableTableHead sortKey="centrosug" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>Centro sugerido</SortableTableHead>
                <SortableTableHead sortKey="disponible" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>Disponible / Lote / Cad.</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTopRaw > 0 && (
                <tr><td style={{ height: paddingTopRaw }} colSpan={COL_COUNT_RAW} /></tr>
              )}
              {itemsRaw.map((vi) => {
                const row = sortedRaw[vi.index];
                const { it, f } = row;
                const b = it.bo;
                const isBloqueado = !!b.bloqueado;
                const condicionesMat = e.matCondiciones(b.materialBase).join(', ');
                const invOpciones: { centro: string; almacen: string; cantidad: number }[] = [
                  { centro: '1031', almacen: '1030', cantidad: num(b.invByCenter['1030'] || 0) },
                  { centro: '1031', almacen: '1032', cantidad: num(b.invByCenter['1032'] || 0) },
                  ...(e.matSector(b.materialBase) === 'Suturas' ? [{ centro: '1018', almacen: '', cantidad: num(b.invByCenter['1018'] || 0) }] : []),
                ].filter((o) => o.cantidad > 0);
                const loteOptions: LoteOption[] = [
                  ...invOpciones.map((o) => ({
                    key: `inv|${o.centro}|${o.almacen}`,
                    label: `Inventario · Centro ${o.centro}${o.almacen ? ` / Alm ${o.almacen}` : ''} · ${formatNumber(o.cantidad)}`,
                    draft: buildFromInventarioCentro(b, it.k, o.centro, o.almacen || o.centro, o.cantidad, e),
                    condicion: condicionesMat,
                  })),
                  ...it.fuentes.map((ff, idx) => ({
                    key: `fuente|${idx}|${ff.lote}`,
                    label: `Lote ${ff.lote || '—'} · Centro ${ff.centroSugerido || '—'} · ${formatNumber(num(ff.cantidadOfertar))} ${e.matUm(ff.materialSugerido) || ''}`.trim(),
                    draft: buildFromSugerencia(b, it.k, ff, e),
                    condicion: condicionesMat,
                  })),
                ];
                const defaultDraft = f ? buildFromSugerencia(b, it.k, f, e) : (loteOptions[0]?.draft ?? buildFromSugerencia(b, it.k, null, e));
                const onSolicitar = () => solicitar.abrir(defaultDraft, loteOptions.length ? loteOptions : undefined);
                const sourceKey = `sug|${it.k}|${norm(f?.lote ?? '')}`;
                const copyItems = [
                  { label: 'Material', value: b.materialBase },
                  { label: 'Pedido', value: b.pedido },
                  { label: 'Cliente', value: b.razonSocial },
                  { label: 'Centro', value: b.centroPedido },
                ];
                return (
                  <SolicitarContextMenu
                    key={row.key}
                    onSolicitar={onSolicitar}
                    solicitado={rawSolicitadas.has(sourceKey)}
                    label={b.materialBase}
                    onVerDetalle={() => open({ type: 'sugDetalle', boKey: it.k })}
                    copyItems={copyItems}
                  >
                  <TableRow title="Doble clic para ver detalle" className={`cursor-pointer ${isBloqueado ? 'bg-amber-400/20 hover:bg-amber-400/30' : ''}`} onDoubleClick={() => open({ type: 'sugDetalle', boKey: it.k })}>
                    <TableCell><Chip onClick={() => open({ type: 'pedido', pedido: b.pedido })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{b.fecha || '—'}</TableCell>
                    <TableCell className="max-w-64 truncate">{b.razonSocial}<div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: b.solicitante })}>S {b.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: b.destinatario })}>D {b.destinatario}</Chip></div></TableCell>
                    <TableCell><Chip onClick={() => addQuick('ejecutivo', ejec(b))} title="Filtrar por ejecutivo">{ejec(b) || '—'}</Chip><div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', grupoCli(b))} title="Filtrar por grupo">{grupoCli(b) || '—'}</Chip></div></TableCell>
                    <TableCell>{b.centroPedido}{b.almacen ? ` / ${b.almacen}` : ''}</TableCell>
                    <TableCell><Chip onClick={() => open({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{b.descripcionSolicitada}</div>{!precioOculto && e.matPrecioOferta(b.materialBase) > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Of. {formatCurrency(e.matPrecioOferta(b.materialBase))}</div>}</TableCell>
                    <TableCell>{e.matSector(b.materialBase) || '—'}<div className="text-[11px] text-text-faint">{e.matGrupo(b.materialBase)}</div></TableCell>
                    <TableCell className="text-right">{formatNumber(b.cantidadPedido)}</TableCell>
                    <TableCell className="text-right">{formatNumber(b.cantidadPendiente)}</TableCell>
                    {!precioOculto && <TableCell className="text-right">{formatCurrency(b.precio)}</TableCell>}
                    <TableCell className="text-right">{formatNumber(it.consumoProm)}</TableCell>
                    {INV_COLS.map((alm) => {
                      const invVal = num(b.invByCenter[alm] || 0);
                      const tr = transitoFor(b.centroPedido, alm, b.materialBase);
                      return (
                        <TableCell key={alm} className="text-right">
                          {formatNumber(invVal)}
                          {tr > 0 && <div className="text-[10px] text-emerald-500">↻+{formatNumber(tr)}</div>}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">{formatNumber(b.invByCenter['1060'] || 0)}</TableCell>
                    <TableCell>{b.bloqueado ? <StatePill label={b.bloqueado} cls="amb" /> : '—'}</TableCell>
                    <TableCell><StatePill label={it.status.label} cls={it.status.cls} /></TableCell>
                    <TableCell><TrendBadge t={it.tend} /></TableCell>
                    <TableCell>{f ? <StatePill label={f.fuente} cls={/corta/i.test(f.fuente) ? 'rojo' : 'azul'} /> : '—'}</TableCell>
                    <TableCell>{f ? (<>{f.materialSugerido || '—'}<div className="text-[11px] text-text-faint max-w-56 truncate">{f.descripcionSugerida}</div></>) : '—'}</TableCell>
                    <TableCell>{f ? <>{f.centroSugerido || '—'}{f.almacenSugerido ? ` / ${f.almacenSugerido}` : ''}</> : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {f ? (
                        <>
                          <div>{formatNumber(f.disponible)} disp. · Lote {f.lote || '—'}</div>
                          {f.fechaCaducidad && (
                            <div className="text-[11px] text-text-faint">
                              {formatFechaCaducidad(f.fechaCaducidad)} · {formatNumber(f.mesesVigenciaLote)} meses
                            </div>
                          )}
                        </>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                  </SolicitarContextMenu>
                );
              })}
              {paddingBottomRaw > 0 && (
                <tr><td style={{ height: paddingBottomRaw }} colSpan={COL_COUNT_RAW} /></tr>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      )}

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}
