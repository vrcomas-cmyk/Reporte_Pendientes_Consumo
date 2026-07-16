import { useMemo, useState } from 'react';
import { Search, Inbox, AlertTriangle, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { TrendBadge, Chip, StatTile, ZoomControl, useZoom } from '@/modules/analytics/ui';
import { invGen, esLento } from '@/core/resumenSin';
import { serieMaterial, tendenciaTexto } from '@/core/resumenFac';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { matchesQuery } from '@/modules/analytics/helpers';
import { useSort } from '@/hooks/useSort';

export function ResumenSinPage() {
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const [q, setQ] = useState('');
  const [centroFiltro, setCentroFiltro] = useState<string>('');
  const zoom = useZoom();
  const rss = a.rss;

  const list = useMemo(() => {
    if (!rss) return [];
    return [...rss.mats.values()].filter((mo) => {
      if (!q) return true;
      return matchesQuery(q, `${mo.material} ${mo.desc} ${a.enrich.matSector(mo.material)} ${a.enrich.matGrupo(mo.material)}`);
    });
  }, [rss, q, a.enrich]);

  const totals = useMemo(() => {
    let inv = 0, pend = 0, trans = 0;
    for (const mo of list) mo.centros.forEach((co) => { inv += invGen(co); pend += co.pend; trans += co.transito; });
    return { inv, pend, trans };
  }, [list]);

  const statusMat = (mo: (typeof list)[number]) => {
    const s = new Set<string>();
    mo.centros.forEach((co) => co.status.forEach((v) => s.add(v)));
    return [...s].join(', ');
  };
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

  // Empty state — rendered after all hooks so hook order stays stable across
  // renders (Rules of Hooks).
  if (!rss) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Inbox className="size-8 text-text-faint" />
        <p className="text-sm text-text-muted">No se cargó la hoja "Resumen Sin Sugerencias".</p>
        <Button asChild><Link to="/carga">Ir a Carga</Link></Button>
      </div>
    );
  }

  const centrosAll = rss.centros;
  // Always-visible: 1031 stays regardless of the toggle; toggle picks which other centro(s) show.
  const centros = centroFiltro ? centrosAll.filter((c) => c === '1031' || c === centroFiltro) : centrosAll;
  const colCount = 6 + centros.length;

  const exportar = () => {
    const out: Record<string, unknown>[] = [];
    list.forEach((mo) => {
      mo.centros.forEach((co, centro) => {
        const ig = invGen(co);
        out.push({
          Material: mo.material, Descripción: mo.desc, Centro: centro,
          'Inv. general (1030+1031+1060)': ig, Pendiente: co.pend, 'En tránsito': co.transito,
          Lento: esLento(co, rss.curMes) ? 'Sí' : '',
          Sector: a.enrich.matSector(mo.material) || '', 'Grupo art.': a.enrich.matGrupo(mo.material) || '',
        });
      });
    });
    exportXlsx(`resumen_sin_sugerencias_${stamp()}.xlsx`, out, 'ResumenSinSug');
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-5">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Resumen Sin Sugerencias</h2>
          <p className="text-sm text-text-muted">Pivote material × centro · inventario general (1030+1031+1060)</p></div>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Materiales" value={formatNumber(list.length)} />
        <StatTile label="Inv. total" value={formatNumber(totals.inv)} />
        <StatTile label="Pendiente total" value={formatNumber(totals.pend)} tone="text-danger" />
        <StatTile label="En tránsito total" value={formatNumber(totals.trans)} tone="text-warning" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
          <Input placeholder="Buscar material…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
        <select value={centroFiltro} onChange={(e) => setCentroFiltro(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Todos los centros</option>
          {centrosAll.filter((c) => c !== '1031').map((c) => <option key={c} value={c}>Solo Centro {c} (+1031)</option>)}
        </select>
        <p className="text-xs text-text-faint">Celda = inv. del centro · <span className="text-danger">Pend</span> pendiente · <AlertTriangle className="inline size-3 text-warning" /> lento (≥6m sin mov.)</p>
        <div className="ml-auto"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort}>Material</SortableTableHead>
                <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort}>Sector/Grupo</SortableTableHead>
                <TableHead>Tendencia</TableHead>
                <SortableTableHead sortKey="status" activeKey={sortKey} dir={dir} onSort={toggleSort}>Status Revisión</SortableTableHead>
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
                      return (
                        <TableCell key={c} className="text-right">
                          <Chip onClick={() => open({ type: 'celda', material: mo.material, centro: c })}>{formatNumber(ig)}</Chip>
                          {co.transito > 0 && <span className="text-emerald-500"> +{formatNumber(co.transito)}</span>}
                          {esLento(co, rss.curMes) && <AlertTriangle className="ml-1 inline size-3 text-warning" />}
                          {co.pend > 0 && <div className="text-[11px] text-danger">Pend {formatNumber(co.pend)}</div>}
                        </TableCell>
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
    </div>
  );
}
