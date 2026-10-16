import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRssFuenteStore } from '@/store/rssFuenteStore';
import { Search, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { buildLotesSheet, loteKey } from '@/lib/lotesSheet';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, TrendBadge, Chip, ZoomControl, useZoom, ColumnFilterBar, ColumnFilterMenu, passesFilters, useColumnVisibility, ColumnVisibilityControl, useSavedViews, SavedViewsControl, PasteCodesFilter, PasteCodesChip, matchesCodes, type ActiveFilter, type FilterColumn, type ColDef } from '@/modules/analytics/ui';
import { TooltipHint } from '@/components/ui/tooltip';
import {
  invGen, esLento, esCentroDistribucion, peorCobertura, quiebreMitigadoPorTransito,
  COBERTURA_LABEL, COBERTURA_CLS, COBERTURA_HELP, COBERTURA_HELP_TRANSITO,
  type RSSMaterial, type RSSCentro, type CoberturaEstado,
} from '@/core/resumenSin';
import { serieMaterial, tendenciaTexto } from '@/core/resumenFac';
import { useQuickFilters } from '@/hooks/useQuickFilters';
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
import { GerenteSelect } from '@/components/ui/gerente-select';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useNombresStore, useVistaCentrosStore } from '@/store/nombresStore';
import { etiquetaCentro } from '@/lib/nombres';
import { ResumenSinContexto } from './ResumenSinContexto';
import { ReportPage, PageHeader, ExportButton, FilterBar, FilterSelect, CellLegend, ALTURA_TABLA, SIN_DATOS } from '@/components/layout/report';
import { SustitutosBadge } from './SustitutosBadge';
import { indiceSustitutos } from '@/core/invCondicionLibros';
import { useFaseFacturacion } from '@/modules/analytics/faseFacturacion';
import { claveMaterial } from '@/core/pedidos';

interface ResumenSinPageProps {
  /** 'disp' = el mismo módulo con el inventario de los libros de Disponibilidad (Libre − Entrega), el pendiente de
   * Seg pedidos y el consumo de Fac_Mensual_CAM. Por defecto, "Resumen Sin Sugerencias" del reporte. */
  modo?: 'sin' | 'disp';
}

export function ResumenSinPage({ modo = 'sin' }: ResumenSinPageProps = {}) {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a = useAnalytics();
  const disp = modo === 'disp';
  // Tendencia: en Inventario · Disponibilidad sale de la facturación de los libros trimestrales de Drive (carpeta de Facturación), no del Resumen_Fac del reporte.
  const rfTendencia = disp ? a.facturacion.rf : a.rf;
  // Qué falta de la facturación (leyendo caché / descargando / calculando / error) en vez de un "no cargada" mudo.
  const faseFac = useFaseFacturacion(a);
  // Prefijo de las llaves persistidas (filtros, columnas, vistas, zoom): cada modo guarda las suyas.
  const ns = disp ? 'invDisp' : 'resumenSin';
  const setFuenteRss = useRssFuenteStore((s) => s.setFuente);
  // Los paneles de detalle leen el inventario de la fuente de ESTA tabla mientras está abierta.
  useEffect(() => {
    setFuenteRss(disp ? 'disp' : 'sin');
    return () => setFuenteRss('sin');
  }, [disp, setFuenteRss]);
  const open = usePanelStore((s) => s.open);
  const [q, setQ] = usePersistedState(`${ns}.q`, '');
  const [centroFiltro, setCentroFiltro] = usePersistedState(`${ns}.centro`, '');
  const [gerente, setGerente] = usePersistedState(`${ns}.gerente`, '');
  const [quick, setQuick] = useQuickFilters(`${ns}.quick`);
  const [pendFiltro, setPendFiltro] = usePersistedState<'' | 'con' | 'sin'>(`${ns}.pend`, '');
  const [lentoFiltro, setLentoFiltro] = usePersistedState<'' | 'con' | 'sin'>(`${ns}.lento`, '');
  const [transitoFiltro, setTransitoFiltro] = usePersistedState<'' | 'con' | 'sin'>(`${ns}.transito`, '');
  const [coberturaFiltro, setCoberturaFiltro] = usePersistedState<'' | CoberturaEstado>(`${ns}.cobertura`, '');
  // Mostrar/ocultar los badges de estado (Quiebre, Exceso, Inmovilizado…) en las celdas.
  const [mostrarEstados, setMostrarEstados] = usePersistedState<boolean>(`${ns}.mostrarEstados`, true);
  // "Pegar materiales" estilo SAP — filtro ADITIVO: no toca ninguno de los
  // filtros de arriba, solo acota la lista a los códigos pegados (si hay alguno).
  const [pasteCodes, setPasteCodes] = usePersistedState<string[]>(`${ns}.pasteCodes`, []);
  const nombresCentros = useNombresStore((s) => s.centros);
  const mostrarNombres = useVistaCentrosStore((s) => s.mostrarNombres);
  const setMostrarNombres = useVistaCentrosStore((s) => s.setMostrarNombres);
  const lblCentro = (c: string) => etiquetaCentro(c, nombresCentros, mostrarNombres);
  const zoom = useZoom(`${ns}_zoom`);
  const clearFilters = () => {
    setQ(''); setGerente(''); setCentroFiltro(''); setQuick([]); setPendFiltro(''); setLentoFiltro(''); setTransitoFiltro(''); setCoberturaFiltro(''); setPasteCodes([]);
  };
  const rss = disp ? a.rssDisp : a.rss;
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
    // Inventario · Disponibilidad: la condición Revision sale de la pestaña Revision de los libros (status unidos con "/", p. ej. "Liz/Lento mov").
    if (disp) {
      const r = a.revisionLibros.get(claveMaterial(mo.material));
      if (r) s.add(r);
      return s;
    }
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
    { key: 'tendencia', label: 'Tendencia', get: (mo) => tendenciaTexto(serieMaterial(rfTendencia, mo.material)).txt },
    { key: 'status', label: 'Status Revisión', getMany: (mo) => [...statusSetOf(mo)] },
    { key: 'centro', label: 'Centro', getMany: (mo) => [...mo.centros.keys()] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [a.enrich, rfTendencia, a.revisionLibros, disp]);

  const list = useMemo(() => {
    if (!rss) return [];
    return [...rss.mats.values()].filter((mo) => {
      if (qd && !matchesQuery(qd, `${mo.material} ${mo.desc} ${a.enrich.matSector(mo.material)} ${a.enrich.matGrupo(mo.material)}`)) return false;
      if (gerente && !a.enrich.sectorDeGerente(a.enrich.matSector(mo.material), gerente)) return false;
      if (!passesFilters(mo, filterCols, quick)) return false;
      if (pendFiltro === 'con' && !anyCentro(mo, (co) => co.pend > 0)) return false;
      if (pendFiltro === 'sin' && anyCentro(mo, (co) => co.pend > 0)) return false;
      if (lentoFiltro === 'con' && !anyCentro(mo, (co) => esLento(co, rss.curMes))) return false;
      if (lentoFiltro === 'sin' && anyCentro(mo, (co) => esLento(co, rss.curMes))) return false;
      if (transitoFiltro === 'con' && !anyCentro(mo, (co) => co.transito > 0)) return false;
      if (transitoFiltro === 'sin' && anyCentro(mo, (co) => co.transito > 0)) return false;
      if (coberturaFiltro && !anyCentro(mo, (co) => peorCobertura(co) === coberturaFiltro)) return false;
      if (!matchesCodes(pasteCodes, mo.material)) return false;
      return true;
    });
  }, [rss, qd, a.enrich, gerente, filterCols, quick, pendFiltro, lentoFiltro, transitoFiltro, coberturaFiltro, pasteCodes]);

  const statusMat = (mo: RSSMaterial) => [...statusSetOf(mo)].join(', ');
  const sortAcc = useMemo(() => ({
    material: (mo: (typeof list)[number]) => mo.material,
    um: (mo: (typeof list)[number]) => a.enrich.matUm(mo.material),
    sector: (mo: (typeof list)[number]) => a.enrich.matSector(mo.material),
    status: (mo: (typeof list)[number]) => statusMat(mo),
    invtot: (mo: (typeof list)[number]) => [...mo.centros.values()].reduce((s, co) => s + invGen(co), 0),
    pendtot: (mo: (typeof list)[number]) => [...mo.centros.values()].reduce((s, co) => s + co.pend, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list, a.enrich]);
  const { sorted, sortKey, dir, toggleSort } = useSort(list, sortAcc);
  const { scrollRef, virtualizer, items, paddingTop, paddingBottom, measureElement } = useRowVirtualizer(sorted.length);
  // Sustitutos (solo con libros): ⇄ junto al código; "ir a fila" salta a la fila y la resalta unos segundos.
  const sustitutos = useMemo(() => (disp ? indiceSustitutos(a.sustitucionesLibros) : null), [disp, a.sustitucionesLibros]);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const [irA, setIrA] = useState<string | null>(null);
  const filaDe = useCallback((material: string) => sorted.findIndex((m) => m.material === material), [sorted]);
  const irAFila = useCallback((material: string) => {
    const i = filaDe(material);
    if (i === -1) return false;
    // Las filas miden distinto a lo estimado: se salta al índice y, en cuanto la fila real existe en el DOM, se centra con precisión.
    virtualizer.scrollToIndex(i, { align: 'center' });
    let intentos = 0;
    const centrar = () => {
      const el = scrollRef.current?.querySelector(`tr[data-material="${CSS.escape(material)}"]`);
      if (el) { el.scrollIntoView({ block: 'center' }); return; }
      if (++intentos < 30) requestAnimationFrame(centrar);
    };
    requestAnimationFrame(centrar);
    setResaltado(material);
    window.setTimeout(() => setResaltado((r) => (r === material ? null : r)), 2500);
    return true;
  }, [filaDe, virtualizer, scrollRef]);
  // Tras "Quitar filtros e ir": cuando la lista ya trae el material, se salta a él.
  useEffect(() => {
    if (irA && irAFila(irA)) setIrA(null);
  }, [irA, irAFila]);
  // Materiales en el orden/filtro de la tabla: base de ◀/▶ en el detalle de celda.
  const listaMateriales = useMemo(() => sorted.map((m) => m.material), [sorted]);

  const colVis = useColumnVisibility(`${ns}_columnas`);
  const columnDefs: ColDef[] = useMemo(
    () => (rss ? rss.centros.map((c) => ({ key: `centro_${c}`, label: `Centro ${lblCentro(c)}` })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rss, nombresCentros, mostrarNombres],
  );
  const savedViews = useSavedViews<{ quick: ActiveFilter[]; centroFiltro: string; pendFiltro: typeof pendFiltro; lentoFiltro: typeof lentoFiltro; transitoFiltro: typeof transitoFiltro; coberturaFiltro: typeof coberturaFiltro; hidden: string[]; pasteCodes?: string[] }>(`${ns}_vistas`);
  const applyView = (state: { quick: ActiveFilter[]; centroFiltro: string; pendFiltro: typeof pendFiltro; lentoFiltro: typeof lentoFiltro; transitoFiltro: typeof transitoFiltro; coberturaFiltro: typeof coberturaFiltro; hidden: string[]; pasteCodes?: string[] }) => {
    setQuick(state.quick); setCentroFiltro(state.centroFiltro); setPendFiltro(state.pendFiltro);
    setLentoFiltro(state.lentoFiltro); setTransitoFiltro(state.transitoFiltro); setCoberturaFiltro(state.coberturaFiltro);
    setPasteCodes(state.pasteCodes ?? []);
    colVis.apply(state.hidden);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { quick, centroFiltro, pendFiltro, lentoFiltro, transitoFiltro, coberturaFiltro, hidden: [...colVis.hidden], pasteCodes });

  if (!rss) {
    if (!bootstrapped) return <TableSkeleton />;
    if (disp) return <EmptyState title={SIN_DATOS.inventario.title} description={SIN_DATOS.inventario.description} action={{ to: SIN_DATOS.inventario.to, label: SIN_DATOS.inventario.label }} />;
    return <EmptyState title={'No se cargó la hoja "Resumen Sin Sugerencias".'} action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const centrosAll = rss.centros;
  // Always-visible: 1031 stays regardless of the toggle; toggle picks which other centro(s) show.
  const centros = (centroFiltro ? centrosAll.filter((c) => c === '1031' || c === centroFiltro) : centrosAll)
    .filter((c) => colVis.isVisible(`centro_${c}`));
  const colCount = 7 + centros.length;
  // El panel lateral de inventario respeta el filtro de centro / columnas
  // ocultas de esta tabla; sin filtros muestra todos los centros.
  const centrosVisibles = centroFiltro || centros.length < centrosAll.length ? centros : undefined;

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
          Material: mo.material, UM: a.enrich.matUm(mo.material), Descripción: mo.desc, Centro: centro, 'Nombre centro': nombresCentros[centro] || '',
          'Inv. general (1030+1031+1060)': ig, Pendiente: co.pend, 'En tránsito': co.transito,
          Lento: esLento(co, rss.curMes) ? 'Sí' : '',
          Cobertura: coberturaTxt,
          Sector: a.enrich.matSector(mo.material) || '', 'Grupo art.': a.enrich.matGrupo(mo.material) || '',
        });
      });
    });
    const lotesX = buildLotesSheet(a.lotes, (l) => pares.has(loteKey(l.material, l.centro)));
    void exportXlsxMultiSheet(`${disp ? 'inventario_disponibilidad' : 'resumen_sin_sugerencias'}_${stamp()}.xlsx`, [
      { name: 'ResumenSinSug', rows: out },
      { name: 'Detalle Lotes', rows: lotesX },
    ]);
  };

  return (
    <ReportPage>
      <PageHeader
        title={disp ? 'Inventario · Disponibilidad' : 'Inventario'}
        subtitle={`${formatNumber(sorted.length)} de ${formatNumber(rss.mats.size)} materiales · pivote material × centro · inventario general (1030+1031+1060)`}
        actions={(
          <>
            <ColumnVisibilityControl columns={columnDefs} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
            <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
            <ExportButton onClick={exportar} />
          </>
        )}
      />

      <ResumenSinContexto
        list={list}
        a={a}
        lblCentro={lblCentro}
        coberturaFiltro={coberturaFiltro}
        onCobertura={setCoberturaFiltro}
        onMaterial={(material) => open({ type: 'material', material })}
        onSector={(sector) => open({ type: 'sector', sector })}
      />

      <FilterBar
        search={(
          <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
            <Input placeholder="Buscar material…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
        )}
        onClear={clearFilters}
        zoom={<ZoomControl level={zoom.level} setLevel={zoom.setLevel} />}
        chips={pasteCodes.length > 0 ? <PasteCodesChip value={pasteCodes} onChange={setPasteCodes} label="material" /> : undefined}
        columnFilters={(
          <>
            <ColumnFilterBar columns={filterCols} rows={list} active={quick} onChange={setQuick} />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted" title="Muestra el nombre de cada centro junto al código (los nombres se configuran en Administración → Nombres).">
              <input type="checkbox" checked={mostrarNombres} onChange={(e) => setMostrarNombres(e.target.checked)} className="size-3.5 accent-accent" />
              Mostrar nombres de centro
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted" title="Muestra u oculta los estados (Quiebre, Exceso, Inmovilizado…) debajo del inventario y el pendiente de cada celda.">
              <input type="checkbox" checked={mostrarEstados} onChange={(e) => setMostrarEstados(e.target.checked)} className="size-3.5 accent-accent" />
              Mostrar estados
            </label>
            <TooltipHint text={`${COBERTURA_HELP.quiebre} · ${COBERTURA_HELP.inmovilizado} · ${COBERTURA_HELP.exceso} · ${COBERTURA_HELP.sano} · ${COBERTURA_HELP.aceptable} · Centro 1031 (hub de distribución) queda excluido de estos estados.`}>
              <button type="button" className="text-xs text-text-faint underline decoration-dotted underline-offset-2 hover:text-text">¿Qué significa cada estado?</button>
            </TooltipHint>
            <CellLegend>Celda = inv. del centro · <span className="text-danger">Pend</span> pendiente · <AlertTriangle className="inline size-3 text-warning" /> lento (≥6m sin mov.)</CellLegend>
          </>
        )}
      >
        <GerenteSelect enrich={a.enrich} value={gerente} onChange={setGerente} />
        <FilterSelect
          value={centroFiltro}
          onChange={setCentroFiltro}
          todos="Centro (todos)"
          options={centrosAll.filter((c) => c !== '1031').map((c) => ({ value: c, label: `Solo Centro ${lblCentro(c)} (+1031)` }))}
        />
        <FilterSelect value={pendFiltro} onChange={setPendFiltro} todos="Pendiente (todos)" options={[{ value: 'con', label: 'Con pendiente' }, { value: 'sin', label: 'Sin pendiente' }]} />
        <FilterSelect value={lentoFiltro} onChange={setLentoFiltro} todos="Lento (todos)" options={[{ value: 'con', label: 'Solo lento' }, { value: 'sin', label: 'Sin lento' }]} />
        <FilterSelect value={transitoFiltro} onChange={setTransitoFiltro} todos="En tránsito (todos)" options={[{ value: 'con', label: 'Con tránsito' }, { value: 'sin', label: 'Sin tránsito' }]} />
        <FilterSelect
          value={coberturaFiltro}
          onChange={setCoberturaFiltro}
          todos="Cobertura (todas)"
          title="Peor cobertura entre los almacenes de cada centro (no incluye Centro 1031)"
          options={[{ value: 'quiebre', label: COBERTURA_LABEL.quiebre }, { value: 'inmovilizado', label: COBERTURA_LABEL.inmovilizado }, { value: 'exceso', label: COBERTURA_LABEL.exceso }, { value: 'sano', label: COBERTURA_LABEL.sano }]}
        />
        <PasteCodesFilter value={pasteCodes} onChange={setPasteCodes} label="material" />
      </FilterBar>

      <Card className={`${ALTURA_TABLA} shrink-0 overflow-hidden`}>
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[0]} rows={list} active={quick} onChange={setQuick} />}>Material</SortableTableHead>
                <SortableTableHead sortKey="um" activeKey={sortKey} dir={dir} onSort={toggleSort} title="Unidad de medida del catálogo (pestaña Materiales).">UM</SortableTableHead>
                <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[2]} rows={list} active={quick} onChange={setQuick} />}>Sector/Grupo</SortableTableHead>
                <TableHead title="Compara la facturación de los últimos 3 meses completos vs. los 3 anteriores: En aumento (+10%), En decremento (-10%) o Estable.">Tendencia</TableHead>
                <SortableTableHead sortKey="status" activeKey={sortKey} dir={dir} onSort={toggleSort} filter={<ColumnFilterMenu column={filterCols[5]} rows={list} active={quick} onChange={setQuick} />} title="Estatus de revisión reportado por el centro para este material.">Status Revisión</SortableTableHead>
                {centros.map((c) => <TableHead key={c} className="text-right" title={`Inventario general (1030+1031+1060) de este material en el centro ${c}. El ícono ⚠ indica "lento" (≥6 meses sin movimiento) y "+N" indica cantidad en tránsito.`}>C {c}{mostrarNombres && nombresCentros[c] && <div className="text-[11px] font-normal text-text-faint">{nombresCentros[c]}</div>}</TableHead>)}
                <SortableTableHead sortKey="invtot" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Suma del inventario general de este material en todos los centros.">Inv. total</SortableTableHead>
                <SortableTableHead sortKey="pendtot" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Suma de la cantidad pendiente de este material en todos los centros.">Pend. total</SortableTableHead>
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
                const sustMat = sustitutos?.get(mo.material);
                return (
                  <TableRow key={mo.material} ref={measureElement} data-index={vi.index} data-material={mo.material} className={resaltado === mo.material ? 'bg-accent/25! [&>td]:bg-accent/25! outline outline-2 -outline-offset-2 outline-accent' : undefined}>
                    <TableCell><Chip onClick={() => open({ type: 'material', material: mo.material })}>{mo.material}</Chip>{sustMat && (
                      <SustitutosBadge
                        info={sustMat}
                        visible={(m) => filaDe(m) !== -1}
                        existe={(m) => rss?.mats.has(m) ?? false}
                        onIr={irAFila}
                        onQuitarFiltrosEIr={(m) => { clearFilters(); setIrA(m); }}
                        onDetalle={(m) => open({ type: 'material', material: m })}
                      />
                    )}<div className="text-[11px] text-text-faint max-w-64 truncate">{mo.desc}</div>{a.enrich.matPrecioOferta(mo.material) > 0 && <div className="text-[10px] text-text">Of. {formatCurrency(a.enrich.matPrecioOferta(mo.material))}</div>}</TableCell>
                    <TableCell>{a.enrich.matUm(mo.material) || '—'}</TableCell>
                    <TableCell>{a.enrich.matSector(mo.material) || '—'}<div className="text-[11px] text-text-faint">{a.enrich.matGrupo(mo.material)}</div></TableCell>
                    <TableCell>{disp && !rfTendencia
                      ? <span className="text-[11px] italic text-text-faint" title="La tendencia sale de la facturación de los libros de Drive (carpeta de Facturación). Sincroniza Facturación desde Carga si no se carga sola.">{faseFac.texto}</span>
                      : <TrendBadge t={tendenciaTexto(serieMaterial(rfTendencia, mo.material))} />}</TableCell>
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
                          label={`${mo.material} · Centro ${lblCentro(c)}`}
                          onVerDetalle={() => open({ type: 'celda', material: mo.material, centro: c, origen: 'resumenSin', centrosVisibles, lista: listaMateriales })}
                          copyItems={copyItems}
                        >
                        <TableCell className="text-right">
                          <Chip onClick={() => open({ type: 'celda', material: mo.material, centro: c, origen: 'resumenSin', centrosVisibles, lista: listaMateriales })}>{formatNumber(ig)}</Chip>
                          {co.transito > 0 && <span className="text-success"> +{formatNumber(co.transito)}</span>}
                          {esLento(co, rss.curMes) && <span title="Lento: sin movimiento hace ≥6 meses y sin pendiente en este centro."><AlertTriangle className="ml-1 inline size-3 text-warning" /></span>}
                          {co.pend > 0 && <div className="text-[11px] text-danger">Pend {formatNumber(co.pend)}</div>}
                          {mostrarEstados && showCoberturaBadge && (
                            <div className="mt-0.5">
                              <TooltipHint text={mitigado ? COBERTURA_HELP_TRANSITO : peor ? COBERTURA_HELP[peor] : ''}>
                                <span className="inline-block"><StatePill label={coberturaLabel} cls={coberturaCls} /></span>
                              </TooltipHint>
                            </div>
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
    </ReportPage>
  );
}
