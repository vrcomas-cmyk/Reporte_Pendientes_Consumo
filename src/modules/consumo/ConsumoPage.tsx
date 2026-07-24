import { useMemo, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useSort } from '@/hooks/useSort';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, TrendBadge, Chip, Ranking, StatTile, EvolChart, ZoomControl, useZoom, ColumnFilterBar, passesFilters, DebouncedSearch, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { ESTADOS, mesKey, mesLabel, clasificarEstado, tendenciaTexto, mesRefQAnterior, mesAnterior, hoyMes, type Serie, type Estado, type Tendencia } from '@/core/resumenFac';
import { norm, num, searchNorm, consumoEnrich, consumoSerie, matchesQueryNormalized, RC, pickField } from '@/modules/analytics/helpers';
import type { ConsumoRow } from '@/core/types';
import { buildFromConsumo } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitadoBadge } from '@/modules/solicitudes/SolicitadoBadge';
import { useSolicitudStore } from '@/store/solicitudStore';

// #2: combined date+qty cell, same pattern as the existing "Última" column.
function fechaCantCell(fecha: string, cant: number) {
  if (!fecha && !cant) return '—';
  return <div>{formatNumber(cant)}<div className="text-[11px] text-text-faint">{fecha || '—'}</div></div>;
}

export function ConsumoPage() {
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const rows = a.result?.consumo ?? [];
  // Perf: memoize on catalog identity. `ce` is a dep of filterCols/sortAcc/
  // rankSector/grupos — a fresh object each render defeated those useMemos and
  // forced the ~80k-row sector/grupo aggregations to recompute on every render
  // (zoom, periodo toggle, panel open, row hover).
  const ce = useMemo(() => consumoEnrich(a.enrich), [a.enrich]);
  const [q, setQ] = useState(''); // committed (debounced) query; input state lives in DebouncedSearch
  const [estado, setEstado] = useState('');
  const [quick, setQuick] = useState<ActiveFilter[]>([]);
  const [gruposOpen, setGruposOpen] = useState(false);
  const [periodo, setPeriodo] = useState<'corriente' | 'anterior'>('corriente');
  const zoom = useZoom();
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
    { key: 'material', label: 'Material', get: (r) => r.material },
    { key: 'grupocli', label: 'Grupo cliente', get: (r) => ce.grupoCli(r) },
    { key: 'ejecutivo', label: 'Ejecutivo', get: (r) => ce.ejec(r) },
    { key: 'centro', label: 'Centro', get: (r) => r.centro },
    { key: 'sector', label: 'Sector', get: (r) => ce.sector(r) },
    // #3: Sector and Grupo artículo share one visual cell — each field still
    // needs its own independent filter entry.
    { key: 'grupoart', label: 'Grupo artículo', get: (r) => ce.grupoArt(r) },
  ], [ce]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (estado && statusOf(r).status.key !== estado) return false;
      if (!passesFilters(r, filterCols, quick)) return false;
      if (q) {
        const hay = searchIndex.get(r) ?? '';
        if (!matchesQueryNormalized(q, hay)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, estado, quick, statusIndex, searchIndex, filterCols]);

  const kpis = useMemo(() => {
    const cnt = (k: string) => filtered.filter((r) => statusOf(r).status.key === k).length;
    return { corriente: cnt('corriente'), riesgo: cnt('riesgo'), reactiva: cnt('reactiva'), nueva: cnt('nueva') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, statusIndex]);

  const aggSerie = useMemo<Serie>(() => {
    // Guard against outlier/corrupt month values (e.g. a mis-parsed date far in the
    // past or future) blowing out the chart's month range: when unfiltered across
    // ~80k+ rows a single bad row is statistically likely, and completarSerie() would
    // fill the whole span with zeros, drowning out the real data into an apparently
    // empty chart. Restrict aggregation to a sane window around the current period.
    const curK = mesKey(a.rf?.curmes || hoyMes());
    const seen = new Set<string>();
    const bucket = new Map<string, { mes: string; cant: number; imp: number }>();
    for (const r of filtered) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const p of consumoSerie(a.rf, r)) {
        const pk = mesKey(p.mes);
        if (!pk || Math.abs(pk - curK) > 36) continue;
        const c = bucket.get(p.mes) || { mes: p.mes, cant: 0, imp: 0 };
        c.cant += p.cant; c.imp += p.imp; bucket.set(p.mes, c);
      }
    }
    return [...bucket.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
  }, [filtered, a.rf]);

  // #5/#6/#7: current month/quarter vs the same period one year ago, driven by
  // the actual current date (never hardcoded) and shiftable one period back
  // via the "Periodo anterior" toggle. Reuses aggSerie's already-deduped
  // month buckets so the numbers always match the chart.
  const comparativas = useMemo(() => {
    const mesMap = new Map(aggSerie.map((p) => [mesKey(p.mes), p.imp]));
    const now = hoyMes();
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
  }, [aggSerie, periodo]);

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
    const cur = mesKey(a.rf.curmes), lo = cur - 11, seen = new Set<string>(), acc = new Map<string, number>();
    for (const r of filtered) {
      const k = norm(r.destinatario) + '||' + norm(r.material);
      if (seen.has(k)) continue;
      seen.add(k);
      let sum = 0;
      for (const p of consumoSerie(a.rf, r)) { const mk = mesKey(p.mes); if (mk >= lo && mk <= cur) sum += p.imp; }
      if (sum) acc.set(norm(r.material), (acc.get(norm(r.material)) || 0) + sum);
    }
    return [...acc.entries()].map(([m, s]) => ({ code: m, desc: a.rf?.matTexto.get(m) || '', val: s / 12 })).sort((x, y) => y.val - x.val).slice(0, 10);
  }, [filtered, a.rf]);

  // #8: top ranking is now Sector-level (with trend), moved above the fold.
  const rankSector = useMemo(() => {
    if (!a.rf) return [];
    const cur = mesKey(a.rf.curmes), lo = cur - 11, seen = new Set<string>();
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
      let imp12 = 0; serie.forEach((x) => { const mk = mesKey(x.mes); if (mk >= lo && mk <= cur) imp12 += x.imp; });
      const t = tendenciaTexto(serie);
      return { code: sector, desc: t.txt, val: imp12 / 12 };
    }).filter((x) => x.val > 0).sort((x, y) => y.val - x.val).slice(0, 10);
  }, [filtered, a.rf, ce]);

  // #6: nueva/reactiva counts for both the current AND the previous quarter, always
  // relative to today's date (mesRefQAnterior derives the previous-quarter reference
  // month from a.rf.curmes, so this shifts automatically as quarters roll over).
  const grupos = useMemo(() => {
    if (!a.rf) return [];
    const pairs = new Set<string>();
    for (const r of filtered) { const s = norm(r.solicitante), g = ce.grupoArt(r) || '(sin grupo)'; if (s) pairs.add(s + '~~' + g); }
    const gsum = new Map<string, { grupo: string; nueva: number; reactiva: number; nuevaPrev: number; reactivaPrev: number; imp12: number; solics: number }>();
    const cur = mesKey(a.rf.curmes), lo = cur - 11;
    const refPrev = mesRefQAnterior(a.rf.curmes);
    pairs.forEach((pk) => {
      const i = pk.indexOf('~~'), s = pk.slice(0, i), g = pk.slice(i + 2);
      const mats = a.rf!.solicMats.get(s);
      if (!mats) return;
      const bucket = new Map<string, { mes: string; cant: number; imp: number }>();
      mats.forEach((serie, mat) => {
        if ((a.enrich.matGrupo(mat) || '(sin grupo)') !== g) return;
        for (const p of serie) { const c = bucket.get(p.mes) || { mes: p.mes, cant: 0, imp: 0 }; c.imp += p.imp; c.cant += p.cant; bucket.set(p.mes, c); }
      });
      if (!bucket.size) return;
      const serie = [...bucket.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
      const st = clasificarEstado(serie, false);
      const stPrev = clasificarEstado(serie, false, refPrev);
      let imp12 = 0; serie.forEach((x) => { const mk = mesKey(x.mes); if (mk >= lo && mk <= cur) imp12 += x.imp; });
      let o = gsum.get(g);
      if (!o) { o = { grupo: g, nueva: 0, reactiva: 0, nuevaPrev: 0, reactivaPrev: 0, imp12: 0, solics: 0 }; gsum.set(g, o); }
      if (st.key === 'nueva') o.nueva++; else if (st.key === 'reactiva') o.reactiva++;
      if (stPrev.key === 'nueva') o.nuevaPrev++; else if (stPrev.key === 'reactiva') o.reactivaPrev++;
      o.imp12 += imp12; o.solics++;
    });
    return [...gsum.values()].filter((x) => x.nueva || x.reactiva || x.nuevaPrev || x.reactivaPrev).sort((x, y) => y.nueva + y.reactiva - (x.nueva + x.reactiva));
  }, [filtered, a.rf, ce]);

  const sortAcc = useMemo(() => ({
    cliente: (r: ConsumoRow) => r.razonSocial,
    ejecutivo: (r: ConsumoRow) => ce.ejec(r),
    centro: (r: ConsumoRow) => r.centro,
    material: (r: ConsumoRow) => r.material,
    sector: (r: ConsumoRow) => ce.sector(r),
    consumo: (r: ConsumoRow) => num(r.consumoActual),
    ultima: (r: ConsumoRow) => num(r.cantidadUltima),
    penultima: (r: ConsumoRow) => num(r.raw[RC.cantPen]),
    impultima: (r: ConsumoRow) => num(r.importeUltima),
    estado: (r: ConsumoRow) => statusOf(r).status.label,
    tendencia: (r: ConsumoRow) => statusOf(r).tend.txt,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ce, statusIndex]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  // Perf #3: virtualize the full result set (~80k rows) instead of paginating
  // 100/page. Two-line cells run ~56px tall. Only the visible slice renders.
  const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(sorted.length, 56);

  if (!rows.length) {
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
        Estado: st.label, Tendencia: tn.txt,
      };
    });
    void exportXlsx(`consumo_${stamp()}.xlsx`, rowsX, 'Consumo');
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-5">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Reporte de Consumo</h2>
          <p className="text-sm text-text-muted">{formatNumber(filtered.length)} de {formatNumber(rows.length)} registros</p></div>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearch onChange={setQ} placeholder="Buscar…" />
        <select value={estado} onChange={(ev) => setEstado(ev.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Estado (todos)</option>{ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
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
        <Table className={zoom.className} wrapperClassName="overflow-visible">
          <TableHeader><TableRow>
            <SortableTableHead sortKey="cliente" activeKey={sortKey} dir={dir} onSort={toggleSort}>Cliente</SortableTableHead>
            <SortableTableHead sortKey="ejecutivo" activeKey={sortKey} dir={dir} onSort={toggleSort}>Ejecutivo / Grupo cli.</SortableTableHead>
            <SortableTableHead sortKey="centro" activeKey={sortKey} dir={dir} onSort={toggleSort}>Centro</SortableTableHead>
            <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort}>Material</SortableTableHead>
            <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort}>Sector/Grupo</SortableTableHead>
            <SortableTableHead sortKey="consumo" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Consumo</SortableTableHead>
            <SortableTableHead sortKey="ultima" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Última</SortableTableHead>
            <SortableTableHead sortKey="penultima" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Penúltima</SortableTableHead>
            <SortableTableHead sortKey="impultima" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Imp. últ.</SortableTableHead>
            <SortableTableHead sortKey="estado" activeKey={sortKey} dir={dir} onSort={toggleSort}>Estado</SortableTableHead>
            <SortableTableHead sortKey="tendencia" activeKey={sortKey} dir={dir} onSort={toggleSort}>Tendencia</SortableTableHead>
            <TableHead>Acción</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paddingTop > 0 && (<tr><td style={{ height: paddingTop }} colSpan={12} /></tr>)}
            {items.map((vi) => {
              const r = sorted[vi.index];
              return (
              <TableRow key={vi.index} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'clienteDetalle', dest: r.destinatario })}>
                <TableCell className="max-w-64 truncate">{r.razonSocial}<div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: r.solicitante })}>S {r.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: r.destinatario })}>D {r.destinatario}</Chip></div></TableCell>
                <TableCell>
                  <Chip onClick={() => addQuick('ejecutivo', ce.ejec(r))}>{ce.ejec(r) || '—'}</Chip>
                  <div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', ce.grupoCli(r))}>{ce.grupoCli(r) || '—'}</Chip></div>
                </TableCell>
                <TableCell><Chip onClick={() => addQuick('centro', r.centro)}>{r.centro || '—'}</Chip></TableCell>
                <TableCell><Chip onClick={() => open({ type: 'material', material: r.material })}>{r.material}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{r.textoMaterial}</div>{ce.precioOferta(r) > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Of. {formatCurrency(ce.precioOferta(r))}</div>}</TableCell>
                <TableCell>{ce.sector(r) || '—'}<div className="text-[11px] text-text-faint">{ce.grupoArt(r)}</div></TableCell>
                <TableCell className="text-right">{vsCell(r.consumoActual, r.consumoPromedioMensual)}</TableCell>
                <TableCell className="text-right">{fechaCantCell(r.ultimoMesFacturacion, r.cantidadUltima)}</TableCell>
                <TableCell className="text-right">{fechaCantCell(pickField(r.raw, [RC.penFecha]), num(r.raw[RC.cantPen]))}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.importeUltima)}</TableCell>
                <TableCell><StatePill label={statusOf(r).status.label} cls={statusOf(r).status.cls} /></TableCell>
                <TableCell><TrendBadge t={statusOf(r).tend} /></TableCell>
                <TableCell onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => solicitar.abrir(buildFromConsumo(r))}>Solicitar</Button>
                    <SolicitadoBadge solicitado={solicitudSourceKeys.has(`con|${norm(r.material)}|${norm(r.centro)}`)} />
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
            {paddingBottom > 0 && (<tr><td style={{ height: paddingBottom }} colSpan={12} /></tr>)}
          </TableBody>
        </Table>
        </div>
      </Card>

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}
