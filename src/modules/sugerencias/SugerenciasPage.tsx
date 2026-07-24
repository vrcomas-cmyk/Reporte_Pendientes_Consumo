import { useMemo, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useSort } from '@/hooks/useSort';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, TrendBadge, Chip, Ranking, StatTile, ZoomControl, useZoom, ColumnFilterBar, DebouncedSearch, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { ESTADOS } from '@/core/resumenFac';
import { norm, num, matchesQuery } from '@/modules/analytics/helpers';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { buildFromSugerencia } from '@/services/solicitudService';
import { useSolicitarDialog, type LoteOption } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitadoBadge } from '@/modules/solicitudes/SolicitadoBadge';
import { useSolicitudStore } from '@/store/solicitudStore';

const INV_COLS = ['1030', '1031', '1032'] as const;

type BORow = (ReturnType<typeof useAnalytics>['bo'])[number];

export function SugerenciasPage() {
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
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
  const [quick, setQuick] = useState<ActiveFilter[]>([]);
  const [sectorOpen, setSectorOpen] = useState(false);
  const [openSector, setOpenSector] = useState<string | null>(null);
  const zoom = useZoom();

  const e = a.enrich;
  const grupoCli = (b: BORow['bo']) => e.grupoCliente(b.gpoCte) || norm(b.gpoCte);
  const ejec = (b: BORow['bo']) => e.ejecutivoNombre(b.gpoVdor);

  const filterCols: FilterColumn<BORow>[] = useMemo(() => [
    { key: 'material', label: 'Material', get: (it) => it.bo.materialBase },
    { key: 'grupocli', label: 'Grupo cliente', get: (it) => grupoCli(it.bo) },
    { key: 'ejecutivo', label: 'Ejecutivo', get: (it) => ejec(it.bo) },
    { key: 'centro', label: 'Centro', get: (it) => it.bo.centroPedido },
    { key: 'sector', label: 'Sector', get: (it) => e.matSector(it.bo.materialBase) },
  ], [e]);

  const filtered = useMemo(() => {
    return a.bo.filter((it) => {
      const b = it.bo;
      if (estado && it.status.key !== estado) return false;
      if (fuente === 'si' && !it.fuentes.length) return false;
      if (fuente === 'no' && it.fuentes.length) return false;
      for (const f of quick) {
        const col = filterCols.find((c) => c.key === f.col);
        if (col && col.get(it) !== f.value) return false;
      }
      if (q) {
        const hay = `${b.materialBase} ${b.descripcionSolicitada} ${b.pedido} ${b.razonSocial} ${b.solicitante} ${b.destinatario}`;
        if (!matchesQuery(q, hay)) return false;
      }
      return true;
    });
  }, [a.bo, q, estado, fuente, quick, filterCols]);

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

  const COL_COUNT = 20;
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

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Sugerencias</h2>
          <p className="text-sm text-text-muted">Órdenes pendientes deduplicadas (BO) · {formatNumber(filtered.length)} renglones</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="inline-grid grid-cols-2 content-start gap-2">
          <StatTile compact label="Renglones BO" value={formatNumber(filtered.length)} />
          <StatTile compact label="Cant. pendiente" value={formatNumber(kpis.pendTot)} sub={<>🟢 {formatNumber(kpis.pendTot - kpis.pendBloq)} · 🟡 {formatNumber(kpis.pendBloq)}</>} />
          <StatTile compact label="Importe pendiente" value={formatCurrency(kpis.impTot)} />
          <StatTile compact label="Con fuentes" value={formatNumber(kpis.conF)} />
        </div>
        <Ranking title="Top 10 material por importe pendiente" items={kpis.rk} money wide onRow={(m) => open({ type: 'material', material: m })} className="min-w-[420px] flex-1" />
      </div>

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

      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearch onChange={setQ} placeholder="Buscar material, pedido, cliente…" />
        <select value={estado} onChange={(ev) => setEstado(ev.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Estado (todos)</option>
          {ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={fuente} onChange={(ev) => setFuente(ev.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Fuentes</option><option value="si">Con fuentes</option><option value="no">Sin fuentes</option>
        </select>
      </div>

      <ColumnFilterBar columns={filterCols} rows={a.bo} active={quick} onChange={setQuick} />

      <div className="flex justify-end"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>

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
                  ['cantped', 'Cant.ped.'], ['pend', 'Pend.'], ['precio', 'Precio'], ['consumo', 'Consumo'],
                  ['inv1030', '1030'], ['inv1031', '1031'], ['inv1032', '1032'], ['inv1060', '1060'],
                ] as const).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">{l}</SortableTableHead>)}
                {([
                  ['bloq', 'Bloq.'], ['estado', 'Estado'], ['tendencia', 'Tendencia'],
                ] as const).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKey} dir={dir} onSort={toggleSort}>{l}</SortableTableHead>)}
                <SortableTableHead sortKey="fuentes" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Fuentes</SortableTableHead>
                <TableHead>Acción</TableHead>
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
                return (
                  <TableRow key={it.k} title="Doble clic para ver detalle" className={`cursor-pointer ${isBloqueado ? 'bg-amber-400/20 hover:bg-amber-400/30' : ''}`} onDoubleClick={() => open({ type: 'sugDetalle', boKey: it.k })}>
                    <TableCell><Chip onClick={() => open({ type: 'pedido', pedido: b.pedido })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{b.fecha || '—'}</TableCell>
                    <TableCell className="max-w-64 truncate">{b.razonSocial}<div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: b.solicitante })}>S {b.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: b.destinatario })}>D {b.destinatario}</Chip></div></TableCell>
                    <TableCell><Chip onClick={() => addQuick('ejecutivo', ejec(b))} title="Filtrar por ejecutivo">{ejec(b) || '—'}</Chip><div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', grupoCli(b))} title="Filtrar por grupo">{grupoCli(b) || '—'}</Chip></div></TableCell>
                    <TableCell>{b.centroPedido}{b.almacen ? ` / ${b.almacen}` : ''}</TableCell>
                    <TableCell><Chip onClick={() => open({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{b.descripcionSolicitada}</div>{e.matPrecioOferta(b.materialBase) > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Of. {formatCurrency(e.matPrecioOferta(b.materialBase))}</div>}</TableCell>
                    <TableCell>{e.matSector(b.materialBase) || '—'}<div className="text-[11px] text-text-faint">{e.matGrupo(b.materialBase)}</div></TableCell>
                    <TableCell className="text-right">{formatNumber(b.cantidadPedido)}</TableCell>
                    <TableCell className="text-right">{formatNumber(b.cantidadPendiente)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(b.precio)}</TableCell>
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
                    <TableCell className="text-right">{it.fuentes.length || '—'}</TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const loteOptions: LoteOption[] = it.fuentes.map((f, idx) => ({
                              key: `${idx}|${f.lote}`,
                              label: `Lote ${f.lote || '—'} · Centro ${f.centroSugerido || '—'} · ${formatNumber(num(f.cantidadOfertar))} ${e.matUm(f.materialSugerido) || ''}`.trim(),
                              draft: buildFromSugerencia(b, it.k, f, e),
                            }));
                            solicitar.abrir(buildFromSugerencia(b, it.k, it.fuentes[0] ?? null, e), loteOptions.length ? loteOptions : undefined);
                          }}
                        >
                          Solicitar
                        </Button>
                        <SolicitadoBadge solicitado={sugSolicitadas.has(it.k)} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paddingBottom > 0 && (
                <tr><td style={{ height: paddingBottom }} colSpan={COL_COUNT} /></tr>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}
