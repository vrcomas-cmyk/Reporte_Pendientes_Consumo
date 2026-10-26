import { useEffect, useMemo, useState } from 'react';
import { useFaseFacturacion } from '@/modules/analytics/faseFacturacion';
import { useFacFuenteStore } from '@/store/facFuenteStore';
import { conFacturacion } from '@/modules/analytics/facturacionAnalytics';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useDataStore } from '@/store/dataStore';
import { useSort } from '@/hooks/useSort';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, TrendBadge, AbcBadge, ClienteOportunidadBadge, Chip, EvolChart, ZoomControl, useZoom, ColumnFilterBar, passesFilters, DebouncedSearch, useColumnVisibility, ColumnVisibilityControl, useSavedViews, SavedViewsControl, MonthRangeFilter, PasteCodesFilter, PasteCodesChip, matchesCodes, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { dateSortValue, isoToMesKey } from '@/lib/fechas';
import { COLS_CONSUMO } from './columns';
import { usePromedioModo, promedioDeFila } from './usePromedioModo';
import { PROMEDIO_MODOS } from '@/core/consumoDesdeRF';
import { ESTADOS, auditoriaFacturacion, mesKey, mesLabel, clasificarEstado, tendenciaTexto, mesRefQAnterior, mesAnterior, hoyMes, type Serie, type Estado, type Tendencia } from '@/core/resumenFac';
import { norm, num, searchNorm, consumoEnrich, consumoSerie, serieFacturada, matchesQueryNormalized } from '@/modules/analytics/helpers';
import type { ConsumoRow } from '@/core/types';
import { buildFromConsumo } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useMaterialPrefiltro } from '@/hooks/useMaterialPrefiltro';
import { PrefiltroBanner } from '@/components/feedback/PrefiltroBanner';
import { GerenteSelect } from '@/components/ui/gerente-select';
import { usePersistedState } from '@/hooks/usePersistedState';
import { buildAbcPares, clavePar, type AbcClass } from '@/core/abc';
import { buildPrecioDispersion } from '@/core/precios';
import type { NivelFac, RenglonFac } from '@/core/facPorNivel';
import { FacPorNivel } from './FacPorNivel';
import { ReportPage, PageHeader, ExportButton, FilterBar, FilterSelect, SegmentedControl, ComparisonCard, KpiBand, ResumenColapsable, CollapsibleCard, CalculandoIndices, ALTURA_TABLA, SIN_DATOS } from '@/components/layout/report';
import { etiquetaMes, resumirMeses } from '@/core/mesesSeleccion';
import { MonthSetFilter } from '@/modules/analytics/ui/MonthSetFilter';
import { useQuickFilters } from '@/hooks/useQuickFilters';
import { useGruposExcluidos } from '@/hooks/useGruposPorDefecto';
import { gruposPorDefecto } from '@/lib/gruposCliente';

// Inversa de mesKey (año*12+mes) -> 'mm/aaaa'.
const kToMes = (k: number) => String(((k - 1) % 12) + 1).padStart(2, '0') + '/' + Math.floor((k - 1) / 12);

// #2: combined date+qty cell, same pattern as the existing "Última" column.
function fechaCantCell(fecha: string, cant: number) {
  if (!fecha && !cant) return '—';
  return <div>{formatNumber(cant)}<div className="text-[11px] text-text-faint">{fecha ? etiquetaMes(fecha) : '—'}</div></div>;
}

/** `modo='fac'`: el módulo "Facturación" — la misma página, con el consumo y la facturación de los libros trimestrales de Drive
 * y sus propios filtros/vistas guardados (prefijo `facturacion`). */
export function ConsumoPage({ modo = 'rep' }: { modo?: 'rep' | 'fac' } = {}) {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a0 = useAnalytics();
  const faseFac = useFaseFacturacion(a0);
  const fac = modo === 'fac';
  const ns = fac ? 'facturacion' : 'consumo';
  const setFacActivo = useFacFuenteStore((s) => s.setActivo);
  // Los paneles de detalle leen la fuente de ESTA tabla mientras está abierta (ver PanelHost).
  useEffect(() => {
    setFacActivo(fac);
    return () => setFacActivo(false);
  }, [fac, setFacActivo]);
  const a = useMemo(() => (fac ? conFacturacion(a0) : a0), [a0, fac]);
  const open = usePanelStore((s) => s.open);
  const rows = a.result?.consumo ?? [];
  // Perf: memoize on catalog identity. `ce` is a dep of filterCols/sortAcc/
  // rankSector/grupos — a fresh object each render defeated those useMemos and
  // forced the ~80k-row sector/grupo aggregations to recompute on every render
  // (zoom, periodo toggle, panel open, row hover).
  const ce = useMemo(() => consumoEnrich(a.enrich), [a.enrich]);
  const [q, setQ] = usePersistedState(`${ns}.q`, ''); // committed (debounced) query; input state lives in DebouncedSearch
  const { prefiltro, clear: clearPrefiltro } = useMaterialPrefiltro(setQ);
  const [estado, setEstado] = usePersistedState(`${ns}.estado`, '');
  const [clase, setClase] = usePersistedState(`${ns}.clase`, '');
  const [gerente, setGerente] = usePersistedState(`${ns}.gerente`, '');
  const claseDe = (r: ConsumoRow) => a.abc.classByMaterial.get(norm(r.material)) || '';
  // Facturación: qué ABC ver — del material, de la combinación cliente-material o las dos.
  const [abcVistaGuardada, setAbcVista] = usePersistedState<'material' | 'par' | 'ambas'>(`${ns}.abcVista`, 'material');
  const vistaAbc: 'material' | 'par' | 'ambas' = fac ? abcVistaGuardada : 'material';
  // En Facturación el ABC de cada combinación llega precalculado (por el contexto); sin él (Consumo) se arma aquí.
  const abcParesFac = fac ? a.facturacion.abcPares : null;
  const abcPares = useMemo(() => abcParesFac ?? (fac ? buildAbcPares(a.rf, rows) : new Map<string, AbcClass>()), [abcParesFac, fac, a.rf, rows]);
  const clasePar = (r: ConsumoRow) => abcPares.get(clavePar(r.destinatario, r.material)) || '';
  /** El filtro de clase aplica a la vista elegida; con las dos, coincide si cualquiera de las dos es esa clase. */
  const claseCoincide = (r: ConsumoRow, c: string) => (vistaAbc === 'ambas' ? claseDe(r) === c || clasePar(r) === c : (vistaAbc === 'par' ? clasePar(r) : claseDe(r)) === c);
  const [quickGuardado, setQuickGuardado] = useQuickFilters(`${ns}.quick`);
  // Grupo cliente: filtro SIEMPRE activo con "todos menos los grupos excluidos en
  // Administración → Filtros" (18 = GOBIERNO) por defecto en cada entrada al módulo. Mientras no se toque (`grupoTocado` = false) el
  // chip se inyecta aquí sobre lo guardado — lo persistido/URL de una visita
  // anterior no cuenta, así un grupo excluido solo aparece si se elige a mano. Un link
  // con `?f=…grupocli…` explícito sí se respeta.
  const grupoOpciones = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) { const g = ce.grupoCli(r); if (g) s.add(g); }
    return [...s].sort();
  }, [rows, ce]);
  const gruposExcluidos = useGruposExcluidos();
  const grupoDefault = useMemo(() => gruposPorDefecto(grupoOpciones, gruposExcluidos), [grupoOpciones, gruposExcluidos]);
  const [grupoTocado, setGrupoTocado] = useState(() => /[?&]f=[^&]*grupocli/.test(window.location.search));
  const quick = useMemo<ActiveFilter[]>(
    () => (grupoTocado || !grupoDefault.length
      ? quickGuardado
      : [{ col: 'grupocli', values: grupoDefault }, ...quickGuardado.filter((f) => f.col !== 'grupocli')]),
    [quickGuardado, grupoTocado, grupoDefault],
  );
  const setQuick = (v: ActiveFilter[]) => {
    if (!grupoTocado && grupoDefault.length) {
      const g = v.find((f) => f.col === 'grupocli');
      // Sin cambios en el grupo: se guarda sin el chip (sigue siendo el default).
      if (g && g.values.length === grupoDefault.length && g.values.every((x) => grupoDefault.includes(x))) {
        setQuickGuardado(v.filter((f) => f.col !== 'grupocli'));
        return;
      }
      setGrupoTocado(true);
    }
    setQuickGuardado(v);
  };
  // Meses ('mm/aaaa') de Resumen de Facturación que acotan el periodo
  // visualizado — no una fecha real, los datos de facturación no tienen día.
  const [periodoMesesRango, setPeriodoMeses] = usePersistedState<{ desde: string; hasta: string }>(`${ns}.periodoMeses`, { desde: '', hasta: '' });
  // Facturación: el periodo es una selección de meses (uno, un rango o periodos saltados); Consumo conserva desde/hasta.
  const [periodoSet, setPeriodoSet] = usePersistedState<string[]>(`${ns}.periodoSet`, []);
  const mesesSel = useMemo(() => (fac && periodoSet.length ? new Set(periodoSet.map(mesKey).filter((k) => k > 0)) : null), [fac, periodoSet]);
  const periodoMeses = useMemo(() => {
    if (!fac) return periodoMesesRango;
    const ordenados = [...periodoSet].sort((x, y) => mesKey(x) - mesKey(y));
    return { desde: ordenados[0] ?? '', hasta: ordenados[ordenados.length - 1] ?? '' };
  }, [fac, periodoSet, periodoMesesRango]);
  const [gruposOpen, setGruposOpen] = useState(false);
  const [periodo, setPeriodo] = usePersistedState<'corriente' | 'anterior'>(`${ns}.periodo`, 'corriente');
  const [promedioModo, setPromedioModo] = usePromedioModo();
  const [cuadreOpen, setCuadreOpen] = useState(false);
  // Filtro por el mes/año de la última compra: operador (≤, ≥, <, >, =) + mes.
  const [ultOp, setUltOp] = useState<'<=' | '>=' | '<' | '>' | '='>('<=');
  const [ultMes, setUltMes] = useState('');
  const [clearTick, setClearTick] = useState(0);
  // "Pegar materiales" estilo SAP — aditivo, no toca los filtros de arriba.
  const [pasteCodes, setPasteCodes] = usePersistedState<string[]>(`${ns}.pasteCodes`, []);
  const clearFilters = () => {
    setQ(''); setEstado(''); setClase(''); setGerente(''); setGrupoTocado(false); setQuickGuardado([]); setPeriodoMeses({ desde: '', hasta: '' }); setPeriodoSet([]); setPasteCodes([]);
    setClearTick((n) => n + 1);
  };
  const colVis = useColumnVisibility(`${ns}_columnas`);
  const vis = colVis.isVisible;
  const zoom = useZoom(`${ns}_zoom`);

  // Vistas guardadas: snapshot de estado + filtros rápidos, persistido entre sesiones.
  const savedViews = useSavedViews<{ estado: string; clase: string; quick: ActiveFilter[]; pasteCodes?: string[] }>(`${ns}_vistas`);
  const applyView = (state: { estado: string; clase?: string; quick: ActiveFilter[]; pasteCodes?: string[] }) => {
    setEstado(state.estado); setClase(state.clase ?? ''); setQuick(state.quick); setPasteCodes(state.pasteCodes ?? []);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { estado, clase, quick, pasteCodes });
  const solicitar = useSolicitarDialog();
  const solicitudSourceKeys = useSolicitudStore((s) => s.sourceKeys);

  // Perf: Estado/Tendencia previously recomputed consumoSerie() TWICE per row
  // (once each in consumoStatus/consumoTend) every time it was needed — inline,
  // in the KPI count, in the estado filter, and per visible row on every
  // render. At ~80k rows that's the single biggest cost in this view. Compute
  // it once per row here (indexed by row identity, memoized on data + catalog
  // identity) and read from the index everywhere else.
  const estadosFac = fac ? a.facturacion.estados : null;
  const statusIndex = useMemo(() => {
    if (estadosFac) return estadosFac; // Facturación: precalculado por tramos
    const m = new Map<ConsumoRow, { status: Estado; tend: Tendencia; meses: number[] }>();
    for (const r of rows) {
      const serie = consumoSerie(a.rf, r);
      // Meses (escala mesKey) en los que esta fila REALMENTE facturó — base
      // del filtro de periodo, que es por mes/año y sale de Resumen de
      // Facturación, no de un campo de fecha con día.
      const meses: number[] = [];
      for (const p of serie) {
        if (!p.cant && !p.imp) continue;
        const k = mesKey(p.mes);
        if (k) meses.push(k);
      }
      m.set(r, { status: clasificarEstado(serie.length ? serie : null, false), tend: tendenciaTexto(serie), meses });
    }
    return m;
  }, [rows, a.rf, estadosFac]);
  const statusOf = (r: ConsumoRow) => statusIndex.get(r) ?? { status: clasificarEstado(null, false), tend: tendenciaTexto([]), meses: [] as number[] };

  // Perf: precompute each row's lowercased/accent-stripped searchable text
  // once, instead of building the concat string + re-normalizing it on every
  // filter pass (i.e. every keystroke) across ~80k rows.
  const searchIndex = useMemo(() => {
    const m = new Map<ConsumoRow, string>();
    for (const r of rows) m.set(r, searchNorm(`${r.material} ${r.textoMaterial} ${r.razonSocial} ${r.solicitante} ${r.destinatario}`));
    return m;
  }, [rows]);

  const filterCols: FilterColumn<ConsumoRow>[] = useMemo(() => [
    { key: 'cliente', label: 'Cliente (razón social)', get: (r) => r.razonSocial },
    { key: 'solicitante', label: 'Solicitante', get: (r) => r.solicitante },
    { key: 'destinatario', label: 'Destinatario', get: (r) => r.destinatario },
    { key: 'material', label: 'Material', get: (r) => r.material },
    { key: 'grupocli', label: 'Grupo cliente', get: (r) => ce.grupoCli(r) },
    { key: 'ejecutivo', label: 'Ejecutivo', get: (r) => ce.ejec(r) },
    { key: 'centro', label: 'Centro', get: (r) => r.centro },
    { key: 'sector', label: 'Sector', get: (r) => ce.sector(r) },
    // #3: Sector and Grupo artículo share one visual cell — each field still
    // needs its own independent filter entry.
    { key: 'grupoart', label: 'Grupo artículo', get: (r) => ce.grupoArt(r) },
    { key: 'estado', label: 'Estado', get: (r) => statusOf(r).status.label },
    { key: 'tendencia', label: 'Tendencia', get: (r) => statusOf(r).tend.txt },
    { key: 'abc', label: vistaAbc === 'par' ? 'Clase ABC (cliente-material)' : 'Clase ABC', get: (r) => (vistaAbc === 'par' ? clasePar(r) : claseDe(r)) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [ce, statusIndex, a.abc]);

  // Rango del filtro de periodo, en la misma escala que mesKey (año*12+mes) —
  // cuando está activo, acota tanto las filas (por meses con movimiento real
  // en statusIndex) como las ventanas de las agregaciones mensuales de abajo
  // (aggSerie/rankMat/rankSector/grupos), en vez de la ventana fija "últimos
  // N meses desde hoy".
  const rangoLoK = useMemo(() => (periodoMeses.desde ? mesKey(periodoMeses.desde) : null), [periodoMeses.desde]);
  const rangoHiK = useMemo(() => (periodoMeses.hasta ? mesKey(periodoMeses.hasta) : null), [periodoMeses.hasta]);
  const rangoActivo = rangoLoK != null || rangoHiK != null;
  const rangoPromedio = useMemo(() => ({ lo: rangoLoK, hi: rangoHiK, meses: mesesSel }), [rangoLoK, rangoHiK, mesesSel]);
  // Ventana de los rankings/promedios: con periodo activo, ese rango; si no, los
  // 12 meses COMPLETOS hasta el mes anterior a hoy (igual que Análisis y los
  // paneles) — no incluye el mes en curso parcial.
  const ventana = useMemo(() => {
    const refK = mesKey(mesAnterior(hoyMes()));
    const lo = rangoActivo ? (rangoLoK ?? -Infinity) : refK - 11;
    const hi = rangoActivo ? (rangoHiK ?? Infinity) : refK;
    const nMeses = mesesSel ? Math.max(1, mesesSel.size) : rangoActivo && rangoLoK != null && rangoHiK != null ? Math.max(1, rangoHiK - rangoLoK + 1) : 12;
    const etiqueta = mesesSel ? resumirMeses(periodoSet) : rangoActivo
      ? `${rangoLoK != null ? mesLabel(periodoMeses.desde) : 'inicio'} – ${rangoHiK != null ? mesLabel(periodoMeses.hasta) : 'último mes'}`
      : `${mesLabel(kToMes(refK - 11))} – ${mesLabel(kToMes(refK))}`;
    return { lo, hi, nMeses, etiqueta };
  }, [rangoActivo, rangoLoK, rangoHiK, periodoMeses.desde, periodoMeses.hasta, mesesSel, periodoSet]);

  const pasaFiltros = (r: ConsumoRow): boolean => {
    if (estado && statusOf(r).status.key !== estado) return false;
    if (clase && !claseCoincide(r, clase)) return false;
    if (gerente && !a.enrich.sectorDeGerente(ce.sector(r), gerente)) return false;
    if (!passesFilters(r, filterCols, quick)) return false;
    if (rangoActivo) {
      const meses = statusOf(r).meses;
      if (!meses.some((k) => (mesesSel ? mesesSel.has(k) : (rangoLoK == null || k >= rangoLoK) && (rangoHiK == null || k <= rangoHiK)))) return false;
    }
    if (q) {
      const hay = searchIndex.get(r) ?? '';
      if (!matchesQueryNormalized(q, hay)) return false;
    }
    if (!matchesCodes(pasteCodes, r.material)) return false;
    if (ultKey != null) {
      const t = dateSortValue(r.ultimoMesFacturacion);
      if (t === -Infinity) return false;
      const d = new Date(t);
      const k = d.getFullYear() * 12 + d.getMonth() + 1;
      if (ultOp === '<=' ? k > ultKey : ultOp === '>=' ? k < ultKey : ultOp === '<' ? k >= ultKey : ultOp === '>' ? k <= ultKey : k !== ultKey) return false;
    }
    return true;
  };
  const ultKey = useMemo(() => isoToMesKey(ultMes ? `${ultMes}-01` : ''), [ultMes]);
  const filtered = useMemo(() => {
    return rows.filter(pasaFiltros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, estado, clase, gerente, quick, rangoActivo, rangoLoK, rangoHiK, statusIndex, searchIndex, filterCols, a.abc, pasteCodes, vistaAbc, abcPares, mesesSel, ultKey, ultOp]);
  // Universo de los AGREGADOS = las filas filtradas (Consumo ya sale de Resumen_Fac,
  // así que no hay pares de facturación fuera de la tabla).
  const filteredAgg = filtered;

  const kpis = useMemo(() => {
    const cnt = (k: string) => filtered.filter((r) => statusOf(r).status.key === k).length;
    return { corriente: cnt('corriente'), riesgo: cnt('riesgo'), reactiva: cnt('reactiva'), nueva: cnt('nueva') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, statusIndex]);

  // Hay algún filtro que acote filas (el rango de periodo se maneja aparte en aggSerie).
  const sinFiltros = !estado && !clase && !gerente && !quick.length && !q && !pasteCodes.length && !prefiltro;
  const aggSerie = useMemo<Serie>(() => {
    // Guard against outlier/corrupt month values (e.g. a mis-parsed date far in the
    // past or future) blowing out the chart's month range: when unfiltered across
    // ~80k+ rows a single bad row is statistically likely, and completarSerie() would
    // fill the whole span with zeros, drowning out the real data into an apparently
    // empty chart. Restrict aggregation to a sane window around the current period —
    // o al rango del filtro de periodo, si hay uno activo.
    const curK = mesKey(a.rf?.curmes || hoyMes());
    // Sin ningún filtro activo el total es la suma DIRECTA de Resumen_Fac
    // (`rf.total`, incluye filas sin material/cliente) — cuadra exacto con la hoja.
    if (a.rf && sinFiltros) {
      return a.rf.total.filter((p) => {
        const pk = mesKey(p.mes);
        if (!pk) return false;
        if (mesesSel) return mesesSel.has(pk);
        if (rangoActivo) return !((rangoLoK != null && pk < rangoLoK) || (rangoHiK != null && pk > rangoHiK));
        return Math.abs(pk - curK) <= 36;
      });
    }
    const seen = new Set<string>();
    const bucket = new Map<string, { mes: string; cant: number; imp: number }>();
    for (const r of filteredAgg) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const p of serieFacturada(a.rf, r)) {
        const pk = mesKey(p.mes);
        if (!pk) continue;
        if (mesesSel) {
          if (!mesesSel.has(pk)) continue;
        } else if (rangoActivo) {
          if (rangoLoK != null && pk < rangoLoK) continue;
          if (rangoHiK != null && pk > rangoHiK) continue;
        } else if (Math.abs(pk - curK) > 36) continue;
        const c = bucket.get(p.mes) || { mes: p.mes, cant: 0, imp: 0 };
        c.cant += p.cant; c.imp += p.imp; bucket.set(p.mes, c);
      }
    }
    return [...bucket.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
  }, [filteredAgg, a.rf, sinFiltros, rangoActivo, rangoLoK, rangoHiK, mesesSel]);

  // Total facturado del periodo visible: suma exacta de los mismos buckets que
  // pinta EvolChart, así el card nunca puede discrepar de la gráfica.
  const facturadoPeriodo = useMemo(() => {
    let imp = 0, cant = 0;
    for (const p of aggSerie) { imp += p.imp; cant += p.cant; }
    const desde = aggSerie.length ? mesLabel(aggSerie[0].mes) : '';
    const hasta = aggSerie.length ? mesLabel(aggSerie[aggSerie.length - 1].mes) : '';
    // Denominador del promedio: meses de CALENDARIO que abarca el periodo (no
    // solo los que tuvieron movimiento) — así un mes en cero sí "pesa" en el
    // promedio, igual que en un estado de cuenta.
    const mesesCalendario = aggSerie.length ? mesKey(aggSerie[aggSerie.length - 1].mes) - mesKey(aggSerie[0].mes) + 1 : 0;
    const promImpMes = mesesCalendario ? imp / mesesCalendario : 0;
    const promCantMes = mesesCalendario ? cant / mesesCalendario : 0;
    const promImpQ = promImpMes * 3;
    const promCantQ = promCantMes * 3;
    return { imp, cant, meses: aggSerie.length, desde, hasta, mesesCalendario, promImpMes, promCantMes, promImpQ, promCantQ };
  }, [aggSerie]);

  // #5/#6/#7: current month/quarter vs the same period one year ago, driven by
  // the actual current date (never hardcoded) and shiftable one period back
  // via the "Periodo anterior" toggle. Reuses aggSerie's already-deduped
  // month buckets so the numbers always match the chart.
  const comparativas = useMemo(() => {
    const mesMap = new Map(aggSerie.map((p) => [mesKey(p.mes), p.imp]));
    // Con un rango de periodo activo, el mes base de la comparativa es el
    // último mes cubierto por ese rango (o el más reciente con datos, si el
    // rango no fija un "hasta") — así las cards también se mueven con el filtro.
    let now = hoyMes();
    if (rangoActivo) {
      const hiK = rangoHiK ?? (aggSerie.length ? mesKey(aggSerie[aggSerie.length - 1].mes) : mesKey(now));
      const yy = Math.floor((hiK - 1) / 12), mm = ((hiK - 1) % 12) + 1;
      now = String(mm).padStart(2, '0') + '/' + yy;
    }
    const baseMes = periodo === 'anterior' ? mesAnterior(now) : now;
    const baseK = mesKey(baseMes);
    const impMesCur = mesMap.get(baseK) || 0;
    const impMesPrev = mesMap.get(baseK - 12) || 0;
    const pctMes = impMesPrev ? ((impMesCur - impMesPrev) / impMesPrev) * 100 : (impMesCur ? 100 : 0);

    const [, cy] = baseMes.split('/').map(Number);
    // El trimestre se ancla en HOY (no en baseMes): "anterior" = el trimestre
    // inmediato previo al actual (en oct-2026: Q3 vs Q3 del año anterior),
    // sin volver a restar tras haber retrocedido ya un mes.
    const [nm, ny] = now.split('/').map(Number);
    let qStartK = ny * 12 + (Math.floor((nm - 1) / 3) * 3 + 1);
    if (periodo === 'anterior') qStartK -= 3;
    let impQCur = 0, impQPrev = 0;
    for (let i = 0; i < 3; i++) { impQCur += mesMap.get(qStartK + i) || 0; impQPrev += mesMap.get(qStartK + i - 12) || 0; }
    const pctQ = impQPrev ? ((impQCur - impQPrev) / impQPrev) * 100 : (impQCur ? 100 : 0);
    const qNum = Math.floor(((qStartK - 1) % 12) / 3) + 1;
    const qYear = Math.floor((qStartK - 1) / 12);

    // #YTD: año a la fecha (enero..baseMes) vs los MISMOS meses del año
    // anterior — parcial vs parcial, no año completo vs parcial, para que la
    // comparación sea justa mientras el año en curso todavía no cierra.
    const janK = cy * 12 + 1;
    let impYtdCur = 0, impYtdPrev = 0;
    for (let k = janK; k <= baseK; k++) { impYtdCur += mesMap.get(k) || 0; impYtdPrev += mesMap.get(k - 12) || 0; }
    const pctYtd = impYtdPrev ? ((impYtdCur - impYtdPrev) / impYtdPrev) * 100 : (impYtdCur ? 100 : 0);
    const ytdLabel = `Enero–${mesLabel(baseMes)}`;

    return { baseMes, impMesCur, impMesPrev, pctMes, impQCur, impQPrev, pctQ, qLabel: `Q${qNum} ${qYear}`, impYtdCur, impYtdPrev, pctYtd, ytdLabel };
  }, [aggSerie, periodo, rangoActivo, rangoHiK]);

  // Cuadre contra Resumen_Fac: suma directa de las filas cargadas por mes vs.
  // lo que usa esta pantalla — para detectar si falta data en la carga.
  // Pesado (recorre todas las filas): solo se arma cuando se abre la sección.
  const auditoria = useMemo(() => (cuadreOpen ? auditoriaFacturacion(a.rf) : auditoriaFacturacion(null)), [a.rf, cuadreOpen]);
  const cuadreFilas = useMemo(() => {
    const usado = new Map(aggSerie.map((p) => [mesKey(p.mes), p.imp]));
    return auditoria.meses.slice(-6).map((m) => ({ ...m, usado: usado.get(mesKey(m.mes)) ?? 0 }));
  }, [auditoria, aggSerie]);

  // #18: click a month bar -> snapshot the clients that invoiced that month under the
  // currently active filters (generalizes legacy openClientesMes beyond a single material).
  const clientesDeMes = (mes: string) => {
    const seen = new Set<string>();
    const out: { razon: string; solic: string; dest: string; material: string; cant: number; imp: number }[] = [];
    for (const r of filteredAgg) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const p of serieFacturada(a.rf, r)) {
        if (p.mes === mes && (p.cant || p.imp)) {
          out.push({ razon: r.razonSocial, solic: r.solicitante, dest: r.destinatario, material: r.material, cant: p.cant, imp: p.imp });
        }
      }
    }
    return out.sort((x, y) => y.imp - x.imp);
  };

  // Dispersión de precios entre clientes distintos, para el mismo material (precio unitario vigente de cada cliente).
  const dispersionBase = useMemo(() => (fac ? buildPrecioDispersion(rows) : a.precioDispersion), [fac, rows, a.precioDispersion]);

  // Facturación promedio mensual por Gerente / Sector / Grupo de artículo / Material, con la dispersión: una fila por material del filtro actual
  // (importe y piezas facturados en la ventana); `FacPorNivel` los agrupa y desglosa.
  const renglonesFac = useMemo<RenglonFac[]>(() => {
    if (!a.rf) return [];
    const { lo, hi } = ventana;
    const seen = new Set<string>();
    const acc = new Map<string, { imp: number; cant: number }>();
    for (const r of filteredAgg) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      let sumImp = 0, sumCant = 0;
      for (const p of serieFacturada(a.rf, r)) { const mk = mesKey(p.mes); if (mk >= lo && mk <= hi) { sumImp += p.imp; sumCant += p.cant; } }
      if (sumImp) {
        const m = norm(r.material);
        const o = acc.get(m) || { imp: 0, cant: 0 };
        o.imp += sumImp; o.cant += sumCant;
        acc.set(m, o);
      }
    }
    const dispPorMat = new Map(dispersionBase.map((e) => [e.material, e]));
    const gerentePorSector = new Map<string, string>();
    const gerenteDe = (sector: string) => {
      let g = gerentePorSector.get(sector);
      if (g === undefined) { g = a.enrich.gerentes.find((x) => a.enrich.sectorDeGerente(sector, x)) ?? ''; gerentePorSector.set(sector, g); }
      return g;
    };
    return [...acc.entries()].map(([m, st]): RenglonFac => {
      const sector = a.enrich.matSector(m);
      const e = dispPorMat.get(m);
      return {
        material: m, descripcion: a.rf?.matTexto.get(m) || a.enrich.matTexto(m), gerente: gerenteDe(sector), sector, grupo: a.enrich.matGrupo(m),
        imp: st.imp, cant: st.cant,
        dispersion: e ? { spread: e.spread, precioMin: e.precioMin, precioMax: e.precioMax, clienteMin: e.clienteMin.razonSocial || e.clienteMin.destinatario, clienteMax: e.clienteMax.razonSocial || e.clienteMax.destinatario, nClientes: e.nClientes } : null,
      };
    });
  }, [filteredAgg, a.rf, a.enrich, ventana, dispersionBase]);

  // #6: nueva/reactiva counts for both the current AND the previous quarter, always
  // relative to today's date (mesRefQAnterior derives the previous-quarter reference
  // month from a.rf.curmes, so this shifts automatically as quarters roll over).
  const grupos = useMemo(() => {
    if (!a.rf || !gruposOpen) return [];
    const pairs = new Set<string>();
    // Materiales que realmente quedaron dentro de `filtered` por solicitante —
    // sin esto, `mats.forEach` de abajo sumaba TODO el histórico del
    // solicitante (cualquier material de ese grupo), aunque el usuario haya
    // filtrado a un material/cliente/sector específico.
    const matsPorSolic = new Map<string, Set<string>>();
    for (const r of filteredAgg) {
      const s = norm(r.solicitante), g = ce.grupoArt(r) || '(sin grupo)';
      if (!s) continue;
      pairs.add(s + '~~' + g);
      const set = matsPorSolic.get(s) ?? new Set<string>();
      set.add(norm(r.material));
      matsPorSolic.set(s, set);
    }
    const gsum = new Map<string, { grupo: string; nueva: number; reactiva: number; nuevaPrev: number; reactivaPrev: number; imp12: number; solics: number }>();
    const { lo, hi, nMeses } = ventana;
    const refPrev = mesRefQAnterior(a.rf.curmes);
    pairs.forEach((pk) => {
      const i = pk.indexOf('~~'), s = pk.slice(0, i), g = pk.slice(i + 2);
      const mats = a.rf!.solicMats.get(s);
      const matsFiltrados = matsPorSolic.get(s);
      if (!mats || !matsFiltrados) return;
      const bucket = new Map<string, { mes: string; cant: number; imp: number }>();
      mats.forEach((serie, mat) => {
        if ((a.enrich.matGrupo(mat) || '(sin grupo)') !== g) return;
        if (!matsFiltrados.has(norm(mat))) return;
        for (const p of serie) { const c = bucket.get(p.mes) || { mes: p.mes, cant: 0, imp: 0 }; c.imp += p.imp; c.cant += p.cant; bucket.set(p.mes, c); }
      });
      if (!bucket.size) return;
      const serie = [...bucket.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
      const st = clasificarEstado(serie, false);
      const stPrev = clasificarEstado(serie, false, refPrev);
      let impVentana = 0; serie.forEach((x) => { const mk = mesKey(x.mes); if (mk >= lo && mk <= hi) impVentana += x.imp; });
      let o = gsum.get(g);
      if (!o) { o = { grupo: g, nueva: 0, reactiva: 0, nuevaPrev: 0, reactivaPrev: 0, imp12: 0, solics: 0 }; gsum.set(g, o); }
      if (st.key === 'nueva') o.nueva++; else if (st.key === 'reactiva') o.reactiva++;
      if (stPrev.key === 'nueva') o.nuevaPrev++; else if (stPrev.key === 'reactiva') o.reactivaPrev++;
      o.imp12 += impVentana / nMeses * 12; o.solics++; // columna se etiqueta "Fact. 12m" — se anualiza para que siga comparable con nMeses distinto de 12
    });
    return [...gsum.values()].filter((x) => x.nueva || x.reactiva || x.nuevaPrev || x.reactivaPrev).sort((x, y) => y.nueva + y.reactiva - (x.nueva + x.reactiva));
  }, [filteredAgg, a.rf, ce, ventana, gruposOpen]);

  // Snapshot de lo que ve el ranking al hacer click: pares destinatario+material
  // de las filas filtradas (opcionalmente acotadas por sector/material) + ventana.
  /** Clic en una fila de «Facturación promedio mensual por …»: sector / material abren su detalle (con la ventana y los clientes del filtro), grupo abre
   * su detalle y gerente filtra esta tabla. */
  const alAbrirNivel = (nivel: NivelFac, valor: string) => {
    if (nivel === 'sector') abrirConFiltro('sector', valor === 'Sin sector' ? '(sin sector)' : valor);
    else if (nivel === 'material') abrirConFiltro('material', valor);
    else if (nivel === 'grupoart') open({ type: 'grupo', grupo: valor });
    else if (valor !== 'Sin gerente') setGerente(valor);
  };

  const abrirConFiltro = (tipo: 'sector' | 'material', valor: string) => {
    const seen = new Set<string>();
    const pares: string[] = [];
    for (const r of filteredAgg) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      if (tipo === 'sector' ? (ce.sector(r) || '(sin sector)') !== valor : norm(r.material) !== norm(valor)) continue;
      pares.push(k);
    }
    const filtro = { pares, lo: ventana.lo, hi: ventana.hi, nMeses: ventana.nMeses, etiqueta: ventana.etiqueta };
    open(tipo === 'sector' ? { type: 'sector', sector: valor, filtro } : { type: 'material', material: valor, filtro });
  };

  const sortAcc = useMemo(() => ({
    // Facturación: el cliente se ordena por Solicitante → Destinatario → Material (los códigos que muestra la fila), no por texto de razón social.
    cliente: (r: ConsumoRow) => (fac ? `${r.solicitante}\u0001${r.destinatario}\u0001${r.material}` : r.razonSocial),
    ejecutivo: (r: ConsumoRow) => ce.ejec(r),
    centro: (r: ConsumoRow) => r.centro,
    material: (r: ConsumoRow) => r.material,
    sector: (r: ConsumoRow) => ce.sector(r),
    consumo: (r: ConsumoRow) => num(r.consumoActual),
    ultima: (r: ConsumoRow) => num(r.cantidadUltima),
    ultimaFecha: (r: ConsumoRow) => dateSortValue(r.ultimoMesFacturacion),
    penultima: (r: ConsumoRow) => num(r.cantidadPenultima),
    penultimaFecha: (r: ConsumoRow) => dateSortValue(r.penultimoMes ?? ''),
    impultima: (r: ConsumoRow) => num(r.importeUltima),
    estado: (r: ConsumoRow) => statusOf(r).status.label,
    tendencia: (r: ConsumoRow) => statusOf(r).tend.txt,
    // sin clasificar ordena al final; con las dos vistas ordena por material y luego por cliente-material
    abc: (r: ConsumoRow) => (vistaAbc === 'par' ? clasePar(r) || 'Z' : vistaAbc === 'ambas' ? `${claseDe(r) || 'Z'}${clasePar(r) || 'Z'}` : claseDe(r) || 'Z'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ce, statusIndex, a.abc, fac]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  // Perf #3: virtualize the full result set (~80k rows) instead of paginating
  // 100/page. Two-line cells run ~56px tall. Only the visible slice renders.
  const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(sorted.length, 56);

  if (!rows.length) {
    if (!bootstrapped) return <TableSkeleton />;
    if (fac && a0.facturacionCalculando) return <CalculandoIndices titulo="Calculando índices de facturación…" progreso={a0.facturacionProgreso} />;
    if (fac && faseFac.fase === 'error') return <EmptyState title="No se pudo cargar la facturación." description={faseFac.texto} action={{ to: SIN_DATOS.facturacion.to, label: SIN_DATOS.facturacion.label }} />;
    if (fac && (faseFac.fase === 'restaurando' || faseFac.fase === 'descargando')) return <CalculandoIndices titulo={faseFac.texto} progreso={faseFac.fase === 'descargando' ? (faseFac.porcentaje ?? 0) / 100 : 0} nota={faseFac.fase === 'restaurando' ? 'Leyendo la facturación guardada en este equipo.' : 'Bajando los libros de facturación de Drive (solo la primera vez baja todos; después, solo el que cambió).'} />;
    if (fac) return <EmptyState title={SIN_DATOS.facturacion.title} description={SIN_DATOS.facturacion.description} action={{ to: SIN_DATOS.facturacion.to, label: SIN_DATOS.facturacion.label }} />;
    return <EmptyState title={'No se cargó la hoja "Reporte de Consumo".'} action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const addQuick = (field: string, value: string) => {
    if (!value) return;
    // Con el default (todos menos los excluidos) activo, clic en un grupo = enfocar ESE grupo.
    if (field === 'grupocli' && !grupoTocado && grupoDefault.length) {
      setQuick([...quick.filter((f) => f.col !== 'grupocli'), { col: 'grupocli', values: [value] }]);
      return;
    }
    const i = quick.findIndex((f) => f.col === field);
    if (i < 0) { setQuick([...quick, { col: field, values: [value] }]); return; }
    if (quick[i].values.includes(value)) return;
    const next = quick.slice();
    next[i] = { col: field, values: [...quick[i].values, value] };
    setQuick(next);
  };
  const vsCell = (act: number, prom: number) => {
    const pct = prom ? ((act - prom) / prom) * 100 : 0;
    const cls = pct > 5 ? 'text-success' : pct < -5 ? 'text-danger' : 'text-text-faint';
    return <div><b>{formatNumber(act)}</b><div className={`text-[11px] ${cls}`}>prom {formatNumber(prom)}</div></div>;
  };

  const exportar = () => {
    const rowsX = filtered.map((r) => {
      const { status: st, tend: tn } = statusOf(r);
      return {
        Solicitante: r.solicitante, Destinatario: r.destinatario, 'Razón social': r.razonSocial,
        'Grupo cliente': ce.grupoCli(r), Ejecutivo: ce.ejec(r), Centro: r.centro,
        Material: r.material, Descripción: r.textoMaterial, Sector: ce.sector(r), 'Grupo art.': ce.grupoArt(r),
        'Consumo actual': r.consumoActual, 'Prom. mensual': promedioDeFila(a.rf, r, promedioModo, rangoPromedio),
        'Último mes': r.ultimoMesFacturacion, 'Cant. última': r.cantidadUltima, 'Importe última': r.importeUltima,
        Estado: st.label, Tendencia: tn.txt, [fac ? 'Clase ABC material' : 'Clase ABC']: claseDe(r) || 'Sin clasificar',
        ...(fac ? { 'Clase ABC cliente-material': clasePar(r) || 'Sin clasificar' } : {}),
      };
    });
    void exportXlsx(`${fac ? 'facturacion' : 'consumo'}_${stamp()}.xlsx`, rowsX, fac ? 'Facturación' : 'Consumo');
  };

  return (
    <ReportPage>
      <PageHeader
        title={fac ? 'Facturación' : 'Consumo'}
        subtitle={`${formatNumber(filtered.length)} de ${formatNumber(rows.length)} registros`}
        actions={(
          <>
            <ColumnVisibilityControl columns={COLS_CONSUMO} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
            <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
            <ExportButton onClick={exportar} />
          </>
        )}
      />

      {prefiltro && <PrefiltroBanner material={prefiltro} onClear={clearPrefiltro} />}

      {/* Banda única: facturado del periodo + estado de los clientes (clicable) + comparativos contra el año anterior */}
      <ResumenColapsable storageKey={`${ns}.resumen.oculto`} linea={<>Facturado {formatCurrency(facturadoPeriodo.imp)} · {formatNumber(facturadoPeriodo.cant)} u. · {formatNumber(filtered.length)} líneas</>}>
      <KpiBand
          titulo={`Facturado en el periodo${facturadoPeriodo.meses ? ` · ${facturadoPeriodo.desde} – ${facturadoPeriodo.hasta}` : ''}`}
          principal={{ etiqueta: 'Importe', valor: formatCurrency(facturadoPeriodo.imp) }}
          metricas={[
            { etiqueta: 'Cantidad', valor: formatNumber(facturadoPeriodo.cant), title: 'Suma de cantidades facturadas; mezcla distintas unidades de medida.' },
            { etiqueta: 'Promedio / mes', valor: formatCurrency(facturadoPeriodo.promImpMes), sub: `${formatNumber(facturadoPeriodo.promCantMes)} u.`, title: `Promedio sobre ${facturadoPeriodo.mesesCalendario} meses de calendario del periodo (incluye meses en cero).` },
            { etiqueta: 'Promedio / trimestre', valor: formatCurrency(facturadoPeriodo.promImpQ), sub: `${formatNumber(facturadoPeriodo.promCantQ)} u.`, title: `Promedio sobre ${facturadoPeriodo.mesesCalendario} meses de calendario del periodo (incluye meses en cero).` },
          ]}
          distribucion={{
            titulo: 'Estado de los clientes (filtro actual)',
            segmentos: [
              { clave: 'corriente', etiqueta: 'Al corriente', valor: kpis.corriente, cls: 'bg-success' },
              { clave: 'riesgo', etiqueta: 'En riesgo', valor: kpis.riesgo, cls: 'bg-danger' },
              { clave: 'reactiva', etiqueta: 'Reactivación', valor: kpis.reactiva, cls: 'bg-info' },
              { clave: 'nueva', etiqueta: 'Nueva compra', valor: kpis.nueva, cls: 'bg-accent' },
            ],
            activo: estado || undefined,
            onToggle: (clave) => setEstado(estado === clave ? '' : clave),
          }}
          extra={(
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-text-faint">Comparativo contra el año anterior</span>
          <SegmentedControl value={periodo} onChange={setPeriodo} ariaLabel="Periodo de comparación" options={[{ value: 'corriente', label: 'Periodo corriente' }, { value: 'anterior', label: 'Periodo anterior' }]} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ComparisonCard titulo={`${periodo === 'anterior' ? 'Periodo anterior · ' : ''}Mes ${mesLabel(comparativas.baseMes)} vs mismo mes año anterior`} actual={comparativas.impMesCur} previo={comparativas.impMesPrev} pct={comparativas.pctMes} />
          <ComparisonCard titulo={`${periodo === 'anterior' ? 'Periodo anterior · ' : ''}${comparativas.qLabel} vs mismo trimestre año anterior`} actual={comparativas.impQCur} previo={comparativas.impQPrev} pct={comparativas.pctQ} />
          <ComparisonCard titulo={`${periodo === 'anterior' ? 'Periodo anterior · ' : ''}${comparativas.ytdLabel} vs mismo periodo año anterior`} actual={comparativas.impYtdCur} previo={comparativas.impYtdPrev} pct={comparativas.pctYtd} />
        </div>
            </div>
          )}
          pie={<>{facturadoPeriodo.meses} {facturadoPeriodo.meses === 1 ? 'mes' : 'meses'} con movimiento · {formatNumber(filtered.length)} líneas del filtro actual{!rangoActivo && ' · ventana por defecto: últimos 36 meses (usa "Último mes fact." para acotar)'}</>}
        />
      </ResumenColapsable>

      <FilterBar
        search={<DebouncedSearch key={clearTick} initialValue={q} onChange={setQ} placeholder="Buscar…" />}
        onClear={clearFilters}
        zoom={<ZoomControl level={zoom.level} setLevel={zoom.setLevel} />}
        chips={pasteCodes.length > 0 ? <PasteCodesChip value={pasteCodes} onChange={setPasteCodes} label="material" /> : undefined}
        columnFilters={<ColumnFilterBar columns={filterCols} rows={rows} active={quick} onChange={setQuick} />}
      >
        <GerenteSelect enrich={a.enrich} value={gerente} onChange={setGerente} />
        <div className="flex items-center gap-1" role="group" aria-label="Filtrar por mes de la última compra">
          <span className="text-xs text-text-muted">Última:</span>
          <Select value={ultOp} onChange={(ev) => setUltOp(ev.target.value as typeof ultOp)} className="w-auto" title="Comparar el mes/año de la última compra">
            <option value="<=">menor o igual a</option>
            <option value=">=">mayor o igual a</option>
            <option value="<">menor que</option>
            <option value=">">mayor que</option>
            <option value="=">igual a</option>
          </Select>
          <input type="month" value={ultMes} onChange={(ev) => setUltMes(ev.target.value)} aria-label="Mes y año de la última compra" className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-sm" />
          {ultMes && <button type="button" className="text-xs text-text-muted hover:text-text" onClick={() => setUltMes('')} title="Quitar el filtro">✕</button>}
        </div>
        <FilterSelect value={estado} onChange={setEstado} todos="Estado (todos)" options={ESTADOS.map(([k, l]) => ({ value: k, label: l }))} />
        {fac && (
          <Select value={abcVistaGuardada} onChange={(ev) => setAbcVista(ev.target.value as 'material' | 'par' | 'ambas')} className="w-auto" title="Qué ABC ver: el del material, el de la combinación cliente-material o los dos">
            <option value="material">ABC: Material</option>
            <option value="par">ABC: Cliente-Material</option>
            <option value="ambas">ABC: Ambas</option>
          </Select>
        )}
        <FilterSelect
          value={clase}
          onChange={setClase}
          todos="Clase ABC (todas)"
          title="Clase ABC (de la vista elegida) — importe facturado en los últimos 12 meses"
          options={[{ value: 'A', label: 'A — 80% del importe' }, { value: 'B', label: 'B — hasta 95%' }, { value: 'C', label: 'C — cola' }]}
        />
        {fac
          ? <MonthSetFilter meses={periodoSet} onChange={setPeriodoSet} label="Periodo" />
          : <MonthRangeFilter desde={periodoMeses.desde} hasta={periodoMeses.hasta} onChange={setPeriodoMeses} label="Periodo" />}
        <div className="flex items-center gap-1" role="group" aria-label="Promedio mensual">
          <span className="text-xs text-text-muted">Promedio:</span>
          {PROMEDIO_MODOS.filter((m) => m.key !== 'historia').map((m) => (
            <Button
              key={m.key}
              size="sm"
              variant={promedioModo === m.key ? 'default' : 'outline'}
              title={m.title}
              aria-pressed={promedioModo === m.key}
              onClick={() => setPromedioModo(promedioModo === m.key ? 'historia' : m.key)}
            >{m.label}</Button>
          ))}
        </div>
        <PasteCodesFilter value={pasteCodes} onChange={setPasteCodes} label="material" />
      </FilterBar>

      <CollapsibleCard title="Facturación mensual (filtro)" storageKey={`${ns}.grafica.abierta`} defaultOpen>
        <EvolChart serie={aggSerie} height={160} onMonth={(mes) => open({ type: 'mesClientesFiltro', mes, rows: clientesDeMes(mes) })} />
      </CollapsibleCard>

      <FacPorNivel renglones={renglonesFac} nMeses={ventana.nMeses} ventana={ventana.etiqueta} storageKey={ns} onNodo={alAbrirNivel} />

      <div className="rounded-xl border border-border">
        <button onClick={() => setGruposOpen(!gruposOpen)} className="flex w-full items-center justify-between p-3 text-sm font-medium">
          <span>Nuevas compras y reactivaciones por Grupo de artículo{gruposOpen && <> · {grupos.reduce((s, g) => s + g.nueva, 0)} nuevas · {grupos.reduce((s, g) => s + g.reactiva, 0)} reactivaciones</>}</span>
          <ChevronDown className={`size-4 transition-transform ${gruposOpen ? 'rotate-180' : ''}`} />
        </button>
        {gruposOpen && (
          <div className="max-h-72 overflow-auto border-t border-border">
            <Table wrapperClassName="overflow-visible">
              <TableHeader><TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Nueva (actual)</TableHead><TableHead className="text-right">Nueva (Q pasado)</TableHead>
                <TableHead className="text-right">Reactiva (actual)</TableHead><TableHead className="text-right">Reactiva (Q pasado)</TableHead>
                <TableHead className="text-right"># Solic.</TableHead><TableHead className="text-right">Fact. 12m</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <TableRow key={g.grupo} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'grupo', grupo: g.grupo })}>
                    <TableCell><span className="text-text">{g.grupo}</span></TableCell>
                    <TableCell className="text-right text-info">{g.nueva || '—'}</TableCell>
                    <TableCell className="text-right text-text-faint">{g.nuevaPrev || '—'}</TableCell>
                    <TableCell className="text-right text-info">{g.reactiva || '—'}</TableCell>
                    <TableCell className="text-right text-text-faint">{g.reactivaPrev || '—'}</TableCell>
                    <TableCell className="text-right">{g.solics}</TableCell>
                    <TableCell className="text-right">{formatCurrency(g.imp12)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Card className={`${ALTURA_TABLA} shrink-0 overflow-hidden`}>
        <div ref={scrollRef} className="h-full overflow-auto">
        <Table className={zoom.className} wrapperClassName="overflow-visible" resizableKey={`${ns}.cols`}>
          <TableHeader><TableRow>
            {vis('cliente') && <SortableTableHead sortKey="cliente" activeKey={sortKey} dir={dir} onSort={toggleSort}>Cliente</SortableTableHead>}
            {vis('ejecutivo') && <SortableTableHead sortKey="ejecutivo" activeKey={sortKey} dir={dir} onSort={toggleSort}>Ejecutivo / Grupo cli.</SortableTableHead>}
            {vis('centro') && <SortableTableHead sortKey="centro" activeKey={sortKey} dir={dir} onSort={toggleSort}>Centro</SortableTableHead>}
            {vis('material') && <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort}>Material</SortableTableHead>}
            {vis('abc') && <SortableTableHead sortKey="abc" activeKey={sortKey} dir={dir} onSort={toggleSort} title="Clase ABC — importe facturado en los últimos 12 meses">ABC</SortableTableHead>}
            {vis('sector') && <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort}>Sector/Grupo</SortableTableHead>}
            {vis('consumo') && <SortableTableHead sortKey="consumo" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Consumo promedio mensual de este cliente para este material.">Consumo</SortableTableHead>}
            {vis('ultima') && <SortableTableHead
              sortKey="ultima"
              activeKey={sortKey === 'ultimaFecha' ? 'ultima' : sortKey}
              dir={dir}
              onSort={toggleSort}
              onContextMenu={(ev) => { ev.preventDefault(); toggleSort('ultimaFecha'); }}
              className="text-right"
              title="Clic: ordenar por cantidad · Clic derecho o botón «mes»: ordenar por mes/año"
            >Última <button type="button" className={`ml-1 rounded border px-1 text-[11px] ${sortKey === 'ultimaFecha' ? 'border-accent text-accent' : 'border-border text-text-faint'}`} onClick={(ev) => { ev.stopPropagation(); toggleSort('ultimaFecha'); }} title="Ordenar por mes/año de la última compra">mes{sortKey === 'ultimaFecha' ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></SortableTableHead>}
            {vis('penultima') && <SortableTableHead
              sortKey="penultima"
              activeKey={sortKey === 'penultimaFecha' ? 'penultima' : sortKey}
              dir={dir}
              onSort={toggleSort}
              onContextMenu={(ev) => { ev.preventDefault(); toggleSort('penultimaFecha'); }}
              className="text-right"
              title="Clic: ordenar por cantidad · Clic derecho: ordenar por fecha"
            >Penúltima</SortableTableHead>}
            {vis('impultima') && <SortableTableHead sortKey="impultima" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Importe facturado en el último mes con movimiento.">Imp. últ.</SortableTableHead>}
            {vis('estado') && <SortableTableHead sortKey="estado" activeKey={sortKey} dir={dir} onSort={toggleSort} title="Actividad reciente del cliente para este material (activo, inactivo, etc.) según meses desde la última compra.">Estado</SortableTableHead>}
            {vis('tendencia') && <SortableTableHead sortKey="tendencia" activeKey={sortKey} dir={dir} onSort={toggleSort} title="Compara la facturación de los últimos 3 meses completos vs. los 3 anteriores: En aumento (+10%), En decremento (-10%) o Estable.">Tendencia</SortableTableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {paddingTop > 0 && (<tr><td style={{ height: paddingTop }} colSpan={COLS_CONSUMO.filter((c) => vis(c.key)).length} /></tr>)}
            {items.map((vi) => {
              const r = sorted[vi.index];
              const onSolicitar = () => solicitar.abrir(buildFromConsumo(r));
              const solicitado = solicitudSourceKeys.has(`con|${norm(r.material)}|${norm(r.centro)}`);
              const copyItems = [
                { label: 'Material', value: r.material },
                { label: 'Cliente', value: r.razonSocial },
                { label: 'Centro', value: r.centro },
              ];
              return (
              <SolicitarContextMenu
                key={vi.index}
                onSolicitar={onSolicitar}
                solicitado={solicitado}
                label={r.material}
                onVerDetalle={() => open({ type: 'clienteDetalle', dest: r.destinatario, material: r.material })}
                copyItems={copyItems}
              >
              <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'clienteDetalle', dest: r.destinatario, material: r.material })}>
                {vis('cliente') && <TableCell className="max-w-64 truncate">{r.razonSocial} <ClienteOportunidadBadge dest={r.destinatario} /><div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: r.solicitante })}>S {r.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: r.destinatario })}>D {r.destinatario}</Chip></div></TableCell>}
                {vis('ejecutivo') && <TableCell>
                  <Chip onClick={() => addQuick('ejecutivo', ce.ejec(r))}>{ce.ejec(r) || '—'}</Chip>
                  <div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', ce.grupoCli(r))}>{ce.grupoCli(r) || '—'}</Chip></div>
                </TableCell>}
                {vis('centro') && <TableCell><Chip onClick={() => addQuick('centro', r.centro)}>{r.centro || '—'}</Chip></TableCell>}
                {vis('material') && <TableCell><Chip onClick={() => open({ type: 'material', material: r.material })}>{r.material}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{r.textoMaterial}</div>{ce.precioOferta(r) > 0 && <div className="text-[11px] text-text">Of. {formatCurrency(ce.precioOferta(r))}</div>}</TableCell>}
                {vis('abc') && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {vistaAbc !== 'par' && <>{vistaAbc === 'ambas' && <span className="text-[11px] text-text-faint" title="ABC del material">M</span>}<AbcBadge clase={claseDe(r) || undefined} /></>}
                      {vistaAbc !== 'material' && <>{vistaAbc === 'ambas' && <span className="text-[11px] text-text-faint" title="ABC de la combinación cliente-material">C-M</span>}<AbcBadge clase={clasePar(r) || undefined} /></>}
                    </div>
                  </TableCell>
                )}
                {vis('sector') && <TableCell>{ce.sector(r) || '—'}<div className="text-[11px] text-text-faint">{ce.grupoArt(r)}</div></TableCell>}
                {vis('consumo') && <TableCell className="text-right">{vsCell(r.consumoActual, promedioDeFila(a.rf, r, promedioModo, rangoPromedio))}</TableCell>}
                {vis('ultima') && <TableCell className="text-right">{fechaCantCell(r.ultimoMesFacturacion, r.cantidadUltima)}</TableCell>}
                {vis('penultima') && <TableCell className="text-right">{fechaCantCell(r.penultimoMes ?? '', num(r.cantidadPenultima))}</TableCell>}
                {vis('impultima') && <TableCell className="text-right">{formatCurrency(r.importeUltima)}</TableCell>}
                {vis('estado') && <TableCell><StatePill label={statusOf(r).status.label} cls={statusOf(r).status.cls} /></TableCell>}
                {vis('tendencia') && <TableCell><TrendBadge t={statusOf(r).tend} /></TableCell>}
              </TableRow>
              </SolicitarContextMenu>
              );
            })}
            {paddingBottom > 0 && (<tr><td style={{ height: paddingBottom }} colSpan={COLS_CONSUMO.filter((c) => vis(c.key)).length} /></tr>)}
          </TableBody>
        </Table>
        </div>
      </Card>



      {/* Detalle de apoyo (plegable): cuadre contra Resumen_Fac, dispersión de precios y grupos */}
      <div className="rounded-xl border border-border">
        <button onClick={() => setCuadreOpen(!cuadreOpen)} className="flex w-full items-center justify-between p-3 text-sm font-medium">
          <span>Cuadre contra Resumen_Fac{cuadreOpen && <> · {formatNumber(auditoria.filas)} filas cargadas</>}{auditoria.filasInvalidas ? ` · ${formatNumber(auditoria.filasInvalidas)} con mes inválido` : ''}</span>
          <ChevronDown className={`size-4 transition-transform ${cuadreOpen ? 'rotate-180' : ''}`} />
        </button>
        {cuadreOpen && (
          <div className="border-t border-border p-3 text-xs">
            <p className="mb-2 text-text-faint">
              “Resumen_Fac” = suma directa de las filas cargadas (compárala con la hoja). “Esta pantalla” = lo que usan las tarjetas y la gráfica
              {sinFiltros ? '' : ' — hay filtros activos, por eso puede ser menor'}.
              {auditoria.filasInvalidas > 0 && ` Filas con “Mes y año” no reconocible: ${formatNumber(auditoria.filasInvalidas)} (${formatCurrency(auditoria.impInvalido)}), no entran a ningún total.`}
              {a.rf && (a.rf.sinClave.material || a.rf.sinClave.solicitante || a.rf.sinClave.destinatario) ? ` Importe sin material: ${formatCurrency(a.rf.sinClave.material)} · sin solicitante: ${formatCurrency(a.rf.sinClave.solicitante)} · sin destinatario: ${formatCurrency(a.rf.sinClave.destinatario)}.` : ''}
            </p>
            <table className="w-full tabular-nums">
              <thead><tr className="text-left text-text-faint"><th>Mes</th><th className="text-right">Filas</th><th className="text-right">Resumen_Fac</th><th className="text-right">Esta pantalla</th><th className="text-right">Diferencia</th></tr></thead>
              <tbody>
                {cuadreFilas.map((m) => (
                  <tr key={m.mes}>
                    <td>{m.mes}</td><td className="text-right">{formatNumber(m.filas)}</td>
                    <td className="text-right">{formatCurrency(m.imp)}</td><td className="text-right">{formatCurrency(m.usado)}</td>
                    <td className={`text-right ${Math.abs(m.imp - m.usado) < 0.5 ? 'text-success' : 'text-danger'}`}>{formatCurrency(m.imp - m.usado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </ReportPage>
  );
}
