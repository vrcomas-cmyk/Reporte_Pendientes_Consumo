import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Download, ClipboardList, Copy, Layers, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead, SortableTableHead } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ReportPage, PageHeader, ExportButton, KpiBand, ResumenColapsable, FilterBar, FilterSelect, SegmentedControl, ToggleButton, ALTURA_TABLA, SIN_DATOS } from '@/components/layout/report';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useDataStore } from '@/store/dataStore';
import { useSort } from '@/hooks/useSort';
import { cn, formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { firmaOrden, moverColumna, ordenarColumnas } from '@/lib/ordenColumnas';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatePill, TrendBadge, ClienteOportunidadBadge, Chip, ZoomControl, useZoom, ColumnFilterBar, passesFilters, DebouncedSearch, useColumnVisibility, ColumnVisibilityControl, useSavedViews, SavedViewsControl, ColumnFilterMenuMulti, DateRangeFilter, PasteCodesFilter, PasteCodesChip, matchesAnyCode, type FilterColumn, type ActiveFilter, type ColDef } from '@/modules/analytics/ui';
import { enRango, dateSortValue } from '@/lib/fechas';
import { ESTADOS } from '@/core/resumenFac';
import { claveMaterial } from '@/core/pedidos';
import { CONDICION_PNC, contextoOfertables, ofertablesDeMaterial, textoOfertable, type Ofertable } from '@/core/invCondicionLibros';
import { CentrosFiltroBar } from '@/modules/analytics/panels/CentrosFiltroBar';
import { centroPasaFiltro, useCentrosFiltroStore } from '@/store/centrosFiltroStore';
import { OfertableCell } from './OfertableCell';
import { EjecutivoZonaFilter, type ModoEjecutivo } from './EjecutivoZonaFilter';
import { norm, num, matchesQuery, transitoFor, buildConsumoIndex, consumoKey } from '@/modules/analytics/helpers';
import { useRowVirtualizer } from '@/hooks/useRowVirtualizer';
import { buildFromSugerencia, buildFromInventarioCentro, crear } from '@/services/solicitudService';
import { useSolicitarDialog, type LoteOption } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { puntosSolicitarInventario } from '@/modules/analytics/panels/MaterialInventario';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useMaterialPrefiltro } from '@/hooks/useMaterialPrefiltro';
import { usePersistedState } from '@/hooks/usePersistedState';
import { PendientePorNivel } from './PendientePorNivel';
import { useQuickFilters } from '@/hooks/useQuickFilters';
import { PrefiltroBanner } from '@/components/feedback/PrefiltroBanner';
import { GerenteSelect } from '@/components/ui/gerente-select';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden, isDetailHidden } from '@/core/permissions';
import { toast } from '@/store/toastStore';
import { useClipboard } from '@/hooks/useClipboard';
import { calcularSeleccion, aTsv } from '@/lib/seleccion';
import { TooltipHint } from '@/components/ui/tooltip';
import { buildSugerenciasColsAgrupado } from './columns';
import type { Sugerencia } from '@/core/types';

const INV_COLS = ['1030', '1031', '1032'] as const;
const INV_ALL = ['1030', '1031', '1032', '1060'] as const;

/** Explicaciones breves para el tooltip nativo de cada encabezado — se
 * generan por `.map()` desde tuplas `[key, label]`, así que van aparte en
 * vez de en línea como en otras páginas. */
const COL_FILTRO: Record<string, readonly string[]> = {
  ejecutivo: ['ejecutivo', 'grupocli'], pedido: ['pedido', 'oc'], fecha: ['fecha'], cliente: ['cliente', 'solicitante', 'destinatario'],
  centro: ['centro', 'almacen'], material: ['material'], sector: ['sector', 'grupoart', 'gerente'],
  cantped: ['cantped'], pend: ['pend'], precio: ['precio'], consumo: ['consumo'],
  inv1030: ['inv1030'], inv1031: ['inv1031'], inv1032: ['inv1032'], inv1060: ['inv1060'], invtotal: ['invtotal'],
  bloq: ['bloq'], estado: ['estado', 'revision'], tendencia: ['tendencia'], ofertable: ['ofertable'],
  fuente: ['fuente'], matsug: ['matsug'], centrosug: ['centrosug'],
};

/** Orden base de las columnas de la tabla agrupada y cómo se rotula cada una. */
const ORDEN_BASE = ['ejecutivo', 'pedido', 'fecha', 'cliente', 'centro', 'material', 'sector', 'cantped', 'pend', 'precio', 'consumo', 'invtotal', 'inv1030', 'inv1031', 'inv1032', 'inv1060', 'bloq', 'estado', 'tendencia', 'ofertable', 'fuentes'] as const;
const ENCABEZADOS: Record<string, { l: string; cls?: string; hint?: string }> = {
  ejecutivo: { l: 'Ejecutivo / Grupo cli.' }, pedido: { l: 'Pedido/OC' }, fecha: { l: 'Fecha' }, cliente: { l: 'Cliente' }, centro: { l: 'Centro/Alm' },
  material: { l: 'Material' }, sector: { l: 'Sector/Grupo' },
  cantped: { l: 'Cant.ped.', cls: 'text-right justify-end' }, pend: { l: 'Pend.', cls: 'text-right justify-end' }, precio: { l: 'Precio', cls: 'text-right justify-end' },
  consumo: { l: 'Consumo', cls: 'text-right justify-end' }, invtotal: { l: 'Inv. total', cls: 'text-right justify-end' },
  inv1030: { l: '1030', cls: 'text-right justify-end' }, inv1031: { l: '1031', cls: 'text-right justify-end' }, inv1032: { l: '1032', cls: 'text-right justify-end' }, inv1060: { l: '1060', cls: 'text-right justify-end' },
  bloq: { l: 'Bloq.' }, estado: { l: 'Estado' }, tendencia: { l: 'Tendencia' }, ofertable: { l: 'Ofertable' },
  fuentes: { l: 'Fuentes', cls: 'text-right', hint: 'Cuántas fuentes alternas de abasto tiene este pedido (otros centros/lotes que podrían surtirlo).' },
};

const HEADER_HINTS: Record<string, string> = {
  cantped: 'Cantidad total pedida originalmente.',
  pend: 'Cantidad que aún falta por surtir de este pedido.',
  precio: 'Precio unitario de lista para este material.',
  consumo: 'Consumo promedio mensual reciente de este material para este cliente. Debajo: fecha de la última venta registrada (Reporte de Consumo).',
  invtotal: 'Inventario disponible sumando todos los almacenes.',
  '1030': 'Inventario disponible en el almacén 1030.',
  '1031': 'Inventario disponible en el almacén 1031 (hub de distribución).',
  '1032': 'Inventario disponible en el almacén 1032.',
  '1060': 'Inventario disponible en el almacén 1060.',
  ofertable: 'Lo que el material tiene para ofrecer en cambio: lotes de corta caducidad con existencia (CC n · cantidad), lotes en PNC, su condición de Revisión o un sustituto con inventario. Respeta "Considerar centros" del detalle del pedido.',
  estado: 'Estatus general calculado del pedido (a tiempo, en riesgo, etc.). A la derecha, en ámbar: la condición de la pestaña Revision del material (p. ej. Liz/Lento mov), si la tiene.',
  tendencia: 'Compara la facturación de los últimos 3 meses completos vs. los 3 anteriores: En aumento (+10%), En decremento (-10%) o Estable.',
  sector: 'Sector y grupo de artículo del catálogo.',
  ejecutivo: 'Ejecutivo de ventas y grupo de cliente asignados.',
};

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
  const cls = dias > 30 ? 'bg-danger' : dias > 15 ? 'bg-warning' : 'bg-success';
  return (
    <TooltipHint text={`${dias} día(s) desde el pedido`}>
      <span tabIndex={0} className={`inline-block size-1.5 rounded-full outline-none ${cls}`} />
    </TooltipHint>
  );
}

type BORow = (ReturnType<typeof useAnalytics>['bo'])[number];
/** Inventario de los cuatro almacenes juntos (también lo usa el filtro de la columna "Inv. total"). */
const invTotalBO = (b: BORow['bo']) => INV_ALL.reduce((s, c) => s + num(b.invByCenter[c] || 0), 0);
/** One "Desagrupar" row: a BO item plus the specific fuente (alternate supply
 * source) it represents, or `null` for the BO's own row when it has none. */
interface RawRow { it: BORow; f: Sugerencia | null; key: string }

interface SugerenciasPageProps {
  /** 'seg' = la misma tabla y paneles, alimentada por el libro Seg pedidos (Seg. de pedidos) y sin
   * fuentes alternas. Por defecto, Pedidos sobre "Todas las Sugerencias". */
  modo?: 'sugerencias' | 'seg';
  /** Solo 'seg': abre el detalle emergente del material en los libros (Disponibilidad, Inv_Condicion…). */
  onDetalleLibros?: (material: string) => void;
}

export function SugerenciasPage({ modo = 'sugerencias', onDetalleLibros }: SugerenciasPageProps = {}) {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a = useAnalytics();
  const seg = modo === 'seg';
  // Prefijo de las llaves persistidas (filtros, columnas, vistas): cada modo guarda las suyas.
  const ns = seg ? 'segPedidos' : 'sugerencias';
  const boFuente = seg ? a.boSeg : a.bo;
  const open = usePanelStore((s) => s.open);
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const addSolicitud = useSolicitudStore((s) => s.add);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Fila de partida para la selección por rango (Shift+clic).
  const [ancla, setAncla] = useState<string | null>(null);
  const { copy } = useClipboard();
  const [bulkSending, setBulkSending] = useState(false);
  const perms = usePermissionsStore((s) => s.perms);
  const precioOculto = isColumnHidden(perms, 'sugerencias', 'precio');
  // "Desagrupar" and the "Fuentes" count/detail only exist to expose fuente
  // (alternate supply source) data — when that detail is hidden for this
  // role, skip the whole thing instead of trying to redact it column by
  // column inside a view whose entire point is showing it.
  const fuenteOcultoPerm = isDetailHidden(perms, 'sugerencias', 'fuente');
  // En 'seg' no hay fuentes alternas: se oculta todo lo relativo a fuentes (columna, filtros, Desagrupar).
  const fuenteOculto = seg || fuenteOcultoPerm;
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
  const [q, setQ] = usePersistedState(`${ns}.q`, '');
  const { prefiltro, clear: clearPrefiltro } = useMaterialPrefiltro(setQ);
  const [estado, setEstado] = usePersistedState(`${ns}.estado`, '');
  const [fuente, setFuente] = usePersistedState(`${ns}.fuente`, '');
  const [gerente, setGerente] = usePersistedState(`${ns}.gerente`, '');
  // Ejecutivos / zonas (varios o uno por uno); la lista sale en el orden del catálogo.
  const [ejecZonas, setEjecZonas] = usePersistedState<string[]>(`${ns}.ejecZonas`, []);
  const [ejecModo, setEjecModo] = usePersistedState<ModoEjecutivo>(`${ns}.ejecModo`, 'varios');
  const [centroValido, setCentroValido] = usePersistedState(`${ns}.centroValido`, false);
  const [soloAccionables, setSoloAccionables] = usePersistedState(`${ns}.soloAccionables`, false);
  const [ocultarPend0, setOcultarPend0] = usePersistedState(`${ns}.ocultarPend0`, false);
  const [ocultarBloqueados, setOcultarBloqueados] = usePersistedState(`${ns}.ocultarBloqueados`, false);
  const [quick, setQuick] = useQuickFilters(`${ns}.quick`);
  const [rango, setRango] = usePersistedState<{ desde: string; hasta: string }>(`${ns}.rango`, { desde: '', hasta: '' });
  const [clearTick, setClearTick] = useState(0);
  // "Pegar pedidos/materiales" estilo SAP — aditivo, no toca los filtros de arriba.
  const [pasteCodes, setPasteCodes] = usePersistedState<string[]>(`${ns}.pasteCodes`, []);
  const clearFilters = () => {
    setQ(''); setEstado(''); setFuente(''); setGerente(''); setEjecZonas([]); setCentroValido(false); setSoloAccionables(false); setOcultarPend0(false); setOcultarBloqueados(false); setQuick([]); setRango({ desde: '', hasta: '' }); setPasteCodes([]);
    setClearTick((n) => n + 1);
  };
  const [agrupadoState, setAgrupado] = usePersistedState(`${ns}.agrupado`, true);
  const agrupado = fuenteOculto || agrupadoState;
  const zoom = useZoom(`${ns}_zoom`);

  const e = a.enrich;
  const grupoCli = (b: BORow['bo']) => e.grupoCliente(b.gpoCte) || norm(b.gpoCte);
  const ejec = (b: BORow['bo']) => e.ejecutivoNombre(b.gpoVdor);
  // Gerente de marca del material (por su sector, pestaña GERENCIA DE MARCA); si un sector tiene varios gerentes se toma el primero.
  const gerenteDe = useMemo(() => {
    const cache = new Map<string, string>();
    return (material: string): string => {
      const sector = e.matSector(material);
      let g = cache.get(sector);
      if (g === undefined) { g = e.gerentes.find((x) => e.sectorDeGerente(sector, x)) ?? ''; cache.set(sector, g); }
      return g;
    };
  }, [e]);
  // Condición de la pestaña Revision del material (solo en Seg. de pedidos, que lee los libros; Pedidos sigue con el reporte anterior).
  const revisionDe = useMemo(() => (material: string): string => (seg ? a.revisionLibros.get(claveMaterial(material)) ?? '' : ''), [seg, a.revisionLibros]);
  // Ofertable (solo Seg. de pedidos): lotes de Corta caducidad con existencia, Revisión o Sustituto. Mismo criterio y mismo filtro "Considerar centros"
  // (store compartido) que el resaltado de "1. Materiales del pedido" del detalle.
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  const ctxOfertables = useMemo(() => (seg ? contextoOfertables(a.lotesLibros, a.revisionLibros, a.sustitucionesLibros, a.detalleLotesLibros[CONDICION_PNC]) : null), [seg, a.lotesLibros, a.revisionLibros, a.sustitucionesLibros, a.detalleLotesLibros]);
  const ofertableDe = useMemo(() => {
    const cache = new Map<string, Ofertable>();
    return (b: BORow['bo']): Ofertable | null => {
      if (!ctxOfertables) return null;
      const k = b.materialBase + '|' + b.centroPedido;
      let o = cache.get(k);
      if (!o) { o = ofertablesDeMaterial(b.materialBase, ctxOfertables, (c) => centroPasaFiltro(c, b.centroPedido, centrosElegidos)); cache.set(k, o); }
      return o;
    };
  }, [ctxOfertables, centrosElegidos]);

  // For fuente "Corta caducidad": centro sugerido debe ser 1031/1022/1017, o
  // igualar al centro del pedido. Cualquier otra fuente (o ninguna) pasa siempre.
  const CENTROS_CORTA = ['1031', '1022', '1017'];
  const centroPasa = (b: BORow['bo'], f: Sugerencia | null) => {
    if (!f) return true;
    if (!/corta/i.test(f.fuente)) return true;
    return CENTROS_CORTA.includes(f.centroSugerido) || f.centroSugerido === b.centroPedido;
  };

  // Fecha de última venta (Destinatario+Material) para la sub-línea de la
  // columna "Consumo" — mismo dato que ya se ve en /consumo, cruzado aquí.
  const consumoIdx = useMemo(() => buildConsumoIndex(a.result?.consumo ?? []), [a.result]);

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
    { key: 'gerente', label: 'Gerente (marca)', get: (it) => gerenteDe(it.bo.materialBase) || 'Sin gerente' },
    { key: 'cantped', label: 'Cant. pedida', get: (it) => formatNumber(num(it.bo.cantidadPedido)) },
    { key: 'pend', label: 'Pendiente', get: (it) => formatNumber(num(it.bo.cantidadPendiente)) },
    ...(precioOculto ? [] : [{ key: 'precio', label: 'Precio', get: (it: BORow) => formatCurrency(num(it.bo.precio)) }]),
    { key: 'consumo', label: 'Consumo', get: (it) => formatNumber(num(it.consumoProm)) },
    { key: 'inv1030', label: 'Inv. 1030', get: (it) => formatNumber(num(it.bo.invByCenter['1030'] || 0)) },
    { key: 'inv1031', label: 'Inv. 1031', get: (it) => formatNumber(num(it.bo.invByCenter['1031'] || 0)) },
    { key: 'inv1032', label: 'Inv. 1032', get: (it) => formatNumber(num(it.bo.invByCenter['1032'] || 0)) },
    { key: 'inv1060', label: 'Inv. 1060', get: (it) => formatNumber(num(it.bo.invByCenter['1060'] || 0)) },
    { key: 'invtotal', label: 'Inv. total', get: (it) => formatNumber(invTotalBO(it.bo)) },
    { key: 'bloq', label: 'Bloqueado', get: (it) => it.bo.bloqueado },
    { key: 'estado', label: 'Estado', get: (it) => it.status.label },
    ...(seg ? [{ key: 'revision', label: 'Revisión', get: (it: BORow) => revisionDe(it.bo.materialBase) }] : []),
    ...(seg ? [{
      key: 'ofertable',
      label: 'Ofertable',
      getMany: (it: BORow) => {
        const o = ofertableDe(it.bo);
        if (!o?.tiene) return ['Sin ofertable'];
        const v: string[] = [];
        if (o.corta.n) v.push('Lotes corta caducidad');
        if (o.pnc.n) v.push('PNC');
        if (o.revision) v.push('Revisión');
        if (o.sustitutos) v.push('Sustituto');
        return v;
      },
    }] : []),
    { key: 'tendencia', label: 'Tendencia', get: (it) => it.tend.txt },
    ...(fuenteOculto ? [] : [
      { key: 'fuente', label: 'Fuente', getMany: (it: BORow) => it.fuentes.map((f) => f.fuente).filter(Boolean) },
      { key: 'matsug', label: 'Material sugerido', getMany: (it: BORow) => it.fuentes.map((f) => f.materialSugerido).filter(Boolean) },
      { key: 'centrosug', label: 'Centro Sugerido', getMany: (it: BORow) => it.fuentes.map((f) => f.centroSugerido).filter(Boolean) },
      { key: 'almacensug', label: 'Almacén sugerido', getMany: (it: BORow) => it.fuentes.map((f) => f.almacenSugerido).filter(Boolean) },
      { key: 'lote', label: 'Lote', getMany: (it: BORow) => it.fuentes.map((f) => f.lote).filter(Boolean) },
    ]),
  ], [e, fuenteOculto, gerenteDe, revisionDe, ofertableDe, seg, precioOculto]);

  // Embudo de cada encabezado: reúne las columnas de filtro que le corresponden (p. ej. "Pedido/OC" → pedido y OC).
  const filtroDe = (k: string) => {
    const claves = COL_FILTRO[k];
    const cols = claves ? filterCols.filter((c) => claves.includes(c.key)) : [];
    return cols.length ? <ColumnFilterMenuMulti columns={cols} rows={boFuente} active={quick} onChange={setQuick} /> : undefined;
  };

  const ejecSet = useMemo(() => (ejecZonas.length ? new Set(ejecZonas) : null), [ejecZonas]);

  const filtered = useMemo(() => {
    return boFuente.filter((it) => {
      const b = it.bo;
      if (estado && it.status.key !== estado) return false;
      if (gerente && !e.sectorDeGerente(e.matSector(b.materialBase), gerente)) return false;
      if (ejecSet && !ejecSet.has(e.zonaDeEjecutivo(b.gpoVdor))) return false;
      if (fuente === 'si' && !it.fuentes.length) return false;
      if (fuente === 'no' && it.fuentes.length) return false;
      if (centroValido && it.fuentes.length && !it.fuentes.some((f) => centroPasa(b, f))) return false;
      // "Solo accionables": pendiente con fuente disponible, sin bloqueo, y con
      // al menos una fuente en centro válido — lo que realmente se puede
      // resolver hoy, sin tener que combinar Fuentes + Centro válido a mano.
      if (soloAccionables && (num(b.cantidadPendiente) <= 0 || !it.fuentes.length || b.bloqueado || !it.fuentes.some((f) => centroPasa(b, f)))) return false;
      if (ocultarPend0 && num(b.cantidadPendiente) <= 0) return false;
      if (ocultarBloqueados && b.bloqueado) return false;
      if (!passesFilters(it, filterCols, quick)) return false;
      if (!enRango(b.fecha, rango.desde, rango.hasta)) return false;
      if (q) {
        const hay = `${b.materialBase} ${b.descripcionSolicitada} ${b.pedido} ${b.oc} ${b.razonSocial} ${b.solicitante} ${b.destinatario} ${ejec(b)} ${grupoCli(b)} ${e.matSector(b.materialBase)} ${e.matGrupo(b.materialBase)} ${gerenteDe(b.materialBase)} ${b.centroPedido} ${it.status.label} ${revisionDe(b.materialBase)} ${(() => { const o = ofertableDe(b); return o?.tiene ? textoOfertable(o) : ''; })()}`;
        if (!matchesQuery(q, hay)) return false;
      }
      if (!matchesAnyCode(pasteCodes, [b.pedido, b.materialBase])) return false;
      return true;
    });
  }, [boFuente, q, estado, fuente, gerente, ejecSet, e, gerenteDe, revisionDe, ofertableDe, centroValido, soloAccionables, ocultarPend0, ocultarBloqueados, quick, rango, filterCols, pasteCodes]);

  const kpis = useMemo(() => {
    const isBloq = (it: (typeof filtered)[number]) => it.bo.bloqueado !== '';
    const pendTot = filtered.reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);
    const pendBloq = filtered.filter(isBloq).reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);
    const impTot = filtered.reduce((s, it) => s + num(it.bo.cantidadPendiente) * num(it.bo.precio), 0);
    const impBloq = filtered.filter(isBloq).reduce((s, it) => s + num(it.bo.cantidadPendiente) * num(it.bo.precio), 0);
    const conF = filtered.filter((it) => it.fuentes.length).length;
    const pedidos = new Set(filtered.map((it) => norm(it.bo.pedido))).size;
    const destinatarios = new Set(filtered.map((it) => norm(it.bo.destinatario))).size;
    const materiales = new Set(filtered.map((it) => norm(it.bo.materialBase))).size;
    return { pendTot, pendBloq, impTot, impBloq, conF, pedidos, destinatarios, materiales };
  }, [filtered, e]);

  // Renglones pendientes del filtro actual para la sección "Pendiente por …" (material / sector / grupo de artículo).
  const renglonesPend = useMemo(() => filtered.map((it) => ({
    material: it.bo.materialBase,
    descripcion: it.bo.descripcionSolicitada,
    gerente: gerenteDe(it.bo.materialBase),
    sector: e.matSector(it.bo.materialBase),
    grupo: e.matGrupo(it.bo.materialBase),
    qty: num(it.bo.cantidadPendiente),
    imp: num(it.bo.cantidadPendiente) * num(it.bo.precio),
  })), [filtered, e, gerenteDe]);

  const addQuick = (field: string, value: string) => {
    if (!value) return;
    const i = quick.findIndex((f) => f.col === field);
    if (i < 0) { setQuick([...quick, { col: field, values: [value] }]); return; }
    if (quick[i].values.includes(value)) return;
    const next = quick.slice();
    next[i] = { col: field, values: [...quick[i].values, value] };
    setQuick(next);
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

  const colVis = useColumnVisibility(`${ns}_columnas`);
  // Orden de columnas (arrastrando los encabezados); vacío = el base. Viaja en las vistas guardadas.
  const [colOrden, setColOrden] = usePersistedState<string[]>(`${ns}.colOrden`, []);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobreCol, setSobreCol] = useState<string | null>(null);
  const vis = colVis.isVisible;
  const [unificarInv, setUnificarInv] = usePersistedState(`${ns}.unificarInv`, false);
  const invTotal = (b: BORow['bo']) => INV_ALL.reduce((s, c) => s + num(b.invByCenter[c] || 0), 0);
  // #12 Tránsito sub-index: join ResumenSin's RSSCentro.alm by Centro + almacén + material.
  const invTransitoTotal = (b: BORow['bo']) => INV_COLS.reduce((s, c) => s + transitoFor(a.rss, b.centroPedido, c, b.materialBase), 0);

  // Vistas guardadas: snapshot de columnas ocultas + unificar inventario, persistido entre sesiones.
  const savedViews = useSavedViews<{ hidden: string[]; unificarInv: boolean; pasteCodes?: string[]; quick?: ActiveFilter[]; order?: string[]; ejec?: string[] }>(`${ns}_vistas`);
  const applyView = (state: { hidden: string[]; unificarInv: boolean; pasteCodes?: string[]; quick?: ActiveFilter[]; order?: string[]; ejec?: string[] }) => {
    colVis.apply(state.hidden);
    setColOrden(state.order ?? []); // las vistas anteriores se guardaron con el orden base
    if (state.ejec) setEjecZonas(state.ejec);
    setUnificarInv(state.unificarInv);
    setPasteCodes(state.pasteCodes ?? []);
    if (state.quick) setQuick(state.quick); // las vistas anteriores no guardaban filtros por columna: esas no tocan los actuales
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { hidden: [...colVis.hidden], unificarInv, pasteCodes, quick, order: colOrden, ejec: ejecZonas });

  const COLS_AGRUPADO: ColDef[] = [...buildSugerenciasColsAgrupado({ precioOculto, unificarInv, fuenteOculto }), ...(seg ? [{ key: 'ofertable', label: 'Ofertable' }] : [])];
  // Columnas de la tabla agrupada: todas las disponibles en el orden elegido (el menú "Columnas" usa el mismo) y las visibles.
  const disponibleCol = (k: string) => (k === 'precio' ? !precioOculto : k === 'invtotal' ? unificarInv : k.startsWith('inv') ? !unificarInv : k === 'ofertable' ? seg : k === 'fuentes' ? !fuenteOculto : true);
  const columnasTodas = ordenarColumnas(ORDEN_BASE.filter(disponibleCol), colOrden);
  const columnasOrden = columnasTodas.filter(vis);
  const colsMenu: ColDef[] = columnasTodas.map((k) => COLS_AGRUPADO.find((c) => c.key === k)).filter((c): c is ColDef => !!c);
  const COLS_COMMON: ColDef[] = fuenteOculto ? COLS_AGRUPADO : COLS_AGRUPADO.slice(0, -1);
  const COLS_RAW: ColDef[] = [
    ...COLS_COMMON,
    { key: 'fuente', label: 'Fuente' }, { key: 'matsug', label: 'Material sugerido' },
    { key: 'centrosug', label: 'Centro sugerido' }, { key: 'disponible', label: 'Disponible / Lote / Cad.' },
  ];

  const COL_COUNT = COLS_AGRUPADO.filter((c) => vis(c.key)).length + (fuenteOculto ? 0 : 1);
  const COL_COUNT_RAW = COLS_RAW.filter((c) => vis(c.key)).length + 1;
  const sortAcc = useMemo(() => ({
    grupocli: (it: (typeof filtered)[number]) => grupoCli(it.bo),
    pedido: (it: (typeof filtered)[number]) => it.bo.pedido,
    fecha: (it: (typeof filtered)[number]) => dateSortValue(it.bo.fecha),
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
    ofertable: (it: (typeof filtered)[number]) => ofertableDe(it.bo)?.corta.cantidad ?? 0,
  }), [e, grupoCli, ejec, ofertableDe]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  const { scrollRef, items, paddingTop, paddingBottom, measureElement } = useRowVirtualizer(sorted.length);
  // Pedidos distintos en el orden/filtro visible de esta tabla — viaja en el
  // descriptor del panel `pedido` para que ◀/▶ recorran exactamente esto.
  const pedidosLista = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const it of sorted) { if (!seen.has(it.bo.pedido)) { seen.add(it.bo.pedido); out.push(it.bo.pedido); } }
    return out;
  }, [sorted]);

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
    fecha: (r: RawRow) => dateSortValue(r.it.bo.fecha),
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
  const pedidosListaRaw = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of sortedRaw) { if (!seen.has(r.it.bo.pedido)) { seen.add(r.it.bo.pedido); out.push(r.it.bo.pedido); } }
    return out;
  }, [sortedRaw]);
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

  // ---- Selección múltiple (clic / Ctrl / Shift) ----------------------------
  // Mismas columnas para Excel y para copiar (TSV) — una sola definición por vista.
  const filaAgrupada = (it: BORow) => {
    const b = it.bo;
    return {
      'Grupo de cliente': grupoCli(b), 'Código grupo': b.gpoCte,
      Pedido: b.pedido, OC: b.oc, Fecha: b.fecha,
      'Razón social': b.razonSocial, Solicitante: b.solicitante, Destinatario: b.destinatario,
      Ejecutivo: ejec(b), Centro: b.centroPedido, Almacén: b.almacen,
      'Material base': b.materialBase, Descripción: b.descripcionSolicitada, Sector: e.matSector(b.materialBase), 'Grupo art.': e.matGrupo(b.materialBase), 'Gerente (marca)': gerenteDe(b.materialBase),
      'Cant. pedida': num(b.cantidadPedido), Pendiente: num(b.cantidadPendiente), Precio: num(b.precio), 'Consumo prom.': num(it.consumoProm),
      'Inv 1030': num(b.invByCenter['1030'] || 0), 'Inv 1031': num(b.invByCenter['1031'] || 0), 'Inv 1032': num(b.invByCenter['1032'] || 0), 'Inv 1060': num(b.invByCenter['1060'] || 0),
      Bloqueado: b.bloqueado, Estado: it.status.label, ...(seg ? { Revisión: revisionDe(b.materialBase), 'Lotes CC': ofertableDe(b)?.corta.n ?? 0, 'Cant. CC': ofertableDe(b)?.corta.cantidad ?? 0, 'Lotes PNC': ofertableDe(b)?.pnc.n ?? 0, 'Cant. PNC': ofertableDe(b)?.pnc.cantidad ?? 0, Sustitutos: ofertableDe(b)?.sustitutos ?? 0 } : {}), Tendencia: it.tend.txt, Fuentes: it.fuentes.length,
    };
  };
  const filaRaw = ({ it, f }: RawRow) => {
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
  };
  const clavesAgrupado = useMemo(() => sorted.map((it) => it.k), [sorted]);
  const clavesRaw = useMemo(() => sortedRaw.map((r) => r.key), [sortedRaw]);
  // Texto TSV de la selección y cuántas filas son solicitables (con fuente): se calculan una
  // sola vez por cambio de selección, no por fila renderizada.
  const { tsvSeleccion, elegiblesSel } = useMemo(() => {
    if (!selected.size) return { tsvSeleccion: '', elegiblesSel: 0 };
    const elegiblesSel = sorted.filter((it) => selected.has(it.k) && it.fuentes.length > 0).length;
    const filas = agrupado
      ? sorted.filter((it) => selected.has(it.k)).map(filaAgrupada)
      : sortedRaw.filter((r) => selected.has(r.key)).map(filaRaw);
    return { tsvSeleccion: aTsv(filas), elegiblesSel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, agrupado, sorted, sortedRaw]);
  // Cambiar de vista (Agrupar/Desagrupar) invalida las claves seleccionadas.
  useEffect(() => { setSelected(new Set()); setAncla(null); }, [agrupado]);
  // Esc limpia la selección (si no hay un panel de detalle abierto que use Esc para cerrarse).
  useEffect(() => {
    if (!selected.size) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !document.querySelector('[role="dialog"]')) { setSelected(new Set()); setAncla(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected.size]);

  if (seg ? !boFuente.length : !a.result || !a.bo.length) {
    if (!bootstrapped) return <TableSkeleton />;
    if (seg) return <EmptyState title={SIN_DATOS.segPedidos.title} description={SIN_DATOS.segPedidos.description} action={{ to: SIN_DATOS.segPedidos.to, label: SIN_DATOS.segPedidos.label }} />;
    return <EmptyState title="No hay sugerencias. Carga catálogo y procesa un reporte." action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const sufijoSel = selected.size ? '_seleccion' : '';
  const exportar = () => {
    const base = selected.size ? filtered.filter((it) => selected.has(it.k)) : filtered;
    void exportXlsx(`sugerencias${sufijoSel}_${stamp()}.xlsx`, base.map(filaAgrupada), 'Sugerencias');
  };

  const exportarRaw = () => {
    const base = selected.size ? flatRaw.filter((r) => selected.has(r.key)) : flatRaw;
    void exportXlsx(`sugerencias_detalle${sufijoSel}_${stamp()}.xlsx`, base.map(filaRaw), 'Sugerencias (detalle)');
  };

  const limpiarSeleccion = () => { setSelected(new Set()); setAncla(null); };
  const copiarSeleccion = () => void copy(tsvSeleccion, `${selected.size} fila(s) copiadas — pégalas en Excel`);
  // Casilla de una fila: alterna; con Shift selecciona el rango desde la última casilla marcada.
  // (El clic simple sobre la fila NO selecciona: el doble clic abre el detalle.)
  const clickCasilla = (key: string, ev: ReactMouseEvent, claves: string[]) => {
    const r = calcularSeleccion({ selected, ancla }, key, { ctrl: true, shift: ev.shiftKey }, claves);
    setSelected(r.selected);
    setAncla(r.ancla);
  };

  const cabecera = (k: string) => {
    const d = ENCABEZADOS[k];
    if (!d) return null;
    return (
      <SortableTableHead
        key={k}
        sortKey={k}
        activeKey={sortKey}
        dir={dir}
        onSort={toggleSort}
        className={cn(d.cls, sobreCol === k && arrastrando !== k && 'bg-accent-soft', arrastrando === k && 'opacity-50')}
        title={d.hint ?? HEADER_HINTS[k]}
        filter={filtroDe(k)}
        draggable
        onDragStart={(ev) => { ev.dataTransfer.setData('text/plain', k); ev.dataTransfer.effectAllowed = 'move'; setArrastrando(k); }}
        onDragOver={(ev) => { if (arrastrando && arrastrando !== k) { ev.preventDefault(); setSobreCol(k); } }}
        onDragLeave={() => setSobreCol((s) => (s === k ? null : s))}
        onDrop={(ev) => { ev.preventDefault(); if (arrastrando && arrastrando !== k) setColOrden(moverColumna(columnasTodas, arrastrando, k)); setArrastrando(null); setSobreCol(null); }}
        onDragEnd={() => { setArrastrando(null); setSobreCol(null); }}
      >
        {d.l}
      </SortableTableHead>
    );
  };

  // Vistas · Unificar inventario · Columnas: arriba de la tabla, fijas junto con los encabezados (la barra queda fuera del scroll).
  const barraTabla = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg-elevated px-3 py-2">
      <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
      <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm" title="Suma 1030+1031+1032+1060 en una sola columna">
        <input type="checkbox" checked={unificarInv} onChange={(ev) => setUnificarInv(ev.target.checked)} />
        Unificar inventario
      </label>
      <ColumnVisibilityControl columns={agrupado ? colsMenu : COLS_RAW} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
      {agrupado && (
        <span className="text-[11px] text-text-faint" title="Arrastra un encabezado sobre otro para cambiar el orden de las columnas; se guarda y viaja en las Vistas.">
          Arrastra los encabezados para ordenar
          {colOrden.length > 0 && <button type="button" onClick={() => setColOrden([])} className="ml-2 text-accent hover:underline">Restablecer orden</button>}
        </span>
      )}
      <span className="ml-auto text-xs tabular-nums text-text-muted">{formatNumber(agrupado ? filtered.length : flatRaw.length)} renglones</span>
    </div>
  );

  return (
    <ReportPage>
      <PageHeader
        title={seg ? 'Seguimiento de Pedidos' : 'Pedidos Vivos en Sistema'}
        subtitle={agrupado
          ? <>Órdenes pendientes por facturar (BO) de un año para aca · {formatNumber(filtered.length)} renglones</>
          : <>Detalle por fuente, sin agrupar · {formatNumber(flatRaw.length)} renglones</>}
        actions={(
          <>
            {!fuenteOculto && (
              <SegmentedControl
                ariaLabel="Agrupar renglones"
                value={agrupado ? 'agrupado' : 'desagrupado'}
                onChange={(v) => setAgrupado(v === 'agrupado')}
                options={[{ value: 'agrupado', label: 'Agrupar' }, { value: 'desagrupado', label: 'Desagrupar' }]}
              />
            )}
            {agrupado && elegiblesSel > 0 && (
              <Button size="sm" onClick={solicitarSeleccionados} disabled={bulkSending}>
                <ClipboardList className="mr-1 size-3.5" />
                {bulkSending ? 'Solicitando…' : `Solicitar seleccionados (${elegiblesSel})`}
              </Button>
            )}
            <ExportButton onClick={agrupado ? exportar : exportarRaw} label={selected.size ? `Exportar selección (${selected.size})` : 'Exportar a Excel'} />
          </>
        )}
      />

      {prefiltro && <PrefiltroBanner material={prefiltro} onClear={clearPrefiltro} />}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm">
          <span className="font-medium">{formatNumber(selected.size)} {agrupado ? 'pedido(s)' : 'renglón(es)'} seleccionado(s)</span>
          <span className="text-xs text-text-muted">Casilla (Shift = rango) o clic derecho › Seleccionar · Esc limpia</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copiarSeleccion}><Copy className="mr-1 size-3.5" />Copiar</Button>
            <Button variant="outline" size="sm" onClick={agrupado ? exportar : exportarRaw}><Download className="mr-1 size-3.5" />Exportar selección</Button>
            <Button variant="ghost" size="sm" onClick={limpiarSeleccion}><X className="mr-1 size-3.5" />Limpiar</Button>
          </div>
        </div>
      )}

      {agrupado && (
        <ResumenColapsable storageKey={`${seg ? 'seg' : 'ped'}.resumen.oculto`} linea={<>Pendiente {formatCurrency(kpis.impTot)} · {formatNumber(kpis.pendTot)} u. · {formatNumber(kpis.pedidos)} pedidos</>}>
          {/* Mitad izquierda: lo principal; mitad derecha: el alcance del filtro. Debajo, el pendiente por gerente/sector/grupo/material */}
          <div className="grid gap-3 lg:grid-cols-2">
          <KpiBand
            titulo="Pendiente por facturar"
            principal={{ etiqueta: 'Importe pendiente', valor: formatCurrency(kpis.impTot), sub: <><span className="mr-1 inline-block size-1.5 rounded-full bg-success" />{formatCurrency(kpis.impTot - kpis.impBloq)} libre · <span className="mr-1 inline-block size-1.5 rounded-full bg-danger" />{formatCurrency(kpis.impBloq)} bloqueado</> }}
            metricas={[
              { etiqueta: 'Cant. pendiente', valor: formatNumber(kpis.pendTot), sub: <><span className="mr-1 inline-block size-1.5 rounded-full bg-success" />{formatNumber(kpis.pendTot - kpis.pendBloq)} libre · <span className="mr-1 inline-block size-1.5 rounded-full bg-danger" />{formatNumber(kpis.pendBloq)} bloqueado</> },
              { etiqueta: 'Renglones BO', valor: formatNumber(filtered.length) },
            ]}
            distribucion={{
              titulo: 'Importe pendiente: libre vs bloqueado (clic en Libre = ocultar bloqueados)',
              segmentos: [
                { clave: 'libre', etiqueta: 'Libre', valor: Math.max(0, kpis.impTot - kpis.impBloq), cls: 'bg-success' },
                { clave: 'bloqueado', etiqueta: 'Bloqueado', valor: kpis.impBloq, cls: 'bg-danger' },
              ],
              activo: ocultarBloqueados ? 'libre' : undefined,
              onToggle: (clave) => { if (clave === 'libre') setOcultarBloqueados((v) => !v); },
              formato: formatCurrency,
            }}
            pie="Órdenes pendientes por facturar (BO) del filtro actual"
          />
          <KpiBand
            titulo="Alcance del filtro"
            contextoCols={2}
            contexto={[
              { etiqueta: 'Pedidos', valor: formatNumber(kpis.pedidos) },
              { etiqueta: 'Destinatarios', valor: formatNumber(kpis.destinatarios) },
              { etiqueta: 'Materiales', valor: formatNumber(kpis.materiales) },
              { etiqueta: 'Importe por pedido', valor: formatCurrency(kpis.pedidos ? kpis.impTot / kpis.pedidos : 0), title: 'Importe pendiente ÷ pedidos del filtro actual' },
            ]}
          />
          </div>
          <PendientePorNivel
            renglones={renglonesPend}
            storageKey={seg ? 'seg' : 'ped'}
            onMaterial={(m) => open({ type: 'material', material: m })}
            onFiltrar={(campo, valor) => addQuick(campo, valor)}
          />
        </ResumenColapsable>
      )}

      <FilterBar
        search={<DebouncedSearch key={clearTick} initialValue={q} onChange={setQ} placeholder="Buscar material, pedido, cliente…" />}
        onClear={clearFilters}
        zoom={<ZoomControl level={zoom.level} setLevel={zoom.setLevel} />}
        chips={pasteCodes.length > 0 ? <PasteCodesChip value={pasteCodes} onChange={setPasteCodes} label="pedido/material" /> : undefined}
        columnFilters={<ColumnFilterBar columns={filterCols} rows={boFuente} active={quick} onChange={setQuick} />}
      >
        <FilterSelect value={estado} onChange={setEstado} todos="Estado (todos)" options={ESTADOS.map(([k, l]) => ({ value: k, label: l }))} />
        <GerenteSelect enrich={e} value={gerente} onChange={setGerente} />
        <EjecutivoZonaFilter opciones={e.ejecutivosZona} seleccion={ejecZonas} onChange={setEjecZonas} modo={ejecModo} onModo={setEjecModo} />
        {!fuenteOculto && (
          <FilterSelect value={fuente} onChange={setFuente} todos="Fuentes (todas)" options={[{ value: 'si', label: 'Con fuentes' }, { value: 'no', label: 'Sin fuentes' }]} />
        )}
        {!fuenteOculto && (
          <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm" title="Para fuente Corta caducidad, exige centro sugerido 1031/1022/1017 o igual al centro del pedido. Otras fuentes no se filtran.">
            <input type="checkbox" checked={centroValido} onChange={(ev) => setCentroValido(ev.target.checked)} />
            Centro con sugerencias
          </label>
        )}
        {!fuenteOculto && (
          <ToggleButton active={soloAccionables} onClick={() => setSoloAccionables((v) => !v)} title="Pendiente + con fuente + sin bloqueo + centro válido: lo que se puede resolver hoy">Solo accionables</ToggleButton>
        )}
        <ToggleButton active={ocultarPend0} onClick={() => setOcultarPend0((v) => !v)} title="Excluye los renglones ya surtidos (Pendiente = 0)">Ocultar pendiente 0</ToggleButton>
        <ToggleButton active={ocultarBloqueados} onClick={() => setOcultarBloqueados((v) => !v)} title="Excluye cualquier renglón con motivo de bloqueo (Detenido, Crédito, Detenido por ambos)">Ocultar bloqueados</ToggleButton>
        <DateRangeFilter desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
        <PasteCodesFilter value={pasteCodes} onChange={setPasteCodes} label="pedido/material" />
      </FilterBar>

      {seg && <CentrosFiltroBar centroPedido="" sufijo="+ el centro de cada pedido" />}

      {agrupado ? (
      <Card className={`${ALTURA_TABLA} flex shrink-0 flex-col overflow-hidden`}>
        {barraTabla}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <Table key={firmaOrden(colOrden)} className={zoom.className} wrapperClassName="overflow-visible" resizableKey={`${ns}.agrupado.cols.${firmaOrden(colOrden)}`}>
            <TableHeader>
              <TableRow>
                {!fuenteOcultoPerm && (
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      title="Seleccionar todos los pedidos visibles"
                      checked={sorted.length > 0 && sorted.every((it) => selected.has(it.k))}
                      onChange={(ev) => { setSelected(ev.target.checked ? new Set(clavesAgrupado) : new Set()); setAncla(null); }}
                    />
                  </TableHead>
                )}
                {columnasOrden.map((k) => cabecera(k))}
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
                const invOpciones = puntosSolicitarInventario(a, b.materialBase, num(b.invByCenter['1018'] || 0)).filter((o) => o.cantidad > 0);
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
                if (selected.size > 1 && selected.has(it.k)) copyItems.push({ label: `${selected.size} seleccionados (para Excel)`, value: tsvSeleccion });
                // Cada celda por su clave: el orden de las columnas es el que eligió el usuario.
                const celdaAlm = (alm: string) => {
                  const tr = transitoFor(a.rss, b.centroPedido, alm, b.materialBase);
                  return (
                    <TableCell key={`inv${alm}`} className="text-right">
                      {formatNumber(num(b.invByCenter[alm] || 0))}
                      {tr > 0 && <div className="text-[10px] text-success">↻+{formatNumber(tr)}</div>}
                    </TableCell>
                  );
                };
                const celdas: Record<string, ReactNode> = {
                  ejecutivo: <TableCell key="ejecutivo"><Chip onClick={() => addQuick('ejecutivo', ejec(b))} title="Filtrar por ejecutivo">{ejec(b) || '—'}</Chip><div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', grupoCli(b))} title="Filtrar por grupo">{grupoCli(b) || '—'}</Chip></div></TableCell>,
                  pedido: <TableCell key="pedido"><Chip onClick={() => open({ type: 'pedido', ...(seg ? { fuente: 'seg' as const } : {}), pedido: b.pedido, lista: pedidosLista })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>,
                  fecha: <TableCell key="fecha" className="whitespace-nowrap text-xs"><span className="inline-flex items-center gap-1"><UrgenciaDot fecha={b.fecha} />{b.fecha || '—'}</span></TableCell>,
                  cliente: <TableCell key="cliente" className="max-w-64 truncate">{b.razonSocial} <ClienteOportunidadBadge dest={b.destinatario} /><div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: b.solicitante })}>S {b.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: b.destinatario })}>D {b.destinatario}</Chip></div></TableCell>,
                  centro: <TableCell key="centro">{b.centroPedido}{b.almacen ? ` / ${b.almacen}` : ''}</TableCell>,
                  material: <TableCell key="material"><Chip onClick={() => open({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip>{onDetalleLibros && <button type="button" onClick={(ev) => { ev.stopPropagation(); onDetalleLibros(b.materialBase); }} title="Detalle en libros: Disponibilidad (Libre real), Corta caducidad, Sustituto…" aria-label="Detalle del material en los libros" className="ml-1 inline-flex align-middle text-text-faint hover:text-accent"><Layers className="size-3.5" /></button>}<div className="text-[11px] text-text-faint max-w-64 truncate">{b.descripcionSolicitada}</div>{!precioOculto && e.matPrecioOferta(b.materialBase) > 0 && <div className="text-[10px] text-text">Of. {formatCurrency(e.matPrecioOferta(b.materialBase))}</div>}</TableCell>,
                  sector: <TableCell key="sector">{e.matSector(b.materialBase) || '—'}<div className="text-[11px] text-text-faint">{e.matGrupo(b.materialBase)}</div></TableCell>,
                  cantped: <TableCell key="cantped" className="text-right">{formatNumber(b.cantidadPedido)}</TableCell>,
                  pend: <TableCell key="pend" className="text-right">{formatNumber(b.cantidadPendiente)}</TableCell>,
                  precio: <TableCell key="precio" className="text-right">{formatCurrency(b.precio)}</TableCell>,
                  consumo: <TableCell key="consumo" className="text-right">{formatNumber(it.consumoProm)}<div className="text-[11px] text-text-faint">{consumoIdx.get(consumoKey(b.destinatario, b.materialBase))?.ultimoMesFacturacion || '—'}</div></TableCell>,
                  invtotal: (
                    <TableCell key="invtotal" className="text-right" title={INV_ALL.map((c) => `${c}: ${formatNumber(num(b.invByCenter[c] || 0))}`).join(' · ')}>
                      {formatNumber(invTotal(b))}
                      {invTransitoTotal(b) > 0 && <div className="text-[10px] text-success">↻+{formatNumber(invTransitoTotal(b))}</div>}
                    </TableCell>
                  ),
                  inv1030: celdaAlm('1030'),
                  inv1031: celdaAlm('1031'),
                  inv1032: celdaAlm('1032'),
                  inv1060: <TableCell key="inv1060" className="text-right">{formatNumber(b.invByCenter['1060'] || 0)}</TableCell>,
                  bloq: <TableCell key="bloq">{b.bloqueado ? <StatePill label={b.bloqueado} cls="amb" /> : '—'}</TableCell>,
                  estado: <TableCell key="estado"><div className="flex flex-wrap items-center gap-1"><StatePill label={it.status.label} cls={it.status.cls} />{revisionDe(b.materialBase) && <StatePill label={revisionDe(b.materialBase)} cls="amb" />}</div></TableCell>,
                  tendencia: <TableCell key="tendencia"><TrendBadge t={it.tend} /></TableCell>,
                  ofertable: <TableCell key="ofertable"><OfertableCell o={ofertableDe(b)} /></TableCell>,
                  fuentes: <TableCell key="fuentes" className="text-right">{it.fuentes.length || '—'}</TableCell>,
                };
                return (
                  <SolicitarContextMenu
                    key={it.k}
                    onSolicitar={onSolicitar}
                    solicitado={sugSolicitadas.has(it.k)}
                    label={b.materialBase}
                    onVerDetalle={() => open({ type: 'pedido', ...(seg ? { fuente: 'seg' as const } : {}), pedido: b.pedido, boKey: it.k, lista: pedidosLista })}
                    seleccion={{ seleccionada: selected.has(it.k), onToggle: () => toggleSelected(it.k) }}
                    copyItems={copyItems}
                  >
                  <TableRow ref={measureElement} data-index={vi.index} title="Doble clic para ver detalle" className={`cursor-pointer ${isBloqueado ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--danger)]' : ''} ${selected.has(it.k) ? 'bg-accent-soft hover:bg-accent-soft' : isBloqueado ? 'bg-danger/10 hover:bg-danger/15' : ''}`} onDoubleClick={() => open({ type: 'pedido', ...(seg ? { fuente: 'seg' as const } : {}), pedido: b.pedido, boKey: it.k, lista: pedidosLista })}>
                    {!fuenteOcultoPerm && (
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(it.k)} onChange={() => undefined} onClick={(ev) => clickCasilla(it.k, ev, clavesAgrupado)} title="Seleccionar pedido (Shift = rango)" />
                      </TableCell>
                    )}
                    {columnasOrden.map((k) => celdas[k])}
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
      <Card className={`${ALTURA_TABLA} flex shrink-0 flex-col overflow-hidden`}>
        {barraTabla}
        <div ref={scrollRefRaw} className="min-h-0 flex-1 overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible" resizableKey={`${ns}.raw.cols`}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    title="Seleccionar todos los renglones visibles"
                    checked={sortedRaw.length > 0 && sortedRaw.every((r) => selected.has(r.key))}
                    onChange={(ev) => { setSelected(ev.target.checked ? new Set(clavesRaw) : new Set()); setAncla(null); }}
                  />
                </TableHead>
                {([
                  ['ejecutivo', 'Ejecutivo / Grupo cli.'], ['pedido', 'Pedido/OC'], ['fecha', 'Fecha'], ['cliente', 'Cliente'],
                  ['centro', 'Centro/Alm'], ['material', 'Material'], ['sector', 'Sector/Grupo'],
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw} filter={filtroDe(k)}>{l}</SortableTableHead>)}
                {([
                  ['cantped', 'Cant.ped.'], ['pend', 'Pend.'], ...(precioOculto ? [] : [['precio', 'Precio'] as const]), ['consumo', 'Consumo'],
                  ...(unificarInv ? [['invtotal', 'Inv. total'] as const] : [['inv1030', '1030'] as const, ['inv1031', '1031'] as const, ['inv1032', '1032'] as const, ['inv1060', '1060'] as const]),
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw} className="text-right justify-end" filter={filtroDe(k)}>{l}</SortableTableHead>)}
                {([
                  ['bloq', 'Bloq.'], ['estado', 'Estado'], ['tendencia', 'Tendencia'],
                ] as const).filter(([k]) => vis(k)).map(([k, l]) => <SortableTableHead key={k} sortKey={k} activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw} filter={filtroDe(k)}>{l}</SortableTableHead>)}
                {vis('fuente') && <SortableTableHead sortKey="fuente" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw} filter={filtroDe('fuente')}>Fuente</SortableTableHead>}
                {vis('matsug') && <SortableTableHead sortKey="matsug" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw} filter={filtroDe('matsug')}>Material sugerido</SortableTableHead>}
                {vis('centrosug') && <SortableTableHead sortKey="centrosug" activeKey={sortKeyRaw} dir={dirRaw} onSort={toggleSortRaw} filter={filtroDe('centrosug')}>Centro sugerido</SortableTableHead>}
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
                const invOpciones = puntosSolicitarInventario(a, b.materialBase, num(b.invByCenter['1018'] || 0)).filter((o) => o.cantidad > 0);
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
                if (selected.size > 1 && selected.has(row.key)) copyItems.push({ label: `${selected.size} seleccionados (para Excel)`, value: tsvSeleccion });
                return (
                  <SolicitarContextMenu
                    key={row.key}
                    onSolicitar={onSolicitar}
                    solicitado={rawSolicitadas.has(sourceKey)}
                    label={b.materialBase}
                    onVerDetalle={() => open({ type: 'pedido', ...(seg ? { fuente: 'seg' as const } : {}), pedido: b.pedido, boKey: it.k, lista: pedidosListaRaw })}
                    seleccion={{ seleccionada: selected.has(row.key), onToggle: () => toggleSelected(row.key) }}
                    copyItems={copyItems}
                  >
                  <TableRow ref={measureElementRaw} data-index={vi.index} title="Doble clic para ver detalle" className={`cursor-pointer ${isBloqueado ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--danger)]' : ''} ${selected.has(row.key) ? 'bg-accent-soft hover:bg-accent-soft' : isBloqueado ? 'bg-danger/10 hover:bg-danger/15' : ''}`} onDoubleClick={() => open({ type: 'pedido', ...(seg ? { fuente: 'seg' as const } : {}), pedido: b.pedido, boKey: it.k, lista: pedidosListaRaw })}>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(row.key)} onChange={() => undefined} onClick={(ev) => clickCasilla(row.key, ev, clavesRaw)} title="Seleccionar renglón (Shift = rango)" />
                    </TableCell>
                    {vis('ejecutivo') && <TableCell><Chip onClick={() => addQuick('ejecutivo', ejec(b))} title="Filtrar por ejecutivo">{ejec(b) || '—'}</Chip><div className="text-[11px] text-text-faint"><Chip onClick={() => addQuick('grupocli', grupoCli(b))} title="Filtrar por grupo">{grupoCli(b) || '—'}</Chip></div></TableCell>}
                    {vis('pedido') && <TableCell><Chip onClick={() => open({ type: 'pedido', ...(seg ? { fuente: 'seg' as const } : {}), pedido: b.pedido, lista: pedidosListaRaw })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>}
                    {vis('fecha') && <TableCell className="whitespace-nowrap text-xs"><span className="inline-flex items-center gap-1"><UrgenciaDot fecha={b.fecha} />{b.fecha || '—'}</span></TableCell>}
                    {vis('cliente') && <TableCell className="max-w-64 truncate">{b.razonSocial} <ClienteOportunidadBadge dest={b.destinatario} /><div className="text-[11px]"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: b.solicitante })}>S {b.solicitante}</Chip> · <Chip onClick={() => open({ type: 'evol', kind: 'dest', key: b.destinatario })}>D {b.destinatario}</Chip></div></TableCell>}
                    {vis('centro') && <TableCell>{b.centroPedido}{b.almacen ? ` / ${b.almacen}` : ''}</TableCell>}
                    {vis('material') && <TableCell><Chip onClick={() => open({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip>{onDetalleLibros && <button type="button" onClick={(ev) => { ev.stopPropagation(); onDetalleLibros(b.materialBase); }} title="Detalle en libros: Disponibilidad (Libre real), Corta caducidad, Sustituto…" aria-label="Detalle del material en los libros" className="ml-1 inline-flex align-middle text-text-faint hover:text-accent"><Layers className="size-3.5" /></button>}<div className="text-[11px] text-text-faint max-w-64 truncate">{b.descripcionSolicitada}</div>{!precioOculto && e.matPrecioOferta(b.materialBase) > 0 && <div className="text-[10px] text-text">Of. {formatCurrency(e.matPrecioOferta(b.materialBase))}</div>}</TableCell>}
                    {vis('sector') && <TableCell>{e.matSector(b.materialBase) || '—'}<div className="text-[11px] text-text-faint">{e.matGrupo(b.materialBase)}</div></TableCell>}
                    {vis('cantped') && <TableCell className="text-right">{formatNumber(b.cantidadPedido)}</TableCell>}
                    {vis('pend') && <TableCell className="text-right">{formatNumber(b.cantidadPendiente)}</TableCell>}
                    {!precioOculto && vis('precio') && <TableCell className="text-right">{formatCurrency(b.precio)}</TableCell>}
                    {vis('consumo') && <TableCell className="text-right">{formatNumber(it.consumoProm)}<div className="text-[11px] text-text-faint">{consumoIdx.get(consumoKey(b.destinatario, b.materialBase))?.ultimoMesFacturacion || '—'}</div></TableCell>}
                    {unificarInv ? (
                      vis('invtotal') && (
                        <TableCell className="text-right" title={INV_ALL.map((c) => `${c}: ${formatNumber(num(b.invByCenter[c] || 0))}`).join(' · ')}>
                          {formatNumber(invTotal(b))}
                          {invTransitoTotal(b) > 0 && <div className="text-[10px] text-success">↻+{formatNumber(invTransitoTotal(b))}</div>}
                        </TableCell>
                      )
                    ) : (
                      <>
                        {INV_COLS.filter((alm) => vis(`inv${alm}`)).map((alm) => {
                          const invVal = num(b.invByCenter[alm] || 0);
                          const tr = transitoFor(a.rss, b.centroPedido, alm, b.materialBase);
                          return (
                            <TableCell key={alm} className="text-right">
                              {formatNumber(invVal)}
                              {tr > 0 && <div className="text-[10px] text-success">↻+{formatNumber(tr)}</div>}
                            </TableCell>
                          );
                        })}
                        {vis('inv1060') && <TableCell className="text-right">{formatNumber(b.invByCenter['1060'] || 0)}</TableCell>}
                      </>
                    )}
                    {vis('bloq') && <TableCell>{b.bloqueado ? <StatePill label={b.bloqueado} cls="amb" /> : '—'}</TableCell>}
                    {vis('estado') && <TableCell><div className="flex flex-wrap items-center gap-1"><StatePill label={it.status.label} cls={it.status.cls} />{revisionDe(b.materialBase) && <StatePill label={revisionDe(b.materialBase)} cls="amb" />}</div></TableCell>}
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
    </ReportPage>
  );
}
