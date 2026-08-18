import { useMemo } from 'react';
import { Search, AlertTriangle, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { buildLotesSheet, loteKey } from '@/lib/lotesSheet';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, TrendBadge, Chip, StatTile, ZoomControl, useZoom, ColumnFilterBar, ColumnFilterMenu, passesFilters, ClearFiltersButton, useColumnVisibility, ColumnVisibilityControl, useSavedViews, SavedViewsControl, type ActiveFilter, type FilterColumn, type ColDef } from '@/modules/analytics/ui';
import { TooltipHint } from '@/components/ui/tooltip';
import {
  invGen, esLento, esCentroDistribucion, peorCobertura, summarizeCoberturaConTransito, quiebreMitigadoPorTransito,
  COBERTURA_LABEL, COBERTURA_CLS, COBERTURA_HELP, COBERTURA_HELP_TRANSITO,
  type RSSMaterial, type RSSCentro, type CoberturaEstado,
} from '@/core/resumenSin';
import { serieMaterial, tendenciaTexto } from '@/core/resumenFac';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { matchesQuery, norm } from '@/modules/analytics/helpers';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useDataStore } from '@/store/dataStore';
import { useSort } from '@/hooks/useSort';
import { buildFromResumenSin } from '@/services/solicitudService';
import { useSolicitarDialog, type LoteOption } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { usePersistedState } from '@/hooks/usePersistedState';

export function ResumenSinPage() {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const [q, setQ] = usePersistedState('resumenSin.q', '');
  const [centroFiltro, setCentroFiltro] = usePersistedState('resumenSin.centro', '');
  const [quick, setQuick] = usePersistedState<ActiveFilter[]>('resumenSin.quick', []);
  useUrlFilters(quick, setQuick);
  const [pendFiltro, setPendFiltro] = usePersistedState<'' | 'con' | 'sin'>('resumenSin.pend', '');
  const [lentoFiltro, setLentoFiltro] = usePersistedState<'' | 'con' | 'sin'>('resumenSin.lento', '');
  const [transitoFiltro, setTransitoFiltro] = usePersistedState<'' | 'con' | 'sin'>('resumenSin.transito', '');
  const [coberturaFiltro, setCoberturaFiltro] = usePersistedState<'' | CoberturaEstado>('resumenSin.cobertura', '');
  const zoom = useZoom('resumen_sin_zoom');
  const clearFilters = () => {
    setQ(''); setCentroFiltro(''); setQuick([]); setPendFiltro(''); setLentoFiltro(''); setTransitoFiltro(''); setCoberturaFiltro('');
  };
  const rss = a.rss;
  const qd = useDebouncedValue(q, 200);
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  // Cell-level (material, centro) match — almacén/pedidos aren't reliably
  // known from the pivot, so the sourceKey suffix is left variable/blank.
  const rssSolicitadas = useMemo(() => {
    const set = new Set<string>();
    for (const s of solicitudesList) {
      if (s.origen !== 'resumenSin') continue;
      const [, material, centro] = s.sourceKey.split('|');
      set.add(`${material}|${centro}`);
    }
    return set;
  }, [solicitudesList]);

  // Distinct statuses across a material's centros — shared by the display
  // string (`statusMat`, comma-joined) and the "Status Revisión" filter
  // column (`getMany`, one value per centro so it matches "has this status
  // in some centro" instead of the exact joined combo).
  const statusSetOf = (mo: RSSMaterial) => {
    const s = new Set<string>();
    mo.centros.forEach((co) => co.status.forEach((v) => s.add(v)));
    return s;
  };
  const anyCentro = (mo: RSSMaterial, pred: (co: RSSCentro) => boolean) => {
    for (const co of mo.centros.values()) if (pred(co)) return true;
    return false;
  };

  const filterCols: FilterColumn<RSSMaterial>[] = useMemo(() => [
    { key: 'material', label: 'Material', get: (mo) => mo.material },
    { key: 'descripcion', label: 'Descripción', get: (mo) => mo.desc },
    { key: 'sector', label: 'Sector', get: (mo) => a.enrich.matSector(mo.material) },
    { key: 'grupo', label: 'Grupo de artículo', get: (mo) => a.enrich.matGrupo(mo.material) },
    { key: 'tendencia', label: 'Tendencia', get: (mo) => tendenciaTexto(serieMaterial(a.rf, mo.material)).txt },
    { key: 'status', label: 'Status Revisión', getMany: (mo) => [...statusSetOf(mo)] },
    { key: 'centro', label: 'Centro', getMany: (mo) => [...mo.centros.keys()] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [a.enrich, a.rf]);

  const list = useMemo(() => {
    if (!rss) return [];
    return [...rss.mats.values()].filter((mo) => {
      if (qd && !matchesQuery(qd, `${mo.material} ${mo.desc} ${a.enrich.matSector(mo.material)} ${a.enrich.matGrupo(mo.material)}`)) return false;
      if (!passesFilters(mo, filterCols, quick)) return false;
      if (pendFiltro === 'con' && !anyCentro(mo, (co) => co.pend > 0)) return false;
      if (pendFiltro === 'sin' && anyCentro(mo, (co) => co.pend > 0)) return false;
      if (lentoFiltro === 'con' && !anyCentro(mo, (co) => esLento(co, rss.curMes))) return false;
      if (lentoFiltro === 'sin' && anyCentro(mo, (co) => esLento(co, rss.curMes))) return false;
      if (transitoFiltro === 'con' && !anyCentro(mo, (co) => co.transito > 0)) return false;
      if (transitoFiltro === 'sin' && anyCentro(mo, (co) => co.transito > 0)) return false;
      if (coberturaFiltro && !anyCentro(mo, (co) => peorCobertura(co) === coberturaFiltro)) return false;
      return true;
    });
  }, [rss, qd, a.enrich, filterCols, quick, pendFiltro, lentoFiltro, transitoFiltro, coberturaFiltro]);

  const totals = useMemo(() => {
    let inv = 0, pend = 0, trans = 0;
    for (const mo of list) mo.centros.forEach((co) => { inv += invGen(co); pend += co.pend; trans += co.transito; });
    return { inv, pend, trans };
  }, [list]);

  // Peor cobertura por cada par (material, centro) visible — base tanto del
  // resumen por clase como del badge por celda, calculado una sola vez.
  const coberturaSummary = useMemo(() => {
    const pares: { estado: CoberturaEstado | undefined; co: RSSCentro }[] = [];
    for (const mo of list) mo.centros.forEach((co) => pares.push({ estado: peorCobertura(co), co }));
    return summarizeCoberturaConTransito(pares);
  }, [list]);
  const coberturaCount = (estado: CoberturaEstado) => coberturaSummary.base.find((s) => s.estado === estado)?.count ?? 0;

  const statusMat = (mo: RSSMaterial) => [...statusSetOf(mo)].join(', ');
  const sortAcc = useMemo(() => ({
    material: (mo: (typeof list)[number]) => mo.material,
    sector: (mo: (typeof list)[number]) => a.enrich.matSector(mo.material),
    status: (mo: (typeof list)[number]) => statusMat(mo),
    invtot: (mo: (typeof list)[number]) => [...mo.centros.values()].reduce((s, co) => s + invGen(co), 0),
    pendtot: (mo: (typeof list)[number]) => [...mo.centros.values()].reduce((s, co) => s + co.pend, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list, a.enrich]);
  const { sorted, sortKey, dir, toggleSort } = useSort(list, sortAcc);
  const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(sorted.length);

  const colVis = useColumnVisibility('resumenSin_columnas');
  const columnDefs: ColDef[] = useMemo(
    () => (rss ? rss.centros.map((c) => ({ key: `centro_${c}`, label: `Centro ${c}` })) : []),
    [rss],
  );
  const savedViews = useSavedViews<{ quick: ActiveFilter[]; centroFiltro: string; pendFiltro: typeof pendFiltro; lentoFiltro: typeof lentoFiltro; transitoFiltro: typeof transitoFiltro; coberturaFiltro: typeof coberturaFiltro; hidden: string[] }>('resumenSin_vistas');
  const applyView = (state: { quick: ActiveFilter[]; centroFiltro: string; pendFiltro: typeof pendFiltro; lentoFiltro: typeof lentoFiltro; transitoFiltro: typeof transitoFiltro; coberturaFiltro: typeof coberturaFiltro; hidden: string[] }) => {
    setQuick(state.quick); setCentroFiltro(state.centroFiltro); setPendFiltro(state.pendFiltro);
    setLentoFiltro(state.lentoFiltro); setTransitoFiltro(state.transitoFiltro); setCoberturaFiltro(state.coberturaFiltro);
    colVis.apply(state.hidden);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { quick, centroFiltro, pendFiltro, lentoFiltro, transitoFiltro, coberturaFiltro, hidden: [...colVis.hidden] });

  if (!rss) {
    if (!bootstrapped) return <TableSkeleton />;
    return <EmptyState title={'No se cargó la hoja "Resumen Sin Sugerencias".'} action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const centrosAll = rss.centros;
  // Always-visible: 1031 stays regardless of the toggle; toggle picks which other centro(s) show.
  const centros = (centroFiltro ? centrosAll.filter((c) => c === '1031' || c === centroFiltro) : centrosAll)
    .filter((c) => colVis.isVisible(`centro_${c}`));
  const colCount = 6 + centros.length;

  const exportar = () => {
    const out: Record<string, unknown>[] = [];
    // La tabla es material × centro, así que los lotes se acotan a los pares
    // (material, centro) realmente exportados.
    const pares = new Set<string>();
    list.forEach((mo) => {
      mo.centros.forEach((co, centro) => {
        pares.add(loteKey(mo.material, centro));
        const ig = invGen(co);
        const peor = peorCobertura(co);
        const coberturaTxt = peor
          ? quiebreMitigadoPorTransito(peor, co) ? `${COBERTURA_LABEL.quiebre} (en tránsito)` : COBERTURA_LABEL[peor]
          : '';
        out.push({
          Material: mo.material, Descripción: mo.desc, Centro: centro,
          'Inv. general (1030+1031+1060)': ig, Pendiente: co.pend, 'En tránsito': co.transito,
          Lento: esLento(co, rss.curMes) ? 'Sí' : '',
          Cobertura: coberturaTxt,
          Sector: a.enrich.matSector(mo.material) || '', 'Grupo art.': a.enrich.matGrupo(mo.material) || '',
        });
      });
    });
    const lotesX = buildLotesSheet(a.lotes, (l) => pares.has(loteKey(l.material, l.centro)));
    void exportXlsxMultiSheet(`resumen_sin_sugerencias_${stamp()}.xlsx`, [
      { name: 'ResumenSinSug', rows: out },
      { name: 'Detalle Lotes', rows: lotesX },
    ]);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-5">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Inventario</h2>
          <p className="text-sm text-text-muted">Pivote material × centro · inventario general (1030+1031+1060)</p></div>
        <div className="flex items-center gap-2">
          <ColumnVisibilityControl columns={columnDefs} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
          <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
          <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Materiales" value={formatNumber(list.length)} />
        <StatTile label="Inv. total" value={formatNumber(totals.inv)} />
        <StatTile label="Pendiente total" value={formatNumber(totals.pend)} tone="text-danger" />
        <StatTile label="En tránsito total" value={formatNumber(totals.trans)} tone="text-warning" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TooltipHint text={`${COBERTURA_HELP.quiebre} No incluye Centro 1031 (hub de distribución).`}>
          <div><StatTile compact label="Quiebre urgente (sin tránsito)" value={formatNumber(coberturaSummary.quiebreUrgente)} tone="text-danger" /></div>
        </TooltipHint>
        <TooltipHint text={`${COBERTURA_HELP_TRANSITO} No incluye Centro 1031 (hub de distribución).`}>
          <div><StatTile compact label="Quiebre con tránsito en camino" value={formatNumber(coberturaSummary.quiebreMitigado)} tone="text-warning" /></div>
        </TooltipHint>
        <TooltipHint text={`${COBERTURA_HELP.inmovilizado} No incluye Centro 1031 (hub de distribución).`}>
          <div><StatTile compact label="Inmovilizado (sin consumo, con inv.)" value={formatNumber(coberturaCount('inmovilizado'))} tone="text-violet-500" /></div>
        </TooltipHint>
        <TooltipHint text={`${COBERTURA_HELP.exceso} No incluye Centro 1031 (hub de distribución).`}>
          <div><StatTile compact label="Exceso (> 12 meses cobertura)" value={formatNumber(coberturaCount('exceso'))} tone="text-warning" /></div>
        </TooltipHint>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
          <Input placeholder="Buscar material…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
        <select value={centroFiltro} onChange={(e) => setCentroFiltro(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Todos los centros</option>
          {centrosAll.filter((c) => c !== '1031').map((c) => <option key={c} value={c}>Solo Centro {c} (+1031)</option>)}
        </select>
        <p className="text-xs text-text-faint">Celda = inv. del centro · <span className="text-danger">Pend</span> pendiente · <AlertTriangle className="inline size-3 text-warning" /> lento (≥6m sin mov.)</p>
        <ClearFiltersButton onClear={clearFilters} />
        <div className="ml-auto"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ColumnFilterBar columns={filterCols} rows={list} active={quick} onChange={setQuick} />
        <select value={pendFiltro} onChange={(e) => setPendFiltro(e.target.value as typeof pendFiltro)} className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs">
          <option value="">Pendiente: todos</option>
          <option value="con">Con pendiente</option>
          <option value="sin">Sin pendiente</option>
        </select>
        <select value={lentoFiltro} onChange={(e) => setLentoFiltro(e.target.value as typeof lentoFiltro)} className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs">
          <option value="">Lento: todos</option>
          <option value="con">Solo lento</option>
          <option value="sin">Sin lento</option>
        </select>
        <select value={transitoFiltro} onChange={(e) => setTransitoFiltro(e.target.value as typeof transitoFiltro)} className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs">
          <option value="">En tránsito: todos</option>
          <option value="con">Con tránsito</option>
          <option value="sin">Sin tránsito</option>
        </select>
        <select value={coberturaFiltro} onChange={(e) => setCoberturaFiltro(e.target.value as typeof coberturaFiltro)} className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs" title="Peor cobertura entre los almacenes de cada centro (no incluye Centro 1031)">
          <option value="">Cobertura: todas</option>
          <option value="quiebre">{COBERTURA_LABEL.quiebre}</option>
          <option value="inmovilizado">{COBERTURA_LABEL.inmovilizado}</option>
          <option value="exceso">{COBERTURA_LABEL.exceso}</option>
          <option value="sano">{COBERTURA_LABEL.sano}</option>
        </select>
        <TooltipHint text={`${COBERTURA_HELP.quiebre} · ${COBERTURA_HELP.inmovilizado} · ${COBERTURA_HELP.exceso} · ${COBERTURA_HELP.sano} · ${COBERTURA_HELP.aceptable} · Centro 1031 (hub de distribución) queda excluido de estos estados.`}>
          <button type="button" className="text-xs text-text-faint underline decoration-dotted underline-offset-2 hover:text-text">¿Qué significa cada estado?</button>
        </TooltipHint>
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[0]} rows={list} active={quick} onChange={setQuick} />}>Material</SortableTableHead>
                <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[2]} rows={list} active={quick} onChange={setQuick} />}>Sector/Grupo</SortableTableHead>
                <TableHead>Tendencia</TableHead>
                <SortableTableHead sortKey="status" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[5]} rows={list} active={quick} onChange={setQuick} />}>Status Revisión</SortableTableHead>
                {centros.map((c) => <TableHead key={c} className="text-right">C {c}</TableHead>)}
                <SortableTableHead sortKey="invtot" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Inv. total</SortableTableHead>
                <SortableTableHead sortKey="pendtot" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Pend. total</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && (
                <tr><td style={{ height: paddingTop }} colSpan={colCount} /></tr>
              )}
              {items.map((vi) => {
                const mo = sorted[vi.index];
                const invTot = [...mo.centros.values()].reduce((s, co) => s + invGen(co), 0);
                const pendTot = [...mo.centros.values()].reduce((s, co) => s + co.pend, 0);
                return (
                  <TableRow key={mo.material}>
                    <TableCell><Chip onClick={() => open({ type: 'material', material: mo.material })}>{mo.material}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{mo.desc}</div>{a.enrich.matPrecioOferta(mo.material) > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Of. {formatCurrency(a.enrich.matPrecioOferta(mo.material))}</div>}</TableCell>
                    <TableCell>{a.enrich.matSector(mo.material) || '—'}<div className="text-[11px] text-text-faint">{a.enrich.matGrupo(mo.material)}</div></TableCell>
                    <TableCell><TrendBadge t={tendenciaTexto(serieMaterial(a.rf, mo.material))} /></TableCell>
                    <TableCell className="text-xs text-text-muted">{statusMat(mo) || '—'}</TableCell>
                    {centros.map((c) => {
                      const co = mo.centros.get(c);
                      if (!co) return <TableCell key={c} className="text-right text-text-faint">—</TableCell>;
                      const ig = invGen(co);
                      const peor = peorCobertura(co);
                      const showCoberturaBadge = peor && peor !== 'sano' && peor !== 'aceptable' && peor !== 'sinDatos';
                      const mitigado = quiebreMitigadoPorTransito(peor, co);
                      const coberturaLabel = mitigado ? `${COBERTURA_LABEL.quiebre} (en tránsito)` : peor ? COBERTURA_LABEL[peor] : '';
                      const coberturaCls = mitigado ? 'amb' : peor ? COBERTURA_CLS[peor] : 'gris';
                      const cellSolicitada = rssSolicitadas.has(`${norm(mo.material)}|${c}`);
                      const condicionesMat = a.enrich.matCondiciones(mo.material).join(', ');
                      const onSolicitar = () => {
                        const lotesPar = a.lotes.filter((l) => loteKey(l.material, l.centro) === loteKey(mo.material, c));
                        const loteOptions: LoteOption[] = lotesPar.map((l, idx) => ({
                          key: `${idx}|${l.almacen}|${l.lote}`,
                          label: `Lote ${l.lote || '—'} · Alm ${l.almacen || '—'} · ${formatNumber(l.cantidadDisp)}`,
                          draft: buildFromResumenSin({ material: mo.material, descripcion: mo.desc, centro: c, cantidadPendiente: co.pend }, l, a.enrich),
                          condicion: condicionesMat,
                        }));
                        const initial = buildFromResumenSin({ material: mo.material, descripcion: mo.desc, centro: c, cantidadPendiente: co.pend }, lotesPar[0] ?? null, a.enrich);
                        solicitar.abrir(initial, loteOptions.length ? loteOptions : undefined);
                      };
                      const copyItems = [
                        { label: 'Material', value: mo.material },
                        { label: 'Centro', value: c },
                      ];
                      return (
                        <SolicitarContextMenu
                          key={c}
                          onSolicitar={onSolicitar}
                          solicitado={cellSolicitada}
                          label={`${mo.material} · Centro ${c}`}
                          onVerDetalle={() => open({ type: 'celda', material: mo.material, centro: c })}
                          copyItems={copyItems}
                        >
                        <TableCell className="text-right">
                          <Chip onClick={() => open({ type: 'celda', material: mo.material, centro: c })}>{formatNumber(ig)}</Chip>
                          {co.transito > 0 && <span className="text-emerald-500"> +{formatNumber(co.transito)}</span>}
                          {esLento(co, rss.curMes) && <AlertTriangle className="ml-1 inline size-3 text-warning" />}
                          {co.pend > 0 && <div className="text-[11px] text-danger">Pend {formatNumber(co.pend)}</div>}
                          {showCoberturaBadge && (
                            <TooltipHint text={mitigado ? COBERTURA_HELP_TRANSITO : peor ? COBERTURA_HELP[peor] : ''}>
                              <div className="mt-0.5 inline-block"><StatePill label={coberturaLabel} cls={coberturaCls} /></div>
                            </TooltipHint>
                          )}
                          {esCentroDistribucion(c) && <div className="text-[10px] text-text-faint">Distribución</div>}
                        </TableCell>
                        </SolicitarContextMenu>
                      );
                    })}
                    <TableCell className="text-right font-medium"><Chip onClick={() => open({ type: 'materialTotales', material: mo.material })}>{formatNumber(invTot)}</Chip></TableCell>
                    <TableCell className="text-right">{pendTot ? <Chip onClick={() => open({ type: 'materialTotales', material: mo.material })}><span className="text-danger">{formatNumber(pendTot)}</span></Chip> : '—'}</TableCell>
                  </TableRow>
                );
              })}
              {paddingBottom > 0 && (
                <tr><td style={{ height: paddingBottom }} colSpan={colCount} /></tr>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}
