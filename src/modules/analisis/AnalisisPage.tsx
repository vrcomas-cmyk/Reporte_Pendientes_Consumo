import { useCallback, useMemo, type ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { ReportPage, PageHeader, ExportButton, FilterBar, SegmentedControl, CollapsibleCard } from '@/components/layout/report';
import { useFacturacionLibros } from '@/modules/analytics/useFacturacionLibros';
import { Card } from '@/components/ui/card';
import { MultiSelect } from '@/components/ui/multi-select';
import { GerenteSelect } from '@/components/ui/gerente-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { EmptyState } from '@/components/feedback/EmptyState';
import { usePanelStore } from '@/store/panelStore';
import { useFacturacionStore } from '@/store/facturacionStore';
import { StatTile, EvolChart, ComparativaDual, Chip, RowContextMenu, StatePill, AbcBadge, MonthRangeFilter, useSavedViews, SavedViewsControl } from '@/modules/analytics/ui';
import { analisisVentas, buildAnalisisPredicates, mesCorteDefault, type BaseComparacion, type ClienteAna, type MatAna, type AnalisisFilters } from '@/core/comercial';
import { insightsAnalisis, type TonoInsight } from '@/core/analisisInsights';
import { filtrarPresupuestoDet, ptoPorMes, type FiltroActivo, type ResolverPto } from '@/core/ventasPto';
import { buildAbc, summarizeAbc, type AbcEntry } from '@/core/abc';
import { mesKey } from '@/core/resumenFac';
import { norm, num } from '@/modules/analytics/helpers';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useGruposPorDefecto } from '@/hooks/useGruposPorDefecto';
import { SIN_GRUPO_CLIENTE } from '@/lib/gruposCliente';

/** Variación contra una base. Base 0 con venta es «Nuevo» y sin ninguna de las dos, «—». Lleva flecha y signo además del color. */
function Variacion({ actual, base }: { actual: number; base: number }) {
  if (base <= 0 && actual <= 0) return <span className="text-text-faint">—</span>;
  if (base <= 0) return <span className="font-medium text-info">Nuevo</span>;
  const p = (actual / base - 1) * 100;
  const sube = p >= 0;
  return <span className={cn('font-medium tabular-nums', sube ? 'text-success' : 'text-danger')}>{sube ? '▲ +' : '▼ −'}{Math.abs(p).toFixed(1)}%</span>;
}

const signo = (n: number) => (n < 0 ? '−' : '+');
const dinero = (n: number) => `${signo(n)}${formatCurrency(Math.abs(n))}`;
const claseSigno = (n: number) => (n < 0 ? 'text-danger' : n > 0 ? 'text-success' : 'text-text-muted');
/** Escala `mesKey` (año×12+mes) → 'mm/aaaa'. */
const kALbl = (k: number) => `${String(((k - 1) % 12) + 1).padStart(2, '0')}/${Math.floor((k - 1) / 12)}`;

const TONO: Record<TonoInsight, { Icono: typeof Info; etiqueta: string; cls: string }> = {
  danger: { Icono: AlertOctagon, etiqueta: 'Crítico', cls: 'text-danger' },
  warning: { Icono: AlertTriangle, etiqueta: 'Atención', cls: 'text-warning' },
  info: { Icono: Info, etiqueta: 'Dato', cls: 'text-info' },
  success: { Icono: CheckCircle2, etiqueta: 'Bien', cls: 'text-success' },
};

type PresetPeriodo = 'mes' | 'trim' | 'sem' | '12m' | 'ytd';
const PRESETS: { value: PresetPeriodo; label: string; title: string }[] = [
  { value: 'mes', label: 'Mes', title: 'Último mes cerrado' },
  { value: 'trim', label: '3 meses', title: 'Últimos 3 meses cerrados' },
  { value: 'sem', label: '6 meses', title: 'Últimos 6 meses cerrados' },
  { value: '12m', label: '12 meses', title: 'Últimos 12 meses cerrados' },
  { value: 'ytd', label: 'Año a la fecha', title: 'De enero al último mes cerrado' },
];
/** [desde, hasta] (escala `mesKey`) de cada atajo, a partir del último mes cerrado `r0`. */
function rangoDe(p: PresetPeriodo, r0: number): [number, number] {
  if (p === 'mes') return [r0, r0];
  if (p === 'trim') return [r0 - 2, r0];
  if (p === 'sem') return [r0 - 5, r0];
  if (p === '12m') return [r0 - 11, r0];
  return [Math.floor((r0 - 1) / 12) * 12 + 1, r0];
}

type Periodo = { desde: string; hasta: string };
type VistaAnalisis = {
  ejecutivos?: string[]; grupoClientes?: string[]; sectores?: string[]; gruposArticulo?: string[]; gerenciasVentas?: string[]; gerentesVentas?: string[]; canalesVentas?: string[]; oficinasVentas?: string[];
  materiales?: string[]; clientes?: string[]; gerente?: string; periodo?: Periodo; base?: BaseComparacion; soloNoDetenido?: boolean;
  /** Campos de vistas guardadas antes de los filtros múltiples. */
  ejecutivo?: string; grupoCliente?: string; sector?: string; grupoArticulo?: string;
};

export function AnalisisPage() {
  const a = useAnalytics();
  useFacturacionLibros(); // pide (y revisa en Drive) la facturación de los libros mientras la pantalla está abierta
  const open = usePanelStore((s) => s.open);
  const presupuestoDet = useFacturacionStore((s) => s.presupuestoDet);

  // ---- Filtros: todos en multi-selección («elegir entre uno u otro»); vacío = sin filtro. ----
  const [ejecutivos, setEjecutivos] = usePersistedState<string[]>('analisis.ejecutivos', []);
  const [gerenciasVentas, setGerenciasVentas] = usePersistedState<string[]>('analisis.gerenciasVentas', []);
  const [gerentesVentas, setGerentesVentas] = usePersistedState<string[]>('analisis.gerentesVentas', []);
  const [canalesVentas, setCanalesVentas] = usePersistedState<string[]>('analisis.canalesVentas', []);
  const [oficinasVentas, setOficinasVentas] = usePersistedState<string[]>('analisis.oficinasVentas', []);
  const [sectores, setSectores] = usePersistedState<string[]>('analisis.sectores', []);
  const [gruposArticulo, setGruposArticulo] = usePersistedState<string[]>('analisis.gruposArticulo', []);
  const [materiales, setMateriales] = usePersistedState<string[]>('analisis.materiales', []);
  const [clientes, setClientes] = usePersistedState<string[]>('analisis.clientes', []);
  const [gerente, setGerente] = usePersistedState('analisis.gerente', '');
  const [periodo, setPeriodo] = usePersistedState<Periodo>('analisis.periodo', { desde: '', hasta: '' });
  const [soloNoDetenido, setSoloNoDetenido] = usePersistedState('analisis.soloNoDetenido', false);
  const [base, setBase] = usePersistedState<BaseComparacion>('analisis.base', 'previos');

  // Opciones distintas de los filtros, tomadas de las mismas fuentes (Resumen_Fac + catálogo) que alimenta analisisVentas — no dependen del
  // resultado ya filtrado, para no ir angostando las listas conforme se filtra.
  const opciones = useMemo(() => {
    const ejecs = new Set<string>(), grupos = new Set<string>(), sects = new Set<string>(), gArts = new Set<string>();
    const gerencias = new Set<string>(), gerentesV = new Set<string>(), canales = new Set<string>(), oficinas = new Set<string>();
    if (a.rf) {
      const yaVistos = new Set<string>();
      a.rf.solic.forEach((_serie, code) => {
        const gv = a.rf!.solicGpoV.get(code) || '';
        const ej = a.enrich.ejecutivoNombre(gv);
        if (ej) ejecs.add(ej);
        if (!yaVistos.has(gv)) {
          yaVistos.add(gv);
          const at = a.enrich.ejecutivoAtributos(gv);
          gerencias.add(at.gerenciaVentas || 'Sin dato'); gerentesV.add(at.gerenteVentas || 'Sin dato');
          canales.add(at.canalVentas || 'Sin dato'); oficinas.add(at.oficinaVentas || 'Sin dato');
        }
        const gc = a.enrich.grupoCliente(a.rf!.solicGpoC.get(code) || '') || a.rf!.solicGpoC.get(code) || '';
        grupos.add(gc || SIN_GRUPO_CLIENTE);
      });
      a.rf.mat.forEach((_serie, m) => {
        sects.add(a.enrich.matSector(m) || '(sin sector)');
        gArts.add(a.enrich.matGrupo(m) || '(sin grupo)');
      });
    }
    const orden = (s: Set<string>) => [...s].sort();
    return {
      ejecutivo: orden(ejecs), grupoCliente: orden(grupos), sector: orden(sects), grupoArticulo: orden(gArts),
      gerencia: orden(gerencias), gerenteV: orden(gerentesV), canal: orden(canales), oficina: orden(oficinas),
      material: a.rf ? [...a.rf.mat.keys()].sort() : [], cliente: a.rf ? [...a.rf.solic.keys()].sort((x, y) => (a.rf!.solicRazon.get(x) || x).localeCompare(a.rf!.solicRazon.get(y) || y)) : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.rf, a.enrich]);
  const etiquetaMaterial = useCallback((m: string) => { const t = a.rf?.matTexto.get(m); return t ? `${m} · ${t}` : m; }, [a.rf]);
  const etiquetaCliente = useCallback((c: string) => { const r = a.rf?.solicRazon.get(c); return r ? `${r} (${c})` : c; }, [a.rf]);

  // Grupo cliente: por defecto todos MENOS los grupos que Administración → Filtros excluya (18 = GOBIERNO) cada vez que se entra al módulo.
  const [grupoClientes, setGrupoClientes, reiniciarGrupos, grupoResumen] = useGruposPorDefecto(opciones.grupoCliente);

  // Último mes cerrado: de aquí salen los atajos de periodo.
  const r0 = useMemo(() => (a.rf ? mesCorteDefault(a.rf) : 0), [a.rf]);
  const presetActivo = useMemo<PresetPeriodo | ''>(() => {
    if (!r0 || !periodo.desde || !periodo.hasta) return '';
    return PRESETS.find((p) => { const [d, h] = rangoDe(p.value, r0); return periodo.desde === kALbl(d) && periodo.hasta === kALbl(h); })?.value ?? '';
  }, [periodo, r0]);
  const elegirPreset = (p: PresetPeriodo) => {
    if (presetActivo === p) { setPeriodo({ desde: '', hasta: '' }); return; } // segundo clic: vuelve al periodo por omisión
    const [d, h] = rangoDe(p, r0);
    setPeriodo({ desde: kALbl(d), hasta: kALbl(h) });
  };

  // Vistas guardadas: snapshot de TODOS los filtros, el periodo y la base de comparación.
  const savedViews = useSavedViews<VistaAnalisis>('analisis_vistas');
  const applyView = (v: VistaAnalisis) => {
    setEjecutivos(v.ejecutivos ?? (v.ejecutivo ? [v.ejecutivo] : []));
    // Vistas viejas guardaban un solo grupo ('' = todos); las nuevas, la lista.
    setGrupoClientes(v.grupoClientes ?? (v.grupoCliente ? [v.grupoCliente] : []));
    setSectores(v.sectores ?? (v.sector ? [v.sector] : []));
    setGruposArticulo(v.gruposArticulo ?? (v.grupoArticulo ? [v.grupoArticulo] : []));
    setGerenciasVentas(v.gerenciasVentas ?? []); setGerentesVentas(v.gerentesVentas ?? []); setCanalesVentas(v.canalesVentas ?? []); setOficinasVentas(v.oficinasVentas ?? []);
    setMateriales(v.materiales ?? []); setClientes(v.clientes ?? []); setGerente(v.gerente ?? '');
    setPeriodo(v.periodo ?? { desde: '', hasta: '' });
    setSoloNoDetenido(!!v.soloNoDetenido);
    if (v.base) setBase(v.base);
  };
  const saveCurrentView = (name: string) => savedViews.save(name, {
    ejecutivos, grupoClientes, sectores, gruposArticulo, gerenciasVentas, gerentesVentas, canalesVentas, oficinasVentas, materiales, clientes, gerente, periodo, base, soloNoDetenido,
  });
  const clearFilters = () => {
    setEjecutivos([]); reiniciarGrupos(); setSectores([]); setGruposArticulo([]); setGerenciasVentas([]); setGerentesVentas([]); setCanalesVentas([]); setOficinasVentas([]);
    setMateriales([]); setClientes([]); setGerente(''); setPeriodo({ desde: '', hasta: '' }); setSoloNoDetenido(false);
  };

  const filters = useMemo<AnalisisFilters>(() => ({
    ejecutivos, grupoClientes, sectores, gruposArticulo, gerenciasVentas, gerentesVentas, canalesVentas, oficinasVentas, materiales, clientes, gerente, base, desde: periodo.desde, hasta: periodo.hasta,
  }), [ejecutivos, grupoClientes, sectores, gruposArticulo, gerenciasVentas, gerentesVentas, canalesVentas, oficinasVentas, materiales, clientes, gerente, base, periodo]);
  const A = useMemo(() => analisisVentas(a.rf, a.bo, a.enrich, filters), [a.rf, a.bo, a.enrich, filters]);

  // ---- Presupuesto con los MISMOS filtros que las ventas, hasta donde su dimensión lo permite (cliente y material no existen en el presupuesto). ----
  const resolverPto = useMemo<ResolverPto>(() => ({
    ejecutivo: (c) => a.enrich.ejecutivoNombre(c),
    grupoCli: (c) => a.enrich.grupoCliente(c) || c,
    ventas: (c) => a.enrich.ejecutivoAtributos(c),
  }), [a.enrich]);
  const ptoFiltro = useMemo(() => {
    if (!presupuestoDet.length) return { filas: [], ignorados: [] as string[] };
    const activos: FiltroActivo[] = [
      { col: 'ejecutivo', values: ejecutivos },
      { col: 'grupocli', values: grupoClientes.length < opciones.grupoCliente.length ? grupoClientes : [] },
      { col: 'gerenciaVentas', values: gerenciasVentas }, { col: 'gerenteVentas', values: gerentesVentas }, { col: 'canalVentas', values: canalesVentas }, { col: 'oficinaVentas', values: oficinasVentas },
      { col: 'sector', values: sectores }, { col: 'grupoart', values: gruposArticulo },
      { col: 'cliente', values: clientes }, { col: 'material', values: materiales },
    ];
    const etiquetas: Record<string, string> = { cliente: 'Cliente', material: 'Material' };
    return filtrarPresupuestoDet(presupuestoDet, activos, resolverPto, {
      sectorPasa: gerente ? (s) => a.enrich.sectorDeGerente(s, gerente) : undefined,
      etiqueta: (c) => etiquetas[c] ?? c,
    });
  }, [presupuestoDet, ejecutivos, grupoClientes, opciones.grupoCliente.length, gerenciasVentas, gerentesVentas, canalesVentas, oficinasVentas, sectores, gruposArticulo, clientes, materiales, gerente, resolverPto, a.enrich]);
  const ptoMapa = useMemo(() => ptoPorMes(ptoFiltro.filas, -Infinity, Infinity), [ptoFiltro]);
  const hayPto = ptoFiltro.filas.length > 0;
  const sumaPto = useCallback((lo: number, hi: number) => { let t = 0; ptoMapa.forEach((m, k) => { if (k >= lo && k <= hi) t += m; }); return t; }, [ptoMapa]);

  // ---- Gráfica: con un periodo elegido muestra al menos 12 meses hasta su fin (para tener contexto) y solo el presupuesto de esos meses. ----
  const explicito = !!(periodo.desde || periodo.hasta);
  const ventanaGrafica = useMemo<[number, number]>(() => {
    if (!explicito || !A) return [-Infinity, Infinity];
    const hi = periodo.hasta ? mesKey(periodo.hasta) : A.kpi.refK;
    const lo = periodo.desde ? Math.min(mesKey(periodo.desde), hi - 11) : hi - 11;
    return [lo, hi];
  }, [explicito, A, periodo]);
  const serieGrafica = useMemo(() => (A && explicito ? A.serieTotal.filter((p) => { const k = mesKey(p.mes); return k >= ventanaGrafica[0] && k <= ventanaGrafica[1]; }) : A?.serieTotal ?? []), [A, explicito, ventanaGrafica]);
  const ptoGrafica = useMemo(() => {
    if (!explicito) return ptoMapa;
    const m = new Map<number, number>();
    ptoMapa.forEach((v, k) => { if (k >= ventanaGrafica[0] && k <= ventanaGrafica[1]) m.set(k, v); });
    return m;
  }, [explicito, ptoMapa, ventanaGrafica]);

  // Solicitantes con al menos un pedido pendiente + fuente disponible — reactivar a un «cliente en riesgo» es más fácil si ya hay con qué surtirlo.
  const solicConFuente = useMemo(() => {
    const s = new Set<string>();
    a.bo.forEach((it) => { if (it.fuentes.length && num(it.bo.cantidadPendiente) > 0) s.add(norm(it.bo.solicitante)); });
    return s;
  }, [a.bo]);

  // Inventario total (todos los centros) por material — para detectar «cae en consumo Y sobra inventario».
  const invPorMaterial = useMemo(() => {
    const m = new Map<string, number>();
    a.invCondicion.forEach((r) => { m.set(norm(r.material), (m.get(norm(r.material)) || 0) + (r.invSuma || 0)); });
    return m;
  }, [a.invCondicion]);

  // ABC/Pareto con los mismos predicados que `analisisVentas` y los 12 meses que terminan en el corte elegido.
  const abcFiltrado = useMemo(() => {
    if (!a.rf || !A) return { materiales: [] as AbcEntry[], clientes: [] as AbcEntry[] };
    return buildAbc(a.rf, buildAnalisisPredicates(a.rf, a.enrich, filters), A.kpi.refK);
  }, [a.rf, a.enrich, filters, A]);
  const abcMaterialesSummary = useMemo(() => summarizeAbc(abcFiltrado.materiales), [abcFiltrado.materiales]);
  const abcClientesSummary = useMemo(() => summarizeAbc(abcFiltrado.clientes), [abcFiltrado.clientes]);
  const [abcTab, setAbcTab] = usePersistedState<'materiales' | 'clientes'>('analisis.abcTab', 'materiales');
  const abcShown = abcTab === 'materiales' ? abcFiltrado.materiales : abcFiltrado.clientes;

  const opsShown = useMemo(() => (A ? A.ops.top.filter((o) => !soloNoDetenido || !o.bloqueado).slice(0, 15) : []), [A, soloNoDetenido]);

  const ptoYtd = A ? sumaPto(A.kpi.ytdAnio * 12 + 1, A.kpi.refK) : 0;
  const ptoMes = A ? ptoMapa.get(A.kpi.refK) ?? 0 : 0;
  const ptoPeriodo = A ? sumaPto(A.kpi.periodo.desdeK, A.kpi.periodo.hastaK) : 0;

  const insights = useMemo(() => {
    if (!A) return [];
    const matCaenConInventario = A.matCaen.filter((m) => (invPorMaterial.get(norm(m.code)) || 0) > 0).length;
    return insightsAnalisis({ A, ptoYtd: hayPto ? ptoYtd : null, matCaenConInventario });
  }, [A, hayPto, ptoYtd, invPorMaterial]);

  if (!A) {
    return <EmptyState title="Para el análisis se necesita la facturación." description="Sincroniza los libros de facturación desde Carga." action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }
  const k = A.kpi;
  const p = k.periodo;
  const r = A.resumen;
  const pu = A.puente;
  const baseLbl = base === 'anio' ? 'Mismo periodo año ant.' : 'Periodo previo';
  const baseRango = `${p.baseDesdeLbl} – ${p.baseHastaLbl}`;
  const periodoLbl = p.n === 1 ? p.hastaLbl : `${p.desdeLbl} – ${p.hastaLbl}`;

  const cumpl = (vendido: number, pto: number): number | null => (hayPto && pto > 0 ? vendido / pto : null);
  const subPto = (c: number | null) => (c == null ? null : <> · <span className={cn('font-medium', c >= 1 ? 'text-success' : c >= 0.9 ? 'text-warning' : 'text-danger')}>{Math.round(c * 100)}% del presupuesto</span></>);

  const clientTable = (list: ClienteAna[], titulo: string, total: ReactNode, kind: 'riesgo' | 'var') => (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="mb-2 text-xs text-text-muted">{total}</p>
      <Table wrapperClassName="max-h-64">
        <TableHeader><TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead className="text-right">{kind === 'riesgo' ? 'Venta 12m' : baseLbl}</TableHead>
          <TableHead className="text-right">{kind === 'riesgo' ? '—' : 'Periodo'}</TableHead>
          <TableHead>{kind === 'riesgo' ? 'Situación' : 'Var.'}</TableHead>
          {kind === 'riesgo' && <TableHead>Pedido</TableHead>}
        </TableRow></TableHeader>
        <TableBody>
          {list.map((c) => (
            <RowContextMenu
              key={c.code}
              label={c.razon || c.code}
              onVerDetalle={() => open({ type: 'evol', kind: 'solic', key: c.code })}
              copyItems={[{ label: 'Cliente', value: c.razon }, { label: 'Solicitante', value: c.code }, { label: 'Ejecutivo', value: c.ejec }]}
            >
              <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'evol', kind: 'solic', key: c.code })}>
                <TableCell className="max-w-72 truncate"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: c.code })}>{c.razon || '—'}</Chip><div className="text-[11px] text-text-faint">Solic {c.code} · {c.ejec || '—'}</div></TableCell>
                <TableCell className="text-right">{formatCurrency(kind === 'riesgo' ? c.base ?? 0 : c.p3)}</TableCell>
                <TableCell className="text-right">{kind === 'riesgo' ? '—' : formatCurrency(c.a3)}</TableCell>
                <TableCell>{kind === 'riesgo' ? `${c.sinComprar} m sin comprar` : <Variacion actual={c.a3} base={c.p3} />}</TableCell>
                {kind === 'riesgo' && (
                  <TableCell>{solicConFuente.has(norm(c.code)) ? <StatePill label="Con fuente" cls="verde" /> : <span className="text-text-faint">—</span>}</TableCell>
                )}
              </TableRow>
            </RowContextMenu>
          ))}
          {list.length === 0 && <TableRow><TableCell colSpan={kind === 'riesgo' ? 5 : 4} className="text-center text-text-muted">Sin casos con los filtros actuales.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );

  const matTable = (list: MatAna[], titulo: string, total: ReactNode, showInv = false) => (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="mb-2 text-xs text-text-muted">{total}</p>
      <Table wrapperClassName="max-h-64">
        <TableHeader><TableRow>
          <TableHead>Material</TableHead><TableHead className="text-right">{baseLbl}</TableHead><TableHead className="text-right">Periodo</TableHead><TableHead>Var.</TableHead>
          {showInv && <TableHead className="text-right">Inventario</TableHead>}
        </TableRow></TableHeader>
        <TableBody>
          {list.map((m) => {
            const inv = invPorMaterial.get(norm(m.code)) || 0;
            return (
              <RowContextMenu
                key={m.code}
                label={m.code}
                onVerDetalle={() => open({ type: 'material', material: m.code })}
                copyItems={[{ label: 'Material', value: m.code }, { label: 'Descripción', value: m.texto }]}
              >
                <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'material', material: m.code })}>
                  <TableCell><Chip onClick={() => open({ type: 'material', material: m.code })}>{m.code}</Chip><div className="max-w-72 truncate text-[11px] text-text-faint">{m.texto}</div></TableCell>
                  <TableCell className="text-right">{formatCurrency(m.p3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(m.a3)}</TableCell>
                  <TableCell><Variacion actual={m.a3} base={m.p3} /></TableCell>
                  {showInv && <TableCell className={cn('text-right', inv > 0 && 'font-medium text-warning')}>{inv > 0 ? formatNumber(inv) : '—'}</TableCell>}
                </TableRow>
              </RowContextMenu>
            );
          })}
          {list.length === 0 && <TableRow><TableCell colSpan={showInv ? 5 : 4} className="text-center text-text-muted">Sin casos con los filtros actuales.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );

  const exportar = () => {
    void exportXlsxMultiSheet(`analisis_${stamp()}.xlsx`, [
      {
        name: 'Resumen',
        rows: [
          { Indicador: `Periodo ${periodoLbl}`, Valor: p.actual, [baseLbl]: p.base, Presupuesto: hayPto ? ptoPeriodo : '' },
          { Indicador: `Ventas ${k.refLbl}`, Valor: k.mesPrevImp, [baseLbl]: k.mesPrevAnt, Presupuesto: hayPto ? ptoMes : '' },
          { Indicador: `Año a la fecha (${k.ytdMeses} meses)`, Valor: k.ytdImp, [baseLbl]: k.ytdAnt, Presupuesto: hayPto ? ptoYtd : '' },
        ],
      },
      {
        name: 'Puente de ventas',
        rows: [
          { Concepto: `Base (${baseRango})`, Importe: pu.base }, { Concepto: 'Volumen (incluye mezcla)', Importe: pu.volumen }, { Concepto: 'Precio', Importe: pu.precio },
          { Concepto: 'Nuevos', Importe: pu.nuevos }, { Concepto: 'Perdidos', Importe: pu.perdidos }, { Concepto: 'Devoluciones / otros', Importe: pu.otros }, { Concepto: `Periodo ${periodoLbl}`, Importe: pu.actual },
        ],
      },
      { name: 'Oportunidades', rows: A.ops.top.map((o) => ({ Pedido: o.pedido, Cliente: o.razon, Material: o.mat, 'Imp. pendiente': o.imp, Bloqueado: o.bloqueado ? 'Sí' : '' })) },
      { name: 'ABC Materiales', rows: abcFiltrado.materiales.map((e) => ({ Rank: e.rank, Material: e.key, Descripción: e.label, 'Importe 12m': e.importe12m, 'Cantidad 12m': e.cantidad12m, '% del importe': e.share, '% acumulado': e.cumShare, Clase: e.clase })) },
      { name: 'ABC Clientes', rows: abcFiltrado.clientes.map((e) => ({ Rank: e.rank, Solicitante: e.key, Cliente: e.label, 'Importe 12m': e.importe12m, 'Cantidad 12m': e.cantidad12m, '% del importe': e.share, '% acumulado': e.cumShare, Clase: e.clase })) },
      { name: 'Sectores', rows: A.sectores.map((s) => ({ Sector: s.sector, [baseLbl]: s.p3, Periodo: s.a3, 'Imp. 12m': s.i12, Grupos: s.grupos.size })) },
      { name: 'Clientes en riesgo', rows: A.riesgo.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, 'Base 12m': c.base ?? 0, 'Meses sin comprar': c.sinComprar })) },
      { name: 'Clientes a la baja', rows: A.caen.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, [baseLbl]: c.p3, Periodo: c.a3 })) },
      { name: 'Clientes en crecimiento', rows: A.crecen.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, [baseLbl]: c.p3, Periodo: c.a3 })) },
      { name: 'Materiales a la baja', rows: A.matCaen.map((m) => ({ Material: m.code, Descripción: m.texto, [baseLbl]: m.p3, Periodo: m.a3 })) },
      { name: 'Materiales en crecimiento', rows: A.matSuben.map((m) => ({ Material: m.code, Descripción: m.texto, [baseLbl]: m.p3, Periodo: m.a3 })) },
    ]);
  };

  return (
    <ReportPage>
      <PageHeader
        title="Análisis"
        subtitle={`Ventas, presupuesto y qué las mueve · periodo ${periodoLbl} (${p.n} ${p.n === 1 ? 'mes' : 'meses'}) vs ${baseRango}`}
        actions={(
          <>
            <SavedViewsControl views={savedViews.views} onApply={applyView} onSave={saveCurrentView} onRemove={savedViews.remove} />
            <ExportButton onClick={exportar} />
          </>
        )}
      />

      <FilterBar onClear={clearFilters}>
        <SegmentedControl<PresetPeriodo | ''>
          ariaLabel="Periodo analizado"
          value={presetActivo}
          onChange={(v) => { if (v) elegirPreset(v); }}
          options={PRESETS}
        />
        <MonthRangeFilter desde={periodo.desde} hasta={periodo.hasta} onChange={setPeriodo} label="Periodo" />
        <SegmentedControl<BaseComparacion>
          ariaLabel="Comparar el periodo contra"
          value={base}
          onChange={setBase}
          options={[
            { value: 'previos', label: 'vs periodo previo', title: 'Compara contra el periodo inmediato anterior, del mismo número de meses (sensible a la estacionalidad).' },
            { value: 'anio', label: 'vs año anterior', title: 'Compara contra los mismos meses del año anterior (quita la estacionalidad).' },
          ]}
        />
        <MultiSelect label="Ejecutivo" options={opciones.ejecutivo} selected={ejecutivos} onChange={setEjecutivos} />
        <MultiSelect label="Grupo cliente" options={opciones.grupoCliente} selected={grupoClientes} onChange={setGrupoClientes} summary={grupoResumen} />
        <MultiSelect label="Gerencia de ventas" options={opciones.gerencia} selected={gerenciasVentas} onChange={setGerenciasVentas} />
        <MultiSelect label="Gerente de ventas" options={opciones.gerenteV} selected={gerentesVentas} onChange={setGerentesVentas} />
        <MultiSelect label="Canal" options={opciones.canal} selected={canalesVentas} onChange={setCanalesVentas} />
        <MultiSelect label="Oficina" options={opciones.oficina} selected={oficinasVentas} onChange={setOficinasVentas} />
        <GerenteSelect enrich={a.enrich} value={gerente} onChange={setGerente} />
        <MultiSelect label="Sector" options={opciones.sector} selected={sectores} onChange={setSectores} />
        <MultiSelect label="Grupo artículo" options={opciones.grupoArticulo} selected={gruposArticulo} onChange={setGruposArticulo} />
        <MultiSelect label="Material" options={opciones.material} selected={materiales} onChange={setMateriales} optionLabel={etiquetaMaterial} />
        <MultiSelect label="Cliente" options={opciones.cliente} selected={clientes} onChange={setClientes} optionLabel={etiquetaCliente} />
      </FilterBar>

      {/* 1 · Dónde estamos: todo sale de las ventas YA filtradas (las cards cambian con cada filtro y con el periodo) */}
      <div className="grid grid-cols-1 items-stretch gap-2 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <StatTile
          fluid
          emphasis="hero"
          label={`Periodo ${periodoLbl}`}
          value={formatCurrency(p.actual)}
          sub={<><Variacion actual={p.actual} base={p.base} /> vs {base === 'anio' ? 'mismo periodo año ant.' : baseRango}{subPto(cumpl(p.actual, ptoPeriodo))}</>}
          title={`${p.n} ${p.n === 1 ? 'mes' : 'meses'} contra ${baseRango}. Cambia con el periodo y con cualquier filtro.`}
        />
        <StatTile
          fluid
          label={`Ventas ${k.refLbl} (mes de corte)`}
          value={formatCurrency(k.mesPrevImp)}
          sub={<><Variacion actual={k.mesPrevImp} base={k.mesPrevAnt} /> vs año ant.{subPto(cumpl(k.mesPrevImp, ptoMes))}</>}
        />
        <StatTile
          fluid
          label={`Año a la fecha ${k.ytdAnio} · ${k.ytdMeses} ${k.ytdMeses === 1 ? 'mes' : 'meses'}`}
          value={formatCurrency(k.ytdImp)}
          sub={<><Variacion actual={k.ytdImp} base={k.ytdAnt} /> vs año ant.{subPto(cumpl(k.ytdImp, ptoYtd))}</>}
        />
        <StatTile fluid label="Clientes activos (≤3m)" value={formatNumber(k.activos3m)} sub={`de ${formatNumber(A.conc.nClientes)} en 12m · top 5 = ${(A.conc.top5 * 100).toFixed(0)}%`} />
      </div>

      {/* 2 · Qué requiere atención */}
      <Card className="p-4">
        <h2 className="mb-2 font-display text-base font-semibold">Lo que requiere atención</h2>
        {insights.length === 0 ? (
          <p className="text-sm text-text-muted">Nada fuera de lo normal con los filtros y el periodo actuales.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {insights.map((i) => {
              const t = TONO[i.tono];
              return (
                <li key={i.titulo} className="flex items-start gap-3 py-2">
                  <t.Icono className={cn('mt-0.5 size-4 shrink-0', t.cls)} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm"><span className={cn('mr-2 text-[11px] font-semibold uppercase tracking-wide', t.cls)}>{t.etiqueta}</span>{i.titulo}</p>
                    {i.detalle && <p className="text-xs text-text-muted">{i.detalle}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 3 · Tendencia y presupuesto */}
      <CollapsibleCard title={hayPto ? 'Facturación mensual vs presupuesto' : 'Facturación mensual'} storageKey="analisis.sec.tendencia" defaultOpen>
        <EvolChart serie={serieGrafica} presupuesto={hayPto ? ptoGrafica : undefined} cantidad={false} filtroPeriodo={false} height={220} />
        {explicito && <p className="mt-1 text-xs text-text-faint">Mostrando {kALbl(Math.max(ventanaGrafica[0], serieGrafica.length ? mesKey(serieGrafica[0].mes) : ventanaGrafica[0]))} – {kALbl(Math.min(ventanaGrafica[1], k.refK))} (al menos 12 meses hasta el fin del periodo, para dar contexto).</p>}
        {presupuestoDet.length === 0 && <p className="mt-1 text-xs text-text-faint">Sin presupuesto cargado: sincroniza facturación en modo forzado para verlo aquí.</p>}
        {ptoFiltro.ignorados.length > 0 && <p className="mt-1 text-xs text-text-muted">El presupuesto no tiene {ptoFiltro.ignorados.join(' ni ')}: ese filtro acota las ventas pero no el presupuesto.</p>}
        <div className="mt-3"><ComparativaDual serie={A.serieTotal} /></div>
      </CollapsibleCard>

      {/* 4 · Por qué cambió */}
      <CollapsibleCard
        title={`¿Por qué cambió la venta? · ${periodoLbl}`}
        storageKey="analisis.sec.puente"
        defaultOpen
        right={<span className={cn('text-xs font-medium tabular-nums', claseSigno(pu.delta))}>{dinero(pu.delta)} vs {baseRango}</span>}
      >
        <p className="mb-2 text-xs text-text-muted">
          Separa el cambio en cuánto se debe a vender más o menos piezas (incluye la mezcla entre materiales), a cambios de precio, a materiales nuevos o perdidos, y a devoluciones. La suma cuadra con la diferencia.
        </p>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {([
            ['Base', pu.base, false], ['Volumen', pu.volumen, true], ['Precio', pu.precio, true], ['Nuevos', pu.nuevos, true],
            ['Perdidos', pu.perdidos, true], ['Devol. / otros', pu.otros, true], ['Periodo', pu.actual, false],
          ] as [string, number, boolean][]).map(([etiqueta, valor, esEfecto]) => (
            <div key={etiqueta} className="min-w-0 rounded-lg border border-border p-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">{etiqueta}</div>
              <div className={cn('break-words font-display text-base font-semibold tabular-nums', esEfecto && claseSigno(valor))}>{esEfecto ? dinero(valor) : formatCurrency(valor)}</div>
            </div>
          ))}
        </div>
        <Table wrapperClassName="max-h-64">
          <TableHeader><TableRow>
            <TableHead>Material (mayor efecto)</TableHead>
            <TableHead className="text-right">{baseLbl}</TableHead><TableHead className="text-right">Periodo</TableHead>
            <TableHead className="text-right">Volumen</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Cambio</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {pu.top.map((m) => (
              <TableRow key={m.code} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'material', material: m.code })}>
                <TableCell><Chip onClick={() => open({ type: 'material', material: m.code })}>{m.code}</Chip><div className="max-w-72 truncate text-[11px] text-text-faint">{m.texto}</div></TableCell>
                <TableCell className="text-right">{formatCurrency(m.base)}</TableCell>
                <TableCell className="text-right">{formatCurrency(m.actual)}</TableCell>
                <TableCell className={cn('text-right tabular-nums', claseSigno(m.volumen))}>{m.volumen ? dinero(m.volumen) : '—'}</TableCell>
                <TableCell className={cn('text-right tabular-nums', claseSigno(m.precio))}>{m.precio ? dinero(m.precio) : '—'}</TableCell>
                <TableCell className={cn('text-right font-medium tabular-nums', claseSigno(m.delta))}>{dinero(m.delta)}</TableCell>
              </TableRow>
            ))}
            {pu.top.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-text-muted">Sin ventas en las ventanas comparadas.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CollapsibleCard>

      {/* 5 · Dónde: sectores y concentración (ABC) */}
      <CollapsibleCard title="Sectores — alza / baja" storageKey="analisis.sec.sectores" defaultOpen>
        <Table wrapperClassName="max-h-64">
          <TableHeader><TableRow><TableHead>Sector</TableHead><TableHead className="text-right">{baseLbl}</TableHead><TableHead className="text-right">Periodo</TableHead><TableHead className="text-right">Venta 12m</TableHead><TableHead>Var.</TableHead></TableRow></TableHeader>
          <TableBody>
            {A.sectores.map((s) => (
              <RowContextMenu key={s.sector} label={s.sector} onVerDetalle={() => open({ type: 'sector', sector: s.sector })} copyItems={[{ label: 'Sector', value: s.sector }]}>
                <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'sector', sector: s.sector })}>
                  <TableCell><Chip onClick={() => open({ type: 'sector', sector: s.sector })}>{s.sector}</Chip><div className="text-[11px] text-text-faint">{s.grupos.size} grupo(s)</div></TableCell>
                  <TableCell className="text-right">{formatCurrency(s.p3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.a3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.i12)}</TableCell>
                  <TableCell><Variacion actual={s.a3} base={s.p3} /></TableCell>
                </TableRow>
              </RowContextMenu>
            ))}
            {A.sectores.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-text-muted">Sin ventas con los filtros actuales.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CollapsibleCard>

      <CollapsibleCard
        title={`Clasificación ABC / Pareto · 12 meses hasta ${k.refLbl}`}
        storageKey="analisis.sec.abc"
        right={(
          <SegmentedControl<'materiales' | 'clientes'> ariaLabel="ABC de" value={abcTab} onChange={setAbcTab} options={[{ value: 'materiales', label: 'Materiales' }, { value: 'clientes', label: 'Clientes' }]} />
        )}
      >
        <div className="mb-3 grid grid-cols-3 gap-2">
          {(abcTab === 'materiales' ? abcMaterialesSummary : abcClientesSummary).map((s) => (
            <div key={s.clase} className="min-w-0 rounded-xl border border-border p-3">
              <div className="flex items-center gap-1.5"><AbcBadge clase={s.clase} /><span className="text-xs font-medium text-text-faint">Clase {s.clase}</span></div>
              <div className="mt-1 font-display text-xl font-semibold">{formatNumber(s.count)}</div>
              <div className="text-[11px] text-text-faint">{formatCurrency(s.importe)} · {(s.shareOfTotal * 100).toFixed(1)}% del importe</div>
            </div>
          ))}
        </div>
        <Table wrapperClassName="max-h-72">
          <TableHeader><TableRow>
            <TableHead className="w-10">#</TableHead><TableHead>{abcTab === 'materiales' ? 'Material' : 'Cliente'}</TableHead>
            <TableHead className="text-right">Importe 12m</TableHead><TableHead className="text-right">% acum.</TableHead><TableHead>Clase</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {abcShown.slice(0, 50).map((e: AbcEntry) => {
              const abrir = () => open(abcTab === 'materiales' ? { type: 'material', material: e.key } : { type: 'evol', kind: 'solic', key: e.key });
              return (
                <TableRow key={e.key} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={abrir}>
                  <TableCell className="text-text-faint">{e.rank}</TableCell>
                  <TableCell className="max-w-72 truncate"><Chip onClick={abrir}>{e.key}</Chip><div className="truncate text-[11px] text-text-faint">{e.label}</div></TableCell>
                  <TableCell className="text-right">{formatCurrency(e.importe12m)}</TableCell>
                  <TableCell className="text-right">{(e.cumShare * 100).toFixed(1)}%</TableCell>
                  <TableCell><AbcBadge clase={e.clase} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="mt-2 text-[11px] text-text-faint">Mostrando los primeros 50 de {formatNumber(abcShown.length)} · el listado completo está en el Excel exportado.</p>
      </CollapsibleCard>

      {/* 6 · Quién y qué */}
      <div className="grid gap-4 lg:grid-cols-2">
        {clientTable(A.riesgo, 'Clientes en riesgo de abandono', <>Top {A.riesgo.length} de {formatNumber(r.riesgo.n)} · facturaban {formatCurrency(r.riesgo.base)} en sus últimos 12 meses de compra</>, 'riesgo')}
        {clientTable(A.caen, 'Clientes a la baja', <>Top {A.caen.length} de {formatNumber(r.caen.n)} · restan {formatCurrency(Math.abs(r.caen.delta))} vs {baseRango}</>, 'var')}
        {clientTable(A.crecen, 'Clientes en crecimiento', <>Top {A.crecen.length} de {formatNumber(r.crecen.n)} · suman {formatCurrency(Math.abs(r.crecen.delta))} vs {baseRango}</>, 'var')}
        {matTable(A.matCaen, 'Materiales a la baja', <>Top {A.matCaen.length} de {formatNumber(r.matCaen.n)} · restan {formatCurrency(Math.abs(r.matCaen.delta))} vs {baseRango}</>, true)}
        {matTable(A.matSuben, 'Materiales en crecimiento', <>Top {A.matSuben.length} de {formatNumber(r.matSuben.n)} · suman {formatCurrency(Math.abs(r.matSuben.delta))} vs {baseRango}</>)}
      </div>

      {/* 7 · Pedidos pendientes: solo existe si hay pedidos cargados (con el reporte diario retirado la sección no tiene datos) */}
      {a.bo.length > 0 && (
        <CollapsibleCard title="Pedidos pendientes · importe por precio" storageKey="analisis.sec.ops">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="grid grid-cols-2 gap-2">
              <StatTile fluid label="Importe pendiente total" value={formatCurrency(A.ops.total)} />
              <StatTile fluid label="Detenido por bloqueo" value={formatCurrency(A.ops.bloq)} tone="text-danger" />
            </div>
            <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm">
              <input type="checkbox" checked={soloNoDetenido} onChange={(ev) => setSoloNoDetenido(ev.target.checked)} />
              Solo no detenido
            </label>
          </div>
          <Table wrapperClassName="max-h-64">
            <TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Material</TableHead><TableHead className="text-right">Imp. pendiente</TableHead></TableRow></TableHeader>
            <TableBody>
              {opsShown.map((o, i) => (
                <RowContextMenu key={i} label={o.pedido} onVerDetalle={() => open({ type: 'pedido', pedido: o.pedido })} copyItems={[{ label: 'Pedido', value: o.pedido }, { label: 'Cliente', value: o.razon }, { label: 'Material', value: o.mat }]}>
                  <TableRow
                    className={cn('cursor-pointer', o.bloqueado && 'bg-danger/10 hover:bg-danger/15 [&>td:first-child]:shadow-[inset_3px_0_0_var(--danger)]')}
                    title="Doble clic para ver detalle"
                    onDoubleClick={() => open({ type: 'pedido', pedido: o.pedido })}
                  >
                    <TableCell><Chip onClick={() => open({ type: 'pedido', pedido: o.pedido })}>{o.pedido}</Chip>{o.bloqueado && <span className="ml-2 text-[11px] font-medium text-danger">Bloqueado</span>}</TableCell>
                    <TableCell className="max-w-64 truncate">{o.razon}</TableCell>
                    <TableCell><Chip onClick={() => open({ type: 'material', material: o.mat })}>{o.mat}</Chip></TableCell>
                    <TableCell className="text-right">{formatCurrency(o.imp)}</TableCell>
                  </TableRow>
                </RowContextMenu>
              ))}
            </TableBody>
          </Table>
        </CollapsibleCard>
      )}
    </ReportPage>
  );
}
