import { useMemo, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
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
import { StatePill, TrendBadge, AbcBadge, Chip, Ranking, StatTile, EvolChart, ZoomControl, useZoom, ColumnFilterBar, passesFilters, DebouncedSearch, useColumnVisibility, ColumnVisibilityControl, useSavedViews, SavedViewsControl, DateRangeFilter, ClearFiltersButton, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { enRango, dateSortValue, isoToMesKey } from '@/lib/fechas';
import { COLS_CONSUMO } from './columns';
import { ESTADOS, mesKey, mesLabel, clasificarEstado, tendenciaTexto, mesRefQAnterior, mesAnterior, hoyMes, type Serie, type Estado, type Tendencia } from '@/core/resumenFac';
import { norm, num, searchNorm, consumoEnrich, consumoSerie, matchesQueryNormalized, RC, pickField } from '@/modules/analytics/helpers';
import type { ConsumoRow } from '@/core/types';
import { buildFromConsumo } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useMaterialPrefiltro } from '@/hooks/useMaterialPrefiltro';
import { PrefiltroBanner } from '@/components/feedback/PrefiltroBanner';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useUrlFilters } from '@/hooks/useUrlFilters';

// #2: combined date+qty cell, same pattern as the existing "Última" column.
function fechaCantCell(fecha: string, cant: number) {
  if (!fecha && !cant) return '—';
  return <div>{formatNumber(cant)}<div className="text-[11px] text-text-faint">{fecha || '—'}</div></div>;
}

export function ConsumoPage() {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const rows = a.result?.consumo ?? [];
  // Perf: memoize on catalog identity. `ce` is a dep of filterCols/sortAcc/
  // rankSector/grupos — a fresh object each render defeated those useMemos and
  // forced the ~80k-row sector/grupo aggregations to recompute on every render
  // (zoom, periodo toggle, panel open, row hover).
  const ce = useMemo(() => consumoEnrich(a.enrich), [a.enrich]);
  const [q, setQ] = usePersistedState('consumo.q', ''); // committed (debounced) query; input state lives in DebouncedSearch
  const { prefiltro, clear: clearPrefiltro } = useMaterialPrefiltro(setQ);
  const [estado, setEstado] = usePersistedState('consumo.estado', '');
  const [clase, setClase] = usePersistedState('consumo.clase', '');
  const claseDe = (r: ConsumoRow) => a.abc.classByMaterial.get(norm(r.material)) || '';
  const [quick, setQuick] = usePersistedState<ActiveFilter[]>('consumo.quick', []);
  useUrlFilters(quick, setQuick);
  const [periodoRango, setPeriodoRango] = usePersistedState<{ desde: string; hasta: string }>('consumo.periodoRango', { desde: '', hasta: '' });
  const [gruposOpen, setGruposOpen] = useState(false);
  const [periodo, setPeriodo] = usePersistedState<'corriente' | 'anterior'>('consumo.periodo', 'corriente');
  const [clearTick, setClearTick] = useState(0);
  const clearFilters = () => {
    setQ(''); setEstado(''); setClase(''); setQuick([]); setPeriodoRango({ desde: '', hasta: '' });
    setClearTick((n) => n + 1);
  };
  const colVis = useColumnVisibility('consumo_columnas');
  const vis = colVis.isVisible;
  const zoom = useZoom('consumo_zoom');

  // Vistas guardadas: snapshot de estado + filtros rápidos, persistido entre sesiones.
  const savedViews = useSavedViews<{ estado: string; clase: string; quick: ActiveFilter[] }>('consumo_vistas');
  const applyView = (state: { estado: string; clase?: string; quick: ActiveFilter[] }) => { setEstado(state.estado); setClase(state.clase ?? ''); setQuick(state.quick); };
  const saveCurrentView = (name: string) => savedViews.save(name, { estado, clase, quick });
  const solicitar = useSolicitarDialog();
  const solicitudSourceKeys = useSolicitudStore((s) => s.sourceKeys);

  // Perf: Estado/Tendencia previously recomputed consumoSerie() TWICE per row
  // (once each in consumoStatus/consumoTend) every time it was needed — inline,
  // in the KPI count, in the estado filter, and per visible row on every
  // render. At ~80k rows that's the single biggest cost in this view. Compute
  // it once per row here (indexed by row identity, memoized on data + catalog
  // identity) and read from the index everywhere else.
  const statusIndex = useMemo(() => {
    const m = new Map<ConsumoRow, { status: Estado; tend: Tendencia }>();
    for (const r of rows) {
      const serie = consumoSerie(a.rf, r);
      m.set(r, { status: clasificarEstado(serie.length ? serie : null, false), tend: tendenciaTexto(serie) });
    }
    return m;
  }, [rows, a.rf]);
  const statusOf = (r: ConsumoRow) => statusIndex.get(r) ?? { status: clasificarEstado(null, false), tend: tendenciaTexto([]) };

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
    { key: 'abc', label: 'Clase ABC', get: (r) => claseDe(r) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [ce, statusIndex, a.abc]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (estado && statusOf(r).status.key !== estado) return false;
      if (clase && claseDe(r) !== clase) return false;
      if (!passesFilters(r, filterCols, quick)) return false;
      if (!enRango(r.ultimoMesFacturacion, periodoRango.desde, periodoRango.hasta, true)) return false;
      if (q) {
        const hay = searchIndex.get(r) ?? '';
        if (!matchesQueryNormalized(q, hay)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, estado, clase, quick, periodoRango, statusIndex, searchIndex, filterCols, a.abc]);

  const kpis = useMemo(() => {
    const cnt = (k: string) => filtered.filter((r) => statusOf(r).status.key === k).length;
    return { corriente: cnt('corriente'), riesgo: cnt('riesgo'), reactiva: cnt('reactiva'), nueva: cnt('nueva') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, statusIndex]);

  // Rango del filtro de periodo, en la misma escala que mesKey (año*12+mes) —
  // cuando está activo, acota las ventanas de las agregaciones mensuales de
  // abajo (aggSerie/rankMat/rankSector/grupos) al mismo rango que ya filtra
  // las filas, en vez de la ventana fija "últimos N meses desde hoy".
  const rangoLoK = useMemo(() => isoToMesKey(periodoRango.desde), [periodoRango.desde]);
  const rangoHiK = useMemo(() => isoToMesKey(periodoRango.hasta), [periodoRango.hasta]);
  const rangoActivo = rangoLoK != null || rangoHiK != null;

  const aggSerie = useMemo<Serie>(() => {
    // Guard against outlier/corrupt month values (e.g. a mis-parsed date far in the
    // past or future) blowing out the chart's month range: when unfiltered across
    // ~80k+ rows a single bad row is statistically likely, and completarSerie() would
    // fill the whole span with zeros, drowning out the real data into an apparently
    // empty chart. Restrict aggregation to a sane window around the current period —
    // o al rango del filtro de periodo, si hay uno activo.
    const curK = mesKey(a.rf?.curmes || hoyMes());
    const seen = new Set<string>();
    const bucket = new Map<string, { mes: string; cant: number; imp: number }>();
    for (const r of filtered) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const p of consumoSerie(a.rf, r)) {
        const pk = mesKey(p.mes);
        if (!pk) continue;
        if (rangoActivo) {
          if (rangoLoK != null && pk < rangoLoK) continue;
          if (rangoHiK != null && pk > rangoHiK) continue;
        } else if (Math.abs(pk - curK) > 36) continue;
        const c = bucket.get(p.mes) || { mes: p.mes, cant: 0, imp: 0 };
        c.cant += p.cant; c.imp += p.imp; bucket.set(p.mes, c);
      }
    }
    return [...bucket.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
  }, [filtered, a.rf, rangoActivo, rangoLoK, rangoHiK]);

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

    const [cm, cy] = baseMes.split('/').map(Number);
    let qStartK = cy * 12 + (Math.floor((cm - 1) / 3) * 3 + 1);
    if (periodo === 'anterior') qStartK -= 3; // shift a full quarter back, not just one month
    let impQCur = 0, impQPrev = 0;
    for (let i = 0; i < 3; i++) { impQCur += mesMap.get(qStartK + i) || 0; impQPrev += mesMap.get(qStartK + i - 12) || 0; }
    const pctQ = impQPrev ? ((impQCur - impQPrev) / impQPrev) * 100 : (impQCur ? 100 : 0);
    const qNum = Math.floor(((qStartK - 1) % 12) / 3) + 1;
    const qYear = Math.floor((qStartK - 1) / 12);

    return { baseMes, impMesCur, impMesPrev, pctMes, impQCur, impQPrev, pctQ, qLabel: `Q${qNum} ${qYear}` };
  }, [aggSerie, periodo, rangoActivo, rangoHiK]);

  // #18: click a month bar -> snapshot the clients that invoiced that month under the
  // currently active filters (generalizes legacy openClientesMes beyond a single material).
  const clientesDeMes = (mes: string) => {
    const seen = new Set<string>();
    const out: { razon: string; solic: string; dest: string; material: string; cant: number; imp: number }[] = [];
    for (const r of filtered) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const p of consumoSerie(a.rf, r)) {
        if (p.mes === mes && (p.cant || p.imp)) {
          out.push({ razon: r.razonSocial, solic: r.solicitante, dest: r.destinatario, material: r.material, cant: p.cant, imp: p.imp });
        }
      }
    }
    return out.sort((x, y) => y.imp - x.imp);
  };

  const rankMat = useMemo(() => {
    if (!a.rf) return [];
    const cur = mesKey(a.rf.curmes);
    const lo = rangoActivo ? (rangoLoK ?? -Infinity) : cur - 11;
    const hi = rangoActivo ? (rangoHiK ?? Infinity) : cur;
    const nMeses = rangoActivo && rangoLoK != null && rangoHiK != null ? Math.max(1, rangoHiK - rangoLoK + 1) : 12;
    const seen = new Set<string>();
    const acc = new Map<string, { imp: number; cant: number }>();
    for (const r of filtered) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      let sumImp = 0, sumCant = 0;
      for (const p of consumoSerie(a.rf, r)) { const mk = mesKey(p.mes); if (mk >= lo && mk <= hi) { sumImp += p.imp; sumCant += p.cant; } }
      if (sumImp) {
        const m = norm(r.material);
        const o = acc.get(m) || { imp: 0, cant: 0 };
        o.imp += sumImp; o.cant += sumCant;
        acc.set(m, o);
      }
    }
    return [...acc.entries()]
      .map(([m, s]) => ({ code: m, desc: a.rf?.matTexto.get(m) || '', val: s.imp / nMeses, valSub: s.cant / nMeses }))
      .sort((x, y) => y.val - x.val).slice(0, 10);
  }, [filtered, a.rf, rangoActivo, rangoLoK, rangoHiK]);

  // Dispersión de precios entre clientes distintos, para el mismo material,
  // acotada a los materiales visibles bajo el filtro actual — así "Buscar" o
  // los filtros rápidos también recortan esta tabla, no solo la principal.
  const dispersionShown = useMemo(() => {
    if (!filtered.length || filtered.length === rows.length) return a.precioDispersion.slice(0, 30);
    const visibles = new Set(filtered.map((r) => norm(r.material)));
    return a.precioDispersion.filter((e) => visibles.has(e.material)).slice(0, 30);
  }, [a.precioDispersion, filtered, rows.length]);

  // #8: top ranking is now Sector-level (with trend), moved above the fold.
  const rankSector = useMemo(() => {
    if (!a.rf) return [];
    const cur = mesKey(a.rf.curmes);
    const lo = rangoActivo ? (rangoLoK ?? -Infinity) : cur - 11;
    const hi = rangoActivo ? (rangoHiK ?? Infinity) : cur;
    const nMeses = rangoActivo && rangoLoK != null && rangoHiK != null ? Math.max(1, rangoHiK - rangoLoK + 1) : 12;
    const seen = new Set<string>();
    const bySector = new Map<string, Map<string, { mes: string; cant: number; imp: number }>>();
    for (const r of filtered) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      const sector = ce.sector(r) || '(sin sector)';
      let bucket = bySector.get(sector);
      if (!bucket) { bucket = new Map(); bySector.set(sector, bucket); }
      for (const p of consumoSerie(a.rf, r)) {
        const c = bucket.get(p.mes) || { mes: p.mes, cant: 0, imp: 0 };
        c.cant += p.cant; c.imp += p.imp; bucket.set(p.mes, c);
      }
    }
    return [...bySector.entries()].map(([sector, bucket]) => {
      const serie = [...bucket.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
      let imp12 = 0, cant12 = 0;
      serie.forEach((x) => { const mk = mesKey(x.mes); if (mk >= lo && mk <= hi) { imp12 += x.imp; cant12 += x.cant; } });
      const t = tendenciaTexto(serie);
      return { code: sector, desc: t.txt, val: imp12 / nMeses, valSub: cant12 / nMeses };
    }).filter((x) => x.val > 0).sort((x, y) => y.val - x.val).slice(0, 10);
  }, [filtered, a.rf, ce, rangoActivo, rangoLoK, rangoHiK]);

  // #6: nueva/reactiva counts for both the current AND the previous quarter, always
  // relative to today's date (mesRefQAnterior derives the previous-quarter reference
  // month from a.rf.curmes, so this shifts automatically as quarters roll over).
  const grupos = useMemo(() => {
    if (!a.rf) return [];
    const pairs = new Set<string>();
    // Materiales que realmente quedaron dentro de `filtered` por solicitante —
    // sin esto, `mats.forEach` de abajo sumaba TODO el histórico del
    // solicitante (cualquier material de ese grupo), aunque el usuario haya
    // filtrado a un material/cliente/sector específico.
    const matsPorSolic = new Map<string, Set<string>>();
    for (const r of filtered) {
      const s = norm(r.solicitante), g = ce.grupoArt(r) || '(sin grupo)';
      if (!s) continue;
      pairs.add(s + '~~' + g);
      const set = matsPorSolic.get(s) ?? new Set<string>();
      set.add(norm(r.material));
      matsPorSolic.set(s, set);
    }
    const gsum = new Map<string, { grupo: string; nueva: number; reactiva: number; nuevaPrev: number; reactivaPrev: number; imp12: number; solics: number }>();
    const cur = mesKey(a.rf.curmes);
    const lo = rangoActivo ? (rangoLoK ?? -Infinity) : cur - 11;
    const hi = rangoActivo ? (rangoHiK ?? Infinity) : cur;
    const nMeses = rangoActivo && rangoLoK != null && rangoHiK != null ? Math.max(1, rangoHiK - rangoLoK + 1) : 12;
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
  }, [filtered, a.rf, ce, rangoActivo, rangoLoK, rangoHiK]);

  const sortAcc = useMemo(() => ({
    cliente: (r: ConsumoRow) => r.razonSocial,
    ejecutivo: (r: ConsumoRow) => ce.ejec(r),
    centro: (r: ConsumoRow) => r.centro,
    material: (r: ConsumoRow) => r.material,
    sector: (r: ConsumoRow) => ce.sector(r),
    consumo: (r: ConsumoRow) => num(r.consumoActual),
    ultima: (r: ConsumoRow) => num(r.cantidadUltima),
    ultimaFecha: (r: ConsumoRow) => dateSortValue(r.ultimoMesFacturacion),
    penultima: (r: ConsumoRow) => num(r.raw[RC.cantPen]),
    penultimaFecha: (r: ConsumoRow) => dateSortValue(pickField(r.raw, [RC.penFecha])),
    impultima: (r: ConsumoRow) => num(r.importeUltima),
    estado: (r: ConsumoRow) => statusOf(r).status.label,
    tendencia: (r: ConsumoRow) => statusOf(r).tend.txt,
    abc: (r: ConsumoRow) => claseDe(r) || 'Z', // sin clasificar ordena al final
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ce, statusIndex, a.abc]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  // Perf #3: virtualize the full result set (~80k rows) instead of paginating
  // 100/page. Two-line cells run ~56px tall. Only the visible slice renders.
  const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(sorted.length, 56);

  if (!rows.length) {
    if (!bootstrapped) return <TableSkeleton />;
    return <EmptyState title={'No se cargó la hoja "Reporte de Consumo".'} action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const addQuick = (field: string, value: string) => { if (value && !quick.some((f) => f.col === field && f.value === value)) setQuick([...quick, { col: field, value }]); };
  const vsCell = (act: number, prom: number) => {
    const pct = prom ? ((act - prom) / prom) * 100 : 0;
    const cls = pct > 5 ? 'text-emerald-500' : pct < -5 ? 'text-danger' : 'text-text-faint';
    return <div><b>{formatNumber(act)}</b><div className={`text-[11px] ${cls}`}>prom {formatNumber(prom)}</div></div>;
  };

  const exportar = () => {
    const rowsX = filtered.map((r) => {
      const { status: st, tend: tn } = statusOf(r);
      return {
        Solicitante: r.solicitante, Destinatario: r.destinatario, 'Razón social': r.razonSocial,
        'Grupo cliente': ce.grupoCli(r), Ejecutivo: ce.ejec(r), Centro: r.centro,
        Material: r.material, Descripción: r.textoMaterial, Sector: ce.sector(r), 'Grupo art.': ce.grupoArt(r),
        'Consumo actual': r.consumoActual, 'Prom. mensual': r.consumoPromedioMensual,
        'Último mes': r.ultimoMesFacturacion, 'Cant. última': r.cantidadUltima, 'Importe última': r.importeUltima,
        Estado: st.label, Tendencia: tn.txt, 'Clase ABC': claseDe(r) || 'Sin clasificar',
      };
    });
    void exportXlsx(`consumo_${stamp()}.xlsx`, rowsX, 'Consumo');
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-5">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Reporte de Consumo</h2>
          <p className="text-sm text-text-muted">{formatNumber(filtered.length)} de {formatNumber(rows.length)} registros</p></div>
        <div className="flex items-center gap-2">
          <ColumnVisibilityControl columns={COLS_CONSUMO} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
          <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
          <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
        </div>
      </div>

      {prefiltro && <PrefiltroBanner material={prefiltro} onClear={clearPrefiltro} />}

      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearch key={clearTick} initialValue={q} onChange={setQ} placeholder="Buscar…" />
        <Select value={estado} onChange={(ev) => setEstado(ev.target.value)} className="w-auto">
          <option value="">Estado (todos)</option>{ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select value={clase} onChange={(ev) => setClase(ev.target.value)} className="w-auto" title="Clase ABC del material — importe facturado en los últimos 12 meses">
          <option value="">Clase ABC (todas)</option>
          <option value="A">A — 80% del importe</option>
          <option value="B">B — hasta 95%</option>
          <option value="C">C — cola</option>
        </Select>
        <DateRangeFilter desde={periodoRango.desde} hasta={periodoRango.hasta} onChange={setPeriodoRango} label="Último mes fact." />
        <ClearFiltersButton onClear={clearFilters} />
      </div>
      <ColumnFilterBar columns={filterCols} rows={rows} active={quick} onChange={setQuick} />

      <div className="flex flex-wrap items-start gap-3">
        <div className="inline-grid grid-cols-2 content-start gap-2 sm:grid-cols-4">
          <StatTile compact label="Al corriente" value={formatNumber(kpis.corriente)} tone="text-emerald-500" />
          <StatTile compact label="En riesgo" value={formatNumber(kpis.riesgo)} tone="text-danger" />
          <StatTile compact label="Reactivación" value={formatNumber(kpis.reactiva)} tone="text-violet-500" />
          <StatTile compact label="Nueva compra" value={formatNumber(kpis.nueva)} tone="text-violet-500" />
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
          <button onClick={() => setPeriodo('corriente')} className={`rounded px-2 py-1 ${periodo === 'corriente' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}`}>Periodo corriente</button>
          <button onClick={() => setPeriodo('anterior')} className={`rounded px-2 py-1 ${periodo === 'anterior' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}`}>Periodo anterior</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3">
          <div className="text-xs font-medium text-text-faint">Mes {mesLabel(comparativas.baseMes)} vs mismo mes año anterior</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-xl font-semibold">{formatCurrency(comparativas.impMesCur)}</span>
            <span className={`text-sm font-medium ${comparativas.pctMes >= 0 ? 'text-emerald-500' : 'text-danger'}`}>{comparativas.pctMes >= 0 ? '▲' : '▼'} {Math.abs(comparativas.pctMes).toFixed(1)}%</span>
          </div>
          <div className="text-[11px] text-text-faint">vs {formatCurrency(comparativas.impMesPrev)} año anterior</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-xs font-medium text-text-faint">{comparativas.qLabel} vs mismo trimestre año anterior</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-xl font-semibold">{formatCurrency(comparativas.impQCur)}</span>
            <span className={`text-sm font-medium ${comparativas.pctQ >= 0 ? 'text-emerald-500' : 'text-danger'}`}>{comparativas.pctQ >= 0 ? '▲' : '▼'} {Math.abs(comparativas.pctQ).toFixed(1)}%</span>
          </div>
          <div className="text-[11px] text-text-faint">vs {formatCurrency(comparativas.impQPrev)} año anterior</div>
        </div>
      </div>

      <Ranking title="Sectores · fact. prom 12m" items={rankSector} money wide onRow={(s) => open({ type: 'sector', sector: s })} />
      <Ranking title="Materiales · fact. prom 12m" items={rankMat} money wide onRow={(m) => open({ type: 'material', material: m })} />

      <div className="rounded-xl border border-border p-3">
        <h4 className="mb-2 text-xs font-semibold text-text-muted">
          Dispersión de precios entre clientes · mismo material, precio muy distinto · {dispersionShown.length}
        </h4>
        {dispersionShown.length === 0 ? (
          <p className="text-xs text-text-faint">Sin dispersión detectada (o ningún material del filtro actual tiene 2+ clientes con precio vigente).</p>
        ) : (
          <Table wrapperClassName="max-h-64">
            <TableHeader><TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Spread</TableHead>
              <TableHead>Paga menos</TableHead>
              <TableHead>Paga más</TableHead>
              <TableHead className="text-right"># Clientes</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {dispersionShown.map((e) => (
                <TableRow key={e.material} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'material', material: e.material })}>
                  <TableCell><Chip onClick={() => open({ type: 'material', material: e.material })}>{e.material}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{e.descripcion}</div></TableCell>
                  <TableCell className="text-right"><span className={e.spread > 1 ? 'text-danger font-medium' : 'text-warning font-medium'}>+{(e.spread * 100).toFixed(0)}%</span></TableCell>
                  <TableCell className="max-w-48 truncate">{e.clienteMin.razonSocial || e.clienteMin.destinatario}<div className="text-[11px] text-text-faint">{formatCurrency(e.clienteMin.precioUnitario)}</div></TableCell>
                  <TableCell className="max-w-48 truncate">{e.clienteMax.razonSocial || e.clienteMax.destinatario}<div className="text-[11px] text-text-faint">{formatCurrency(e.clienteMax.precioUnitario)}</div></TableCell>
                  <TableCell className="text-right">{e.nClientes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="w-full rounded-xl border border-border p-3">
        <h4 className="mb-2 text-xs font-semibold text-text-muted">Facturación mensual (filtro)</h4>
        <EvolChart serie={aggSerie} height={160} onMonth={(mes) => open({ type: 'mesClientesFiltro', mes, rows: clientesDeMes(mes) })} />
      </div>

      <div className="rounded-xl border border-border">
        <button onClick={() => setGruposOpen(!gruposOpen)} className="flex w-full items-center justify-between p-3 text-sm font-medium">
          <span>Nuevas compras y reactivaciones por Grupo de artículo · {grupos.reduce((s, g) => s + g.nueva, 0)} nuevas · {grupos.reduce((s, g) => s + g.reactiva, 0)} reactivaciones</span>
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
                    <TableCell><span className="text-accent">{g.grupo}</span></TableCell>
                    <TableCell className="text-right text-violet-500">{g.nueva || '—'}</TableCell>
                    <TableCell className="text-right text-text-faint">{g.nuevaPrev || '—'}</TableCell>
                    <TableCell className="text-right text-violet-500">{g.reactiva || '—'}</TableCell>
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

      <div className="flex justify-end"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>

      <Card className="min-h-[640px] shrink-0 overflow-hidden">
        <div ref={scrollRef} className="h-[640px] overflow-auto">
        <Table className={zoom.className} wrapperClassName="overflow-visible" resizableKey="consumo.cols">
          <TableHeader><TableRow>
            {vis('cliente') && <SortableTableHead sortKey="cliente" activeKey={sortKey} dir={dir} onSort={toggleSort}>Cliente</SortableTableHead>}
            {vis('ejecutivo') && <SortableTableHead sortKey="ejecutivo" activeKey={sortKey} dir={dir} onSort={toggleSort}>Ejecutivo / Grupo cli.</SortableTableHead>}
            {vis('centro') && <SortableTableHead sortKey="centro" activeKey={sortKey} dir={dir} onSort={toggleSort}>Centro</SortableTableHead>}
            {vis('material') && <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort}>Material</SortableTableHead>}
            {vis('abc') && <SortableTableHead sortKey="abc" activeKey={sortKey} dir={dir} onSort={toggleSort} title="Clase ABC — importe facturado en los últimos 12 meses">ABC</SortableTableHead>}
            {vis('sector') && <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort}>Sector/Grupo</SortableTableHead>}
            {vis('consumo') && <SortableTableHead sortKey="consumo" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Consumo</SortableTableHead>}
            {vis('ultima') && <SortableTableHead
              sortKey="ultima"
              activeKey={sortKey === 'ultimaFecha' ? 'ultima' : sortKey}
              dir={dir}
              onSort={toggleSort}
              onContextMenu={(ev) => { ev.preventDefault(); toggleSort('ultimaFecha'); }}
              className="text-right"
              title="Clic: ordenar por cantidad · Clic derecho: ordenar por fecha"
            >Última</SortableTableHead>}
            {vis('penultima') && <SortableTableHead
              sortKey="penultima"
              activeKey={sortKey === 'penultimaFecha' ? 'penultima' : sortKey}
              dir={dir}
              onSort={toggleSort}
              onContextMenu={(ev) => { ev.preventDefault(); toggleSort('penultimaFecha'); }}
              className="text-right"
              title="Clic: ordenar por cantidad · Clic derecho: ordenar por fecha"
            >Penúltima</SortableTableHead>}
            {vis('impultima') && <SortableTableHead sortKey="impultima" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Imp. últ.</SortableTableHead>}
            {vis('estado') && <SortableTableHead sortKey="estado" activeKey={sortKey} dir={dir} onSort={toggleSort}>Estado</SortableTableHead>}
            {vis('tendencia') && <SortableTableHead sortKey="tendencia" activeKey={sortKey} dir={dir} onSort={toggleSort}>Tendencia</SortableTableHead>}
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
                onVerDetalle={() => open({ type: 'clienteDetalle', dest: r.destinatario })}
                copyItems={copyItems}
              >
              <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'clienteDetalle', dest: r.destinatario })}>
                {vis('cliente') && <TableCell className="max-w-64 truncate">{r.razonSocial}<div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: r.solicitante })}>S {r.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: r.destinatario })}>D {r.destinatario}</Chip></div></TableCell>}
                {vis('ejecutivo') && <TableCell>
                  <Chip onClick={() => addQuick('ejecutivo', ce.ejec(r))}>{ce.ejec(r) || '—'}</Chip>
                  <div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', ce.grupoCli(r))}>{ce.grupoCli(r) || '—'}</Chip></div>
                </TableCell>}
                {vis('centro') && <TableCell><Chip onClick={() => addQuick('centro', r.centro)}>{r.centro || '—'}</Chip></TableCell>}
                {vis('material') && <TableCell><Chip onClick={() => open({ type: 'material', material: r.material })}>{r.material}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{r.textoMaterial}</div>{ce.precioOferta(r) > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Of. {formatCurrency(ce.precioOferta(r))}</div>}</TableCell>}
                {vis('abc') && <TableCell><AbcBadge clase={claseDe(r) || undefined} /></TableCell>}
                {vis('sector') && <TableCell>{ce.sector(r) || '—'}<div className="text-[11px] text-text-faint">{ce.grupoArt(r)}</div></TableCell>}
                {vis('consumo') && <TableCell className="text-right">{vsCell(r.consumoActual, r.consumoPromedioMensual)}</TableCell>}
                {vis('ultima') && <TableCell className="text-right">{fechaCantCell(r.ultimoMesFacturacion, r.cantidadUltima)}</TableCell>}
                {vis('penultima') && <TableCell className="text-right">{fechaCantCell(pickField(r.raw, [RC.penFecha]), num(r.raw[RC.cantPen]))}</TableCell>}
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

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}
