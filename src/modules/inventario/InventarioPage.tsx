import { useEffect, useMemo, useState } from 'react';
import { Search, Lock, LockOpen, Download, AlertTriangle, ChevronDown, ChevronRight, Maximize2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { buildLotesSheet } from '@/lib/lotesSheet';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore, type Panel } from '@/store/panelStore';
import type { InvDetalleRow } from '@/core/types';
import { StatePill, Chip, Ranking, StatTile, ZoomControl, useZoom, ColumnFilterBar, ColumnFilterMenu, passesFilters, useSavedViews, SavedViewsControl, RowContextMenu, ClearFiltersButton, useColumnVisibility, ColumnVisibilityControl, type ActiveFilter, type FilterColumn, type ColDef } from '@/modules/analytics/ui';
import { norm, matchesQuery } from '@/modules/analytics/helpers';
import { esCondicionCortaCaducidad } from '@/core/inventoryRules';
import { pendPorCondicion, transitoPorCondicion, esLentoPorCondicion } from '@/core/resumenSin';
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
import { useMaterialPrefiltro } from '@/hooks/useMaterialPrefiltro';
import { PrefiltroBanner } from '@/components/feedback/PrefiltroBanner';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useQuickFilters } from '@/hooks/useQuickFilters';

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

interface LotePorVencer extends InvDetalleRow {
  dias: number;
  demanda: number;
  topCliente?: { razon: string; destinatario: string; consumo: number };
}

/** Filtro de periodo de "Lotes por vencer": mayor/menor que N días, o todos
 * (sin acotar) — mismo control se repite en la tarjeta inline y en el modal
 * de mayor visibilidad, ambos leyendo/escribiendo el mismo estado del padre. */
function LotesPeriodoFiltro({ op, dias, onOpChange, onDiasChange }: {
  op: '' | 'gt' | 'lt';
  dias: number;
  onOpChange: (v: '' | 'gt' | 'lt') => void;
  onDiasChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={op}
        onChange={(e) => onOpChange(e.target.value as '' | 'gt' | 'lt')}
        className="h-7 rounded-md border border-border bg-bg-elevated px-1.5 text-xs"
      >
        <option value="">Todos</option>
        <option value="gt">Mayor que</option>
        <option value="lt">Menor que</option>
      </select>
      {op && (
        <>
          <input
            type="number"
            value={dias}
            onChange={(e) => onDiasChange(Number(e.target.value) || 0)}
            className="h-7 w-16 rounded-md border border-border bg-bg-elevated px-1.5 text-xs"
          />
          <span className="text-[11px] text-text-faint">días</span>
        </>
      )}
    </div>
  );
}

/** Tabla de "Lotes por vencer" — extraída para no duplicar el JSX entre la
 * tarjeta inline (lista acotada) y el modal de mayor visibilidad (lista
 * completa, sin acotar). */
function LotesPorVencerTable({ lotes, open, wrapperClassName }: {
  lotes: LotePorVencer[];
  open: (p: Panel) => void;
  wrapperClassName: string;
}) {
  if (!lotes.length) return <p className="text-sm text-text-muted">Sin lotes que cumplan el filtro de periodo.</p>;
  return (
    <Table wrapperClassName={wrapperClassName}>
      <TableHeader>
        <TableRow>
          <TableHead>Material</TableHead><TableHead>Lote / Centro</TableHead>
          <TableHead className="text-right">Disp.</TableHead><TableHead>Vence</TableHead>
          <TableHead className="text-right">Consumo/mes</TableHead><TableHead>Ofrecer a</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lotes.map((l, i) => (
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
                <StatePill label={`${l.dias} d`} cls={l.dias <= 31 ? 'rojo' : l.dias <= 60 ? 'amb' : 'gris'} />
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
  );
}

export function InventarioPage() {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const rows = a.invCondicion;
  const [q, setQ] = usePersistedState('inventario.q', '');
  const { prefiltro, clear: clearPrefiltro } = useMaterialPrefiltro(setQ);
  const [cond, setCond] = usePersistedState('inventario.cond', '');
  const [sector, setSector] = usePersistedState('inventario.sector', '');
  const [centro, setCentro] = usePersistedState('inventario.centro', '');
  const [isAdmin, setIsAdmin] = useState(readAdmin);
  const [hidden, setHidden] = useState<Set<string>>(readHidden);
  const [quick, setQuick] = useQuickFilters('inventario.quick');
  const zoom = useZoom('inventario_zoom');
  const clearFilters = () => { setQ(''); setCond(''); setSector(''); setCentro(''); setQuick([]); };

  const colVis = useColumnVisibility('inventario_columnas');
  const columnDefs: ColDef[] = useMemo(() => [
    { key: 'disp3130', label: 'Disp 31·30' },
    { key: 'disp3132', label: 'Disp 31·32' },
    ...CENTERS.map((c) => ({ key: `centro_${c}`, label: `Inv ${c}` })),
    { key: 'invsuma', label: 'Inv Suma' },
    { key: 'importe', label: 'Importe $' },
  ], []);

  // Vistas guardadas: snapshot de filtros (condicion/sector/centro/quick) + columnas ocultas, persistido entre sesiones.
  const savedViews = useSavedViews<{ cond: string; sector: string; centro: string; quick: ActiveFilter[]; hidden?: string[] }>('inventario_vistas');
  const applyView = (state: { cond: string; sector: string; centro: string; quick: ActiveFilter[]; hidden?: string[] }) => {
    setCond(state.cond); setSector(state.sector); setCentro(state.centro); setQuick(state.quick);
    if (state.hidden) colVis.apply(state.hidden);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { cond, sector, centro, quick, hidden: [...colVis.hidden] });
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

  // Periodo de "Lotes por vencer": mayor/menor que N días, o todos (sin
  // acotar) — antes era un umbral fijo (≤90 días).
  const [lotesOp, setLotesOp] = usePersistedState<'' | 'gt' | 'lt'>('inventario.lotesOp', 'lt');
  const [lotesDias, setLotesDias] = usePersistedState('inventario.lotesDias', 90);
  const [lotesColapsado, setLotesColapsado] = usePersistedState('inventario.lotesColapsado', false);
  const [lotesModalOpen, setLotesModalOpen] = useState(false);

  const lotesPorVencer = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return a.lotes
      .map((l) => {
        if (!l.fechaCaducidad) return null;
        const d = new Date(l.fechaCaducidad);
        if (Number.isNaN(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        const dias = Math.round((d.getTime() - now.getTime()) / 86400000);
        if (lotesOp === 'gt' && !(dias > lotesDias)) return null;
        if (lotesOp === 'lt' && !(dias < lotesDias)) return null;
        const cons = consumoPorMaterial.get(norm(l.material));
        const topCliente = cons ? [...cons.clientes.values()].sort((x, y) => y.consumo - x.consumo)[0] : undefined;
        return { ...l, dias, demanda: cons?.total ?? 0, topCliente };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((x, y) => (y.demanda > 0 ? 1 : 0) - (x.demanda > 0 ? 1 : 0) || x.dias - y.dias);
  }, [a.lotes, consumoPorMaterial, lotesOp, lotesDias]);
  const lotesLabel = lotesOp === 'gt' ? `> ${lotesDias} días` : lotesOp === 'lt' ? `< ${lotesDias} días` : 'todos';
  const hayLotesConCaducidad = useMemo(() => a.lotes.some((l) => l.fechaCaducidad), [a.lotes]);

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

  // El valor mostrado por centro es SIEMPRE el del reporte "InvConsolidado"
  // (`r.invByCenter[c]`, ya viene por condición desde la hoja), sin
  // recalcular contra RSS/InvDetalle — así la tabla nunca muestra un número
  // que no venga literal del reporte. El desglose por almacén (InvDetalle)
  // se ve al hacer clic en la celda, vía el panel `invCondCelda`.
  const invCond = (r: (typeof rows)[number], c: string) => r.invByCenter[c] || 0;
  // "Inv Suma" (y por tanto "Importe $") debe sumar también Disp 31-30 y
  // Disp 31-32 — así lo calcula el reporte original ("Inv Suma"/"Importe
  // Inventario $" de la hoja fuente), y antes se quedaban fuera al sumar solo
  // los centros nombrados (CENTERS).
  const invSumaCond = (r: (typeof rows)[number]) => CENTERS.reduce((s, c) => s + invCond(r, c), 0) + (r.disponible31_30 || 0) + (r.disponible31_32 || 0);
  // Pendiente/tránsito/lento por celda vienen de "Resumen Sin Sugerencias"
  // (por almacén), no de "InvConsolidado" — restringidos a los almacenes que
  // aplican según la condición (RN-INV-002: solo 1032 en corta caducidad,
  // 1030+1031+1060 en cualquier otro caso), igual que el módulo Inventario.
  const rssCentro = (r: (typeof rows)[number], c: string) => a.rss?.mats.get(norm(r.material))?.centros.get(c);

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
      if (centro && !(invCond(r, centro) > 0)) return false;
      if (!passesFilters(r, filterCols, quick)) return false;
      if (qd && !matchesQuery(qd, `${r.material} ${r.textoBreve}`)) return false;
      if (!isAdmin && hidden.has(rowKey(r.material, r.condicion))) return false;
      return true;
    });
  }, [rows, qd, cond, sector, centro, a.enrich, isAdmin, hidden, filterCols, quick]);

  const kpis = useMemo(() => {
    const mats = new Set(filtered.map((r) => norm(r.material)));
    const imp = filtered.reduce((s, r) => s + invSumaCond(r) * r.precioOferta, 0);
    const stock = filtered.reduce((s, r) => s + invSumaCond(r), 0);
    const rk = filtered.map((r) => ({ code: r.material, desc: r.textoBreve, val: invSumaCond(r) * r.precioOferta }))
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
    invsuma: (r: (typeof filtered)[number]) => invSumaCond(r),
    importe: (r: (typeof filtered)[number]) => invSumaCond(r) * r.precioOferta,
  }), [a.enrich]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(sorted.length);
  const visibleCenters = useMemo(() => CENTERS.filter((c) => colVis.isVisible(`centro_${c}`)), [colVis]);
  const colCount = (isAdmin ? 1 : 0) + 4
    + (colVis.isVisible('disp3130') ? 1 : 0) + (colVis.isVisible('disp3132') ? 1 : 0)
    + visibleCenters.length
    + (colVis.isVisible('invsuma') ? 1 : 0) + (colVis.isVisible('importe') ? 1 : 0);

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
      CENTERS.forEach((c) => { o['Inv ' + c] = invCond(r, c); });
      o['Inv Suma'] = invSumaCond(r); o['Importe $'] = invSumaCond(r) * r.precioOferta;
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
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-5">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Inv Condición</h2>
          <p className="text-sm text-text-muted">{formatNumber(filtered.length)} renglones · clic en material = detalle del material · clic en cantidad de un centro = detalle de ese centro</p></div>
        <div className="flex items-center gap-2">
          <ColumnVisibilityControl columns={columnDefs} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
          <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
          <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-start gap-3">
        <div className="inline-grid grid-cols-3 content-start gap-2">
          <StatTile compact label="Materiales" value={formatNumber(kpis.mats)} />
          <StatTile compact label="Stock" value={formatNumber(kpis.stock)} />
          <StatTile compact label="Importe $" value={formatCurrency(kpis.imp)} />
        </div>
        <Ranking title="Top 10 por Importe $" items={kpis.rk} money wide onRow={(m) => open({ type: 'material', material: m })} className="min-w-[420px] flex-1" />
      </div>

      {hayLotesConCaducidad && (
        <Card className="shrink-0 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setLotesColapsado((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text"
            >
              {lotesColapsado ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              Lotes por vencer ({lotesLabel}) con demanda activa · {lotesPorVencer.length}
            </button>
            <div className="flex items-center gap-2">
              <LotesPeriodoFiltro op={lotesOp} dias={lotesDias} onOpChange={setLotesOp} onDiasChange={setLotesDias} />
              <button
                type="button"
                onClick={() => setLotesModalOpen(true)}
                title="Ver en ventana grande"
                className="rounded-md border border-border p-1.5 text-text-faint hover:border-accent hover:text-accent"
              >
                <Maximize2 className="size-3.5" />
              </button>
            </div>
          </div>
          {!lotesColapsado && <LotesPorVencerTable lotes={lotesPorVencer.slice(0, 20)} open={open} wrapperClassName="max-h-56 rounded-lg border border-border" />}
        </Card>
      )}

      <Dialog open={lotesModalOpen} onOpenChange={setLotesModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Lotes por vencer ({lotesLabel}) con demanda activa · {lotesPorVencer.length}</DialogTitle>
          </DialogHeader>
          <div className="mb-2"><LotesPeriodoFiltro op={lotesOp} dias={lotesDias} onOpChange={setLotesOp} onDiasChange={setLotesDias} /></div>
          <LotesPorVencerTable lotes={lotesPorVencer} open={open} wrapperClassName="max-h-[65vh] rounded-lg border border-border" />
        </DialogContent>
      </Dialog>

      {prefiltro && <PrefiltroBanner material={prefiltro} onClear={clearPrefiltro} />}

      <div className="flex shrink-0 flex-wrap items-center gap-2">
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
        <p className="text-xs text-text-faint">Debajo de cada celda: <span className="text-danger">Pend</span> pendiente · <span className="text-emerald-500">+N</span> tránsito · <AlertTriangle className="inline size-3 text-warning" /> lento (≥6m sin consumo)</p>
        <Button
          variant={isAdmin ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsAdmin((v) => !v)}
          className="gap-1.5"
        >
          {isAdmin ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
          {isAdmin ? 'Admin ON' : 'Admin'}
        </Button>
        <ClearFiltersButton onClear={clearFilters} />
        <div className="ml-auto"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>
      </div>

      <ColumnFilterBar columns={filterCols} rows={rows} active={quick} onChange={setQuick} />

      <Card className="h-[36rem] shrink-0 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead className="sticky z-20 bg-bg-elevated" style={{ left: adminLeft, width: ADMIN_W, minWidth: ADMIN_W }}></TableHead>}
                <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: materialLeft, width: MATERIAL_W, minWidth: MATERIAL_W }} filter={<ColumnFilterMenu column={filterCols[0]} rows={rows} active={quick} onChange={setQuick} />}>Material</SortableTableHead>
                <SortableTableHead sortKey="condicion" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: condicionLeft, width: CONDICION_W, minWidth: CONDICION_W }} title="Fuente de pedido/condición del material: corta-caducidad, lento-movimiento, calidad, dañado o normal.">Condición</SortableTableHead>
                <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: sectorLeft, width: SECTOR_W, minWidth: SECTOR_W }} filter={<ColumnFilterMenu column={filterCols[2]} rows={rows} active={quick} onChange={setQuick} />} title="Sector y grupo de artículo del catálogo.">Sector/Grupo</SortableTableHead>
                <SortableTableHead sortKey="precio" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated text-right" style={{ left: precioLeft, width: PRECIO_W, minWidth: PRECIO_W }} title="Precio de oferta vigente para este material.">Precio</SortableTableHead>
                {colVis.isVisible('disp3130') && <SortableTableHead sortKey="disp3130" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Cantidad disponible para mover del centro 1031 (hub de distribución) al almacén 1030.">Disp 31·30</SortableTableHead>}
                {colVis.isVisible('disp3132') && <SortableTableHead sortKey="disp3132" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Cantidad disponible para mover del centro 1031 (hub de distribución) al almacén 1032.">Disp 31·32</SortableTableHead>}
                {visibleCenters.map((c) => <TableHead key={c} className="text-right" title={`Inventario de este material en el centro ${c}, tal como viene en el reporte "InvConsolidado". Clic = desglose por lote (InvDetalle). Debajo: pendiente (rojo) y tránsito ("+N", solo hacia los almacenes que aplican según la condición). El ícono ⚠ indica "lento" (≥6 meses sin consumo y sin pendiente en ese centro).`}>Inv {c}</TableHead>)}
                {colVis.isVisible('invsuma') && <SortableTableHead sortKey="invsuma" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Suma del inventario (por condición) de este material en todos los centros, más Disp 31-30 y Disp 31-32.">Inv Suma</SortableTableHead>}
                {colVis.isVisible('importe') && <SortableTableHead sortKey="importe" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Valor del inventario por condición (cantidad × precio de oferta).">Importe $</SortableTableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && <tr><td style={{ height: paddingTop }} colSpan={colCount} /></tr>}
              {items.map((vi) => {
                const r = sorted[vi.index];
                const corta = esCondicionCortaCaducidad(r.condicion);
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
                    {colVis.isVisible('disp3130') && <TableCell className="text-right">{formatNumber(r.disponible31_30)}</TableCell>}
                    {colVis.isVisible('disp3132') && <TableCell className="text-right">{formatNumber(r.disponible31_32)}</TableCell>}
                    {visibleCenters.map((c) => {
                      const co = rssCentro(r, c);
                      const pend = pendPorCondicion(co, r.condicion);
                      const transito = transitoPorCondicion(co, r.condicion);
                      const lento = a.rss ? esLentoPorCondicion(co, r.condicion, a.rss.curMes) : false;
                      return (
                        <TableCell key={c} className="text-right">
                          <Chip onClick={() => open({ type: 'invCondCelda', material: r.material, centro: c })}>{formatNumber(invCond(r, c))}</Chip>
                          {transito > 0 && <span className="text-emerald-500"> +{formatNumber(transito)}</span>}
                          {lento && <span title="Lento: sin consumo hace ≥6 meses y sin pendiente aplicable en este centro."><AlertTriangle className="ml-1 inline size-3 text-warning" /></span>}
                          {pend > 0 && <div className="text-[11px] text-danger">Pend {formatNumber(pend)}</div>}
                        </TableCell>
                      );
                    })}
                    {colVis.isVisible('invsuma') && <TableCell className="text-right font-medium">{formatNumber(invSumaCond(r))}</TableCell>}
                    {colVis.isVisible('importe') && <TableCell className="text-right">{formatCurrency(invSumaCond(r) * r.precioOferta)}</TableCell>}
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
