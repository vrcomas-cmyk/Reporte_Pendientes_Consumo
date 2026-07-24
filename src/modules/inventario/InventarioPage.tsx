import { useEffect, useMemo, useState } from 'react';
import { Search, Lock, LockOpen, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { buildLotesSheet } from '@/lib/lotesSheet';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, Chip, Ranking, StatTile, ZoomControl, useZoom } from '@/modules/analytics/ui';
import { norm, matchesQuery } from '@/modules/analytics/helpers';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useSort } from '@/hooks/useSort';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { buildFromInvDetalle } from '@/services/solicitudService';
import { useSolicitarDialog, type LoteOption } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitadoBadge } from '@/modules/solicitudes/SolicitadoBadge';
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
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const rows = a.invCondicion;
  const [q, setQ] = useState('');
  const [cond, setCond] = useState('');
  const [sector, setSector] = useState('');
  const [isAdmin, setIsAdmin] = useState(readAdmin);
  const [hidden, setHidden] = useState<Set<string>>(readHidden);
  const zoom = useZoom();
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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (cond && norm(r.condicion) !== cond) return false;
      if (sector && (a.enrich.matSector(r.material) || r.sector) !== sector) return false;
      if (qd && !matchesQuery(qd, `${r.material} ${r.textoBreve}`)) return false;
      if (!isAdmin && hidden.has(rowKey(r.material, r.condicion))) return false;
      return true;
    });
  }, [rows, qd, cond, sector, a.enrich, isAdmin, hidden]);

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
  const colCount = (isAdmin ? 1 : 0) + 5 + 2 + CENTERS.length + 1 + 1 + 1;

  if (!rows.length) {
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
    // centros), así que los lotes se anexan a nivel material.
    const mats = new Set(filtered.map((r) => norm(r.material)));
    const lotesX = buildLotesSheet(a.lotes, (l) => mats.has(norm(l.material)));
    void exportXlsxMultiSheet(`inventario_${stamp()}.xlsx`, [
      { name: 'Inventario', rows: rowsX },
      { name: 'Detalle Lotes', rows: lotesX },
    ]);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-5">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Inventario por Condición</h2>
          <p className="text-sm text-text-muted">{formatNumber(filtered.length)} renglones · clic en cantidad = lotes del material</p></div>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="inline-grid grid-cols-3 content-start gap-2">
          <StatTile compact label="Materiales" value={formatNumber(kpis.mats)} />
          <StatTile compact label="Stock" value={formatNumber(kpis.stock)} />
          <StatTile compact label="Importe $" value={formatCurrency(kpis.imp)} />
        </div>
        <Ranking title="Top 10 por Importe $" items={kpis.rk} money wide onRow={(m) => open({ type: 'material', material: m })} className="min-w-[420px] flex-1" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
          <Input placeholder="Buscar material…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" /></div>
        <select value={cond} onChange={(e) => setCond(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Condición (todas)</option>{conds.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sector} onChange={(e) => setSector(e.target.value)} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Sector (todos)</option>{sectores.map((s) => <option key={s} value={s}>{s}</option>)}
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

      <Card className="min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead></TableHead>}
                <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky left-0 z-20 bg-bg-elevated">Material</SortableTableHead>
                <SortableTableHead sortKey="condicion" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky left-[140px] z-20 bg-bg-elevated">Condición</SortableTableHead>
                <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky left-[260px] z-20 bg-bg-elevated">Sector/Grupo</SortableTableHead>
                <SortableTableHead sortKey="precio" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky left-[400px] z-20 bg-bg-elevated text-right">Precio</SortableTableHead>
                <SortableTableHead sortKey="disp3130" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Disp 31·30</SortableTableHead>
                <SortableTableHead sortKey="disp3132" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Disp 31·32</SortableTableHead>
                {CENTERS.map((c) => <TableHead key={c} className="text-right">Inv {c}</TableHead>)}
                <SortableTableHead sortKey="invsuma" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Inv Suma</SortableTableHead>
                <SortableTableHead sortKey="importe" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Importe $</SortableTableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && <tr><td style={{ height: paddingTop }} colSpan={colCount} /></tr>}
              {items.map((vi) => {
                const r = sorted[vi.index];
                const corta = /corta/i.test(r.condicion);
                const key = rowKey(r.material, r.condicion);
                const isHidden = hidden.has(key);
                return (
                  <TableRow key={key} className={cn(isAdmin && isHidden && 'opacity-40')}>
                    {isAdmin && (
                      <TableCell>
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
                    <TableCell className="sticky left-0 z-10 bg-bg-elevated"><Chip onClick={() => open({ type: 'material', material: r.material })}>{r.material}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{r.textoBreve}</div></TableCell>
                    <TableCell className="sticky left-[140px] z-10 bg-bg-elevated"><StatePill label={r.condicion || '—'} cls={corta ? 'rojo' : 'gris'} /></TableCell>
                    <TableCell className="sticky left-[260px] z-10 bg-bg-elevated">{a.enrich.matSector(r.material) || r.sector || '—'}<div className="text-[11px] text-text-faint">{a.enrich.matGrupo(r.material) || r.grupo}</div></TableCell>
                    <TableCell className="sticky left-[400px] z-10 bg-bg-elevated text-right">{r.precioOferta ? formatCurrency(r.precioOferta) : '—'}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.disponible31_30)}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.disponible31_32)}</TableCell>
                    {CENTERS.map((c) => (
                      <TableCell key={c} className="text-right">
                        <Chip onClick={() => open({ type: 'material', material: r.material })}>{formatNumber(r.invByCenter[c] || 0)}</Chip>
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">{formatNumber(r.invSuma)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.importeInventario)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const lotesMaterial = a.lotes.filter((l) => norm(l.material) === norm(r.material));
                            const loteOptions: LoteOption[] = lotesMaterial.map((l, idx) => ({
                              key: `${idx}|${l.centro}|${l.lote}`,
                              label: `Lote ${l.lote || '—'} · Centro ${l.centro} · ${formatNumber(l.cantidadDisp)}`,
                              draft: buildFromInvDetalle(l, a.enrich),
                            }));
                            const initial = lotesMaterial.length
                              ? buildFromInvDetalle(lotesMaterial[0], a.enrich)
                              : buildFromInvDetalle({ material: r.material, textoBreve: r.textoBreve, centro: '', almacen: '', lote: '', fechaCaducidad: null, cantidadDisp: 0 }, a.enrich);
                            solicitar.abrir(initial, loteOptions.length ? loteOptions : undefined);
                          }}
                        >
                          Solicitar
                        </Button>
                        <SolicitadoBadge solicitado={invSolicitadas.has(norm(r.material))} />
                      </div>
                    </TableCell>
                  </TableRow>
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
