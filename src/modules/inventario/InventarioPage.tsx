import { Select } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import { Search, Lock, LockOpen, AlertTriangle, ChevronDown, ChevronRight, Maximize2 } from 'lucide-react';
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
import { CENTERS } from '@/core/types';
import type { InvDetalleRow } from '@/core/types';
import { StatePill, Chip, Ranking, ZoomControl, useZoom, ColumnFilterBar, ColumnFilterMenu, passesFilters, useSavedViews, SavedViewsControl, RowContextMenu, useColumnVisibility, ColumnVisibilityControl, PasteCodesFilter, PasteCodesChip, matchesCodes, type ActiveFilter, type FilterColumn, type ColDef } from '@/modules/analytics/ui';
import { norm, matchesQuery } from '@/modules/analytics/helpers';
import { esCondicionCortaCaducidad } from '@/core/inventoryRules';
import { pendSegunAmbito, transitoPorCondicion, esLentoPorCondicion, type AmbitoPend } from '@/core/resumenSin';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ReportPage, PageHeader, ExportButton, KpiBand, ResumenColapsable, FilterBar, FilterSelect, SegmentedControl, CellLegend, ALTURA_TABLA, SIN_DATOS } from '@/components/layout/report';
import { useRssFuenteStore } from '@/store/rssFuenteStore';
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
import { GerenteSelect } from '@/components/ui/gerente-select';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useQuickFilters } from '@/hooks/useQuickFilters';
import { useOfertaLotesStore } from '@/store/ofertaLotesStore';
import { useCentrosOfertaStore } from '@/store/centrosOfertaStore';
import { modoDeCentro } from '@/core/candidatosLote';
import { indiceSustitutos, type RelSustituto } from '@/core/invCondicionLibros';
import { mesKey, mesLabel } from '@/core/resumenFac';
import { valoresConSustitutos, type CampoNum, type ConsumoMaterial, type ValoresMaterial, type ValoresSustituto } from './valoresLote';
import { ResumenOfertaLotes } from '@/modules/analytics/panels/ResumenOfertaLotes';

import { bucketCaducidad, BUCKETS_CADUCIDAD } from '@/modules/analytics/caducidadBucket';

const DIAS_MES = 30.44;
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

interface LoteFila extends InvDetalleRow {
  condicion: string;
  dias: number | null;
  pendGeneral: number;
  pendCentro: number;
  /** Consumo general del material (todos los centros) y el de ESTE centro. */
  consumo: number;
  consumoCentro: number;
  /** Promedio mensual y última facturación del material propio (general y del centro del lote). */
  propio: ValoresMaterial;
  /** Materiales sustitutos (hoja Sustituto) con su inventario. */
  sustitutos: RelSustituto[];
  /** Lo que aportan los sustitutos (suma y detalle por código); aparte del valor propio de las columnas. */
  sust: ValoresMaterial & { detalle: ValoresSustituto[] };
  candidato: boolean;
}

interface LotePorVencer extends InvDetalleRow {
  dias: number;
  demanda: number;
  topCliente?: { razon: string; destinatario: string; consumo: number };
}

/** Filtro de periodo de "Lotes por vencer": mayor/menor que N días, o todos
 * (sin acotar) — mismo control se repite en la tarjeta inline y en el modal
 * de mayor visibilidad, ambos leyendo/escribiendo el mismo estado del padre. */
function LotesPeriodoFiltro({ op, dias, onOpChange, onDiasChange, unidad = 'días' }: {
  op: '' | 'gt' | 'lt';
  dias: number;
  onOpChange: (v: '' | 'gt' | 'lt') => void;
  onDiasChange: (v: number) => void;
  unidad?: 'días' | 'meses';
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={op}
        onChange={(e) => onOpChange(e.target.value as '' | 'gt' | 'lt')}
        className="h-8 w-auto text-xs"
      >
        <option value="">Todos</option>
        <option value="gt">Mayor que</option>
        <option value="lt">Menor que</option>
      </Select>
      {op && (
        <>
          <input
            type="number"
            value={dias}
            onChange={(e) => onDiasChange(Number(e.target.value) || 0)}
            className="h-7 w-16 rounded-md border border-border bg-bg-elevated px-1.5 text-xs"
          />
          <span className="text-[11px] text-text-faint">{unidad}</span>
        </>
      )}
    </div>
  );
}

/** "+N" en ámbar junto al valor propio: lo que aportan los sustitutos del material (con el desglose por código al pasar el cursor). */
function MasSustituto({ n, sust, campo }: { n: number; sust: ValoresSustituto[]; campo: CampoNum }) {
  if (!(n > 0)) return null;
  const lineas = sust.filter((d) => d[campo] > 0).map((d) => `${d.material} ${d.texto}: ${formatNumber(d[campo])}`).join('\n');
  return <span className="ml-1 text-xs font-medium text-warning" title={`De sustitutos:\n${lineas}`}>+{formatNumber(n)}</span>;
}

/** Debajo del consumo: promedio mensual y última facturación del material propio y, en ámbar, de cada sustituto. `ambito` = general (todos los centros) o del centro del lote. */
function HistorialConsumo({ propio, sust, ambito }: { propio: ValoresMaterial; sust: ValoresSustituto[]; ambito: 'general' | 'centro' }) {
  const prom = (v: ValoresMaterial) => (ambito === 'general' ? v.promGeneral : v.promCentro);
  const ult = (v: ValoresMaterial) => (ambito === 'general' ? v.ultGeneral : v.ultCentro);
  const texto = (v: ValoresMaterial) => `prom ${formatNumber(prom(v))} · ${ult(v) ? mesLabel(ult(v)) : 'sin fact.'}`;
  const conDatos = sust.filter((d) => prom(d) > 0 || ult(d));
  return (
    <div className="mt-0.5 space-y-px text-[11px] font-normal leading-tight">
      <div className="text-text-faint" title="Material del lote: consumo promedio mensual (historia) y último mes con facturación.">{texto(propio)}</div>
      {conDatos.slice(0, 3).map((d) => (
        <div key={d.material} className="text-warning" title={`Sustituto ${d.material} ${d.texto}: consumo promedio mensual y último mes con facturación.`}>{d.material}: {texto(d)}</div>
      ))}
      {conDatos.length > 3 && <div className="text-warning">+{conDatos.length - 3} sustitutos más</div>}
    </div>
  );
}

/** Filtro por meses restantes a la caducidad: todos, mayor que, menor que o un periodo (entre X y Y), con atajos de periodos comunes. */
function MesesRestantesFiltro({ op, desde, hasta, onOp, onDesde, onHasta }: {
  op: '' | 'gt' | 'lt' | 'between';
  desde: number;
  hasta: number;
  onOp: (v: '' | 'gt' | 'lt' | 'between') => void;
  onDesde: (v: number) => void;
  onHasta: (v: number) => void;
}) {
  const campo = (v: number, set: (n: number) => void, etiqueta: string) => (
    <input type="number" min={0} step={1} value={v} onChange={(e) => set(Number(e.target.value) || 0)} aria-label={etiqueta} className="h-7 w-14 rounded-md border border-border bg-bg-elevated px-1.5 text-xs" />
  );
  const atajos: { label: string; op: 'gt' | 'between'; d: number; h: number }[] = [
    { label: '0–3', op: 'between', d: 0, h: 3 }, { label: '3–6', op: 'between', d: 3, h: 6 },
    { label: '6–9', op: 'between', d: 6, h: 9 }, { label: '9–12', op: 'between', d: 9, h: 12 }, { label: '> 12', op: 'gt', d: 12, h: 12 },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select value={op} onChange={(e) => onOp(e.target.value as '' | 'gt' | 'lt' | 'between')} className="h-8 w-auto text-xs" aria-label="Tipo de filtro de meses restantes">
        <option value="">Todos</option>
        <option value="lt">Menor que</option>
        <option value="gt">Mayor que</option>
        <option value="between">Entre</option>
      </Select>
      {op === 'between' ? <>{campo(desde, onDesde, 'Desde (meses)')}<span className="text-[11px] text-text-faint">y</span>{campo(hasta, onHasta, 'Hasta (meses)')}</> : op ? campo(desde, onDesde, 'Meses') : null}
      {op && <span className="text-[11px] text-text-faint">meses</span>}
      <span className="ml-1 flex items-center gap-1" role="group" aria-label="Periodos rápidos">
        {atajos.map((x) => {
          const activo = op === x.op && desde === x.d && (x.op !== 'between' || hasta === x.h);
          return (
            <button
              key={x.label} type="button" aria-pressed={activo}
              onClick={() => { if (activo) { onOp(''); return; } onOp(x.op); onDesde(x.d); onHasta(x.h); }}
              className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums', activo ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-muted hover:border-accent/50')}
            >{x.label} m</button>
          );
        })}
      </span>
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
                <div className="text-[11px] text-text-faint">{formatFechaCaducidad(l.fechaCaducidad)}</div>
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

interface InventarioPageProps {
  /** 'libros' = el mismo módulo con una fila por material × condición armada desde el libro Inv_Condicion (Corta
   * caducidad por lote, Revision con sus Status, Sustituto, PNC) y Disponibilidad. Por defecto, el reporte diario. */
  modo?: 'rep' | 'libros';
}

export function InventarioPage({ modo = 'rep' }: InventarioPageProps = {}) {
  const bootstrapped = useDataStore((s) => s.bootstrapped);
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const libros = modo === 'libros';
  // Prefijo de las llaves persistidas (filtros, columnas, vistas, zoom): cada modo guarda las suyas.
  const ns = libros ? 'invLibros' : 'inventario';
  const setFuenteRss = useRssFuenteStore((s) => s.setFuente);
  // Los paneles de detalle leen los datos de ESTA tabla mientras está abierta.
  useEffect(() => {
    setFuenteRss(libros ? 'libros' : 'sin');
    return () => setFuenteRss('sin');
  }, [libros, setFuenteRss]);
  const rows = libros ? a.invCondicionLibros : a.invCondicion;
  const lotes = libros ? a.lotesLibros : a.lotes;
  const rss = libros ? a.rssDisp : a.rss;
  const [q, setQ] = usePersistedState(`${ns}.q`, '');
  const { prefiltro, clear: clearPrefiltro } = useMaterialPrefiltro(setQ);
  const [cond, setCond] = usePersistedState(`${ns}.cond`, '');
  // Alcance del pendiente por celda: solo los almacenes que aplican a la condición (RN-INV-002) o todo el del centro.
  const [ambitoPend, setAmbitoPend] = usePersistedState<AmbitoPend>(`${ns}.ambitoPend`, 'condicion');
  const setAmbitoRss = useRssFuenteStore((s) => s.setAmbitoPend);
  useEffect(() => {
    setAmbitoRss(ambitoPend);
    return () => setAmbitoRss('condicion');
  }, [ambitoPend, setAmbitoRss]);
  // Filtros por las sumas de la fila: «Pend. suma» (todos los centros, según el alcance elegido) e «Inv Suma».
  const [pendFiltro, setPendFiltro] = usePersistedState<'' | 'con' | 'sin'>(`${ns}.pendFiltro`, '');
  const [invFiltro, setInvFiltro] = usePersistedState<'' | 'con' | 'sin'>(`${ns}.invFiltro`, '');
  const [sector, setSector] = usePersistedState(`${ns}.sector`, '');
  const [gerente, setGerente] = usePersistedState(`${ns}.gerente`, '');
  const [centro, setCentro] = usePersistedState(`${ns}.centro`, '');
  const [isAdmin, setIsAdmin] = useState(readAdmin);
  const [hidden, setHidden] = useState<Set<string>>(readHidden);
  const [quick, setQuick] = useQuickFilters(`${ns}.quick`);
  // "Pegar materiales" estilo SAP — aditivo, no toca los filtros de arriba.
  const [pasteCodes, setPasteCodes] = usePersistedState<string[]>(`${ns}.pasteCodes`, []);
  const zoom = useZoom(`${ns}_zoom`);
  const clearFilters = () => { setQ(''); setCond(''); setSector(''); setGerente(''); setCentro(''); setQuick([]); setPasteCodes([]); setPendFiltro(''); setInvFiltro(''); };

  const colVis = useColumnVisibility(`${ns}_columnas`);
  const columnDefs: ColDef[] = useMemo(() => [
    ...(libros ? [{ key: 'detalle', label: 'Detalle condición' }] : []),
    { key: 'disp3130', label: 'Disp 31·30' },
    { key: 'disp3132', label: 'Disp 31·32' },
    ...CENTERS.map((c) => ({ key: `centro_${c}`, label: `Inv ${c}` })),
    { key: 'invsuma', label: 'Inv Suma' },
    { key: 'pendsuma', label: 'Pend. suma' },
    { key: 'importe', label: 'Importe $' },
  ], [libros]);

  // Vistas guardadas: snapshot de filtros (condicion/sector/centro/quick) + columnas ocultas, persistido entre sesiones.
  const savedViews = useSavedViews<{ cond: string; sector: string; centro: string; quick: ActiveFilter[]; hidden?: string[]; pasteCodes?: string[]; pendFiltro?: '' | 'con' | 'sin'; invFiltro?: '' | 'con' | 'sin' }>(`${ns}_vistas`);
  const applyView = (state: { cond: string; sector: string; centro: string; quick: ActiveFilter[]; hidden?: string[]; pasteCodes?: string[]; pendFiltro?: '' | 'con' | 'sin'; invFiltro?: '' | 'con' | 'sin' }) => {
    setCond(state.cond); setSector(state.sector); setCentro(state.centro); setQuick(state.quick);
    setPasteCodes(state.pasteCodes ?? []);
    setPendFiltro(state.pendFiltro ?? ''); setInvFiltro(state.invFiltro ?? '');
    if (state.hidden) colVis.apply(state.hidden);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, { cond, sector, centro, quick, hidden: [...colVis.hidden], pasteCodes, pendFiltro, invFiltro });
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
    type Agg = ConsumoMaterial & { clientes: Map<string, { razon: string; destinatario: string; consumo: number }> };
    const m = new Map<string, Agg>();
    const mas = (x: string, y: string) => (mesKey(y) > mesKey(x) ? y : x);
    (a.result?.consumo ?? []).forEach((r) => {
      const key = norm(r.material);
      const c = norm(r.centro);
      let o = m.get(key);
      if (!o) { o = { total: 0, porCentro: new Map(), prom: 0, promPorCentro: new Map(), ultMes: '', ultPorCentro: new Map(), clientes: new Map() }; m.set(key, o); }
      // Promedio mensual y última facturación cuentan TODAS las filas (también las sin consumo en el mes en curso).
      o.prom += r.consumoPromedioMensual || 0;
      o.promPorCentro.set(c, (o.promPorCentro.get(c) ?? 0) + (r.consumoPromedioMensual || 0));
      if (r.ultimoMesFacturacion) {
        o.ultMes = mas(o.ultMes, r.ultimoMesFacturacion);
        o.ultPorCentro.set(c, mas(o.ultPorCentro.get(c) ?? '', r.ultimoMesFacturacion));
      }
      if (!(r.consumoActual > 0)) return;
      o.total += r.consumoActual;
      o.porCentro.set(c, (o.porCentro.get(c) ?? 0) + r.consumoActual);
      const ck = norm(r.destinatario);
      const cl = o.clientes.get(ck) || { razon: r.razonSocial, destinatario: r.destinatario, consumo: 0 };
      cl.consumo += r.consumoActual;
      o.clientes.set(ck, cl);
    });
    return m;
  }, [a.result]);

  // Periodo de "Lotes por vencer": mayor/menor que N días, o todos (sin
  // acotar) — antes era un umbral fijo (≤90 días).
  const [lotesOp, setLotesOp] = usePersistedState<'' | 'gt' | 'lt'>(`${ns}.lotesOp`, 'lt');
  const [lotesDias, setLotesDias] = usePersistedState(`${ns}.lotesDias`, 90);
  const [lotesColapsado, setLotesColapsado] = usePersistedState(`${ns}.lotesColapsado`, false);
  const [lotesModalOpen, setLotesModalOpen] = useState(false);
  const [vista, setVista] = usePersistedState<'material' | 'lote'>(`${ns}.vista`, 'material');
  const [soloCand, setSoloCand] = usePersistedState(`${ns}.soloCand`, false);
  // Filtros propios de la vista Por lote (independientes de «Lotes por vencer»): por omisión, TODOS los lotes, también los sin disponible.
  const [loteOp, setLoteOp] = usePersistedState<'' | 'gt' | 'lt' | 'between'>(`${ns}.loteOp`, '');
  const [loteMeses, setLoteMeses] = usePersistedState(`${ns}.loteMeses`, 3);
  const [loteMesesHasta, setLoteMesesHasta] = usePersistedState(`${ns}.loteMesesHasta`, 12);
  const [ocultarSinDisp, setOcultarSinDisp] = usePersistedState(`${ns}.loteOcultarSinDisp`, false);

  const lotesPorVencer = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return lotes
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
  }, [lotes, consumoPorMaterial, lotesOp, lotesDias]);
  const lotesLabel = lotesOp === 'gt' ? `> ${lotesDias} días` : lotesOp === 'lt' ? `< ${lotesDias} días` : 'todos';
  const hayLotesConCaducidad = useMemo(() => lotes.some((l) => l.fechaCaducidad), [lotes]);

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
  const rssCentro = (r: (typeof rows)[number], c: string) => rss?.mats.get(norm(r.material))?.centros.get(c);
  // Pendiente de la fila sumado en TODOS los centros, con el alcance elegido (por condición / todo el centro).
  const pendSumaCond = (r: (typeof rows)[number]) => CENTERS.reduce((sum, c) => sum + pendSegunAmbito(rssCentro(r, c), r.condicion, ambitoPend), 0);

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
      if (gerente && !a.enrich.sectorDeGerente(a.enrich.matSector(r.material) || r.sector, gerente)) return false;
      if (centro && !(invCond(r, centro) > 0)) return false;
      if (!passesFilters(r, filterCols, quick)) return false;
      if (qd && !matchesQuery(qd, `${r.material} ${r.textoBreve}`)) return false;
      if (!isAdmin && hidden.has(rowKey(r.material, r.condicion))) return false;
      if (!matchesCodes(pasteCodes, r.material)) return false;
      if (pendFiltro && (pendSumaCond(r) > 0) !== (pendFiltro === 'con')) return false;
      if (invFiltro && (invSumaCond(r) > 0) !== (invFiltro === 'con')) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, qd, cond, sector, gerente, centro, a.enrich, isAdmin, hidden, filterCols, quick, pasteCodes, pendFiltro, invFiltro, ambitoPend, rss]);

  const kpis = useMemo(() => {
    const mats = new Set(filtered.map((r) => norm(r.material)));
    const imp = filtered.reduce((s, r) => s + invSumaCond(r) * r.precioOferta, 0);
    const stock = filtered.reduce((s, r) => s + invSumaCond(r), 0);
    const rk = filtered.map((r) => ({ code: r.material, desc: r.textoBreve, val: invSumaCond(r) * r.precioOferta }))
      .filter((x) => x.val > 0).sort((x, y) => y.val - x.val).slice(0, 10);
    // Importe por condición (si no hay precios, la distribución se arma con el stock).
    const porCond = new Map<string, { imp: number; stock: number }>();
    for (const r of filtered) {
      const e = porCond.get(r.condicion) ?? { imp: 0, stock: 0 };
      e.imp += invSumaCond(r) * r.precioOferta;
      e.stock += invSumaCond(r);
      porCond.set(r.condicion, e);
    }
    return { mats: mats.size, imp, stock, rk, porCond: [...porCond].map(([condicion, v]) => ({ condicion, ...v })).sort((x, y) => y.imp - x.imp || y.stock - x.stock) };
  }, [filtered]);

  // Totales de la tabla según el filtro activo: por centro (inventario y pendiente) y las sumas de fila.
  const totales = useMemo(() => {
    const invC: Record<string, number> = {};
    const pendC: Record<string, number> = {};
    let inv = 0, pend = 0, imp = 0, d3130 = 0, d3132 = 0;
    for (const r of filtered) {
      for (const c of CENTERS) {
        invC[c] = (invC[c] ?? 0) + invCond(r, c);
        pendC[c] = (pendC[c] ?? 0) + pendSegunAmbito(rssCentro(r, c), r.condicion, ambitoPend);
      }
      d3130 += r.disponible31_30 || 0; d3132 += r.disponible31_32 || 0;
      inv += invSumaCond(r); pend += pendSumaCond(r); imp += invSumaCond(r) * r.precioOferta;
    }
    return { invC, pendC, inv, pend, imp, d3130, d3132 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, ambitoPend, rss]);

  const sortAcc = useMemo(() => ({
    material: (r: (typeof filtered)[number]) => r.material,
    condicion: (r: (typeof filtered)[number]) => r.condicion,
    detalle: (r: (typeof filtered)[number]) => r.detalle ?? '',
    sector: (r: (typeof filtered)[number]) => a.enrich.matSector(r.material) || r.sector,
    precio: (r: (typeof filtered)[number]) => r.precioOferta,
    um: (r: (typeof filtered)[number]) => a.enrich.matUm(r.material),
    disp3130: (r: (typeof filtered)[number]) => r.disponible31_30,
    disp3132: (r: (typeof filtered)[number]) => r.disponible31_32,
    invsuma: (r: (typeof filtered)[number]) => invSumaCond(r),
    pendsuma: (r: (typeof filtered)[number]) => pendSumaCond(r),
    importe: (r: (typeof filtered)[number]) => invSumaCond(r) * r.precioOferta,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [a.enrich, ambitoPend, rss]);
  const { sorted, sortKey, dir, toggleSort } = useSort(filtered, sortAcc);
  const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(sorted.length);
  // Materiales (únicos) en el orden/filtro de la tabla, para recorrerlos con ◀/▶ en el detalle de celda.
  const listaMateriales = useMemo(() => [...new Set(sorted.map((r) => r.material))], [sorted]);
  const visibleCenters = useMemo(() => CENTERS.filter((c) => colVis.isVisible(`centro_${c}`)), [colVis]);
  const colCount = (isAdmin ? 1 : 0) + 5 + (libros && colVis.isVisible('detalle') ? 1 : 0)
    + (colVis.isVisible('disp3130') ? 1 : 0) + (colVis.isVisible('disp3132') ? 1 : 0)
    + visibleCenters.length
    + (colVis.isVisible('invsuma') ? 1 : 0) + (colVis.isVisible('pendsuma') ? 1 : 0) + (colVis.isVisible('importe') ? 1 : 0);

  // Vista "Por lote": un renglón por lote (con caducidad) de los materiales que pasan los filtros, con el pendiente general
  // y el consumo del material al lado para detectar candidatos a ofertar.
  const idxSust = useMemo(() => (libros ? indiceSustitutos(a.sustitucionesLibros) : new Map<string, RelSustituto[]>()), [libros, a.sustitucionesLibros]);
  const { filas: filasLote, sinRenglon: lotesSinRenglon } = useMemo(() => {
    const condPorMat = new Map<string, Set<string>>();
    for (const r of filtered) {
      const k = norm(r.material);
      if (!condPorMat.has(k)) condPorMat.set(k, new Set());
      if (r.condicion) condPorMat.get(k)!.add(r.condicion);
    }
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const out: LoteFila[] = [];
    let sinRenglon = 0;
    // Con los filtros de renglón apagados, un lote cuyo material no tiene renglón (todos sus lotes están en cero/bloqueados) también se muestra.
    const sinFiltrosDeRenglon = !cond && !sector && !gerente && !quick.length && !pendFiltro && !invFiltro;
    const base = libros && !ocultarSinDisp ? [...lotes, ...a.lotesSinLibreLibros] : lotes;
    for (const l of base) {
      const k = norm(l.material);
      if (!condPorMat.has(k)) {
        const pasa = sinFiltrosDeRenglon && l.cantidadDisp <= 0 && matchesCodes(pasteCodes, l.material) && (!qd || matchesQuery(qd, `${l.material} ${l.textoBreve}`));
        if (!pasa) { sinRenglon++; continue; }
      }
      if (ocultarSinDisp && !(l.cantidadDisp > 0)) continue;
      if (centro && norm(l.centro) !== centro) continue;
      let dias: number | null = null;
      if (l.fechaCaducidad) {
        const d = new Date(l.fechaCaducidad);
        if (!Number.isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); dias = Math.round((d.getTime() - hoy.getTime()) / 86400000); }
      }
      if (loteOp && dias !== null) {
        const m = dias / DIAS_MES;
        if (loteOp === 'gt' && !(m > loteMeses)) continue;
        if (loteOp === 'lt' && !(m < loteMeses)) continue;
        if (loteOp === 'between' && !(m >= Math.min(loteMeses, loteMesesHasta) && m <= Math.max(loteMeses, loteMesesHasta))) continue;
      } else if (loteOp && dias === null) continue;
      const v = valoresConSustitutos(l.material, norm(l.centro), idxSust.get(l.material) ?? [], {
        pendDe: (mk, c) => {
          const mo = rss?.mats.get(mk);
          if (!mo) return 0;
          return c ? pendSegunAmbito(mo.centros.get(c), '', 'centro') : CENTERS.reduce((sum, cc) => sum + pendSegunAmbito(mo.centros.get(cc), '', 'centro'), 0);
        },
        consumoDe: (mk) => consumoPorMaterial.get(mk),
      });
      const { pendGeneral, pendCentro, consumo, consumoCentro } = v.propio;
      // «Candidato» también cuando el consumo o el pendiente está en el sustituto.
      const candidato = pendGeneral > 0 || consumo > 0 || v.sust.pendGeneral > 0 || v.sust.consumo > 0;
      if (soloCand && !candidato) continue;
      out.push({ ...l, condicion: [...(condPorMat.get(k) ?? [])].join(', ') || (l.cantidadDisp > 0 ? '' : 'Corta caducidad (sin libre)'), dias, pendGeneral, pendCentro, consumo, consumoCentro, sustitutos: idxSust.get(l.material) ?? [], propio: v.propio, sust: v.sust, candidato });
    }
    return { filas: out, sinRenglon };
  }, [filtered, lotes, a.lotesSinLibreLibros, libros, centro, rss, consumoPorMaterial, idxSust, loteOp, loteMeses, loteMesesHasta, soloCand, ocultarSinDisp, cond, sector, gerente, quick, pendFiltro, invFiltro, pasteCodes, qd]);
  const accLote = useMemo(() => ({
    material: (l: LoteFila) => l.material,
    condicion: (l: LoteFila) => l.condicion,
    centro: (l: LoteFila) => l.centro,
    lote: (l: LoteFila) => l.lote,
    disp: (l: LoteFila) => l.cantidadDisp,
    dias: (l: LoteFila) => l.dias ?? 99999,
    pendGeneral: (l: LoteFila) => l.pendGeneral,
    pendCentro: (l: LoteFila) => l.pendCentro,
    consumo: (l: LoteFila) => l.consumo,
    consumoCentro: (l: LoteFila) => l.consumoCentro,
    sustitutos: (l: LoteFila) => l.sustitutos.length,
  }), []);
  const lotesSort = useSort(filasLote, accLote);
  const lotesVirt = useRowVirtualizer(lotesSort.sorted.length);
  // Abre el panel de candidatos del lote; `lista` = los lotes en el orden de la tabla, para recorrerlos con ←/→.
  const abrirCandidatos = (l: LoteFila) => open({
    type: 'loteCandidatos', material: l.material, lote: l.lote, centro: l.centro, almacen: l.almacen,
    lista: lotesSort.sorted.map((x) => ({ material: x.material, lote: x.lote, centro: x.centro, almacen: x.almacen })),
  });
  const modosCentro = useCentrosOfertaStore((s) => s.modos);
  const nOfertas = Object.keys(useOfertaLotesStore((s) => s.items)).length;
  const [resumenOfertaAbierto, setResumenOfertaAbierto] = useState(false);

  // Fixed pixel widths for the sticky (frozen) columns — the previous
  // hardcoded `left-[Npx]` offsets assumed specific column widths, but those
  // columns auto-sized to content (and the shared <Table> colgroup only ever
  // grows column widths, never shrinks them back), so as soon as real data
  // made one of them wider than assumed, every sticky column after it drifted
  // out of alignment with the header on horizontal scroll. Giving each a
  // fixed width (+ truncate) keeps the offsets always accurate, and also
  // accounts for the admin toggle column, which the old offsets ignored.
  const ADMIN_W = 36, MATERIAL_W = 160, UM_W = 64, CONDICION_W = 110, SECTOR_W = 140, PRECIO_W = 90;
  const adminLeft = 0;
  const materialLeft = isAdmin ? ADMIN_W : 0;
  const umLeft = materialLeft + MATERIAL_W;
  const condicionLeft = umLeft + UM_W;
  const sectorLeft = condicionLeft + CONDICION_W;
  const precioLeft = sectorLeft + SECTOR_W;

  if (!rows.length) {
    if (!bootstrapped) return <TableSkeleton />;
    if (libros) return <EmptyState title={SIN_DATOS.inventario.title} description={SIN_DATOS.inventario.description} action={{ to: SIN_DATOS.inventario.to, label: SIN_DATOS.inventario.label }} />;
    return <EmptyState title={'No hay datos de "Inventario por condición".'} action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const exportar = () => {
    const rowsX = filtered.map((r) => {
      const o: Record<string, unknown> = {
        Material: r.material, Descripción: r.textoBreve, Condición: r.condicion, ...(libros ? { 'Detalle condición': r.detalle ?? '' } : {}),
        Sector: a.enrich.matSector(r.material) || r.sector, 'Grupo art.': a.enrich.matGrupo(r.material) || r.grupo,
        UM: a.enrich.matUm(r.material), Precio: r.precioOferta, 'Disp 1031-1030': r.disponible31_30, 'Disp 1031-1032': r.disponible31_32,
      };
      CENTERS.forEach((c) => { o['Inv ' + c] = invCond(r, c); });
      o['Inv Suma'] = invSumaCond(r); o['Pend. suma'] = pendSumaCond(r); o['Importe $'] = invSumaCond(r) * r.precioOferta;
      return o;
    });
    // Los renglones son material × condición (el inventario se reparte entre
    // centros), así que los lotes se anexan a nivel material — salvo que
    // haya un filtro de Centro activo, en cuyo caso se acotan también a ese
    // centro (si el material tiene 5 lotes en 3 centros y filtras por 1001,
    // solo se exportan los de 1001).
    const mats = new Set(filtered.map((r) => norm(r.material)));
    const lotesX = buildLotesSheet(lotes, (l) => mats.has(norm(l.material)) && (!centro || norm(l.centro) === centro));
    const lotesCand = lotesSort.sorted.map((l) => ({
      Material: l.material, Descripción: l.textoBreve, Condición: l.condicion, Centro: l.centro, Almacén: l.almacen, Lote: l.lote,
      Disponible: l.cantidadDisp, Caducidad: formatFechaCaducidad(l.fechaCaducidad), 'Meses a caducidad': l.dias === null ? '' : Math.round((l.dias / DIAS_MES) * 10) / 10,
      'Pend. general': l.pendGeneral, 'Pend. centro': l.pendCentro, 'Consumo general': l.consumo, 'Consumo centro': l.consumoCentro, Sustitutos: l.sustitutos.map((x) => x.material).join(', '),
      'Prom. mensual general': l.propio.promGeneral, 'Últ. facturación general': l.propio.ultGeneral, 'Prom. mensual centro': l.propio.promCentro, 'Últ. facturación centro': l.propio.ultCentro,
      'Prom. mensual general sustituto': l.sust.promGeneral, 'Últ. facturación general sustituto': l.sust.ultGeneral, 'Prom. mensual centro sustituto': l.sust.promCentro, 'Últ. facturación centro sustituto': l.sust.ultCentro,
      'Pend. general sustituto': l.sust.pendGeneral, 'Pend. centro sustituto': l.sust.pendCentro, 'Consumo general sustituto': l.sust.consumo, 'Consumo centro sustituto': l.sust.consumoCentro,
    }));
    void exportXlsxMultiSheet(`${libros ? 'inv_con_condicion' : 'inventario'}_${stamp()}.xlsx`, [
      { name: 'Inventario', rows: rowsX },
      { name: 'Detalle Lotes', rows: lotesX },
      ...(vista === 'lote' ? [{ name: 'Lotes y candidatos', rows: lotesCand }] : []),
    ]);
  };

  return (
    <ReportPage>
      <PageHeader
        title={libros ? 'Inventario con condición' : 'Inventario por condición'}
        subtitle={`${formatNumber(filtered.length)} renglones · clic en material = detalle del material · clic en cantidad de un centro = detalle de ese centro`}
        actions={(
          <>
            <SegmentedControl
              ariaLabel="Vista de la tabla"
              value={vista}
              onChange={setVista}
              options={[
                { value: 'material', label: 'Por material', title: 'Un renglón por material × condición, con el inventario por centro.' },
                { value: 'lote', label: 'Por lote', title: 'Un renglón por lote con su caducidad, el pendiente general y el consumo del material (candidatos a ofertar).' },
              ]}
            />
            <SegmentedControl
              ariaLabel="Alcance del pendiente"
              value={ambitoPend}
              onChange={setAmbitoPend}
              options={[
                { value: 'condicion', label: 'Pend. por condición', title: 'Solo los almacenes que aplican a la condición: 1032 en corta caducidad; 1030+1031+1060 en las demás.' },
                { value: 'centro', label: 'Pend. todo el centro', title: 'Todo el pendiente del material en el centro, sin importar el almacén.' },
              ]}
            />
            <ColumnVisibilityControl columns={columnDefs} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
            <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
            <ExportButton onClick={exportar} />
          </>
        )}
      />

      {/* Banda arriba (lo principal) y, debajo, el top de importe */}
      <ResumenColapsable storageKey={`${libros ? 'invcond-libros' : 'invcond'}.resumen.oculto`} linea={<>Inventario {formatCurrency(kpis.imp)} · {formatNumber(kpis.mats)} materiales · {formatNumber(kpis.stock)} u.</>}>
      <KpiBand
        titulo="Inventario por condición"
        principal={{ etiqueta: 'Importe $ en inventario', valor: formatCurrency(kpis.imp) }}
        metricas={[
          { etiqueta: 'Materiales', valor: formatNumber(kpis.mats) },
          { etiqueta: 'Stock', valor: formatNumber(kpis.stock) },
          ...(hayLotesConCaducidad && vista !== 'lote' ? [{ etiqueta: 'Lotes por vencer', valor: formatNumber(lotesPorVencer.length), tono: lotesPorVencer.length > 0 ? ('warning' as const) : undefined, title: `Lotes por vencer (${lotesLabel}) con demanda activa` }] : []),
        ]}
        distribucion={{
          titulo: kpis.imp > 0 ? 'Importe por condición (clic = filtrar)' : 'Stock por condición (clic = filtrar)',
          segmentos: kpis.porCond.map((c, i) => ({ clave: c.condicion, etiqueta: c.condicion, valor: kpis.imp > 0 ? c.imp : c.stock, cls: ['bg-warning', 'bg-info', 'bg-danger', 'bg-success', 'bg-accent'][i % 5] ?? 'bg-accent' })),
          activo: cond || undefined,
          onToggle: (clave) => setCond(cond === clave ? '' : clave),
          formato: kpis.imp > 0 ? formatCurrency : formatNumber,
        }}
        pie={`${formatNumber(filtered.length)} renglones del filtro actual`}
      />
      <Ranking title="Top 10 por Importe $" items={kpis.rk} money wide onRow={(m) => open({ type: 'material', material: m })} className="w-full" />
      </ResumenColapsable>

      {vista !== 'lote' && hayLotesConCaducidad && (
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
            <ColumnFilterBar columns={filterCols} rows={rows} active={quick} onChange={setQuick} />
            <CellLegend>Debajo de cada celda: <span className="text-danger">Pend</span> pendiente ({ambitoPend === 'centro' ? 'todo el centro' : 'por condición'}) · <span className="text-success">+N</span> tránsito · <AlertTriangle className="inline size-3 text-warning" /> lento (≥6m sin consumo)</CellLegend>
          </>
        )}
      >
        <FilterSelect value={cond} onChange={setCond} todos="Condición (todas)" options={conds.map((c) => ({ value: c, label: c }))} />
        <GerenteSelect enrich={a.enrich} value={gerente} onChange={setGerente} />
        <FilterSelect value={sector} onChange={setSector} todos="Sector (todos)" options={sectores.map((s) => ({ value: s, label: s }))} />
        <FilterSelect value={centro} onChange={setCentro} todos="Centro (todos)" options={CENTERS.map((c) => ({ value: c, label: c }))} />
        <FilterSelect value={pendFiltro} onChange={setPendFiltro} todos="Pendiente (todos)" title="Pend. suma: el pendiente del renglón sumado en todos los centros, con el alcance elegido arriba." options={[{ value: 'con', label: 'Con pendiente' }, { value: 'sin', label: 'Sin pendiente' }]} />
        <FilterSelect value={invFiltro} onChange={setInvFiltro} todos="Inv Suma (todos)" title="Inv Suma: el inventario del renglón sumado en todos los centros (más Disp 31-30 y 31-32)." options={[{ value: 'con', label: 'Con inventario' }, { value: 'sin', label: 'Sin inventario' }]} />
        <PasteCodesFilter value={pasteCodes} onChange={setPasteCodes} label="material" />
        <Button
          variant={isAdmin ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsAdmin((v) => !v)}
          className="gap-1.5"
        >
          {isAdmin ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
          {isAdmin ? 'Admin ON' : 'Admin'}
        </Button>
      </FilterBar>

      {vista === 'lote' && (
        <Card className={`${ALTURA_TABLA} shrink-0 overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2">
            <span className="text-xs text-text-muted">Meses restantes:</span>
            <MesesRestantesFiltro op={loteOp} desde={loteMeses} hasta={loteMesesHasta} onOp={setLoteOp} onDesde={setLoteMeses} onHasta={setLoteMesesHasta} />
            <Button variant={ocultarSinDisp ? 'default' : 'outline'} size="sm" onClick={() => setOcultarSinDisp((v) => !v)} title="Oculta los lotes sin disponible (bloqueados o en cero)">Solo con disponible</Button>
            <Button variant={soloCand ? 'default' : 'outline'} size="sm" onClick={() => setSoloCand((v) => !v)} title="Solo lotes cuyo material tiene pendiente o consumo">Solo candidatos</Button>
            <Button variant={nOfertas ? 'default' : 'outline'} size="sm" onClick={() => setResumenOfertaAbierto(true)} title="Lotes seleccionados para ofertar a clientes">Resumen de ofertas ({nOfertas})</Button>
            <span className="flex items-center gap-1" aria-label="Leyenda de caducidad">{BUCKETS_CADUCIDAD.map((b) => <StatePill key={b.key} label={b.rango} cls={b.cls} />)}</span>
            <span className="text-xs text-text-faint">{formatNumber(lotesSort.sorted.length)} lotes{libros ? ` · hoja: ${formatNumber(a.lotesHojaLibros)} lotes (${formatNumber(lotes.length)} con libre · ${formatNumber(a.lotesSinLibreLibros.length)} sin libre)` : ''}{lotesSinRenglon > 0 ? ` · ${formatNumber(lotesSinRenglon)} fuera por los filtros de arriba` : ''} · clic en un lote = candidatos a ofertar · clic derecho = Solicitar / Copiar</span>
          </div>
          <div ref={lotesVirt.scrollRef} className="h-[calc(100%-45px)] overflow-auto">
            <Table className={zoom.className} wrapperClassName="overflow-visible">
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="material" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort}>Material</SortableTableHead>
                  <SortableTableHead sortKey="condicion" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort}>Condición</SortableTableHead>
                  <SortableTableHead sortKey="sustitutos" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort} title="Materiales sustitutos de este código (hoja Sustituto). Sus clientes también son candidatos: los verás en el detalle del lote.">Sustituto</SortableTableHead>
                  <SortableTableHead sortKey="centro" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort}>Centro / Alm.</SortableTableHead>
                  <TableHead title="A quién se puede ofrecer según el centro del lote: Local = solo clientes de ese centro; Compartido = varios centros. Se edita en el panel de candidatos.">Se ofrece a</TableHead>
                  <SortableTableHead sortKey="lote" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort}>Lote</SortableTableHead>
                  <SortableTableHead sortKey="disp" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort} className="text-right">Disp.</SortableTableHead>
                  <SortableTableHead sortKey="dias" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort}>Vence</SortableTableHead>
                  <SortableTableHead sortKey="pendGeneral" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort} className="text-right" title="Pendiente del material sumado en todos los centros y almacenes. El «+N» en ámbar es lo que suman sus sustitutos (aparte).">Pend. general</SortableTableHead>
                  <SortableTableHead sortKey="pendCentro" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort} className="text-right" title="Pendiente del material en el centro del lote (todos los almacenes). El «+N» en ámbar es lo de sus sustitutos en ese centro.">Pend. centro</SortableTableHead>
                  <SortableTableHead sortKey="consumo" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort} className="text-right" title={`Piezas facturadas del material en el mes en curso (${mesLabel(a.curmes)}), sumando todos los centros. El «+N» en ámbar es lo que suman sus sustitutos (aparte).`}>Consumo general</SortableTableHead>
                  <SortableTableHead sortKey="consumoCentro" activeKey={lotesSort.sortKey} dir={lotesSort.dir} onSort={lotesSort.toggleSort} className="text-right" title={`Piezas facturadas del material en el mes en curso (${mesLabel(a.curmes)}) en el centro de este lote. El «+N» en ámbar es lo de sus sustitutos en ese centro.`}>Consumo centro</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotesVirt.paddingTop > 0 && <tr><td style={{ height: lotesVirt.paddingTop }} colSpan={12} /></tr>}
                {lotesVirt.items.map((vi) => {
                  const l = lotesSort.sorted[vi.index];
                  return (
                    <SolicitarContextMenu
                      key={vi.index}
                      onSolicitar={() => solicitar.abrir(buildFromInvDetalle(l, a.enrich))}
                      solicitado={invSolicitadas.has(norm(l.material))}
                      label={`${l.material} · Lote ${l.lote || '—'}`}
                      onVerDetalle={() => open({ type: 'material', material: l.material })}
                      copyItems={[{ label: 'Material', value: l.material }, { label: 'Lote', value: l.lote }, { label: 'Centro', value: l.centro }, { label: 'Almacén', value: l.almacen }]}
                    >
                      <TableRow tabIndex={0} className={cn('cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent', !(l.cantidadDisp > 0) && 'opacity-50')} onClick={() => abrirCandidatos(l)} onKeyDown={(e) => { if (e.key === 'Enter') abrirCandidatos(l); }} title={!(l.cantidadDisp > 0) ? 'Sin disponible (bloqueado o en cero)' : undefined}>
                        <TableCell><Chip onClick={() => open({ type: 'material', material: l.material })}>{l.material}</Chip><div className="max-w-56 truncate text-[11px] text-text-faint">{l.textoBreve}</div></TableCell>
                        <TableCell className="text-xs">{l.condicion || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {l.sustitutos.length === 0 ? <span className="text-text-faint">—</span> : (
                            <span className="flex items-center gap-1" title={l.sustitutos.map((x) => `${x.material} ${x.texto} · inv. ${formatNumber(x.invTotal)}`).join('\n')}>
                              <Chip onClick={() => open({ type: 'material', material: l.sustitutos[0].material })}>{l.sustitutos[0].material}</Chip>
                              {l.sustitutos.length > 1 && <span className="text-text-faint">+{l.sustitutos.length - 1}</span>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{l.centro} · {l.almacen || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{modoDeCentro(l.centro, modosCentro) === 'local' ? <StatePill label={`Solo centro ${l.centro}`} cls="amb" /> : <StatePill label="Varios centros" cls="vio" />}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{l.lote || '—'}</TableCell>
                        <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {l.dias === null ? <span className="text-text-faint">—</span> : <StatePill label={l.dias < 0 ? 'vencido' : `${(l.dias / DIAS_MES).toFixed(1)} meses`} cls={bucketCaducidad(l.dias).cls} />}
                          <div className="text-[11px] text-text-faint">{formatFechaCaducidad(l.fechaCaducidad)}</div>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${l.pendGeneral > 0 ? 'text-danger' : 'text-text-faint'}`}>{formatNumber(l.pendGeneral)}<MasSustituto n={l.sust.pendGeneral} sust={l.sust.detalle} campo="pendGeneral" /></TableCell>
                        <TableCell className={`text-right ${l.pendCentro > 0 ? 'text-danger' : 'text-text-faint'}`}>{formatNumber(l.pendCentro)}<MasSustituto n={l.sust.pendCentro} sust={l.sust.detalle} campo="pendCentro" /></TableCell>
                        <TableCell className={`text-right ${l.consumo > 0 ? '' : 'text-text-faint'}`}>{formatNumber(l.consumo)}<MasSustituto n={l.sust.consumo} sust={l.sust.detalle} campo="consumo" /><HistorialConsumo propio={l.propio} sust={l.sust.detalle} ambito="general" /></TableCell>
                        <TableCell className={`text-right ${l.consumoCentro > 0 ? 'font-medium' : 'text-text-faint'}`}>{formatNumber(l.consumoCentro)}<MasSustituto n={l.sust.consumoCentro} sust={l.sust.detalle} campo="consumoCentro" /><HistorialConsumo propio={l.propio} sust={l.sust.detalle} ambito="centro" /></TableCell>
                      </TableRow>
                    </SolicitarContextMenu>
                  );
                })}
                {lotesVirt.paddingBottom > 0 && <tr><td style={{ height: lotesVirt.paddingBottom }} colSpan={12} /></tr>}
              </TableBody>
            </Table>
            {lotesSort.sorted.length === 0 && <p className="p-4 text-sm text-text-muted">Sin lotes con los filtros actuales.</p>}
          </div>
        </Card>
      )}

      <Card className={`${ALTURA_TABLA} shrink-0 overflow-hidden ${vista === 'lote' ? 'hidden' : ''}`}>
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table className={zoom.className} wrapperClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead className="sticky z-20 bg-bg-elevated" style={{ left: adminLeft, width: ADMIN_W, minWidth: ADMIN_W }}></TableHead>}
                <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: materialLeft, width: MATERIAL_W, minWidth: MATERIAL_W }} filter={<ColumnFilterMenu column={filterCols[0]} rows={rows} active={quick} onChange={setQuick} />}>Material</SortableTableHead>
                <SortableTableHead sortKey="um" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: umLeft, width: UM_W, minWidth: UM_W }} title="Unidad de medida del catálogo (pestaña Materiales).">UM</SortableTableHead>
                <SortableTableHead sortKey="condicion" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: condicionLeft, width: CONDICION_W, minWidth: CONDICION_W }} title="Fuente de pedido/condición del material: corta-caducidad, lento-movimiento, calidad, dañado o normal.">Condición</SortableTableHead>
                <SortableTableHead sortKey="sector" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated" style={{ left: sectorLeft, width: SECTOR_W, minWidth: SECTOR_W }} filter={<ColumnFilterMenu column={filterCols[2]} rows={rows} active={quick} onChange={setQuick} />} title="Sector y grupo de artículo del catálogo.">Sector/Grupo</SortableTableHead>
                <SortableTableHead sortKey="precio" activeKey={sortKey} dir={dir} onSort={toggleSort} className="sticky z-20 bg-bg-elevated text-right" style={{ left: precioLeft, width: PRECIO_W, minWidth: PRECIO_W }} title="Precio de oferta vigente para este material.">Precio</SortableTableHead>
                {libros && colVis.isVisible('detalle') && <SortableTableHead sortKey="detalle" activeKey={sortKey} dir={dir} onSort={toggleSort} title="Detalle de la condición, aparte del material (p. ej. el motivo de un PNC).">Detalle condición</SortableTableHead>}
                {colVis.isVisible('disp3130') && <SortableTableHead sortKey="disp3130" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Cantidad disponible para mover del centro 1031 (hub de distribución) al almacén 1030.">Disp 31·30</SortableTableHead>}
                {colVis.isVisible('disp3132') && <SortableTableHead sortKey="disp3132" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Cantidad disponible para mover del centro 1031 (hub de distribución) al almacén 1032.">Disp 31·32</SortableTableHead>}
                {visibleCenters.map((c) => <TableHead key={c} className="text-right" title={`Inventario de este material en el centro ${c}, tal como viene en el reporte "InvConsolidado". Clic = desglose por lote (InvDetalle). Debajo: pendiente (rojo; ${ambitoPend === 'centro' ? 'todo el del centro' : 'solo de los almacenes que aplican según la condición'}) y tránsito ("+N", solo hacia los almacenes que aplican según la condición). El ícono ⚠ indica "lento" (≥6 meses sin consumo y sin pendiente en ese centro).`}>Inv {c}</TableHead>)}
                {colVis.isVisible('invsuma') && <SortableTableHead sortKey="invsuma" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title="Suma del inventario (por condición) de este material en todos los centros, más Disp 31-30 y Disp 31-32.">Inv Suma</SortableTableHead>}
                {colVis.isVisible('pendsuma') && <SortableTableHead sortKey="pendsuma" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right" title={`Pendiente de este renglón sumado en todos los centros (${ambitoPend === 'centro' ? 'todo el pendiente del centro' : 'solo de los almacenes que aplican a la condición'}).`}>Pend. suma</SortableTableHead>}
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
                  const lotesMaterial = lotes.filter((l) => norm(l.material) === norm(r.material));
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
                    <TableCell className="sticky z-10 bg-bg-elevated" style={{ left: umLeft, width: UM_W, minWidth: UM_W }}>{a.enrich.matUm(r.material) || '—'}</TableCell>
                    <TableCell className="sticky z-10 bg-bg-elevated" style={{ left: condicionLeft, width: CONDICION_W, minWidth: CONDICION_W }}><StatePill label={r.condicion || '—'} cls={corta ? 'rojo' : 'gris'} /></TableCell>
                    <TableCell className="sticky z-10 truncate bg-bg-elevated" style={{ left: sectorLeft, width: SECTOR_W, minWidth: SECTOR_W }}>{a.enrich.matSector(r.material) || r.sector || '—'}<div className="truncate text-[11px] text-text-faint">{a.enrich.matGrupo(r.material) || r.grupo}</div></TableCell>
                    <TableCell className="sticky z-10 bg-bg-elevated text-right" style={{ left: precioLeft, width: PRECIO_W, minWidth: PRECIO_W }}>{r.precioOferta ? formatCurrency(r.precioOferta) : <span className="text-text-faint" title="Sin precio autorizado para esta condición">-</span>}</TableCell>
                    {libros && colVis.isVisible('detalle') && <TableCell className="max-w-56 truncate text-xs" title={r.detalle || undefined}>{r.detalle || '—'}</TableCell>}
                    {colVis.isVisible('disp3130') && <TableCell className="text-right"><Chip title="Ver el detalle del centro 1031 · almacén 1030" onClick={() => open({ type: 'invCondCelda', material: r.material, centro: '1031', almacen: '1030', lista: listaMateriales, condicion: r.condicion })}>{formatNumber(r.disponible31_30)}</Chip></TableCell>}
                    {colVis.isVisible('disp3132') && <TableCell className="text-right"><Chip title="Ver el detalle del centro 1031 · almacén 1032" onClick={() => open({ type: 'invCondCelda', material: r.material, centro: '1031', almacen: '1032', lista: listaMateriales, condicion: r.condicion })}>{formatNumber(r.disponible31_32)}</Chip></TableCell>}
                    {visibleCenters.map((c) => {
                      const co = rssCentro(r, c);
                      const pend = pendSegunAmbito(co, r.condicion, ambitoPend);
                      const transito = transitoPorCondicion(co, r.condicion);
                      const lento = rss ? esLentoPorCondicion(co, r.condicion, rss.curMes, ambitoPend) : false;
                      return (
                        <TableCell key={c} className="text-right">
                          <Chip onClick={() => open({ type: 'invCondCelda', material: r.material, centro: c, lista: listaMateriales, condicion: r.condicion })}>{formatNumber(invCond(r, c))}</Chip>
                          {transito > 0 && <span className="text-success"> +{formatNumber(transito)}</span>}
                          {lento && <span title={ambitoPend === 'centro' ? 'Lento: sin consumo hace ≥6 meses y sin pendiente en este centro (todos los almacenes).' : 'Lento: sin consumo hace ≥6 meses y sin pendiente aplicable en este centro.'}><AlertTriangle className="ml-1 inline size-3 text-warning" /></span>}
                          {pend > 0 && <div className="text-[11px] text-danger">Pend {formatNumber(pend)}</div>}
                        </TableCell>
                      );
                    })}
                    {colVis.isVisible('invsuma') && <TableCell className="text-right font-medium">{formatNumber(invSumaCond(r))}</TableCell>}
                    {colVis.isVisible('pendsuma') && <TableCell className={`text-right font-medium ${pendSumaCond(r) > 0 ? 'text-danger' : 'text-text-faint'}`}>{formatNumber(pendSumaCond(r))}</TableCell>}
                    {colVis.isVisible('importe') && <TableCell className="text-right">{formatCurrency(invSumaCond(r) * r.precioOferta)}</TableCell>}
                  </TableRow>
                  </SolicitarContextMenu>
                );
              })}
              {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} colSpan={colCount} /></tr>}
            </TableBody>
            {/* Totales del filtro activo: inventario y pendiente por centro, y las sumas de fila. */}
            <tfoot className="sticky bottom-0 z-10 border-t-2 border-border bg-bg-elevated text-sm font-semibold shadow-[0_-1px_0_var(--border)]">
              <tr>
                <td colSpan={(isAdmin ? 1 : 0) + 5} className="sticky left-0 z-20 bg-bg-elevated px-3 py-2">Total · {formatNumber(sorted.length)} renglones</td>
                {libros && colVis.isVisible('detalle') && <td />}
                {colVis.isVisible('disp3130') && <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totales.d3130)}</td>}
                {colVis.isVisible('disp3132') && <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totales.d3132)}</td>}
                {visibleCenters.map((c) => (
                  <td key={c} className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(totales.invC[c] ?? 0)}
                    {(totales.pendC[c] ?? 0) > 0 && <div className="text-[11px] font-normal text-danger">Pend {formatNumber(totales.pendC[c] ?? 0)}</div>}
                  </td>
                ))}
                {colVis.isVisible('invsuma') && <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totales.inv)}</td>}
                {colVis.isVisible('pendsuma') && <td className={`px-3 py-2 text-right tabular-nums ${totales.pend > 0 ? 'text-danger' : 'text-text-faint'}`}>{formatNumber(totales.pend)}</td>}
                {colVis.isVisible('importe') && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totales.imp)}</td>}
              </tr>
            </tfoot>
          </Table>
        </div>
      </Card>

      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
      <ResumenOfertaLotes open={resumenOfertaAbierto} onOpenChange={setResumenOfertaAbierto} />
    </ReportPage>
  );
}
