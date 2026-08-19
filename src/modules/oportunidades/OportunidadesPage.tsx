import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Plus, Bell, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatTile, StatePill, useSavedViews, SavedViewsControl, ColumnFilterBar, passesFilters, type ActiveFilter, type FilterColumn } from '@/modules/analytics/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useDataStore } from '@/store/dataStore';
import { usePanelStore } from '@/store/panelStore';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { buildOportunidadesCandidatas, condicionPorMaterialIndex, lotesParaAlertas, candidatasSinCobertura, condicionesDisponibles, type OportunidadCandidata } from '@/core/oportunidad';
import { alertasColocacion, agruparAlertasPorMaterial, fichaConfigurada } from '@/core/matchingOfertas';
import { consumoStatus } from '@/modules/analytics/helpers';
import { norm } from '@/lib/text';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { supabase } from '@/lib/supabaseClient';
import { MaterialSearch } from './components/MaterialSearch';
import { OportunidadTray } from './components/OportunidadTray';
import { OportunidadListView } from './components/OportunidadListView';
import { ClientesTab } from './ClientesPage';
import type { CondicionEspecial, Oportunidad } from '@/core/types';

// Prioridad de "mejor rotación primero" entre los estados de consumo que ya
// usa el resto del portal (`core/resumenFac.ts: clasificarEstado`). 'sinanio'
// (más de un año sin comprar) queda fuera por completo — no se le puede
// ofertar a quien ya no compra nada.
const ESTADO_PRIORIDAD: Record<string, number> = { corriente: 0, nueva: 1, reactiva: 1, revisar: 2, riesgo: 3 };

function materialTieneCondicion(lotesMaterial: { condicionTexto: string | null }[], condicionKey: string): boolean {
  if (!condicionKey) return true;
  return lotesMaterial.some((l) => (l.condicionTexto || '').trim().toLowerCase() === condicionKey);
}

function diasRestantesOportunidad(fecha: string | null): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

type QuickFiltro = 'todas' | 'mias' | 'sin-asignar' | 'urgentes';
const QUICK_FILTROS: { key: QuickFiltro; label: string }[] = [
  { key: 'mias', label: 'Mías' },
  { key: 'sin-asignar', label: 'Sin asignar' },
  { key: 'urgentes', label: 'Urgentes' },
];

/** Fila de una candidata en la bandeja: material/condición/cantidad/precio
 * vienen de la candidata (solo lectura, ya calculados) — el usuario solo
 * completa responsable y prioridad antes de crear la Oportunidad, en vez de
 * un clic ciego que la creaba con esos campos vacíos y sin forma de editarlos
 * después (ahora sí se puede editar, ver OportunidadPanel, pero de una vez
 * pedirlos aquí evita el viaje de ida y vuelta). */
function CandidataRow({ c, onCrear }: { c: OportunidadCandidata; onCrear: (c: OportunidadCandidata, responsable: string, prioridad: Oportunidad['prioridad']) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [responsable, setResponsable] = useState('');
  const [prioridad, setPrioridad] = useState<Oportunidad['prioridad']>(c.diasVigencia != null && c.diasVigencia <= 30 ? 'alta' : 'media');

  if (!abierto) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs">
        <span className="font-mono text-accent">{c.material}</span>
        <span className="text-text-muted">{c.diasVigencia != null ? `${c.diasVigencia}d` : c.condicion}</span>
        <Button size="sm" variant="outline" onClick={() => setAbierto(true)}><Plus className="size-3" /> Crear oportunidad</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-bg-elevated px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono text-accent">{c.material}</span>
        <span className="text-text-muted">{c.diasVigencia != null ? `${c.diasVigencia}d` : c.condicion} · {formatNumber(c.cantidadDisponible)} disp. · {formatCurrency(c.precioOferta)}</span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32">
          <label className="mb-0.5 block text-[11px] text-text-faint">Responsable</label>
          <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Opcional" className="h-7 text-xs" />
        </div>
        <div className="min-w-24">
          <label className="mb-0.5 block text-[11px] text-text-faint">Prioridad</label>
          <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Oportunidad['prioridad'])} className="h-7 text-xs">
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </Select>
        </div>
        <Button size="sm" onClick={() => onCrear(c, responsable, prioridad)}>Crear</Button>
        <Button size="sm" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

const CONDICION_FILTROS: { key: CondicionEspecial | ''; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'corta-caducidad', label: 'Caducidad' },
  { key: 'lento-movimiento', label: 'Lento mov.' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'danado', label: 'Dañado' },
];

type TabKey = 'bandeja' | 'clientes';
interface ViewState { condicion: CondicionEspecial | ''; vista: 'tablero' | 'lista' }

/** Hub de Oportunidades Comerciales — una sola pantalla con 2 pestañas:
 *   Bandeja: lotes/materiales que buscamos colocar (candidatas + tablero).
 *   Clientes: toda la demanda — fichas (qué acepta cada cliente, prospectos
 *   incluidos), excepciones por material, ofertas e historial.
 * `/oportunidades/clientes` y `/oportunidades/ofertas-cliente` siguen
 * existiendo como deep-links, pero redirigen aquí (ver ClientesPage.tsx /
 * OfertasClientePage.tsx). */
export function OportunidadesPage() {
  const a = useAnalytics();
  const { lotes, invCondicion, bo, result } = a;
  const settings = useDataStore((s) => s.settings);
  const oportunidades = useConocimientoStore((s) => s.oportunidades);
  const hydrate = useConocimientoStore((s) => s.hydrate);
  const addOportunidad = useConocimientoStore((s) => s.addOportunidad);
  const clientesFichas = useConocimientoStore((s) => s.clientes);
  const reglasAceptacion = useConocimientoStore((s) => s.reglas);
  const openPanel = usePanelStore((s) => s.open);
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (searchParams.get('tab') as TabKey | null) ?? 'bandeja';
  const setTab = (t: TabKey) => setSearchParams((prev) => { const next = new URLSearchParams(prev); if (t === 'bandeja') next.delete('tab'); else next.set('tab', t); return next; }, { replace: true });

  const [condicion, setCondicion] = usePersistedState<CondicionEspecial | ''>('oportunidades.condicion', '');
  const [vista, setVista] = usePersistedState<'tablero' | 'lista'>('oportunidades.vista', 'tablero');
  const [quick, setQuick] = usePersistedState<ActiveFilter[]>('oportunidades.quick', []);
  useUrlFilters(quick, setQuick);
  const [quickFiltro, setQuickFiltro] = useState<QuickFiltro>('todas');
  const [miEmail, setMiEmail] = useState('');
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setMiEmail(data.user?.email ?? '')); }, []);
  // Filtro de "Materiales por colocar" con valores REALES de negocio
  // (Cosmopark, PNC, Corta caducidad...) — separado de `condicion`, que sigue
  // filtrando el tablero de Oportunidades por sus 4 categorías fijas.
  const [condicionMaterial, setCondicionMaterial] = usePersistedState('oportunidades.condicionMaterial', '');
  const [verSeguimiento, setVerSeguimiento] = usePersistedState('oportunidades.verSeguimiento', false);
  const savedViews = useSavedViews<ViewState>('oportunidades_vistas');
  const applyView = (state: ViewState) => { setCondicion(state.condicion); setVista(state.vista); };

  const filterCols: FilterColumn<Oportunidad>[] = useMemo(() => [
    { key: 'material', label: 'Material', get: (o) => o.material },
    { key: 'estado', label: 'Estado', get: (o) => o.estado },
    { key: 'responsable', label: 'Responsable', get: (o) => o.responsable },
    { key: 'prioridad', label: 'Prioridad', get: (o) => o.prioridad },
  ], []);

  useEffect(() => { void hydrate(); }, [hydrate]);

  const existingKeys = useMemo(
    () => new Set(oportunidades.map((o) => `${norm(o.material)}|${norm(o.lote ?? '')}`)),
    [oportunidades],
  );
  const candidatas = useMemo(
    () => buildOportunidadesCandidatas(lotes, invCondicion, settings?.shortExpiryDays ?? 90, existingKeys),
    [lotes, invCondicion, settings, existingKeys],
  );

  // Alertas de colocación: cruza TODO el inventario disponible contra TODAS
  // las reglas de aceptación configuradas (fichas + excepciones por
  // material) de una sola vez — "avísame" en vez de revisar cliente por
  // cliente / material por material. Condición combinada de Fuentes de
  // Pedidos + columna Condición de Inv Condición (`condicionPorMaterialIndex`).
  const consumoPorDestMaterial = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of result?.consumo ?? []) {
      const k = `${norm(r.destinatario)}|${norm(r.material)}`;
      m.set(k, (m.get(k) ?? 0) + r.consumoActual);
    }
    return m;
  }, [result]);
  const razonSocialPorDest = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of result?.consumo ?? []) if (!m.has(norm(r.destinatario))) m.set(norm(r.destinatario), r.razonSocial);
    return m;
  }, [result]);
  const universoAlertas = useMemo(() => {
    const condicionIdx = condicionPorMaterialIndex(bo, invCondicion);
    return lotesParaAlertas(lotes, condicionIdx);
  }, [bo, invCondicion, lotes]);
  const alertas = useMemo(() => {
    const hayReglas = reglasAceptacion.length > 0 || clientesFichas.some(fichaConfigurada);
    if (!hayReglas) return [];
    return alertasColocacion(clientesFichas, reglasAceptacion, universoAlertas, {
      razonSocialDe: (d) => razonSocialPorDest.get(d) || d,
      consumoDe: (d, mat) => consumoPorDestMaterial.get(`${d}|${norm(mat)}`) ?? 0,
    });
  }, [clientesFichas, reglasAceptacion, universoAlertas, razonSocialPorDest, consumoPorDestMaterial]);
  // Enfoque por material (no por cliente): "código A tiene N lotes, M
  // clientes califican" — agrupa las mismas alertas ya resueltas arriba; el
  // total de lotes/cantidad se calcula del inventario real (`universoAlertas`),
  // no sumando las alertas por cliente (ver comentario en agruparAlertasPorMaterial).
  const materialesColocacionBase = useMemo(
    () => agruparAlertasPorMaterial(alertas, universoAlertas),
    [alertas, universoAlertas],
  );
  // Valores reales de negocio disponibles para filtrar (Cosmopark, PNC,
  // Corta caducidad, Sustitutos... lo que sea que exista de verdad en Inv
  // Condición/Fuentes) — nada inventado, mismo criterio que `CondicionSelector`.
  const condicionesReales = useMemo(() => condicionesDisponibles(bo, invCondicion), [bo, invCondicion]);
  const condicionMaterialKey = condicionMaterial.trim().toLowerCase();

  const [ordenMateriales, setOrdenMateriales] = useState<'clientes' | 'caducidad' | 'cantidad'>('clientes');
  const materialesColocacion = useMemo(() => {
    const arr = materialesColocacionBase.filter((g) => materialTieneCondicion(g.lotes, condicionMaterialKey));
    if (ordenMateriales === 'caducidad') arr.sort((a, b) => (a.diasCaducidad ?? Infinity) - (b.diasCaducidad ?? Infinity));
    else if (ordenMateriales === 'cantidad') arr.sort((a, b) => b.cantidadDisponible - a.cantidadDisponible);
    else arr.sort((a, b) => b.clientes.length - a.clientes.length || (a.diasCaducidad ?? Infinity) - (b.diasCaducidad ?? Infinity));
    return arr;
  }, [materialesColocacionBase, ordenMateriales, condicionMaterialKey]);

  // "Candidatas sugeridas" (lotes con condición especial sin Oportunidad)
  // antes listaba cientos de lotes de uno en uno sin decir cuáles de verdad
  // importan. Ahora solo muestra los materiales que NO tienen ni un cliente
  // configurado que los acepte — el hueco real de cobertura; los que sí
  // tienen candidato ya salen arriba en "Materiales por colocar".
  const materialesCubiertos = useMemo(() => new Set(materialesColocacionBase.map((g) => norm(g.material))), [materialesColocacionBase]);
  const sinCoberturaBase = useMemo(() => candidatasSinCobertura(candidatas, materialesCubiertos), [candidatas, materialesCubiertos]);
  const sinCobertura = useMemo(() => {
    if (!condicionMaterialKey) return sinCoberturaBase;
    const universoPorMaterial = new Map<string, typeof universoAlertas>();
    for (const l of universoAlertas) {
      const k = norm(l.material);
      const arr = universoPorMaterial.get(k) ?? [];
      arr.push(l);
      universoPorMaterial.set(k, arr);
    }
    return sinCoberturaBase.filter((g) => materialTieneCondicion(universoPorMaterial.get(norm(g.material)) ?? [], condicionMaterialKey));
  }, [sinCoberturaBase, condicionMaterialKey, universoAlertas]);
  const candidatasParaCrear = useMemo(() => {
    const materiales = new Set(sinCobertura.map((g) => norm(g.material)));
    return candidatas.filter((c) => materiales.has(norm(c.material)));
  }, [candidatas, sinCobertura]);

  // "Sin cliente configurado" ya no dice solo "nadie acepta esto" — para
  // cada material sin cobertura, busca quién YA lo compra (aunque su regla
  // actual no lo cubra o no tenga regla) y descarta a quien lleva más de un
  // año sin comprar nada (`estado.key === 'sinanio'`, mismo umbral que usa
  // todo el portal en `core/resumenFac.ts: clasificarEstado`). El resto se
  // ordena por mejor rotación primero — a quién sí vale la pena ofertarle.
  const clientesSinReglaPorMaterial = useMemo(() => {
    const consumo = result?.consumo ?? [];
    return sinCobertura
      .map((g) => {
        const matN = norm(g.material);
        const porDest = new Map<string, (typeof consumo)[number]>();
        for (const r of consumo) {
          if (norm(r.material) !== matN) continue;
          const k = norm(r.destinatario);
          if (!porDest.has(k)) porDest.set(k, r);
        }
        const clientesRotacion = [...porDest.values()]
          .map((row) => ({ row, estado: consumoStatus(a.rf, row) }))
          .filter(({ estado }) => estado.key !== 'sinanio')
          .sort((x, y) =>
            (ESTADO_PRIORIDAD[x.estado.key] ?? 9) - (ESTADO_PRIORIDAD[y.estado.key] ?? 9)
            || y.row.consumoPromedioMensual - x.row.consumoPromedioMensual,
          );
        return { material: g.material, descripcion: g.descripcion, clientesRotacion };
      })
      .filter((g) => g.clientesRotacion.length > 0);
  }, [sinCobertura, result, a.rf]);

  const filtradas = useMemo(
    () => oportunidades.filter((o) => {
      if (condicion && o.condicion !== condicion) return false;
      if (!passesFilters(o, filterCols, quick)) return false;
      if (quickFiltro === 'mias') return !!miEmail && norm(o.responsable) === norm(miEmail);
      if (quickFiltro === 'sin-asignar') return !o.responsable.trim();
      if (quickFiltro === 'urgentes') { const d = diasRestantesOportunidad(o.fechaCaducidad); return d != null && d <= 60; }
      return true;
    }),
    [oportunidades, condicion, filterCols, quick, quickFiltro, miEmail],
  );
  const abiertas = filtradas.filter((o) => !['colocada-total', 'sin-interesados'].includes(o.estado));
  const riesgo = candidatas.reduce((acc, c) => acc + c.cantidadDisponible * c.precioOferta, 0);
  const venceProximo = candidatas.filter((c) => c.diasVigencia != null && c.diasVigencia <= 60).length;

  // % de colocación entre las oportunidades CERRADAS en los últimos 90 días
  // (colocada-total vs. sin-interesados — colocada-parcial sigue activa,
  // nunca se marca `cerradaEn`) — KPI avanzado (fase 4): mide efectividad
  // real del cierre, no solo volumen de oportunidades abiertas.
  const colocacion90 = useMemo(() => {
    const hace90 = Date.now() - 90 * 86400000;
    const cerradas = oportunidades.filter((o) => o.cerradaEn && new Date(o.cerradaEn).getTime() >= hace90);
    if (cerradas.length === 0) return null;
    const colocadas = cerradas.filter((o) => o.estado === 'colocada-total').length;
    return Math.round((colocadas / cerradas.length) * 100);
  }, [oportunidades]);

  function crearDesde(c: OportunidadCandidata, responsable: string, prioridad: Oportunidad['prioridad']) {
    const now = new Date().toISOString();
    const o: Oportunidad = {
      material: c.material, descripcion: c.descripcion, lote: c.lote, centro: c.centro,
      condicion: c.condicion, cantidadDisponible: c.cantidadDisponible, fechaCaducidad: c.fechaCaducidad,
      precioOferta: c.precioOferta, estado: 'nueva', responsable, prioridad,
      creadaEn: now, actualizadaEn: now, cantidadColocada: 0, notas: '',
    };
    void addOportunidad(o);
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 sm:p-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Oportunidades comerciales</h1>
        <p className="mt-0.5 text-sm text-text-muted">Dos lados del mismo trabajo: qué hay para colocar antes de que se pierda (Bandeja) y a qué clientes ofrecérselo (Clientes) — fichas, qué aceptan, ofertas y seguimiento.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="bandeja" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted" title="Materiales con inventario de condición especial que se necesita colocar antes de que venza o pierda valor.">Qué colocar y a quién ofrecérselo — lo primero, siempre.</p>
            <MaterialSearch />
          </div>

          <div className="rounded-lg border border-accent/30 bg-accent-soft/40 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-text" title="Por material: cuántos lotes hay disponibles y cuántos clientes ya configurados los aceptarían — clic en un material para ver esos clientes con ejecutivo, última compra, precio y tendencia.">
                <Bell className="size-4 text-accent" /> Materiales por colocar ({materialesColocacion.length})
              </h2>
              <Select value={ordenMateriales} onChange={(e) => setOrdenMateriales(e.target.value as typeof ordenMateriales)} className="h-7 w-auto text-xs">
                <option value="clientes">Más clientes primero</option>
                <option value="caducidad">Caducidad más próxima</option>
                <option value="cantidad">Mayor cantidad disponible</option>
              </Select>
            </div>

            {condicionesReales.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {condicionMaterial ? (
                  <button
                    onClick={() => setCondicionMaterial('')}
                    className="flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs text-accent transition-colors hover:bg-accent-soft/70"
                  >
                    {condicionMaterial} <X className="size-3" />
                  </button>
                ) : (
                  condicionesReales.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCondicionMaterial(c)}
                      className="rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-text-muted transition-colors hover:bg-bg-inset"
                    >
                      {c}
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="flex max-h-[34rem] flex-col gap-1.5 overflow-y-auto pr-1">
              {materialesColocacion.map((g) => {
                const urgente = g.diasCaducidad != null && g.diasCaducidad <= 60;
                return (
                  <button
                    key={g.material}
                    onClick={() => openPanel({ type: 'materialColocacion', material: g.material, descripcion: g.descripcion, clientes: g.clientes, lotes: g.lotes })}
                    className={cn('flex w-full flex-wrap items-center justify-between gap-2 rounded-md border bg-bg-elevated px-3 py-2 text-left text-xs hover:bg-bg-inset', urgente ? 'border-danger/40' : 'border-border')}
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-accent">{g.material}</span>
                      <span className="ml-1.5 text-text-faint">{g.descripcion}</span>
                      <span className="ml-1.5 text-text-faint">· {formatNumber(g.cantidadDisponible)} disp.{g.lotesCount > 1 ? ` (${g.lotesCount} lotes)` : ''}</span>
                      {g.diasCaducidad != null && (
                        <span className={cn('ml-1.5', urgente ? 'font-medium text-danger' : 'text-text-faint')}>
                          {urgente && <AlertTriangle className="mr-0.5 inline size-3" />}· vence en {g.diasCaducidad}d
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">{g.clientes.length} cliente{g.clientes.length === 1 ? '' : 's'}</span>
                  </button>
                );
              })}
              {materialesColocacion.length === 0 && <p className="text-xs text-text-faint">Ningún material coincide con el filtro de condición elegido.</p>}
            </div>
          </div>

          {sinCobertura.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-text" title="De los materiales sin ningún cliente configurado, estos SÍ tienen clientes que los compran activamente (menos de un año sin comprar) — su regla actual no cubre la condición, o no tienen regla, pero la rotación dice que vale la pena ofertarles.">
                Clientes que compran pero no cumplen su regla ({clientesSinReglaPorMaterial.length} material{clientesSinReglaPorMaterial.length === 1 ? '' : 'es'})
              </h2>
              <div className="flex flex-col gap-3">
                {clientesSinReglaPorMaterial.map((g) => (
                  <div key={g.material} className="rounded-lg border border-border bg-bg-elevated p-3 text-xs">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="font-mono text-accent">{g.material}</span>
                      <span className="text-text-faint">{g.descripcion}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {g.clientesRotacion.slice(0, 8).map(({ row, estado }) => (
                        <div key={row.destinatario} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg-inset px-2.5 py-1.5">
                          <div className="min-w-0">
                            <button className="text-left font-medium text-text hover:text-accent hover:underline" onClick={() => openPanel({ type: 'clienteConocimiento', dest: row.destinatario, razonSocial: row.razonSocial, tab: 'ficha' })}>{row.razonSocial || row.destinatario}</button>
                            <span className="ml-1.5"><StatePill label={estado.label} cls={estado.cls} /></span>
                            <span className="ml-1.5 text-text-faint">última compra {row.ultimoMesFacturacion || '—'}</span>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => openPanel({ type: 'clienteConocimiento', dest: row.destinatario, razonSocial: row.razonSocial, tab: 'ofertas', prefillMaterial: g.material })}>Ofertar</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sinCobertura.length > 0 && (
            <details className="text-xs text-text-faint">
              <summary className="cursor-pointer select-none hover:text-text">Registrar lote en el pipeline sin cliente todavía ({sinCobertura.length} material{sinCobertura.length === 1 ? '' : 'es'})</summary>
              <div className="mt-2 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
                {candidatasParaCrear.slice(0, 20).map((c) => (
                  <CandidataRow key={`${c.material}-${c.lote}`} c={c} onCrear={crearDesde} />
                ))}
              </div>
            </details>
          )}

          <div className="border-t border-border pt-3">
            <button onClick={() => setVerSeguimiento(!verSeguimiento)} className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
              {verSeguimiento ? '▾' : '▸'} Oportunidades en seguimiento ({filtradas.length})
            </button>

            {verSeguimiento && (
              <div className="mt-3 flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  <StatTile label="Abiertas" value={String(abiertas.length)} />
                  <StatTile label="Riesgo económico" value={formatCurrency(riesgo)} sub="lotes sin oportunidad" tone="text-danger" title="Valor de los lotes con condición especial que aún no tienen una Oportunidad abierta." />
                  <StatTile label="Vencen <60d" value={String(venceProximo)} />
                  <StatTile label="Colocación 90d" value={colocacion90 != null ? `${colocacion90}%` : '—'} sub="oportunidades cerradas" title="% de oportunidades cerradas en los últimos 90 días que terminaron colocadas por completo (vs. sin interesados)." />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_FILTROS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setQuickFiltro(quickFiltro === f.key ? 'todas' : f.key)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        quickFiltro === f.key ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-muted hover:bg-bg-inset',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {condicion ? (
                      <button
                        onClick={() => setCondicion('')}
                        className="flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs text-accent transition-colors hover:bg-accent-soft/70"
                      >
                        {CONDICION_FILTROS.find((f) => f.key === condicion)?.label} <X className="size-3" />
                      </button>
                    ) : (
                      CONDICION_FILTROS.filter((f) => f.key !== '').map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setCondicion(f.key)}
                          className="rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:bg-bg-inset"
                        >
                          {f.label}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={(name) => savedViews.save(name, { condicion, vista })} onRemove={savedViews.remove} />
                    <div className="flex rounded-md border border-border">
                      <button onClick={() => setVista('tablero')} className={cn('flex items-center gap-1 rounded-l-md px-2.5 py-1.5 text-xs', vista === 'tablero' ? 'bg-bg-inset text-text' : 'text-text-muted')} title="Vista tablero: prioridad alta arriba en cada columna">
                        <LayoutGrid className="size-3.5" /> Tablero
                      </button>
                      <button onClick={() => setVista('lista')} className={cn('flex items-center gap-1 rounded-r-md border-l border-border px-2.5 py-1.5 text-xs', vista === 'lista' ? 'bg-bg-inset text-text' : 'text-text-muted')} title="Vista lista">
                        <List className="size-3.5" /> Lista
                      </button>
                    </div>
                  </div>
                </div>

                <ColumnFilterBar columns={filterCols} rows={oportunidades} active={quick} onChange={setQuick} />

                {filtradas.length === 0 ? (
                  <EmptyState title="Sin oportunidades todavía" description="Crea una desde una candidata sugerida arriba, o busca un material para analizarlo." />
                ) : vista === 'tablero' ? (
                  <OportunidadTray oportunidades={filtradas} />
                ) : (
                  <OportunidadListView oportunidades={filtradas} />
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="clientes">
          <ClientesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
