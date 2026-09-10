import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Download, RefreshCw, TrendingDown, AlertTriangle, Boxes, Users, Percent, ShoppingCart,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { FilterChip } from '@/components/ui/filter-chip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead } from '@/components/ui/table';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useDataStore } from '@/store/dataStore';
import { EmptyState } from '@/components/feedback/EmptyState';
import { usePanelStore } from '@/store/panelStore';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useSort } from '@/hooks/useSort';
import { toast } from '@/store/toastStore';
import {
  DebouncedSearch, ClearFiltersButton, StatTile, EvolChart, Ranking, Chip,
  AbcBadge, useColumnVisibility, ColumnVisibilityControl, useSavedViews, SavedViewsControl, RowContextMenu,
} from '@/modules/analytics/ui';
import { mesLabel, mesKey } from '@/core/resumenFac';
import {
  buildPeriodo, buildIncrementoImpacto, buildEscenarios, defaultEscenarioGrid, puntoEquilibrio, round4,
  type PeriodoAnalisis, type ImpactoSku, type ImpactoFlag, type RentabilidadClase,
} from '@/core/incremento';
import type { AnalisisFilters } from '@/core/comercial';
import { syncIncrementoFromAppScript } from '@/services/incrementoService';
import type { Material } from '@/core/types';
import { COLS_INCREMENTO } from './columns';

// Referencia estable para el selector de zustand — sin esto, `?? []` crea un
// array nuevo en cada notificación del store cuando no hay catálogo, lo que
// invalida cualquier useMemo que dependa de `materiales`.
const EMPTY_MATERIALES: Material[] = [];

const FLAG_LABEL: Record<ImpactoFlag, string> = {
  'sin-venta-en-periodo': 'Sin venta en el periodo',
  'costo-anterior-cero': 'Costo anterior en 0',
  'margen-negativo-nuevo': 'Margen negativo con costo nuevo',
  'caja-inconsistente': 'Costo caja no cuadra con piezas/caja',
  'sin-catalogo': 'Sin catálogo',
  'sin-precio-lista06': 'Sin LISTA 06 en catálogo',
};

/** Orden de severidad (peor primero) — mismo orden en el que se listan las
 * tiles y cualquier ranking de rentabilidad, para leer "lo urgente" antes
 * que "lo que va bien". */
const RENT_ORDEN: RentabilidadClase[] = ['baja', 'media', 'alta', 'estrategica'];
const RENT_LABEL: Record<RentabilidadClase, string> = { alta: '🟢 Alta', media: '🟡 Media', baja: '🔴 Baja', estrategica: '⭐ Estratégica' };

function pctTxt(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Tarjeta secundaria de KPI — icono + valor, dos tamaños (lg para lo que
 * pide atención, sm para contexto), mismo lenguaje visual que `KpiTile` del
 * Dashboard (icono en chip, tono semántico) pero local a este módulo para no
 * cruzar el límite modules/dashboard → modules/incremento. */
function Kpi({ label, value, icon: Icon, tone = 'default', sub, size = 'sm' }: {
  label: string; value: string; icon: typeof Boxes; tone?: 'default' | 'warning' | 'danger'; sub?: ReactNode; size?: 'lg' | 'sm';
}) {
  return (
    <Card className={cn('flex items-start justify-between gap-3', size === 'lg' ? 'p-4' : 'p-3')}>
      <div className="min-w-0">
        <p className={cn('font-medium uppercase tracking-wide text-text-faint', size === 'lg' ? 'text-[11px]' : 'text-[10px]')}>{label}</p>
        <p className={cn('mt-1 truncate font-mono font-medium text-text', size === 'lg' ? 'text-xl' : 'text-base')}>{value}</p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-text-faint">{sub}</p>}
      </div>
      <div className={cn(
        'flex shrink-0 items-center justify-center rounded-md',
        size === 'lg' ? 'size-8' : 'size-6',
        tone === 'warning' && 'bg-warning/15 text-warning',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'default' && 'bg-accent-soft text-accent',
      )}
      >
        <Icon className={size === 'lg' ? 'size-4' : 'size-3.5'} />
      </div>
    </Card>
  );
}

/** Color según signo: un Δ/impacto negativo (costo bajó) es favorable
 * (`success`), uno positivo (costo subió) es desfavorable (`danger`) — antes
 * la columna "Impacto" siempre pintaba rojo aunque el número fuera a favor. */
function signTone(n: number): string {
  return n > 0 ? 'text-danger' : n < 0 ? 'text-success' : '';
}

function ultimosNMeses(meses: string[], n: number): { desde: string; hasta: string } | null {
  if (!meses.length) return null;
  const hasta = meses[meses.length - 1];
  const desde = meses[Math.max(0, meses.length - n)];
  return { desde, hasta };
}
function anioEnCurso(meses: string[]): { desde: string; hasta: string } | null {
  if (!meses.length) return null;
  const hasta = meses[meses.length - 1];
  const year = hasta.split('/')[1];
  const desde = meses.find((m) => m.split('/')[1] === year) || hasta;
  return { desde, hasta };
}
function anioAnteriorCompleto(meses: string[]): { desde: string; hasta: string } | null {
  if (!meses.length) return null;
  const y = Number(meses[meses.length - 1].split('/')[1]) - 1;
  if (!meses.some((m) => Number(m.split('/')[1]) === y)) return null;
  return { desde: `01/${y}`, hasta: `12/${y}` };
}

// `q` (búsqueda de texto) vive en su propio `usePersistedState`, NO aquí — es
// el mismo patrón que usan Consumo/Sugerencias con `DebouncedSearch`. Meterlo
// en este objeto y reconstruirlo en cada tecleo (`{ ...filters, q }`) rompía
// el bailout de React (un objeto nuevo con el mismo valor NO es
// `Object.is`-igual al anterior) y `DebouncedSearch` volvía a llamar
// `onChange` en cada render → loop infinito ("Maximum update depth
// exceeded", saturaba hasta el worker de análisis).
interface IncrementoFiltersState {
  sector: string;
  grupoArticulo: string;
  ejecutivo: string;
  /** Canal — reutiliza "Grupo de cliente" del catálogo (Ejecutivos), ya
   * capturado para todo el negocio (gobierno, hospitales, distribuidores…),
   * sin inventar un catálogo de canal nuevo. */
  grupoCliente: string;
  clase: string;
}
const FILTROS_VACIOS: IncrementoFiltersState = { sector: '', grupoArticulo: '', ejecutivo: '', grupoCliente: '', clase: '' };

export function IncrementoPage() {
  const a = useAnalytics();
  const materiales = useDataStore((s) => s.catalog?.materiales ?? EMPTY_MATERIALES);
  const setIncremento = useDataStore((s) => s.setIncremento);
  const open = usePanelStore((s) => s.open);
  const [syncing, setSyncing] = useState(false);

  const [periodoInput, setPeriodoInput] = usePersistedState('incremento.periodo', { desde: '', hasta: '' });
  const [q, setQ] = usePersistedState('incremento.q', ''); // búsqueda (debounced) — commited query, el input vive dentro de DebouncedSearch
  const [filters, setFilters] = usePersistedState<IncrementoFiltersState>('incremento.filtros', FILTROS_VACIOS);
  const [tab, setTab] = usePersistedState('incremento.tab', 'resumen');

  const savedViews = useSavedViews<{ periodo: { desde: string; hasta: string }; filters: IncrementoFiltersState }>('incremento_vistas');
  const applyView = (state: { periodo: { desde: string; hasta: string }; filters: IncrementoFiltersState }) => {
    setPeriodoInput(state.periodo);
    setFilters(state.filters);
  };
  const [clearTick, setClearTick] = useState(0);
  const clearFilters = () => {
    setQ('');
    setFilters(FILTROS_VACIOS);
    setClearTick((n) => n + 1); // remonta DebouncedSearch — ver su comentario sobre por qué no es controlado
  };

  const columnVis = useColumnVisibility('incremento_columnas');

  // Memoizados por VALOR (desde/hasta como strings, no el objeto `periodoInput`
  // ni el array `mesesDisponibles`) — de lo contrario `periodoEfectivo`/`periodo`
  // son un objeto nuevo en cada render, lo que invalida el useMemo de `impacto`
  // en cada render y termina en un loop infinito de re-render (recharts
  // reacciona a la nueva identidad de `serieImpactoMensual` en cada commit).
  const defaultPeriodo = useMemo(() => ultimosNMeses(a.mesesDisponibles, 12), [a.mesesDisponibles]);
  // Cada extremo cae al default POR SU CUENTA (no como par) — con la lógica
  // anterior ("si no están los dos, usa el default completo") editar solo
  // "desde" no tenía efecto visible hasta también tocar "hasta": en cuanto el
  // usuario terminaba de escribir una fecha, como la otra seguía vacía, el
  // campo se revertía al valor por defecto — se sentía como "no puedo
  // modificar la fecha".
  const periodoEfectivo = useMemo(
    () => ({
      desde: periodoInput.desde || defaultPeriodo?.desde || '',
      hasta: periodoInput.hasta || defaultPeriodo?.hasta || '',
    }),
    [periodoInput.desde, periodoInput.hasta, defaultPeriodo],
  );
  const periodo: PeriodoAnalisis | null = useMemo(
    () => (periodoEfectivo.desde && periodoEfectivo.hasta ? buildPeriodo(periodoEfectivo.desde, periodoEfectivo.hasta) : null),
    [periodoEfectivo.desde, periodoEfectivo.hasta],
  );
  const periodoLabel = periodo && periodo.meses > 0
    ? `${mesLabel(periodo.desde)} – ${mesLabel(periodo.hasta)} · ${periodo.meses} mes${periodo.meses === 1 ? '' : 'es'}`
    : periodo
      ? 'Rango inválido (revisa desde/hasta)'
      : 'Selecciona un periodo';

  // Selects nativos de mes (no texto libre con máscara) — mucho más fácil de
  // colocar: siempre valores válidos, sin tener que escribir dígitos. Se
  // incluye el valor vigente aunque no esté en `a.mesesDisponibles` (p. ej. un
  // preset "Año anterior completo" cuyo Ene/Dic no tuvo facturación), para
  // que el <select> nunca quede en un valor sin opción correspondiente.
  const desdeOptions = useMemo(() => {
    const set = new Set(a.mesesDisponibles);
    if (periodoEfectivo.desde) set.add(periodoEfectivo.desde);
    return [...set].sort((x, y) => mesKey(x) - mesKey(y));
  }, [a.mesesDisponibles, periodoEfectivo.desde]);
  const hastaOptions = useMemo(() => {
    const set = new Set(a.mesesDisponibles);
    if (periodoEfectivo.hasta) set.add(periodoEfectivo.hasta);
    return [...set].sort((x, y) => mesKey(x) - mesKey(y));
  }, [a.mesesDisponibles, periodoEfectivo.hasta]);

  // Impacto SIN filtros de sector/grupo/ejecutivo — universo completo de los
  // SKUs del Sheet de incremento (sí respeta el periodo, que no es un filtro
  // opcional sino la base del cálculo). Sirve para poblar los 3 selects de
  // abajo: antes se llenaban recorriendo TODO `Resumen_Fac` (todo el
  // catálogo, toda la empresa, todos los años) en vez de limitarse a lo que
  // trae este Sheet — por eso aparecían sectores/ejecutivos que no tenían
  // nada que ver y cualquier filtro terminaba en una tabla vacía.
  const impactoSinFiltros = useMemo(() => {
    if (!periodo || !periodo.meses) return null;
    return buildIncrementoImpacto(
      a.incrementoRows,
      { rf: a.rf, enrich: a.enrich, abc: a.abc, materiales, rss: a.rss, bo: a.bo },
      periodo,
    );
  }, [a.incrementoRows, a.rf, a.enrich, a.abc, a.rss, a.bo, materiales, periodo]);

  const { sectorOptions, grupoArticuloOptions, ejecOptions, canalOptions } = useMemo(() => {
    if (!impactoSinFiltros) return { sectorOptions: [], grupoArticuloOptions: [], ejecOptions: [], canalOptions: [] };
    // Ojo: el filtro (`buildAnalisisPredicates`, vía `comercial.ts`) compara
    // contra el sector/grupo del CATÁLOGO (`enrich.matSector`/`matGrupo`), no
    // contra el texto propio del Sheet (`ImpactoSku.sector`, que se muestra
    // en la tabla pero puede venir redactado distinto). Si el desplegable
    // ofreciera el texto del Sheet, elegirlo podía no coincidir con nada y
    // devolver la tabla vacía — aquí se listan exactamente los valores que el
    // filtro de verdad usa.
    const sectores = new Set(impactoSinFiltros.skus.map((s) => a.enrich.matSector(s.material) || '(sin sector)'));
    const gArts = new Set(impactoSinFiltros.skus.map((s) => a.enrich.matGrupo(s.material) || '(sin grupo)'));
    const ejecs = new Set(impactoSinFiltros.porEjecutivo.map((g) => g.key).filter((k) => k !== '(sin ejecutivo)'));
    const canales = new Set(impactoSinFiltros.porCanal.map((g) => g.key).filter((k) => k !== '(sin canal)'));
    return {
      sectorOptions: [...sectores].sort(), grupoArticuloOptions: [...gArts].sort(),
      ejecOptions: [...ejecs].sort(), canalOptions: [...canales].sort(),
    };
  }, [impactoSinFiltros, a.enrich]);

  const impacto = useMemo(() => {
    if (!impactoSinFiltros || !periodo) return null;
    if (!filters.ejecutivo && !filters.sector && !filters.grupoArticulo && !filters.grupoCliente) return impactoSinFiltros;
    const analisisFilters: AnalisisFilters = {
      ejecutivo: filters.ejecutivo, sector: filters.sector, grupoArticulo: filters.grupoArticulo, grupoCliente: filters.grupoCliente,
    };
    return buildIncrementoImpacto(
      a.incrementoRows,
      // Inventario tomado del reporte "Inventario" (Resumen Sin Sugerencias,
      // `a.rss`) — no de "Inv Condición"/InvConsolidado.
      { rf: a.rf, enrich: a.enrich, abc: a.abc, materiales, rss: a.rss, bo: a.bo },
      periodo,
      analisisFilters,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impactoSinFiltros, a.incrementoRows, a.rf, a.enrich, a.abc, a.rss, a.bo, materiales, periodo, filters.ejecutivo, filters.sector, filters.grupoArticulo, filters.grupoCliente]);

  const skusShown = useMemo(() => {
    if (!impacto) return [];
    const qNorm = q.trim().toLowerCase();
    return impacto.skus.filter((s) => {
      if (filters.clase && (s.clase || '') !== filters.clase) return false;
      if (!qNorm) return true;
      return s.material.toLowerCase().includes(qNorm) || s.descripcion.toLowerCase().includes(qNorm);
    });
  }, [impacto, q, filters.clase]);

  const sortAcc = useMemo(() => ({
    material: (s: ImpactoSku) => s.material,
    impacto: (s: ImpactoSku) => s.impactoPeriodo,
    delta: (s: ImpactoSku) => s.deltaPct,
    venta: (s: ImpactoSku) => s.importePeriodo,
    margen: (s: ImpactoSku) => s.margenNuePct,
  }), []);
  const { sorted, sortKey, dir, toggleSort } = useSort(skusShown, sortAcc);

  const paretoTop15 = useMemo(() => {
    if (!impacto) return [];
    return [...impacto.skus].sort((x, y) => y.importePeriodo - x.importePeriodo).slice(0, 15);
  }, [impacto]);

  const escenarios = useMemo(() => {
    if (!impacto || !impacto.skus.length) return [];
    return buildEscenarios(impacto.skus, defaultEscenarioGrid(impacto.resumen.incrementoPromedioPonderado));
  }, [impacto]);

  const puntosEquilibrio = useMemo(() => {
    if (!impacto || !impacto.skus.length) return [];
    const traslados = [0, 0.03, 0.05, impacto.resumen.incrementoPromedioPonderado];
    const unicos = [...new Set(traslados.map((t) => round4(Math.max(0, t))))].sort((a, b) => a - b);
    return unicos.map((t) => ({ trasladoPct: t, volumenMax: puntoEquilibrio(impacto.skus, t) }));
  }, [impacto]);

  const doSync = async () => {
    setSyncing(true);
    try {
      const snapshot = await syncIncrementoFromAppScript();
      setIncremento(snapshot);
      toast.success('Sincronizado', `Se actualizó el Sheet de incremento de costos (${snapshot.rows.length} materiales).`);
    } catch (e) {
      toast.error('Error al sincronizar', e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const exportar = () => {
    if (!impacto || !periodo) return;
    const base = `Base: ${periodoLabel}`;
    const conBase = <T extends Record<string, unknown>>(rows: T[]) => [{ [base]: '' } as unknown as T, ...rows];
    void exportXlsxMultiSheet(`incremento_costos_${stamp()}.xlsx`, [
      {
        name: '01 Resumen Ejecutivo',
        rows: conBase([{
          'SKUs afectados': impacto.resumen.nSkus,
          'Venta periodo': impacto.resumen.ventaPeriodo,
          'Piezas periodo': impacto.resumen.piezasPeriodo,
          'Incremento promedio ponderado': impacto.resumen.incrementoPromedioPonderado,
          'Impacto periodo': impacto.resumen.impactoPeriodo,
          'Impacto anualizado': impacto.resumen.impactoAnualizado,
          'Margen actual': impacto.resumen.margenActPct,
          'Margen nuevo': impacto.resumen.margenNuePct,
          '% de venta del portafolio': impacto.resumen.shareVentaPortafolio,
        }]),
      },
      {
        name: '02 Base SKU',
        rows: conBase(impacto.skus.map((s) => ({
          Material: s.material, Descripción: s.descripcion, Sector: s.sector, 'Grupo artículo': s.grupoArticulo,
          'Costo anterior pieza': s.costoAnteriorPieza, 'Costo nuevo pieza': s.costoNuevoPieza,
          'Costo anterior caja': s.costoAnteriorCaja, 'Costo nuevo caja': s.costoNuevoCaja,
          'LISTA 06 (base de margen)': s.precioLista06, 'Precio neto histórico (informativo)': s.precioNeto,
        }))),
      },
      {
        name: '03 Impacto Costos',
        rows: conBase(impacto.skus.map((s) => ({
          Material: s.material, 'Δ$ pieza': s.deltaAbs, 'Δ%': s.deltaPct,
          'Impacto periodo': s.impactoPeriodo, 'Impacto anualizado': s.impactoAnualizado,
          'Margen actual': s.margenActPct, 'Margen nuevo': s.margenNuePct,
          'Precio requerido': s.precioRequerido, '% incremento requerido': s.incrementoRequeridoPct,
        }))),
      },
      {
        name: '04 Ventas Periodo',
        rows: conBase(impacto.serieImpactoMensual.map((p) => ({ Mes: mesLabel(p.mes), Piezas: p.cant, 'Impacto $': p.imp }))),
      },
      {
        name: '05 Rentabilidad',
        rows: conBase(impacto.skus.map((s) => ({
          Material: s.material, Clase: s.clase || '', Rentabilidad: RENT_LABEL[impacto.rentabilidadPorSku.get(s.material) || 'media'],
          'Margen nuevo': s.margenNuePct, 'Venta periodo': s.importePeriodo,
        }))),
      },
      {
        name: '06 Clientes',
        rows: conBase(impacto.clientes.map((c) => ({
          Cliente: c.razon, Solicitante: c.key, Ejecutivo: c.ejecutivo, 'Grupo cliente': c.grupo,
          'Venta periodo': c.ventaPeriodo, 'Piezas periodo': c.piezasPeriodo, 'Impacto $': c.impactoPeriodo,
        }))),
      },
      {
        name: '07 Escenarios',
        rows: conBase(escenarios.map((e) => ({ 'Traslado %': e.trasladoPct, 'Pérdida volumen %': e.perdidaVolPct, Utilidad: e.utilidad, 'Δ vs. actual': e.deltaUtilidadVsActual }))),
      },
      {
        name: '08 Inventario',
        rows: conBase(impacto.skus.map((s) => ({ Material: s.material, 'Piezas en inventario': s.invPiezas, 'Cobertura (meses)': s.coberturaMeses, 'Colchón $': s.colchonInventario }))),
      },
      {
        name: '09 Pedidos',
        rows: conBase(impacto.skus.filter((s) => s.pedidoPendientePiezas > 0).map((s) => ({ Material: s.material, 'Piezas pendientes': s.pedidoPendientePiezas, 'Riesgo $': s.riesgoPedidosPendientes }))),
      },
      {
        name: '10 Recomendación',
        rows: conBase([{ Nota: 'Completar con la decisión final (traslado %, negociación con proveedor, monitoreo de volumen).' }]),
      },
      {
        name: '11 Supuestos',
        rows: conBase([{
          Campo: 'Precio de competencia / productos sustitutos / tipo de cambio / costo logístico / condiciones contractuales / EBITDA',
          Nota: 'Sin fuente en el sistema — completar a mano si aplica.',
        }]),
      },
    ]);
  };

  if (!a.incrementoRows.length) {
    return (
      <EmptyState
        title="Sin datos de incremento de costos"
        description="Configura el conector en Admin · Conectores y sincroniza el Sheet de incremento de costos."
        action={{ label: syncing ? 'Sincronizando…' : 'Sincronizar ahora', onClick: doSync }}
      />
    );
  }

  // Un incremento de costo siempre reduce margen — no hay estado "neutral".
  // Crítico (rojo) cuando el margen queda en negativo; de lo contrario
  // siempre amerita atención (ámbar), nunca "todo bien" en verde.
  const heroCritico = !!impacto && impacto.resumen.margenNuePct < 0;

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Incremento de costos</h2>
          <p className="text-sm text-text-muted">Impacto comercial y financiero del incremento de proveedor</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={doSync} disabled={syncing}>
            <RefreshCw className={`mr-1 size-3.5 ${syncing ? 'animate-spin' : ''}`} />Actualizar
          </Button>
          <div className="flex items-center gap-1 border-l border-border pl-1.5">
            <SavedViewsControl
              views={savedViews.views}
              onApply={applyView}
              onSave={(name) => savedViews.save(name, { periodo: periodoEfectivo, filters })}
              onRemove={savedViews.remove}
            />
            <ColumnVisibilityControl columns={COLS_INCREMENTO} hidden={columnVis.hidden} toggle={columnVis.toggle} reset={columnVis.reset} />
          </div>
          <Button size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
        </div>
      </div>

      {/* Periodo + filtros en una sola superficie — antes eran 2 filas sueltas
          con el mismo texto de periodo repetido 3 veces. */}
      <Card className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-faint">Periodo</span>
          <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg p-0.5 text-xs">
            {([
              ['12 meses', () => ultimosNMeses(a.mesesDisponibles, 12)],
              ['6 meses', () => ultimosNMeses(a.mesesDisponibles, 6)],
              ['Año en curso', () => anioEnCurso(a.mesesDisponibles)],
              ['Año anterior', () => anioAnteriorCompleto(a.mesesDisponibles)],
            ] as const).map(([label, fn]) => {
              const target = fn();
              const active = !!target && target.desde === periodoEfectivo.desde && target.hasta === periodoEfectivo.hasta;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => { if (target) setPeriodoInput(target); }}
                  disabled={!target}
                  className={cn(
                    'rounded px-2 py-1 transition-colors disabled:opacity-30',
                    active ? 'bg-accent text-accent-fg' : 'text-text-muted hover:bg-bg-inset',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-faint">de</span>
            <Select
              value={periodoEfectivo.desde}
              onChange={(ev) => setPeriodoInput({ desde: ev.target.value, hasta: periodoEfectivo.hasta })}
              className="w-auto"
            >
              {desdeOptions.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </Select>
            <span className="text-xs text-text-faint">a</span>
            <Select
              value={periodoEfectivo.hasta}
              onChange={(ev) => setPeriodoInput({ desde: periodoEfectivo.desde, hasta: ev.target.value })}
              className="w-auto"
            >
              {hastaOptions.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </Select>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">{periodoLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <DebouncedSearch key={clearTick} initialValue={q} onChange={setQ} placeholder="Buscar material o descripción…" />
          <Select value={filters.sector} onChange={(ev) => setFilters({ ...filters, sector: ev.target.value })} className="w-auto">
            <option value="">Sector (todos)</option>{sectorOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select value={filters.grupoArticulo} onChange={(ev) => setFilters({ ...filters, grupoArticulo: ev.target.value })} className="w-auto">
            <option value="">Grupo artículo (todos)</option>{grupoArticuloOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select value={filters.ejecutivo} onChange={(ev) => setFilters({ ...filters, ejecutivo: ev.target.value })} className="w-auto">
            <option value="">Ejecutivo (todos)</option>{ejecOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select value={filters.grupoCliente} onChange={(ev) => setFilters({ ...filters, grupoCliente: ev.target.value })} className="w-auto">
            <option value="">Canal (todos)</option>{canalOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select value={filters.clase} onChange={(ev) => setFilters({ ...filters, clase: ev.target.value })} className="w-auto">
            <option value="">Clase ABC (todas)</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </Select>
          <ClearFiltersButton onClear={clearFilters} />
        </div>
        {/* Confirmación visual de que la selección sí quedó guardada — cada
            filtro elegido aparece como chip removible, no solo dentro del
            <select> (que en algunos navegadores/zoom no siempre se nota
            resaltado a simple vista). */}
        {(filters.sector || filters.grupoArticulo || filters.ejecutivo || filters.grupoCliente || filters.clase) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            <span className="text-[11px] text-text-faint">Filtrando por:</span>
            {filters.sector && (
              <FilterChip active onClear={() => setFilters({ ...filters, sector: '' })}>Sector: {filters.sector}</FilterChip>
            )}
            {filters.grupoArticulo && (
              <FilterChip active onClear={() => setFilters({ ...filters, grupoArticulo: '' })}>Grupo: {filters.grupoArticulo}</FilterChip>
            )}
            {filters.ejecutivo && (
              <FilterChip active onClear={() => setFilters({ ...filters, ejecutivo: '' })}>Ejecutivo: {filters.ejecutivo}</FilterChip>
            )}
            {filters.grupoCliente && (
              <FilterChip active onClear={() => setFilters({ ...filters, grupoCliente: '' })}>Canal: {filters.grupoCliente}</FilterChip>
            )}
            {filters.clase && (
              <FilterChip active onClear={() => setFilters({ ...filters, clase: '' })}>Clase: {filters.clase}</FilterChip>
            )}
          </div>
        )}
      </Card>

      {!impacto || !impacto.skus.length ? (
        <EmptyState title="Sin coincidencias" description="Ningún SKU del Sheet de incremento facturó dentro del periodo/filtros elegidos." />
      ) : (
        <>
          {/* HERO — el número que Dirección necesita ver sin buscarlo: cuánto
              cuesta el incremento y qué pasa con el margen, de un vistazo. */}
          <Card
            className={cn(
              'p-5',
              heroCritico ? 'border-danger/25 bg-danger/5' : 'border-warning/25 bg-warning/5',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', heroCritico ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning')}>
                  <AlertTriangle className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Impacto estimado del incremento · {periodoLabel}</p>
                  <p className={cn('mt-1 font-display text-4xl font-bold tabular-nums', heroCritico ? 'text-danger' : 'text-warning')}>
                    {formatCurrency(impacto.resumen.impactoPeriodo)}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {formatCurrency(impacto.resumen.impactoAnualizado)} anualizado · {formatNumber(impacto.resumen.nSkus)} SKUs afectados
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-right">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-text-faint">Margen actual → nuevo</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1.5 font-mono text-lg font-medium">
                    {pctTxt(impacto.resumen.margenActPct)}
                    <TrendingDown className="size-4 text-text-faint" />
                    <span className={heroCritico ? 'text-danger' : 'text-warning'}>{pctTxt(impacto.resumen.margenNuePct)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-text-faint">Incremento promedio</p>
                  <p className="mt-0.5 font-mono text-lg font-medium">{pctTxt(impacto.resumen.incrementoPromedioPonderado)}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Contexto secundario — ya no compite con el hero de arriba. */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Kpi label="Venta del periodo" value={formatCurrency(impacto.resumen.ventaPeriodo)} icon={ShoppingCart} sub={`${formatNumber(impacto.resumen.piezasPeriodo)} piezas`} />
            <Kpi label="% del portafolio" value={pctTxt(impacto.resumen.shareVentaPortafolio)} icon={Percent} sub="del total facturado" />
            <Kpi label="Concentración" value={`${pctTxt(impacto.concCliente.top5, 0)} top 5`} icon={Users} sub={`de ${formatNumber(impacto.concCliente.nClientes)} clientes`} />
            <Kpi label="SKUs en catálogo" value={formatNumber(impacto.resumen.nSkus)} icon={Boxes} sub="con precio LISTA 06" />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="resumen">Resumen ejecutivo</TabsTrigger>
              <TabsTrigger value="skus">Impacto por SKU</TabsTrigger>
              <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
              <TabsTrigger value="clientes">Clientes</TabsTrigger>
              <TabsTrigger value="escenarios">Escenarios</TabsTrigger>
              <TabsTrigger value="inventario">Inventario y pedidos</TabsTrigger>
            </TabsList>

            <TabsContent value="resumen">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Impacto mensual dentro del periodo</h3>
                  <EvolChart serie={impacto.serieImpactoMensual} height={220} />
                </Card>
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Escenarios de traslado</h3>
                  <div>
                    <Table wrapperClassName="max-h-64">
                      <TableHeader><TableRow><TableHead>Traslado</TableHead><TableHead>Pérdida vol.</TableHead><TableHead className="text-right">Utilidad</TableHead><TableHead className="text-right">Δ vs. actual</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {escenarios.map((e) => (
                          <TableRow key={`${e.trasladoPct}-${e.perdidaVolPct}`}>
                            <TableCell>{pctTxt(e.trasladoPct, 0)}</TableCell>
                            <TableCell>{pctTxt(e.perdidaVolPct, 0)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(e.utilidad)}</TableCell>
                            <TableCell className={`text-right ${e.deltaUtilidadVsActual >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(e.deltaUtilidadVsActual)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </div>
              <Card className="mt-4 flex items-start gap-3 bg-accent-soft/40 p-4">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <AlertTriangle className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Recomendación</h3>
                  <p className="mt-1 text-sm text-text-muted">
                    Absorber el incremento completo reduce el margen de <strong className="text-text">{pctTxt(impacto.resumen.margenActPct)}</strong> a{' '}
                    <strong className="text-danger">{pctTxt(impacto.resumen.margenNuePct)}</strong> — un impacto de{' '}
                    <strong className="text-text">{formatCurrency(impacto.resumen.impactoPeriodo)}</strong> en el periodo ({formatCurrency(impacto.resumen.impactoAnualizado)} anualizado).
                    Trasladar el incremento promedio ponderado (<strong className="text-text">{pctTxt(impacto.resumen.incrementoPromedioPonderado)}</strong>) sostiene el margen actual;
                    el punto de equilibrio de volumen para cada escenario de traslado está en la pestaña Escenarios.
                  </p>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="skus">
              <Card className="p-0">
                <div>
                  <Table wrapperClassName="max-h-[60vh]">
                    <TableHeader>
                      <TableRow>
                        {columnVis.isVisible('material') && <SortableTableHead sortKey="material" activeKey={sortKey} dir={dir} onSort={toggleSort}>Material</SortableTableHead>}
                        {columnVis.isVisible('sector') && <TableHead>Sector / Grupo</TableHead>}
                        {columnVis.isVisible('abc') && <TableHead>ABC</TableHead>}
                        {columnVis.isVisible('costos') && <TableHead className="text-right">Costo ant. → nuevo</TableHead>}
                        {columnVis.isVisible('delta') && <SortableTableHead sortKey="delta" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Δ$ / Δ%</SortableTableHead>}
                        {columnVis.isVisible('venta') && <SortableTableHead sortKey="venta" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Piezas / venta</SortableTableHead>}
                        {columnVis.isVisible('impacto') && <SortableTableHead sortKey="impacto" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Impacto periodo / anual.</SortableTableHead>}
                        {columnVis.isVisible('margen') && <SortableTableHead sortKey="margen" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right">Margen ant. → nuevo</SortableTableHead>}
                        {columnVis.isVisible('precioReq') && <TableHead className="text-right">Precio requerido</TableHead>}
                        {columnVis.isVisible('inventario') && <TableHead className="text-right">Cobertura inv.</TableHead>}
                        {columnVis.isVisible('pedidos') && <TableHead className="text-right">Riesgo pedidos</TableHead>}
                        {columnVis.isVisible('flags') && <TableHead>Alertas</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((s) => (
                        <RowContextMenu
                          key={s.material}
                          label={s.material}
                          onVerDetalle={() => open({ type: 'materialTotales', material: s.material })}
                          copyItems={[{ label: 'Material', value: s.material }, { label: 'Descripción', value: s.descripcion }]}
                        >
                          <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'materialTotales', material: s.material })}>
                            {columnVis.isVisible('material') && (
                              <TableCell className="max-w-72"><Chip onClick={() => open({ type: 'materialTotales', material: s.material })}>{s.material}</Chip><div className="truncate text-[11px] text-text-faint">{s.descripcion}</div></TableCell>
                            )}
                            {columnVis.isVisible('sector') && <TableCell className="text-xs text-text-muted">{s.sector}<div className="text-text-faint">{s.grupoArticulo}</div></TableCell>}
                            {columnVis.isVisible('abc') && <TableCell><AbcBadge clase={s.clase} /></TableCell>}
                            {columnVis.isVisible('costos') && <TableCell className="text-right font-mono text-xs">{formatCurrency(s.costoAnteriorPieza)} → {formatCurrency(s.costoNuevoPieza)}</TableCell>}
                            {columnVis.isVisible('delta') && <TableCell className={`text-right font-mono text-xs ${signTone(s.deltaAbs)}`}>{formatCurrency(s.deltaAbs)} / {pctTxt(s.deltaPct)}</TableCell>}
                            {columnVis.isVisible('venta') && <TableCell className="text-right font-mono text-xs">{formatNumber(s.cantidadPeriodo)} / {formatCurrency(s.importePeriodo)}</TableCell>}
                            {columnVis.isVisible('impacto') && <TableCell className={`text-right font-mono text-xs ${signTone(s.impactoPeriodo)}`}>{formatCurrency(s.impactoPeriodo)} / {formatCurrency(s.impactoAnualizado)}</TableCell>}
                            {columnVis.isVisible('margen') && <TableCell className="text-right font-mono text-xs">{pctTxt(s.margenActPct)} → <span className={s.margenNuePct < 0 ? 'text-danger' : ''}>{pctTxt(s.margenNuePct)}</span></TableCell>}
                            {columnVis.isVisible('precioReq') && <TableCell className="text-right font-mono text-xs">{formatCurrency(s.precioRequerido)}<div className="text-text-faint">{pctTxt(s.incrementoRequeridoPct)}</div></TableCell>}
                            {columnVis.isVisible('inventario') && <TableCell className="text-right font-mono text-xs">{s.coberturaMeses > 0 ? `${s.coberturaMeses.toFixed(1)}m` : '—'}</TableCell>}
                            {columnVis.isVisible('pedidos') && <TableCell className="text-right font-mono text-xs">{s.pedidoPendientePiezas > 0 ? formatCurrency(s.riesgoPedidosPendientes) : '—'}</TableCell>}
                            {columnVis.isVisible('flags') && (
                              <TableCell className="max-w-56">
                                {s.flags.map((f) => <div key={f} className="text-[10px] text-warning">{FLAG_LABEL[f]}</div>)}
                              </TableCell>
                            )}
                          </TableRow>
                        </RowContextMenu>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="rentabilidad">
              <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {RENT_ORDEN.map((c) => (
                  <StatTile key={c} label={RENT_LABEL[c]} value={formatNumber(impacto.rentabilidadResumen[c])} />
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Mismo top-15 (por venta del periodo) en los dos Pareto, en el
                    mismo orden — así la fila N de un lado es el mismo material
                    que la fila N del otro, y se puede comparar directamente
                    "vende mucho pero deja poca utilidad" sin buscar el código
                    de un lado a otro. */}
                <Ranking
                  title="Pareto de venta del periodo"
                  items={paretoTop15.map((s) => ({ code: s.material, desc: s.descripcion, val: s.importePeriodo }))}
                  money onRow={(m) => open({ type: 'materialTotales', material: m })}
                />
                <Ranking
                  title="Utilidad nueva de esos mismos SKUs"
                  items={paretoTop15.map((s) => ({ code: s.material, desc: s.descripcion, val: s.utilidadNue }))}
                  money onRow={(m) => open({ type: 'materialTotales', material: m })}
                />
              </div>
              <Card className="mt-4 p-4">
                <h3 className="mb-2 text-sm font-semibold">SKUs con margen negativo al costo nuevo</h3>
                <div>
                  <Table wrapperClassName="max-h-64">
                    <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Margen nuevo</TableHead><TableHead className="text-right">Venta periodo</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {impacto.skus.filter((s) => s.flags.includes('margen-negativo-nuevo'))
                        .sort((x, y) => x.margenNuePct - y.margenNuePct)
                        .map((s) => (
                          <TableRow key={s.material}>
                            <TableCell><Chip onClick={() => open({ type: 'materialTotales', material: s.material })}>{s.material}</Chip> {s.descripcion}</TableCell>
                            <TableCell className="text-right text-danger">{pctTxt(s.margenNuePct)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(s.importePeriodo)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="clientes">
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Top clientes por impacto</h3>
                  <span className="text-xs text-text-faint">{pctTxt(impacto.concCliente.top5, 0)} top 5 · {pctTxt(impacto.concCliente.top10, 0)} top 10</span>
                </div>
                <div>
                  <Table wrapperClassName="max-h-[50vh]">
                    <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Ejecutivo</TableHead><TableHead className="text-right">Piezas</TableHead><TableHead className="text-right">Venta periodo</TableHead><TableHead className="text-right">Impacto $</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {impacto.clientes.slice(0, 50).map((c) => (
                        <TableRow key={c.key} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'clienteDetalle', dest: c.key })}>
                          <TableCell className="max-w-64">
                            <Chip onClick={() => open({ type: 'clienteDetalle', dest: c.key })}>{c.razon || c.key}</Chip>
                            <div className="truncate text-[11px] text-text-faint">Solic. {c.key}</div>
                          </TableCell>
                          <TableCell className="text-xs text-text-muted">
                            {c.ejecutivo || '—'}
                            <div className="text-text-faint">{c.grupo || '—'}</div>
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(c.piezasPeriodo)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(c.ventaPeriodo)}</TableCell>
                          <TableCell className="text-right text-danger">{formatCurrency(c.impactoPeriodo)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-[11px] text-text-faint">Mostrando los primeros 50 de {formatNumber(impacto.clientes.length)} · el listado completo está en el Excel exportado.</p>
              </Card>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Impacto por ejecutivo</h3>
                  <Ranking
                    title="Ejecutivos por impacto"
                    items={impacto.porEjecutivo.slice(0, 15).map((g) => ({ code: g.key, desc: `${g.nSkus} cliente(s)`, val: Math.abs(g.impactoPeriodo) }))}
                    money
                  />
                </Card>
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold">Impacto por canal</h3>
                  <Ranking
                    title="Canal (grupo de cliente) por impacto"
                    items={impacto.porCanal.slice(0, 15).map((g) => ({ code: g.key, desc: `${g.nSkus} cliente(s)`, val: Math.abs(g.impactoPeriodo) }))}
                    money onRow={(canal) => setFilters({ ...filters, grupoCliente: canal === '(sin canal)' ? '' : canal })}
                  />
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="escenarios">
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold">Matriz de sensibilidad — traslado × pérdida de volumen</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="p-1.5 text-left text-text-faint">Traslado \ Pérdida vol.</th>
                        {[...new Set(escenarios.map((e) => e.perdidaVolPct))].map((v) => <th key={v} className="p-1.5 text-right text-text-faint">{pctTxt(v, 0)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(escenarios.map((e) => e.trasladoPct))].map((t) => (
                        <tr key={t}>
                          <td className="p-1.5 font-medium">{pctTxt(t, 0)}</td>
                          {escenarios.filter((e) => e.trasladoPct === t).map((e) => (
                            <td key={e.perdidaVolPct} className={`p-1.5 text-right font-mono ${e.deltaUtilidadVsActual >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                              {formatCurrency(e.utilidad)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card className="mt-4 p-4">
                <h3 className="mb-2 text-sm font-semibold">Punto de equilibrio — volumen máximo a perder sin quedar peor que hoy</h3>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {puntosEquilibrio.map((p) => (
                    <StatTile key={p.trasladoPct} label={`Trasladando ${pctTxt(p.trasladoPct, 0)}`} value={pctTxt(p.volumenMax, 1)} sub="volumen máximo a perder" />
                  ))}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="inventario">
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold">Cobertura de inventario y colchón al costo anterior</h3>
                <p className="mb-2 text-[11px] text-text-faint">Inventario tomado del reporte Inventario (Resumen Sin Sugerencias).</p>
                <div>
                  <Table wrapperClassName="max-h-64">
                    <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Piezas inv.</TableHead><TableHead className="text-right">Cobertura</TableHead><TableHead className="text-right">Colchón $</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {impacto.skus.filter((s) => s.invPiezas > 0).sort((x, y) => y.colchonInventario - x.colchonInventario).map((s) => (
                        <TableRow key={s.material}>
                          <TableCell className="max-w-72">
                            <Chip onClick={() => open({ type: 'materialTotales', material: s.material })}>{s.material}</Chip>
                            <div className="truncate text-[11px] text-text-faint">{s.descripcion}</div>
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(s.invPiezas)}</TableCell>
                          <TableCell className="text-right">{s.coberturaMeses.toFixed(1)}m</TableCell>
                          <TableCell className="text-right">{formatCurrency(s.colchonInventario)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
              <Card className="mt-4 p-4">
                <h3 className="mb-2 text-sm font-semibold">Pedidos pendientes pactados al costo anterior</h3>
                <div>
                  <Table wrapperClassName="max-h-64">
                    <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Piezas pendientes</TableHead><TableHead className="text-right">Riesgo $</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {impacto.skus.filter((s) => s.pedidoPendientePiezas > 0).sort((x, y) => y.riesgoPedidosPendientes - x.riesgoPedidosPendientes).map((s) => (
                        <TableRow key={s.material}>
                          <TableCell className="max-w-72">
                            <Chip onClick={() => open({ type: 'materialTotales', material: s.material })}>{s.material}</Chip>
                            <div className="truncate text-[11px] text-text-faint">{s.descripcion}</div>
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(s.pedidoPendientePiezas)}</TableCell>
                          <TableCell className="text-right text-danger">{formatCurrency(s.riesgoPedidosPendientes)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
