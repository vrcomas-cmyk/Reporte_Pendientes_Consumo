import { useEffect, useMemo, useState } from 'react';
import { Search, Lock, LockOpen, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { cn, formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { buildLotesSheet } from '@/lib/lotesSheet';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, Chip, Ranking, StatTile, ZoomControl, useZoom, ColumnFilterBar, passesFilters, useSavedViews, SavedViewsControl, RowContextMenu, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { norm, matchesQuery } from '@/modules/analytics/helpers';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useDataStore } from '@/store/dataStore';
import { useSort } from '@/hooks/useSort';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { buildFromInvDetalle } from '@/services/solicitudService';
import { useSolicitarDialog, type LoteOption } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';

const CENTERS = ['1001', '1003', '1004', '1017', '1018', '1022', '1036'];

const ADMIN_KEY = 'inv_admin';
const HIDDEN_KEY = 'inv_hidden';

function readAdmin(): boolean {
  try { return localStorage.getItem(ADMIN_KEY) === '1'; } catch { return false; }
}
function writeAdmin(v: boolean) {
  try { localStorage.setItem(ADMIN_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}
function readHidden(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
}
function writeHidden(s: Set<string>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}
function rowKey(material: string, condicion: string) {
  return `${norm(material)}||${norm(condicion)}`;
}

export function InventarioPage() {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const rows = a.invCondicion;
  const [q, setQ] = useState('');
  const [cond, setCond] = useState('');
  const [sector, setSector] = useState('');
  const [centro, setCentro] = useState('');
  const [isAdmin, setIsAdmin] = useState(readAdmin);
  const [hidden, setHidden] = useState<Set<string>>(readHidden);
  const [quick, setQuick] = useState<ActiveFilter[]>([]);
  const zoom = useZoom('inventario_zoom');

  // Vistas guardadas: snapshot de filtros (condicion/sector/centro/quick), persistido entre sesiones.
  const savedViews = useSavedViews<{ cond: string; sector: string; centro: string; quick: ActiveFilter[] }>('inventario_vistas');
  const applyView = (state: { cond: string; sector: string; centro: string; quick: ActiveFilter[] }) => {
    setCond(state.cond); setSector(state.sector); setCentro(state.centro); setQuick(state.quick);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { cond, sector, centro, quick });
  const qd = useDebouncedValue(q, 200);
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  // A row here is material×condición (inventory split by centro), so "ya
  // solicitada" is a per-material match against any of its lotes.
  const invSolicitadas = useMemo(() => {
    const set = new Set<string>();
    for (const s of solicitudesList) {
      if (s.origen === 'inventario') set.add(s.sourceKey.split('|')[1]);
    }
    return set;
  }, [solicitudesList]);

  // #7: consumo reciente por material (+ mejor cliente al que ofrecer), para
  // cruzar contra los lotes por vencer y priorizar los que sí tienen demanda
  // en vez de ofrecerlos al azar.
  const consumoPorMaterial = useMemo(() => {
    const m = new Map<string, { total: number; clientes: Map<string, { razon: string; destinatario: string; consumo: number }> }>();
    (a.result?.consumo ?? []).forEach((r) => {
      if (!(r.consumoActual > 0)) return;
      const key = norm(r.material);
      let o = m.get(key);
      if (!o) { o = { total: 0, clientes: new Map() }; m.set(key, o); }
      o.total += r.consumoActual;
      const ck = norm(r.destinatario);
      const c = o.clientes.get(ck) || { razon: r.razonSocial, destinatario: r.destinatario, consumo: 0 };
      c.consumo += r.consumoActual;
      o.clientes.set(ck, c);
    });
    return m;
  }, [a.result]);

  const lotesPorVencer = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return a.lotes
      .map((l) => {
        if (!l.fechaCaducidad) return null;
        const d = new Date(l.fechaCaducidad);
        if (Number.isNaN(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        const dias = Math.round((d.getTime() - now.getTime()) / 86400000);
        if (dias < 0 || dias > 90) return null;
        const cons = consumoPorMaterial.get(norm(l.material));
        const topCliente = cons ? [...cons.clientes.values()].sort((x, y) => y.consumo - x.consumo)[0] : undefined;
        return { ...l, dias, demanda: cons?.total ?? 0, topCliente };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((x, y) => (y.demanda > 0 ? 1 : 0) - (x.demanda > 0 ? 1 : 0) || x.dias - y.dias)
      .slice(0, 20);
  }, [a.lotes, consumoPorMaterial]);

  useEffect(() => { writeAdmin(isAdmin); }, [isAdmin]);

  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeHidden(next);
      return next;
    });
  };

  const conds = useMemo(() => [...new Set(rows.map((r) => r.condicion).filter(Boolean))].sort(), [rows]);
  const sectores = useMemo(() => [...new Set(rows.map((r) => a.enrich.matSector(r.material) || r.sector).filter(Boolean))].sort(), [rows, a.enrich]);

  // Condición/Sector/Centro ya tienen su propio dropdown arriba — esta barra
  // cubre el resto de columnas/subcolumnas visibles en la tabla.
  const filterCols: FilterColumn<(typeof rows)[number]>[] = useMemo(() => [
    { key: 'material', label: 'Material', get: (r) => r.material },
    { key: 'descripcion', label: 'Descripción', get: (r) => r.textoBreve },
    { key: 'grupoart', label: 'Grupo artículo', get: (r) => a.enrich.matGrupo(r.material) || r.grupo },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [a.enrich]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (cond && norm(r.condicion) !== cond) return false;
      if (sector && (a.enrich.matSector(r.material) || r.sector) !== sector) return false;
      if (centro && !(r.invByCenter[centro] > 0)) return false;
      if (!passesFilters(r, filterCols, quick)) return false;
      if (qd && !matchesQuery(qd, `${r.material} ${r.textoBreve}`)) return false;
      if (!isAdmin && hidden.has(rowKey(r.material, r.condicion))) return false;
      return true;
    });
  }, [rows, qd, cond, sector, centro, a.enrich, isAdmin, hidden, filterCols, quick]);

  const kpis = useMemo(() => {
    const mats = new Set(filtered.map((r) => norm(r.material)));
    const imp = filtered.reduce((s, r) => s + r.importeInventario, 0);
    const stock = filtered.reduce((s, r) => s + r.invSuma, 0);
    const rk = filtered.map((r) => ({ code: r.material, desc: r.textoBreve, val: r.importeInventario }))
      .filter((x) => x.val > 0).sort((x, y) => y.val - x.val).slice(0, 10);
    return { mats: mats.size, imp, stock, rk };
  }, [filtered]);

  const sortAcc = useMemo(() => ({
    material: (r: (typeof filtered)[number]) => r.material,
    condicion: (r: (typeof filtered)[number]) => r.condicion,
    sector: (r: (typeof filtered)[number]) => a.enrich.matSector(r.material) || r.sector,
    precio: (r: (typeof filtered)[number]) => r.precioOferta,
    disp3130: (r: (typeof filtered)[number]) => r.disponible31_30,
    disp3132: (r: (typeof filtered)[number]) => r.disponible31_32,
    invsuma: (r: (typeof filtered)[number]) => r.invSuma,
    importe: (r: (typeof filtered)[number]) => r.importeInventario,
  }), [a.enrich]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(sorted.length);
  const colCount = (isAdmin ? 1 : 0) + 5 + 2 + CENTERS.length + 1 + 1;

  // Fixed pixel widths for the sticky (frozen) columns — the previous
  // hardcoded `left-[Npx]` offsets assumed specific column widths, but those
  // columns auto-sized to content (and the shared <Table> colgroup only ever
  // grows column widths, never shrinks them back), so as soon as real data
  // made one of them wider than assumed, every sticky column after it drifted
  // out of alignment with the header on horizontal scroll. Giving each a
  // fixed width (+ truncate) keeps the offsets always accurate, and also
  // accounts for the admin toggle column, which the old offsets ignored.
  const ADMIN_W = 36, MATERIAL_W = 160, CONDICION_W = 110, SECTOR_W = 140, PRECIO_W = 90;
  const adminLeft = 0;
  const materialLeft = isAdmin ? ADMIN_W : 0;
  const condicionLeft = materialLeft + MATERIAL_W;
  const sectorLeft = condicionLeft + CONDICION_W;
  const precioLeft = sectorLeft + SECTOR_W;

  if (!rows.length) {
    if (!bootstrapped) return <TableSkeleton />;
    return <EmptyState title={'No hay datos de "Inventario por condición".'} action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const exportar = () => {
    const rowsX = filtered.map((r) => {
      const o: Record<string, unknown> = {
        Material: r.material, Descripción: r.textoBreve, Condición: r.condicion,
        Sector: a.enrich.matSector(r.material) || r.sector, 'Grupo art.': a.enrich.matGrupo(r.material) || r.grupo,
        Precio: r.precioOferta, 'Disp 1031-1030': r.disponible31_30, 'Disp 1031-1032': r.disponible31_32,
      };
      CENTERS.forEach((c) => { o['Inv ' + c] = r.invByCenter[c] || 0; });
      o['Inv Suma'] = r.invSuma; o['Importe $'] = r.importeInventario;
      return o;
    });
    // Los renglones son material × condición (el inventario se reparte entre
    // centros), así que los lotes se anexan a nivel material — salvo que
    // haya un filtro de Centro activo, en cuyo caso se acotan también a ese
    // centro (si el material tiene 5 lotes en 3 centros y filtras por 1001,
    // solo se exportan los de 1001).
    const mats = new Set(filtered.map((r) => norm(r.material)));
    const lotesX = buildLotesSheet(a.lotes, (l) => mats.has(norm(l.material)) && (!centro || norm(l.centro) === centro));
    void exportXlsxMultiSheet(`inventario_${stamp()}.xlsx`, [
      { name: 'Inventario', rows: rowsX },
      { name: 'Detalle Lotes', rows: lotesX },
    ]);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-5">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Inv Condición</h2>
          <p className="text-sm text-text-muted">{formatNumber(filtered.length)} renglones · clic en cantidad = lotes del material</p></div>
        <div className="flex items-center gap-2">
          <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
          <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="inline-grid grid-cols-3 content-start gap-2">
          <StatTile compact label="Materiales" value={formatNumber(kpis.mats)} />
          <StatTile compact label="Stock" value={formatNumber(kpis.stock)} />
          <StatTile compact label="Importe $" value={formatCurrency(kpis.imp)} />
        </div>
        <Ranking title="Top 10 por Importe $" items={kpis.rk} money wide onRow={(m) => open({ type: 'material', material: m })} className="min-w-[420px] flex-1" />
      </div>

      {lotesPorVencer.length > 0 && (
        <Card className="p-3">
          <h4 className="mb-2 text-xs font-semibold text-text-muted">
            Lotes por vencer (≤90 días) con demanda activa · {lotesPorVencer.length}
          </h4>
          <div>
            <Table wrapperClassName="max-h-56 rounded-lg border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead><TableHead>Lote / Centro</TableHead>
                  <TableHead className="text-right">Disp.</TableHead><TableHead>Vence</TableHead>
                  <TableHead className="text-right">Consumo/mes</TableHead><TableHead>Ofrecer a</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotesPorVencer.map((l, i) => (
                  <RowContextMenu
                    key={i}
                    label={l.material}
                    onVerDetalle={() => open({ type: 'material', material: l.material })}
                    copyItems={[{ label: 'Material', value: l.material }, { label: 'Lote', value: l.lote }, { label: 'Cliente', value: l.topCliente?.razon ?? '' }]}
                  >
                    <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'material', material: l.material })}>
                      <TableCell><Chip onClick={() => open({ type: 'material', material: l.material })}>{l.material}</Chip><div className="text-[11px] text-text-faint max-w-56 truncate">{l.textoBreve}</div></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{l.lote || '—'} · {l.centro}</TableCell>
                      <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        <StatePill label={l.dias <= 31 ? `${l.dias} d` : `${l.dias} d`} cls={l.dias <= 31 ? 'rojo' : l.dias <= 60 ? 'amb' : 'gris'} />
                        <div className="text-[10px] text-text-faint">{formatFechaCaducidad(l.fechaCaducidad)}</div>
                      </TableCell>
                      <TableCell className="text-right">{l.demanda > 0 ? formatNumber(l.demanda) : <span className="text-text-faint">sin demanda</span>}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs">
                        {l.topCliente
                          ? <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: l.topCliente!.destinatario })}>{l.topCliente.razon || l.topCliente.destinatario}</Chip>
                          : <span className="text-text-faint">—</span>}
                      </TableCell>
                    </TableRow>
                  </RowContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
          <Input placeholder="Buscar material…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
        <select value={cond} onChange={(e) => setCond(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Condición (todas)</option>{conds.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sector} onChange={(e) => setSector(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Sector (todos)</option>{sectores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={centro} onChange={(e) => setCentro(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Centro (todos)</option>{CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button
          variant={isAdmin ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsAdmin((v) => !v)}
          className="gap-1.5"
        >
          {isAdmin ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
          {isAdmin ? 'Admin ON' : 'Admin'}
        </Button>
        <div className="ml-auto"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>
      </div>

      <ColumnFilterBar columns={filterCols} rows={rows} active={quick} onChange={setQuick} />

      <Card className="min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead className="sticky z-20 bg-bg-elevated" style={{ left: adminLeft, width: ADMIN_W, minWidth: ADMIN_W }}></TableHead>}
                <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: materialLeft, width: MATERIAL_W, minWidth: MATERIAL_W }}>Material</SortableTableHead>
                <SortableTableHead sortKey="condicion" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: condicionLeft, width: CONDICION_W, minWidth: CONDICION_W }}>Condición</SortableTableHead>
                <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: sectorLeft, width: SECTOR_W, minWidth: SECTOR_W }}>Sector/Grupo</SortableTableHead>
                <SortableTableHead sortKey="precio" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated text-right" style={{ left: precioLeft, width: PRECIO_W, minWidth: PRECIO_W }}>Precio</SortableTableHead>
                <SortableTableHead sortKey="disp3130" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Disp 31·30</SortableTableHead>
                <SortableTableHead sortKey="disp3132" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Disp 31·32</SortableTableHead>
                {CENTERS.map((c) => <TableHead key={c} className="text-right">Inv {c}</TableHead>)}
                <SortableTableHead sortKey="invsuma" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Inv Suma</SortableTableHead>
                <SortableTableHead sortKey="importe" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Importe $</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && <tr><td style={{ height: paddingTop }} colSpan={colCount} /></tr>}
              {items.map((vi) => {
                const r = sorted[vi.index];
                const corta = /corta/i.test(r.condicion);
                const key = rowKey(r.material, r.condicion);
                const isHidden = hidden.has(key);
                const onSolicitar = () => {
                  const lotesMaterial = a.lotes.filter((l) => norm(l.material) === norm(r.material));
                  const condicionesMat = a.enrich.matCondiciones(r.material).join(', ');
                  const loteOptions: LoteOption[] = lotesMaterial.map((l, idx) => ({
                    key: `${idx}|${l.centro}|${l.lote}`,
                    label: `Lote ${l.lote || '—'} · Centro ${l.centro} · ${formatNumber(l.cantidadDisp)}`,
                    draft: buildFromInvDetalle(l, a.enrich),
                    condicion: condicionesMat,
                  }));
                  const initial = lotesMaterial.length
                    ? buildFromInvDetalle(lotesMaterial[0], a.enrich)
                    : buildFromInvDetalle({ material: r.material, textoBreve: r.textoBreve, centro: '', almacen: '', lote: '', fechaCaducidad: null, cantidadDisp: 0 }, a.enrich);
                  solicitar.abrir(initial, loteOptions.length ? loteOptions : undefined);
                };
                const copyItems = [
                  { label: 'Material', value: r.material },
                  { label: 'Descripción', value: r.textoBreve },
                  { label: 'Condición', value: r.condicion },
                ];
                return (
                  <SolicitarContextMenu
                    key={key}
                    onSolicitar={onSolicitar}
                    solicitado={invSolicitadas.has(norm(r.material))}
                    label={r.material}
                    onVerDetalle={() => open({ type: 'material', material: r.material })}
                    copyItems={copyItems}
                  >
                  <TableRow className={cn(isAdmin && isHidden && 'opacity-40')}>
                    {isAdmin && (
                      <TableCell className="sticky z-10 bg-bg-elevated" style={{ left: adminLeft, width: ADMIN_W, minWidth: ADMIN_W }}>
                        <button
                          type="button"
                          title={isHidden ? 'Mostrar' : 'Ocultar'}
                          onClick={() => toggleHidden(key)}
                          className="text-sm"
                        >
                          {isHidden ? '↩' : '🚫'}
                        </button>
                      </TableCell>
                    )}
                    <TableCell className="sticky z-10 truncate bg-bg-elevated" style={{ left: materialLeft, width: MATERIAL_W, minWidth: MATERIAL_W }}><Chip onClick={() => open({ type: 'material', material: r.material })}>{r.material}</Chip><div className="truncate text-[11px] text-text-faint">{r.textoBreve}</div></TableCell>
                    <TableCell className="sticky z-10 bg-bg-elevated" style={{ left: condicionLeft, width: CONDICION_W, minWidth: CONDICION_W }}><StatePill label={r.condicion || '—'} cls={corta ? 'rojo' : 'gris'} /></TableCell>
                    <TableCell className="sticky z-10 truncate bg-bg-elevated" style={{ left: sectorLeft, width: SECTOR_W, minWidth: SECTOR_W }}>{a.enrich.matSector(r.material) || r.sector || '—'}<div className="truncate text-[11px] text-text-faint">{a.enrich.matGrupo(r.material) || r.grupo}</div></TableCell>
                    <TableCell className="sticky z-10 bg-bg-elevated text-right" style={{ left: precioLeft, width: PRECIO_W, minWidth: PRECIO_W }}>{r.precioOferta ? formatCurrency(r.precioOferta) : '—'}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.disponible31_30)}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.disponible31_32)}</TableCell>
                    {CENTERS.map((c) => (
                      <TableCell key={c} className="text-right">
                        <Chip onClick={() => open({ type: 'material', material: r.material })}>{formatNumber(r.invByCenter[c] || 0)}</Chip>
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">{formatNumber(r.invSuma)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.importeInventario)}</TableCell>
                  </TableRow>
                  </SolicitarContextMenu>
                );
              })}
              {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} colSpan={colCount} /></tr>}
            </TableBody>
          </Table>
        </div>
      </Card>

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}
