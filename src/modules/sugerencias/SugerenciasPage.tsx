import { useMemo, useState } from 'react';
import { Download, ChevronDown, ClipboardList } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead, SortableTableHead } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useDataStore } from '@/store/dataStore';
import { useSort } from '@/hooks/useSort';
import { formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, TrendBadge, Chip, Ranking, StatTile, ZoomControl, useZoom, ColumnFilterBar, passesFilters, DebouncedSearch, useColumnVisibility, ColumnVisibilityControl, useSavedViews, SavedViewsControl, DateRangeFilter, ClearFiltersButton, type ActiveFilter, type FilterColumn, type ColDef } from '@/modules/analytics/ui';
import { enRango } from '@/lib/fechas';
import { ESTADOS } from '@/core/resumenFac';
import { norm, num, matchesQuery } from '@/modules/analytics/helpers';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { buildFromSugerencia, buildFromInventarioCentro, crear } from '@/services/solicitudService';
import { useSolicitarDialog, type LoteOption } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useMaterialPrefiltro } from '@/hooks/useMaterialPrefiltro';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { PrefiltroBanner } from '@/components/feedback/PrefiltroBanner';
import { Select } from '@/components/ui/select';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden, isDetailHidden } from '@/core/permissions';
import { toast } from '@/store/toastStore';
import { TooltipHint } from '@/components/ui/tooltip';
import { buildSugerenciasColsAgrupado } from './columns';
import type { Sugerencia } from '@/core/types';

const INV_COLS = ['1030', '1031', '1032'] as const;
const INV_ALL = ['1030', '1031', '1032', '1060'] as const;

/** Días transcurridos desde la fecha del pedido — misma tolerancia de formato
 * (dd/mm/yyyy, yyyy-mm-dd…) que el resto de la app, ya que el campo llega
 * como texto crudo del reporte. `null` si no se puede interpretar. */
function diasDesde(fecha: string): number | null {
  if (!fecha) return null;
  let d: Date | null = null;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(fecha);
  if (dmy) d = new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  else { const t = Date.parse(fecha); if (!Number.isNaN(t)) d = new Date(t); }
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - d.getTime()) / 86400000);
}

/** Semáforo de urgencia por antigüedad: 🟢 <15d · 🟡 15-30d · 🔴 >30d. */
function UrgenciaDot({ fecha }: { fecha: string }) {
  const dias = diasDesde(fecha);
  if (dias === null || dias < 0) return null;
  const cls = dias > 30 ? 'bg-danger' : dias > 15 ? 'bg-warning' : 'bg-emerald-500';
  return (
    <TooltipHint text={`${dias} día(s) desde el pedido`}>
      <span tabIndex={0} className={`inline-block size-1.5 rounded-full outline-none ${cls}`} />
    </TooltipHint>
  );
}

type BORow = (ReturnType<typeof useAnalytics>['bo'])[number];
/** One "Desagrupar" row: a BO item plus the specific fuente (alternate supply
 * source) it represents, or `null` for the BO's own row when it has none. */
interface RawRow { it: BORow; f: Sugerencia | null; key: string }

export function SugerenciasPage() {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const addSolicitud = useSolicitudStore((s) => s.add);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const perms = usePermissionsStore((s) => s.perms);
  const precioOculto = isColumnHidden(perms, 'sugerencias', 'precio');
  // "Desagrupar" and the "Fuentes" count/detail only exist to expose fuente
  // (alternate supply source) data — when that detail is hidden for this
  // role, skip the whole thing instead of trying to redact it column by
  // column inside a view whose entire point is showing it.
  const fuenteOculto = isDetailHidden(perms, 'sugerencias', 'fuente');
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
  const [q, setQ] = usePersistedState('sugerencias.q', '');
  const { prefiltro, clear: clearPrefiltro } = useMaterialPrefiltro(setQ);
  const [estado, setEstado] = usePersistedState('sugerencias.estado', '');
  const [fuente, setFuente] = usePersistedState('sugerencias.fuente', '');
  const [centroValido, setCentroValido] = usePersistedState('sugerencias.centroValido', false);
  const [soloAccionables, setSoloAccionables] = usePersistedState('sugerencias.soloAccionables', false);
  const [ocultarPend0, setOcultarPend0] = usePersistedState('sugerencias.ocultarPend0', false);
  const [quick, setQuick] = usePersistedState<ActiveFilter[]>('sugerencias.quick', []);
  useUrlFilters(quick, setQuick);
  const [rango, setRango] = usePersistedState<{ desde: string; hasta: string }>('sugerencias.rango', { desde: '', hasta: '' });
  const [clearTick, setClearTick] = useState(0);
  const clearFilters = () => {
    setQ(''); setEstado(''); setFuente(''); setCentroValido(false); setSoloAccionables(false); setOcultarPend0(false); setQuick([]); setRango({ desde: '', hasta: '' });
    setClearTick((n) => n + 1);
  };
  const [sectorOpen, setSectorOpen] = useState(false);
  const [openSector, setOpenSector] = useState<string | null>(null);
  const [agrupadoState, setAgrupado] = usePersistedState('sugerencias.agrupado', true);
  const agrupado = fuenteOculto || agrupadoState;
  const zoom = useZoom('sugerencias_zoom');

  const e = a.enrich;
  const grupoCli = (b: BORow['bo']) => e.grupoCliente(b.gpoCte) || norm(b.gpoCte);
  const ejec = (b: BORow['bo']) => e.ejecutivoNombre(b.gpoVdor);

  // For fuente "Corta caducidad": centro sugerido debe ser 1031/1022/1017, o
  // igualar al centro del pedido. Cualquier otra fuente (o ninguna) pasa siempre.
  const CENTROS_CORTA = ['1031', '1022', '1017'];
  const centroPasa = (b: BORow['bo'], f: Sugerencia | null) => {
    if (!f) return true;
    if (!/corta/i.test(f.fuente)) return true;
    return CENTROS_CORTA.includes(f.centroSugerido) || f.centroSugerido === b.centroPedido;
  };

  const filterCols: FilterColumn<BORow>[] = useMemo(() => [
    { key: 'pedido', label: 'Pedido', get: (it) => it.bo.pedido },
    { key: 'oc', label: 'OC', get: (it) => it.bo.oc },
    { key: 'fecha', label: 'Fecha', get: (it) => it.bo.fecha },
    { key: 'cliente', label: 'Cliente (razón social)', get: (it) => it.bo.razonSocial },
    { key: 'solicitante', label: 'Solicitante', get: (it) => it.bo.solicitante },
    { key: 'destinatario', label: 'Destinatario', get: (it) => it.bo.destinatario },
    { key: 'grupocli', label: 'Grupo cliente', get: (it) => grupoCli(it.bo) },
    { key: 'ejecutivo', label: 'Ejecutivo', get: (it) => ejec(it.bo) },
    { key: 'centro', label: 'Centro', get: (it) => it.bo.centroPedido },
    { key: 'almacen', label: 'Almacén', get: (it) => it.bo.almacen },
    { key: 'material', label: 'Material', get: (it) => it.bo.materialBase },
    { key: 'sector', label: 'Sector', get: (it) => e.matSector(it.bo.materialBase) },
    { key: 'grupoart', label: 'Grupo artículo', get: (it) => e.matGrupo(it.bo.materialBase) },
    { key: 'bloq', label: 'Bloqueado', get: (it) => it.bo.bloqueado },
    { key: 'estado', label: 'Estado', get: (it) => it.status.label },
    { key: 'tendencia', label: 'Tendencia', get: (it) => it.tend.txt },
    ...(fuenteOculto ? [] : [
      { key: 'fuente', label: 'Fuente', getMany: (it: BORow) => it.fuentes.map((f) => f.fuente).filter(Boolean) },
      { key: 'matsug', label: 'Material sugerido', getMany: (it: BORow) => it.fuentes.map((f) => f.materialSugerido).filter(Boolean) },
      { key: 'centrosug', label: 'Centro Sugerido', getMany: (it: BORow) => it.fuentes.map((f) => f.centroSugerido).filter(Boolean) },
      { key: 'almacensug', label: 'Almacén sugerido', getMany: (it: BORow) => it.fuentes.map((f) => f.almacenSugerido).filter(Boolean) },
      { key: 'lote', label: 'Lote', getMany: (it: BORow) => it.fuentes.map((f) => f.lote).filter(Boolean) },
    ]),
  ], [e, fuenteOculto]);

  const filtered = useMemo(() => {
    return a.bo.filter((it) => {
      const b = it.bo;
      if (estado && it.status.key !== estado) return false;
      if (fuente === 'si' && !it.fuentes.length) return false;
      if (fuente === 'no' && it.fuentes.length) return false;
      if (centroValido && it.fuentes.length && !it.fuentes.some((f) => centroPasa(b, f))) return false;
      // "Solo accionables": pendiente con fuente disponible, sin bloqueo, y con
      // al menos una fuente en centro válido — lo que realmente se puede
      // resolver hoy, sin tener que combinar Fuentes + Centro válido a mano.
      if (soloAccionables && (num(b.cantidadPendiente) <= 0 || !it.fuentes.length || b.bloqueado || !it.fuentes.some((f) => centroPasa(b, f)))) return false;
      if (ocultarPend0 && num(b.cantidadPendiente) <= 0) return false;
      if (!passesFilters(it, filterCols, quick)) return false;
      if (!enRango(b.fecha, rango.desde, rango.hasta)) return false;
      if (q) {
        const hay = `${b.materialBase} ${b.descripcionSolicitada} ${b.pedido} ${b.razonSocial} ${b.solicitante} ${b.destinatario}`;
        if (!matchesQuery(q, hay)) return false;
      }
      return true;
    });
  }, [a.bo, q, estado, fuente, centroValido, soloAccionables, ocultarPend0, quick, rango, filterCols]);

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

  const toggleSelected = (k: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // Envía en lote las filas marcadas (siempre con fuente — sin eso no hay de
  // dónde surtir), usando su primera fuente como origen por defecto, sin
  // pasar por el diálogo uno por uno. El usuario puede revisar/ajustar cada
  // una después desde "Solicitudes DRP" si algo no quedó bien.
  const solicitarSeleccionados = async () => {
    const items = sorted.filter((it) => selected.has(it.k) && it.fuentes.length > 0);
    if (!items.length) return;
    setBulkSending(true);
    let ok = 0, fail = 0;
    for (const it of items) {
      try {
        const draft = buildFromSugerencia(it.bo, it.k, it.fuentes[0], e);
        const solicitud = await crear(draft);
        addSolicitud(solicitud);
        if (solicitud.sync === 'error') fail++; else ok++;
      } catch {
        fail++;
      }
    }
    setBulkSending(false);
    setSelected(new Set());
    if (fail) toast.warning(`Solicitadas ${ok} de ${items.length}`, `${fail} fallaron — revísalas en Solicitudes DRP`);
    else toast.success(`Solicitadas ${ok} de ${items.length}`);
  };

  const colVis = useColumnVisibility('sugerencias_columnas');
  const vis = colVis.isVisible;
  const [unificarInv, setUnificarInv] = usePersistedState('sugerencias.unificarInv', false);
  const invTotal = (b: BORow['bo']) => INV_ALL.reduce((s, c) => s + num(b.invByCenter[c] || 0), 0);
  const invTransitoTotal = (b: BORow['bo']) => INV_COLS.reduce((s, c) => s + transitoFor(b.centroPedido, c, b.materialBase), 0);

  // Vistas guardadas: snapshot de columnas ocultas + unificar inventario, persistido entre sesiones.
  const savedViews = useSavedViews<{ hidden: string[]; unificarInv: boolean }>('sugerencias_vistas');
  const applyView = (state: { hidden: string[]; unificarInv: boolean }) => {
    colVis.apply(state.hidden);
    setUnificarInv(state.unificarInv);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { hidden: [...colVis.hidden], unificarInv });

  const COLS_AGRUPADO: ColDef[] = buildSugerenciasColsAgrupado({ precioOculto, unificarInv, fuenteOculto });
  const COLS_COMMON: ColDef[] = fuenteOculto ? COLS_AGRUPADO : COLS_AGRUPADO.slice(0, -1);
  const COLS_RAW: ColDef[] = [
    ...COLS_COMMON,
    { key: 'fuente', label: 'Fuente' }, { key: 'matsug', label: 'Material sugerido' },
    { key: 'centrosug', label: 'Centro sugerido' }, { key: 'disponible', label: 'Disponible / Lote / Cad.' },
  ];

  const COL_COUNT = COLS_AGRUPADO.filter((c) => vis(c.key)).length + (fuenteOculto ? 0 : 1);
  const COL_COUNT_RAW = COLS_RAW.filter((c) => vis(c.key)).length;
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
    invtotal: (it: (typeof filtered)[number]) => invTotal(it.bo),
    bloq: (it: (typeof filtered)[number]) => it.bo.bloqueado,
    estado: (it: (typeof filtered)[number]) => it.status.label,
    tendencia: (it: (typeof filtered)[number]) => it.tend.txt,
    fuentes: (it: (typeof filtered)[number]) => it.fuentes.length,
  }), [e, grupoCli, ejec]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  const { scrollRef, items, paddingTop, paddingBottom, measureElement } = useRowVirtualizer(sorted.length);

  // "Desagrupado": mirrors the raw sheet 1-to-1 — the origin row (no fuente,
  // the actual pending order) PLUS one row per fuente (alternate supply
  // source), same as "Todas las Sugerencias" lists them. Previously this only
  // rendered the fuente rows and dropped the origin row whenever fuentes
  // existed, so a BO with, say, 6 fuentes lost its origin renglón entirely.
  const flatRaw = useMemo(() => {
    const rows: RawRow[] = [];
    filtered.forEach((it) => {
      rows.push({ it, f: null, key: it.k });
      const fuentesOk = centroValido ? it.fuentes.filter((f) => centroPasa(it.bo, f)) : it.fuentes;
      fuentesOk.forEach((f, idx) => rows.push({ it, f, key: `${it.k}|${idx}` }));
    });
    return rows;
  }, [filtered, centroValido]);
  const sortAccRaw = useMemo(() => ({
    pedido: (r: RawRow) => r.it.bo.pedido,
    fecha: (r: RawRow) => r.it.bo.fecha,
    cliente: (r: RawRow) => r.it.bo.razonSocial,
    ejecutivo: (r: RawRow) => ejec(r.it.bo),
    centro: (r: RawRow) => r.it.bo.centroPedido,
    material: (r: RawRow) => r.it.bo.materialBase,
    sector: (r: RawRow) => e.matSector(r.it.bo.materialBase),
    cantped: (r: RawRow) => num(r.it.bo.cantidadPedido),
    pend: (r: RawRow) => num(r.it.bo.cantidadPendiente),
    precio: (r: RawRow) => num(r.it.bo.precio),
    consumo: (r: RawRow) => num(r.it.consumoProm),
    inv1030: (r: RawRow) => num(r.it.bo.invByCenter['1030'] || 0),
    inv1031: (r: RawRow) => num(r.it.bo.invByCenter['1031'] || 0),
    inv1032: (r: RawRow) => num(r.it.bo.invByCenter['1032'] || 0),
    inv1060: (r: RawRow) => num(r.it.bo.invByCenter['1060'] || 0),
    invtotal: (r: RawRow) => invTotal(r.it.bo),
    bloq: (r: RawRow) => r.it.bo.bloqueado,
    estado: (r: RawRow) => r.it.status.label,
    tendencia: (r: RawRow) => r.it.tend.txt,
    fuente: (r: RawRow) => r.f?.fuente ?? '',
    matsug: (r: RawRow) => r.f?.materialSugerido ?? '',
    centrosug: (r: RawRow) => r.f?.centroSugerido ?? '',
    disponible: (r: RawRow) => (r.f ? num(r.f.disponible) : -1),
  }), [e, ejec]);
  const { sorted: sortedRaw, sortKey: sortKeyRaw, dir: dirRaw, toggleSort: toggleSortRaw } = useSort(flatRaw, sortAccRaw);
  const { scrollRef: scrollRefRaw, items: itemsRaw, paddingTop: paddingTopRaw, paddingBottom: paddingBottomRaw, measureElement: measureElementRaw } = useRowVirtualizer(sortedRaw.length);
  // Matches `buildFromSugerencia`'s own `sourceKey` convention exactly, so
  // "ya solicitado" reflects this specific fuente, not just the parent BO.
  const rawSolicitadas = useMemo(() => {
    const set = new Set<string>();
    for (const s of solicitudesList) {
      if (s.origen !== 'sugerencias') continue;
      set.add(s.sourceKey);
    }
    return set;
  }, [solicitudesList]);

  if (!a.result || !a.bo.length) {
    if (!bootstrapped) return <TableSkeleton />;
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

  const exportarRaw = () => {
    const rowsX = flatRaw.map(({ it, f }) => {
      const b = it.bo;
      return {
        Pedido: b.pedido, OC: b.oc, Fecha: b.fecha,
        'Razón social': b.razonSocial, Solicitante: b.solicitante, Destinatario: b.destinatario,
        Ejecutivo: ejec(b), Centro: b.centroPedido, Almacén: b.almacen,
        'Material base': b.materialBase, Descripción: b.descripcionSolicitada, Sector: e.matSector(b.materialBase), 'Grupo art.': e.matGrupo(b.materialBase),
        'Cant. pedida': num(b.cantidadPedido), Pendiente: num(b.cantidadPendiente), Precio: num(b.precio), 'Consumo prom.': num(it.consumoProm),
        'Inv 1030': num(b.invByCenter['1030'] || 0), 'Inv 1031': num(b.invByCenter['1031'] || 0), 'Inv 1032': num(b.invByCenter['1032'] || 0), 'Inv 1060': num(b.invByCenter['1060'] || 0),
        Bloqueado: b.bloqueado, Estado: it.status.label, Tendencia: it.tend.txt,
        Fuente: f?.fuente || '', 'Material sugerido': f?.materialSugerido || '', 'Descripción sugerida': f?.descripcionSugerida || '',
        'Centro sugerido': f?.centroSugerido || '', 'Almacén sugerido': f?.almacenSugerido || '',
        Disponible: f ? num(f.disponible) : '', Lote: f?.lote || '', 'Fecha caducidad': f?.fechaCaducidad || '',
        'Meses vigencia lote': f ? num(f.mesesVigenciaLote) : '',
      };
    });
    void exportXlsx(`sugerencias_detalle_${stamp()}.xlsx`, rowsX, 'Sugerencias (detalle)');
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Pedidos</h2>
          <p className="text-sm text-text-muted">
            {agrupado
              ? <>Órdenes pendientes deduplicadas (BO) · {formatNumber(filtered.length)} renglones</>
              : <>Detalle por fuente, sin agrupar · {formatNumber(flatRaw.length)} renglones</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!fuenteOculto && (
            <div className="inline-flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
              <button onClick={() => setAgrupado(true)} className={`rounded px-2 py-1 ${agrupado ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}`}>Agrupar</button>
              <button onClick={() => setAgrupado(false)} className={`rounded px-2 py-1 ${!agrupado ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text'}`}>Desagrupar</button>
            </div>
          )}
          <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm" title="Suma 1030+1031+1032+1060 en una sola columna">
            <input type="checkbox" checked={unificarInv} onChange={(ev) => setUnificarInv(ev.target.checked)} />
            Unificar inventario
          </label>
          <ColumnVisibilityControl columns={agrupado ? COLS_AGRUPADO : COLS_RAW} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
          <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
          {agrupado && selected.size > 0 && (
            <Button size="sm" onClick={solicitarSeleccionados} disabled={bulkSending}>
              <ClipboardList className="mr-1 size-3.5" />
              {bulkSending ? 'Solicitando…' : `Solicitar seleccionados (${selected.size})`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={agrupado ? exportar : exportarRaw}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
        </div>
      </div>

      {agrupado && (
      <div className="flex flex-wrap items-start gap-3">
        <div className="inline-grid grid-cols-2 content-start gap-2">
          <StatTile compact label="Renglones BO" value={formatNumber(filtered.length)} />
          <StatTile compact label="Cant. pendiente" value={formatNumber(kpis.pendTot)} sub={<>🟢 {formatNumber(kpis.pendTot - kpis.pendBloq)} · 🟡 {formatNumber(kpis.pendBloq)}</>} />
          <StatTile compact label="Importe pendiente" value={formatCurrency(kpis.impTot)} />
          {!fuenteOculto && <StatTile compact label="Con fuentes" value={formatNumber(kpis.conF)} />}
        </div>
        <Ranking title="Top 10 material por importe pendiente" items={kpis.rk} money wide onRow={(m) => open({ type: 'material', material: m })} className="min-w-[420px] flex-1" />
      </div>
      )}

      {agrupado && (
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
      )}

      {prefiltro && <PrefiltroBanner material={prefiltro} onClear={clearPrefiltro} />}

      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearch key={clearTick} initialValue={q} onChange={setQ} placeholder="Buscar material, pedido, cliente…" />
        <Select value={estado} onChange={(ev) => setEstado(ev.target.value)} className="w-auto">
          <option value="">Estado (todos)</option>
          {ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        {!fuenteOculto && (
          <Select value={fuente} onChange={(ev) => setFuente(ev.target.value)} className="w-auto">
            <option value="">Fuentes</option><option value="si">Con fuentes</option><option value="no">Sin fuentes</option>
          </Select>
        )}
        {!fuenteOculto && (
          <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm" title="Para fuente Corta caducidad, exige centro sugerido 1031/1022/1017 o igual al centro del pedido. Otras fuentes no se filtran.">
            <input type="checkbox" checked={centroValido} onChange={(ev) => setCentroValido(ev.target.checked)} />
            Centro válido (Corta cad.)
          </label>
        )}
        {!fuenteOculto && (
          <button
            type="button"
            onClick={() => setSoloAccionables((v) => !v)}
            title="Pendiente + con fuente + sin bloqueo + centro válido: lo que se puede resolver hoy"
            className={`flex h-9 items-center gap-1.5 rounded-md border px-2 text-sm ${soloAccionables ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-bg-elevated text-text-muted hover:text-text'}`}
          >
            Solo accionables
          </button>
        )}
        <button
          type="button"
          onClick={() => setOcultarPend0((v) => !v)}
          title="Excluye los renglones ya surtidos (Pendiente = 0)"
          className={`flex h-9 items-center gap-1.5 rounded-md border px-2 text-sm ${ocultarPend0 ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-bg-elevated text-text-muted hover:text-text'}`}
        >
          Ocultar pendiente 0
        </button>
        <DateRangeFilter desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
        <ClearFiltersButton onClear={clearFilters} />
      </div>

      <ColumnFilterBar columns={filterCols} rows={a.bo} active={quick} onChange={setQuick} />

      <div className="flex justify-end"><ZoomControl level={zoom.level} setLevel={zoom.setLevel} /></div>

      {agrupado ? (
      <Card className="min-h-[640px] shrink-0 overflow-hidden">
        <div ref={scrollRef} className="h-[640px] overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible" resizableKey="sugerencias.agrupado.cols">
            <TableHeader>
              <TableRow>
                {!fuenteOculto && (
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      title="Seleccionar todas las visibles con fuente"
                      checked={sorted.some((it) => it.fuentes.length > 0) && sorted.filter((it) => it.fuentes.length > 0).every((it) => selected.has(it.k))}
                      onChange={(ev) => setSelected(ev.target.checked ? new Set(sorted.filter((it) => it.fuentes.length > 0).map((it) => it.k)) : new Set())}
                    />
                  </TableHead>
                )}
                {([
                  ['ejecutivo', 'Ejecutivo / Grupo cli.'], ['pedido', 'Pedido/OC'], ['fecha', 'Fecha'], ['cliente', 'Cliente'],
                  ['centro', 'Centro/Alm'], ['material', 'Material'], ['sector', 'Sector/Grupo'],
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKey} dir={dir} onSort={toggleSort}>{l}</SortableTableHead>)}
                {([
                  ['cantped', 'Cant.ped.'], ['pend', 'Pend.'], ...(precioOculto ? [] : [['precio', 'Precio'] as const]), ['consumo', 'Consumo'],
                  ...(unificarInv ? [['invtotal', 'Inv. total'] as const] : [['inv1030', '1030'] as const, ['inv1031', '1031'] as const, ['inv1032', '1032'] as const, ['inv1060', '1060'] as const]),
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">{l}</SortableTableHead>)}
                {([
                  ['bloq', 'Bloq.'], ['estado', 'Estado'], ['tendencia', 'Tendencia'],
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKey} dir={dir} onSort={toggleSort}>{l}</SortableTableHead>)}
                {!fuenteOculto && vis('fuentes') && <SortableTableHead sortKey="fuentes" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Fuentes</SortableTableHead>}
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
                const condicionesMat = e.matCondiciones(b.materialBase).join(', ');
                const invOpciones: { centro: string; almacen: string; cantidad: number }[] = [
                  { centro: '1031', almacen: '1030', cantidad: num(b.invByCenter['1030'] || 0) },
                  { centro: '1031', almacen: '1032', cantidad: num(b.invByCenter['1032'] || 0) },
                  ...(e.matSector(b.materialBase) === 'Suturas' ? [{ centro: '1018', almacen: '', cantidad: num(b.invByCenter['1018'] || 0) }] : []),
                ].filter((o) => o.cantidad > 0);
                const loteOptions: LoteOption[] = [
                  ...invOpciones.map((o) => ({
                    key: `inv|${o.centro}|${o.almacen}`,
                    label: `Inventario · Centro ${o.centro}${o.almacen ? ` / Alm ${o.almacen}` : ''} · ${formatNumber(o.cantidad)}`,
                    draft: buildFromInventarioCentro(b, it.k, o.centro, o.almacen || o.centro, o.cantidad, e),
                    condicion: condicionesMat,
                  })),
                  ...it.fuentes.map((f, idx) => ({
                    key: `fuente|${idx}|${f.lote}`,
                    label: `Lote ${f.lote || '—'} · Centro ${f.centroSugerido || '—'} · ${formatNumber(num(f.cantidadOfertar))} ${e.matUm(f.materialSugerido) || ''}`.trim(),
                    draft: buildFromSugerencia(b, it.k, f, e),
                    condicion: condicionesMat,
                  })),
                ];
                const onSolicitar = () => solicitar.abrir(
                  loteOptions[0]?.draft ?? buildFromSugerencia(b, it.k, it.fuentes[0] ?? null, e),
                  loteOptions.length ? loteOptions : undefined,
                );
                const copyItems = [
                  { label: 'Material', value: b.materialBase },
                  { label: 'Pedido', value: b.pedido },
                  { label: 'Cliente', value: b.razonSocial },
                  { label: 'Centro', value: b.centroPedido },
                ];
                return (
                  <SolicitarContextMenu
                    key={it.k}
                    onSolicitar={onSolicitar}
                    solicitado={sugSolicitadas.has(it.k)}
                    label={b.materialBase}
                    onVerDetalle={() => open({ type: 'pedido', pedido: b.pedido, boKey: it.k })}
                    copyItems={copyItems}
                  >
                  <TableRow ref={measureElement} data-index={vi.index} title="Doble clic para ver detalle" className={`cursor-pointer ${isBloqueado ? 'bg-amber-400/20 hover:bg-amber-400/30' : ''}`} onDoubleClick={() => open({ type: 'pedido', pedido: b.pedido, boKey: it.k })}>
                    {!fuenteOculto && (
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        {it.fuentes.length > 0 && (
                          <input type="checkbox" checked={selected.has(it.k)} onChange={() => toggleSelected(it.k)} title="Seleccionar para solicitar en lote" />
                        )}
                      </TableCell>
                    )}
                    {vis('ejecutivo') && <TableCell><Chip onClick={() => addQuick('ejecutivo', ejec(b))} title="Filtrar por ejecutivo">{ejec(b) || '—'}</Chip><div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', grupoCli(b))} title="Filtrar por grupo">{grupoCli(b) || '—'}</Chip></div></TableCell>}
                    {vis('pedido') && <TableCell><Chip onClick={() => open({ type: 'pedido', pedido: b.pedido })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>}
                    {vis('fecha') && <TableCell className="whitespace-nowrap text-xs"><span className="inline-flex items-center gap-1"><UrgenciaDot fecha={b.fecha} />{b.fecha || '—'}</span></TableCell>}
                    {vis('cliente') && <TableCell className="max-w-64 truncate">{b.razonSocial}<div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: b.solicitante })}>S {b.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: b.destinatario })}>D {b.destinatario}</Chip></div></TableCell>}
                    {vis('centro') && <TableCell>{b.centroPedido}{b.almacen ? ` / ${b.almacen}` : ''}</TableCell>}
                    {vis('material') && <TableCell><Chip onClick={() => open({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{b.descripcionSolicitada}</div>{!precioOculto && e.matPrecioOferta(b.materialBase) > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Of. {formatCurrency(e.matPrecioOferta(b.materialBase))}</div>}</TableCell>}
                    {vis('sector') && <TableCell>{e.matSector(b.materialBase) || '—'}<div className="text-[11px] text-text-faint">{e.matGrupo(b.materialBase)}</div></TableCell>}
                    {vis('cantped') && <TableCell className="text-right">{formatNumber(b.cantidadPedido)}</TableCell>}
                    {vis('pend') && <TableCell className="text-right">{formatNumber(b.cantidadPendiente)}</TableCell>}
                    {!precioOculto && vis('precio') && <TableCell className="text-right">{formatCurrency(b.precio)}</TableCell>}
                    {vis('consumo') && <TableCell className="text-right">{formatNumber(it.consumoProm)}</TableCell>}
                    {unificarInv ? (
                      vis('invtotal') && (
                        <TableCell className="text-right" title={INV_ALL.map((c) => `${c}: ${formatNumber(num(b.invByCenter[c] || 0))}`).join(' · ')}>
                          {formatNumber(invTotal(b))}
                          {invTransitoTotal(b) > 0 && <div className="text-[10px] text-emerald-500">↻+{formatNumber(invTransitoTotal(b))}</div>}
                        </TableCell>
                      )
                    ) : (
                      <>
                        {INV_COLS.filter((alm) => vis(`inv${alm}`)).map((alm) => {
                          const invVal = num(b.invByCenter[alm] || 0);
                          const tr = transitoFor(b.centroPedido, alm, b.materialBase);
                          return (
                            <TableCell key={alm} className="text-right">
                              {formatNumber(invVal)}
                              {tr > 0 && <div className="text-[10px] text-emerald-500">↻+{formatNumber(tr)}</div>}
                            </TableCell>
                          );
                        })}
                        {vis('inv1060') && <TableCell className="text-right">{formatNumber(b.invByCenter['1060'] || 0)}</TableCell>}
                      </>
                    )}
                    {vis('bloq') && <TableCell>{b.bloqueado ? <StatePill label={b.bloqueado} cls="amb" /> : '—'}</TableCell>}
                    {vis('estado') && <TableCell><StatePill label={it.status.label} cls={it.status.cls} /></TableCell>}
                    {vis('tendencia') && <TableCell><TrendBadge t={it.tend} /></TableCell>}
                    {!fuenteOculto && vis('fuentes') && <TableCell className="text-right">{it.fuentes.length || '—'}</TableCell>}
                  </TableRow>
                  </SolicitarContextMenu>
                );
              })}
              {paddingBottom > 0 && (
                <tr><td style={{ height: paddingBottom }} colSpan={COL_COUNT} /></tr>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      ) : (
      <Card className="min-h-[640px] shrink-0 overflow-hidden">
        <div ref={scrollRefRaw} className="h-[640px] overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible" resizableKey="sugerencias.raw.cols">
            <TableHeader>
              <TableRow>
                {([
                  ['ejecutivo', 'Ejecutivo / Grupo cli.'], ['pedido', 'Pedido/OC'], ['fecha', 'Fecha'], ['cliente', 'Cliente'],
                  ['centro', 'Centro/Alm'], ['material', 'Material'], ['sector', 'Sector/Grupo'],
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>{l}</SortableTableHead>)}
                {([
                  ['cantped', 'Cant.ped.'], ['pend', 'Pend.'], ...(precioOculto ? [] : [['precio', 'Precio'] as const]), ['consumo', 'Consumo'],
                  ...(unificarInv ? [['invtotal', 'Inv. total'] as const] : [['inv1030', '1030'] as const, ['inv1031', '1031'] as const, ['inv1032', '1032'] as const, ['inv1060', '1060'] as const]),
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw} className="text-right justify-end">{l}</SortableTableHead>)}
                {([
                  ['bloq', 'Bloq.'], ['estado', 'Estado'], ['tendencia', 'Tendencia'],
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>{l}</SortableTableHead>)}
                {vis('fuente') && <SortableTableHead sortKey="fuente" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>Fuente</SortableTableHead>}
                {vis('matsug') && <SortableTableHead sortKey="matsug" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>Material sugerido</SortableTableHead>}
                {vis('centrosug') && <SortableTableHead sortKey="centrosug" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>Centro sugerido</SortableTableHead>}
                {vis('disponible') && <SortableTableHead sortKey="disponible" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw}>Disponible / Lote / Cad.</SortableTableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTopRaw > 0 && (
                <tr><td style={{ height: paddingTopRaw }} colSpan={COL_COUNT_RAW} /></tr>
              )}
              {itemsRaw.map((vi) => {
                const row = sortedRaw[vi.index];
                const { it, f } = row;
                const b = it.bo;
                const isBloqueado = !!b.bloqueado;
                const condicionesMat = e.matCondiciones(b.materialBase).join(', ');
                const invOpciones: { centro: string; almacen: string; cantidad: number }[] = [
                  { centro: '1031', almacen: '1030', cantidad: num(b.invByCenter['1030'] || 0) },
                  { centro: '1031', almacen: '1032', cantidad: num(b.invByCenter['1032'] || 0) },
                  ...(e.matSector(b.materialBase) === 'Suturas' ? [{ centro: '1018', almacen: '', cantidad: num(b.invByCenter['1018'] || 0) }] : []),
                ].filter((o) => o.cantidad > 0);
                const loteOptions: LoteOption[] = [
                  ...invOpciones.map((o) => ({
                    key: `inv|${o.centro}|${o.almacen}`,
                    label: `Inventario · Centro ${o.centro}${o.almacen ? ` / Alm ${o.almacen}` : ''} · ${formatNumber(o.cantidad)}`,
                    draft: buildFromInventarioCentro(b, it.k, o.centro, o.almacen || o.centro, o.cantidad, e),
                    condicion: condicionesMat,
                  })),
                  ...it.fuentes.map((ff, idx) => ({
                    key: `fuente|${idx}|${ff.lote}`,
                    label: `Lote ${ff.lote || '—'} · Centro ${ff.centroSugerido || '—'} · ${formatNumber(num(ff.cantidadOfertar))} ${e.matUm(ff.materialSugerido) || ''}`.trim(),
                    draft: buildFromSugerencia(b, it.k, ff, e),
                    condicion: condicionesMat,
                  })),
                ];
                const defaultDraft = f ? buildFromSugerencia(b, it.k, f, e) : (loteOptions[0]?.draft ?? buildFromSugerencia(b, it.k, null, e));
                const onSolicitar = () => solicitar.abrir(defaultDraft, loteOptions.length ? loteOptions : undefined);
                const sourceKey = `sug|${it.k}|${norm(f?.lote ?? '')}`;
                const copyItems = [
                  { label: 'Material', value: b.materialBase },
                  { label: 'Pedido', value: b.pedido },
                  { label: 'Cliente', value: b.razonSocial },
                  { label: 'Centro', value: b.centroPedido },
                ];
                return (
                  <SolicitarContextMenu
                    key={row.key}
                    onSolicitar={onSolicitar}
                    solicitado={rawSolicitadas.has(sourceKey)}
                    label={b.materialBase}
                    onVerDetalle={() => open({ type: 'pedido', pedido: b.pedido, boKey: it.k })}
                    copyItems={copyItems}
                  >
                  <TableRow ref={measureElementRaw} data-index={vi.index} title="Doble clic para ver detalle" className={`cursor-pointer ${isBloqueado ? 'bg-amber-400/20 hover:bg-amber-400/30' : ''}`} onDoubleClick={() => open({ type: 'pedido', pedido: b.pedido, boKey: it.k })}>
                    {vis('ejecutivo') && <TableCell><Chip onClick={() => addQuick('ejecutivo', ejec(b))} title="Filtrar por ejecutivo">{ejec(b) || '—'}</Chip><div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', grupoCli(b))} title="Filtrar por grupo">{grupoCli(b) || '—'}</Chip></div></TableCell>}
                    {vis('pedido') && <TableCell><Chip onClick={() => open({ type: 'pedido', pedido: b.pedido })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>}
                    {vis('fecha') && <TableCell className="whitespace-nowrap text-xs"><span className="inline-flex items-center gap-1"><UrgenciaDot fecha={b.fecha} />{b.fecha || '—'}</span></TableCell>}
                    {vis('cliente') && <TableCell className="max-w-64 truncate">{b.razonSocial}<div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: b.solicitante })}>S {b.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: b.destinatario })}>D {b.destinatario}</Chip></div></TableCell>}
                    {vis('centro') && <TableCell>{b.centroPedido}{b.almacen ? ` / ${b.almacen}` : ''}</TableCell>}
                    {vis('material') && <TableCell><Chip onClick={() => open({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip><div className="text-[11px] text-text-faint max-w-64 truncate">{b.descripcionSolicitada}</div>{!precioOculto && e.matPrecioOferta(b.materialBase) > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Of. {formatCurrency(e.matPrecioOferta(b.materialBase))}</div>}</TableCell>}
                    {vis('sector') && <TableCell>{e.matSector(b.materialBase) || '—'}<div className="text-[11px] text-text-faint">{e.matGrupo(b.materialBase)}</div></TableCell>}
                    {vis('cantped') && <TableCell className="text-right">{formatNumber(b.cantidadPedido)}</TableCell>}
                    {vis('pend') && <TableCell className="text-right">{formatNumber(b.cantidadPendiente)}</TableCell>}
                    {!precioOculto && vis('precio') && <TableCell className="text-right">{formatCurrency(b.precio)}</TableCell>}
                    {vis('consumo') && <TableCell className="text-right">{formatNumber(it.consumoProm)}</TableCell>}
                    {unificarInv ? (
                      vis('invtotal') && (
                        <TableCell className="text-right" title={INV_ALL.map((c) => `${c}: ${formatNumber(num(b.invByCenter[c] || 0))}`).join(' · ')}>
                          {formatNumber(invTotal(b))}
                          {invTransitoTotal(b) > 0 && <div className="text-[10px] text-emerald-500">↻+{formatNumber(invTransitoTotal(b))}</div>}
                        </TableCell>
                      )
                    ) : (
                      <>
                        {INV_COLS.filter((alm) => vis(`inv${alm}`)).map((alm) => {
                          const invVal = num(b.invByCenter[alm] || 0);
                          const tr = transitoFor(b.centroPedido, alm, b.materialBase);
                          return (
                            <TableCell key={alm} className="text-right">
                              {formatNumber(invVal)}
                              {tr > 0 && <div className="text-[10px] text-emerald-500">↻+{formatNumber(tr)}</div>}
                            </TableCell>
                          );
                        })}
                        {vis('inv1060') && <TableCell className="text-right">{formatNumber(b.invByCenter['1060'] || 0)}</TableCell>}
                      </>
                    )}
                    {vis('bloq') && <TableCell>{b.bloqueado ? <StatePill label={b.bloqueado} cls="amb" /> : '—'}</TableCell>}
                    {vis('estado') && <TableCell><StatePill label={it.status.label} cls={it.status.cls} /></TableCell>}
                    {vis('tendencia') && <TableCell><TrendBadge t={it.tend} /></TableCell>}
                    {vis('fuente') && <TableCell>{f ? <StatePill label={f.fuente} cls={/corta/i.test(f.fuente) ? 'rojo' : 'azul'} /> : '—'}</TableCell>}
                    {vis('matsug') && <TableCell>{f ? (<>{f.materialSugerido || '—'}<div className="text-[11px] text-text-faint max-w-56 truncate">{f.descripcionSugerida}</div></>) : '—'}</TableCell>}
                    {vis('centrosug') && <TableCell>{f ? <>{f.centroSugerido || '—'}{f.almacenSugerido ? ` / ${f.almacenSugerido}` : ''}</> : '—'}</TableCell>}
                    {vis('disponible') && (
                    <TableCell className="whitespace-nowrap">
                      {f ? (
                        <>
                          <div>{formatNumber(f.disponible)} disp. · Lote {f.lote || '—'}</div>
                          {f.fechaCaducidad && (
                            <div className="text-[11px] text-text-faint">
                              {formatFechaCaducidad(f.fechaCaducidad)} · {formatNumber(f.mesesVigenciaLote)} meses
                            </div>
                          )}
                        </>
                      ) : '—'}
                    </TableCell>
                    )}
                  </TableRow>
                  </SolicitarContextMenu>
                );
              })}
              {paddingBottomRaw > 0 && (
                <tr><td style={{ height: paddingBottomRaw }} colSpan={COL_COUNT_RAW} /></tr>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      )}

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}
