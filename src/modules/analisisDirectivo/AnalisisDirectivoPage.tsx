import { useMemo } from 'react';
import { Download, TrendingUp, TrendingDown, Minus, DollarSign, PiggyBank, Users, UserPlus, UserCheck, UserMinus, ShieldCheck, Trophy, AlertTriangle, Sparkles, CalendarDays } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { GerenteSelect } from '@/components/ui/gerente-select';
import { MonthRangeFilter } from '@/modules/analytics/ui/MonthRangeFilter';
import { DumbbellChart } from '@/modules/analytics/ui/DumbbellChart';
import { PuenteVentaChart } from '@/modules/analytics/ui/PuenteVentaChart';
import { FacturacionMensualCard } from './FacturacionMensualCard';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePersistedState } from '@/hooks/usePersistedState';
import { usePanelStore } from '@/store/panelStore';
import { EmptyState } from '@/components/feedback/EmptyState';
import { analisisDirectivo, buildPeriodo, narrativaDirectivo, serieAnualComparada, serieMensualFiltrada, clientesDeMes, type ClienteMovimiento } from '@/core/analisisDirectivo';
import type { AnalisisFilters } from '@/core/comercial';

// ---------------------------------------------------------------------------
// Convenciones de color (ver skill frontend-design): verde = mejoró, rojo =
// empeoró, ámbar = requiere atención pero no es urgente, gris = neutro. Nunca
// se usa el color como único indicador — siempre va acompañado de una flecha
// o una etiqueta de texto.
// ---------------------------------------------------------------------------
const pct = (a: number, b: number): number => (a > 0 ? ((b - a) / a) * 100 : b > 0 ? 100 : 0);
const pctTxt = (a: number, b: number): string => { const p = pct(a, b); return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`; };
const deltaTone = (p: number) => (p > 0.5 ? 'text-success' : p < -0.5 ? 'text-danger' : 'text-text-faint');
const DeltaIcon = ({ p }: { p: number }) => p > 0.5 ? <TrendingUp className="size-3.5" /> : p < -0.5 ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />;

function StatTile({ icon: Icon, label, hint, value, deltaFrom, deltaTo, sub, hero, valueClass }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  value: string;
  deltaFrom?: number;
  deltaTo?: number;
  sub?: string;
  /** KPI protagonista de la seccion: valor grande y filete superior. */
  hero?: boolean;
  /** Color semantico del valor (p. ej. segun umbral). Sin esto el valor va neutro. */
  valueClass?: string;
}) {
  const p = deltaFrom != null && deltaTo != null ? pct(deltaFrom, deltaTo) : null;
  return (
    <div className={cn('rounded-lg border border-border bg-bg-elevated p-3', hero && 'border-t-2 border-t-accent p-4 shadow-sm')} title={hint}>
      <div className="flex items-center gap-1.5 text-text-faint"><Icon className="size-3.5" /><p className="text-xs">{label}</p></div>
      <p className={cn('mt-1.5 font-display font-semibold tabular-nums', hero ? 'text-3xl tracking-tight' : 'text-xl', valueClass)}>{value}</p>
      <div className="mt-0.5 flex items-center gap-1 text-[11px]">
        {p != null && (
          <span className={cn('flex items-center gap-0.5 font-medium', deltaTone(p))}>
            <DeltaIcon p={p} />{pctTxt(deltaFrom!, deltaTo!)}
          </span>
        )}
        {sub && <span className="text-text-faint">{sub}</span>}
      </div>
    </div>
  );
}

const anioDe = (mmAaaa: string): number => +mmAaaa.split('/')[1] || 0;

/** Módulo "Análisis Directivo" (Fase 1): Finanzas (venta/margen aproximado) y
 * Clientes (altas/recuperación/penetración/deterioro), comparando dos
 * periodos mm/aaaa, filtrable por Gerente de marca — para presentar a
 * dirección/gerencia. Fase 2 (Procesos, Crecimiento, eventos, "inicio de
 * gestión") queda fuera de esta entrega — ver el plan de la conversación. */
export function AnalisisDirectivoPage() {
  const a = useAnalytics();
  const [gerente, setGerente] = usePersistedState('analisisDirectivo.gerente', '');
  const [sector, setSector] = usePersistedState('analisisDirectivo.sector', '');
  const [grupoArticulo, setGrupoArticulo] = usePersistedState('analisisDirectivo.grupoArticulo', '');
  const [grupoClientes, setGrupoClientes] = usePersistedState<string[]>('analisisDirectivo.grupoClientes', []);
  const [periodoA, setPeriodoA] = usePersistedState('analisisDirectivo.periodoA', { desde: '', hasta: '' });
  const [periodoB, setPeriodoB] = usePersistedState('analisisDirectivo.periodoB', { desde: '', hasta: '' });
  // Años a comparar en "Evolución anual" — independiente de Periodo A/B, para
  // poder ver TODO el histórico (2024 vs 2025 vs 2026…) aunque A/B solo
  // comparen dos meses puntuales. `null` = todavía no tocado -> todos los
  // años disponibles; un array explícito (incluso vacío) es lo que el
  // usuario eligió a mano.
  const [aniosSel, setAniosSel] = usePersistedState<number[] | null>('analisisDirectivo.anios', null);

  const listo = !!(periodoA.desde && periodoA.hasta && periodoB.desde && periodoB.hasta);
  const filters: AnalisisFilters = useMemo(
    () => ({ gerente: gerente || undefined, sector: sector || undefined, grupoArticulo: grupoArticulo || undefined, grupoClientes: grupoClientes.length ? grupoClientes : undefined }),
    [gerente, sector, grupoArticulo, grupoClientes],
  );

  // Opciones de los filtros — sobre el universo COMPLETO de Resumen_Fac (no
  // sobre lo ya filtrado), mismo criterio que /analisis, para que la lista no
  // se vaya angostando conforme se filtra.
  const { sectorOptions, grupoArticuloOptions, grupoClienteOptions } = useMemo(() => {
    const secs = new Set<string>(), garts = new Set<string>(), grps = new Set<string>();
    if (a.rf) {
      a.rf.mat.forEach((_s, m) => { secs.add(a.enrich.matSector(m) || '(sin sector)'); garts.add(a.enrich.matGrupo(m) || '(sin grupo)'); });
      a.rf.solic.forEach((_s, code) => { grps.add(a.enrich.grupoCliente(a.rf!.solicGpoC.get(code) || '') || a.rf!.solicGpoC.get(code) || '(sin grupo)'); });
    }
    return { sectorOptions: [...secs].sort(), grupoArticuloOptions: [...garts].sort(), grupoClienteOptions: [...grps].sort() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.rf, a.enrich]);

  const resultado = useMemo(() => {
    if (!listo || !a.rf) return null;
    return analisisDirectivo(a.rf, a.bo, a.enrich, filters, buildPeriodo(periodoA.desde, periodoA.hasta), buildPeriodo(periodoB.desde, periodoB.hasta));
  }, [listo, a.rf, a.bo, a.enrich, filters, periodoA, periodoB]);

  // Evolución anual (línea sólida por año, un color por año, punteada donde
  // se proyecta) — TODO el histórico disponible por default (todos los años
  // con datos en Resumen_Fac), acotable a mano con el selector de años.
  const aniosDisponibles = useMemo(() => {
    if (!a.rf) return [];
    const set = new Set<number>();
    a.rf.mat.forEach((serie) => serie.forEach((p) => { const y = anioDe(p.mes); if (y) set.add(y); }));
    return [...set].sort((x, y) => x - y);
  }, [a.rf]);
  const aniosActivos = aniosSel ?? aniosDisponibles;
  const toggleAnio = (y: number) => setAniosSel((aniosSel ?? aniosDisponibles).includes(y) ? (aniosSel ?? aniosDisponibles).filter((x) => x !== y) : [...(aniosSel ?? aniosDisponibles), y].sort((x, z) => x - z));
  const anios = useMemo(() => {
    if (!a.rf || !aniosActivos.length) return [];
    return aniosActivos.map((n) => serieAnualComparada(a.rf!, a.enrich, filters, n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.rf, a.enrich, filters, aniosActivos.join(',')]);
  // Serie "de Consumo": total mensual de TODO el historial bajo los filtros de
  // esta pantalla, con clic al detalle de clientes del mes (panel lateral).
  const openPanel = usePanelStore((s) => s.open);
  const serieFiltro = useMemo(() => (a.rf ? serieMensualFiltrada(a.rf, a.enrich, filters) : []), [a.rf, a.enrich, filters]);
  const anioActual = anios.find((y) => y.esAnioEnCurso);
  const proyeccionCierre = anioActual ? anioActual.meses.reduce((s, m) => s + (m.imp ?? 0), 0) : 0;
  const anioAnterior = anioActual ? anios.find((y) => y.anio === anioActual.anio - 1) : undefined;
  const totalAnioAnterior = anioAnterior ? anioAnterior.meses.reduce((s, m) => s + (m.imp ?? 0), 0) : null;

  const narrativa = resultado ? narrativaDirectivo(resultado) : '';
  const labelA = resultado ? `${resultado.periodoA.desde}–${resultado.periodoA.hasta}` : '';
  const labelB = resultado ? `${resultado.periodoB.desde}–${resultado.periodoB.hasta}` : '';

  const dumbbellVenta = resultado?.porSector.slice(0, 12).map((s) => ({ label: s.sector, a: s.a.imp, b: s.b.imp })) ?? [];
  const dumbbellMargen = resultado?.porSector.slice(0, 12).map((s) => ({ label: s.sector, a: s.a.margen, b: s.b.margen })) ?? [];

  const exportar = () => {
    if (!resultado) return;
    exportXlsxMultiSheet(`analisis-directivo-${stamp()}.xlsx`, [
      {
        name: 'Por sector', rows: resultado.porSector.map((s) => ({
          Sector: s.sector, [`Venta ${labelA}`]: s.a.imp, [`Venta ${labelB}`]: s.b.imp,
          [`Margen aprox. ${labelA}`]: s.a.margen, [`Margen aprox. ${labelB}`]: s.b.margen,
        })),
      },
      {
        name: 'Por gerente', rows: resultado.porGerente.map((g) => ({
          Gerente: g.gerente, [`Venta ${labelA}`]: g.a.imp, [`Venta ${labelB}`]: g.b.imp,
          [`Margen aprox. ${labelA}`]: g.a.margen, [`Margen aprox. ${labelB}`]: g.b.margen,
        })),
      },
      {
        name: 'Por grupo cliente', rows: resultado.porGrupoCliente.map((g) => ({
          'Grupo cliente': g.grupo, [`Venta ${labelA}`]: g.a.imp, [`Venta ${labelB}`]: g.b.imp,
          [`Margen aprox. ${labelA}`]: g.a.margen, [`Margen aprox. ${labelB}`]: g.b.margen,
        })),
      },
      { name: 'Altas', rows: resultado.altas.map((c) => ({ Cliente: c.razon || c.code, Ejecutivo: c.ejec, Grupo: c.grupo, [`Venta ${labelB}`]: c.impB })) },
      { name: 'Recuperados', rows: resultado.recuperados.map((c) => ({ Cliente: c.razon || c.code, Ejecutivo: c.ejec, Grupo: c.grupo, [`Venta ${labelB}`]: c.impB })) },
      { name: 'Bajas', rows: resultado.bajas.map((c) => ({ Cliente: c.razon || c.code, Ejecutivo: c.ejec, Grupo: c.grupo, [`Venta ${labelA}`]: c.impA })) },
      { name: 'Top 10 clientes', rows: resultado.topClientes.map((c, i) => ({ '#': i + 1, Cliente: c.razon || c.code, Estado: c.estado, Ejecutivo: c.ejec, Grupo: c.grupo, [`Venta ${labelA}`]: c.impA, [`Venta ${labelB}`]: c.impB, '% de la venta B': Number(c.share.toFixed(2)) })) },
      { name: 'Por ejecutivo', rows: resultado.porEjecutivo.map((e) => ({ Ejecutivo: e.ejecutivo, [`Venta ${labelA}`]: e.a, [`Venta ${labelB}`]: e.b, Altas: e.altas, Recuperados: e.recuperados, Bajas: e.bajas })) },
      { name: 'En riesgo (deterioro)', rows: resultado.deterioro.map((c) => ({ Cliente: c.razon || c.code, Ejecutivo: c.ejec, Grupo: c.grupo, 'Última compra': c.ultimaCompra, 'Sin comprar (meses)': c.sinComprar, 'Total 12m previos': c.total, 'Promedio mensual': c.promMensual })) },
    ]);
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto bg-bg p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Análisis por Gerencia</h2>
          <p className="text-sm text-text-muted">Venta, rendimiento aproximado y clientes por Gerencia</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!resultado}>
          <Download className="mr-1 size-3.5" />Exportar
        </Button>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div title="Acota todo el análisis a los sectores que ese gerente tiene a su cargo (pestaña GERENCIA DE MARCA).">
          <GerenteSelect enrich={a.enrich} value={gerente} onChange={setGerente} />
        </div>
        <div title="Acota a un sector específico del catálogo.">
          <Select value={sector} onChange={(ev) => setSector(ev.target.value)} className="w-auto">
            <option value="">Sector (todos)</option>{sectorOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </div>
        <div title="Acota a un grupo de artículo específico del catálogo.">
          <Select value={grupoArticulo} onChange={(ev) => setGrupoArticulo(ev.target.value)} className="w-auto">
            <option value="">Grupo artículo (todos)</option>{grupoArticuloOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </div>
        <MultiSelect label="Grupo cliente" options={grupoClienteOptions} selected={grupoClientes} onChange={setGrupoClientes} />
        <div className="h-6 w-px bg-border" />
        <div title="Periodo base de la comparación — normalmente el más antiguo (ej. el año o mes pasado).">
          <MonthRangeFilter label="Periodo A" desde={periodoA.desde} hasta={periodoA.hasta} onChange={setPeriodoA} />
        </div>
        <div title="Periodo que se compara contra el A — normalmente el más reciente (ej. el año o mes actual).">
          <MonthRangeFilter label="Periodo B" desde={periodoB.desde} hasta={periodoB.hasta} onChange={setPeriodoB} />
        </div>
      </Card>

      {!listo && <EmptyState title="Elige los dos periodos a comparar." description="Periodo A = base, Periodo B = el que se compara contra A (por ejemplo, el año pasado vs. el actual)." />}

      {listo && !a.rf && <EmptyState title="Sin Resumen de Facturación cargado." action={{ to: '/carga', label: 'Ir a Carga' }} />}

      {resultado && (
        <>
          <Card className="flex items-start gap-3 border-accent/30 bg-accent-soft/40 p-4 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
            <p>{narrativa}</p>
          </Card>

          <div>
            <p className="mb-2 text-sm font-semibold text-text-muted">Finanzas</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <StatTile
                icon={DollarSign} label={`Venta ${labelB}`} value={formatCurrency(resultado.totalB.imp)}
                deltaFrom={resultado.totalA.imp} deltaTo={resultado.totalB.imp} sub={`vs ${labelA}`}
                hint={`Importe facturado total en ${labelB}, comparado contra ${labelA}.`}
              />
              <StatTile
                icon={PiggyBank} label={`Rendimiento aprox. ${labelB}`} value={formatCurrency(resultado.totalB.margen)}
                deltaFrom={resultado.totalA.margen} deltaTo={resultado.totalB.margen} sub={`vs ${labelA}`}
                hint="Importe facturado menos costo VIGENTE del catálogo × cantidad. Es una aproximación: no hay histórico de costo, así que meses pasados usan el costo de hoy."
              />
              <StatTile
                icon={Users} label="Clientes activos" value={formatNumber(resultado.penetracion.activosB)}
                sub={`Penetración ${resultado.penetracion.universo ? ((resultado.penetracion.activosB / resultado.penetracion.universo) * 100).toFixed(1) : '0'}% de ${formatNumber(resultado.penetracion.universo)}`}
                hint="Clientes con al menos una compra en el periodo B, sobre el universo total de clientes con historial de compra."
              />
            </div>
          </div>

          {aniosDisponibles.length > 0 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text-muted" title="Evolución mes a mes de TODO el histórico de Resumen de Facturación, un color por año — línea punteada = promedio proyectado para los meses que aún no cierran del año en curso.">
                  Evolución anual — histórico completo
                </p>
                <div className="flex flex-wrap items-center gap-1.5" title="Elige qué años superponer en las gráficas de abajo.">
                  {aniosDisponibles.map((y) => (
                    <button
                      key={y}
                      type="button"
                      aria-pressed={aniosActivos.includes(y)}
                      onClick={() => toggleAnio(y)}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums transition-colors',
                        aniosActivos.includes(y) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-faint hover:border-accent/50 hover:text-text',
                      )}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              {anioActual && (
                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <StatTile
                    hero icon={Sparkles} label={`Proyección cierre ${anioActual.anio}`} value={formatCurrency(proyeccionCierre)}
                    hint={`Suma de los meses ya facturados de ${anioActual.anio} + el promedio mensual real (${formatCurrency(anioActual.promedioImpReal)}) aplicado a los meses que faltan. Es "si el ritmo se mantiene", no un pronóstico estadístico.`}
                  />
                  {totalAnioAnterior != null && (
                    <StatTile
                      icon={DollarSign} label={`${anioActual.anio} proyectado vs ${anioActual.anio - 1}`} value={pctTxt(totalAnioAnterior, proyeccionCierre)}
                      valueClass={deltaTone(pct(totalAnioAnterior, proyeccionCierre))}
                      hint={`Compara la proyección de cierre de ${anioActual.anio} contra la venta total ya cerrada de ${anioActual.anio - 1} (${formatCurrency(totalAnioAnterior)}).`}
                    />
                  )}
                  <StatTile
                    icon={CalendarDays} label="Meses reales considerados" value={String(anioActual.meses.filter((m) => !m.esProyeccion).length)}
                    hint="Cuántos meses de Resumen_Fac ya tienen dato real para este año — entre más meses, más confiable el promedio de proyección."
                  />
                </div>
              )}

              <FacturacionMensualCard
                anios={anios}
                serieFiltro={serieFiltro}
                onMonth={(mes) => a.rf && openPanel({ type: 'mesClientesFiltro', mes, rows: clientesDeMes(a.rf, a.enrich, filters, mes) })}
              />
              {anioActual && (
                <p className="mt-1.5 text-[11px] text-text-faint">
                  La línea punteada de {anioActual.anio} proyecta los meses que faltan al promedio mensual real hasta ahora ({formatCurrency(anioActual.promedioImpReal)}/mes) — no es un pronóstico, es "si el ritmo se mantiene".
                </p>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-text-muted" title="Compara los dos periodos elegidos, no el año completo.">
              Venta y Rendimiento por sector — {labelA} vs {labelB}
            </p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <p className="mb-2 text-xs font-semibold text-text-muted">Venta</p>
                <DumbbellChart rows={dumbbellVenta} labelA={labelA} labelB={labelB} />
              </Card>
              <Card className="p-4">
                <p className="mb-2 text-xs font-semibold text-text-muted">Rendimiento aproximado</p>
                <DumbbellChart rows={dumbbellMargen} labelA={labelA} labelB={labelB} />
              </Card>
            </div>
          </div>

          {(resultado.porGerente.length > 1 || resultado.porGrupoCliente.length > 1) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {resultado.porGerente.length > 1 && (
                <Card className="p-4">
                  <p className="mb-2 text-sm font-semibold text-text-muted">Por gerente de marca</p>
                  <ComparativoTable rows={resultado.porGerente} nombreDe={(g) => g.gerente} labelA={labelA} labelB={labelB} />
                </Card>
              )}
              {resultado.porGrupoCliente.length > 1 && (
                <Card className="p-4">
                  <p className="mb-2 text-sm font-semibold text-text-muted" title="Grupo de cliente (Gpo. Cte. del catálogo) — respeta el filtro de Grupo cliente elegido arriba.">Por grupo de cliente</p>
                  <ComparativoTable rows={resultado.porGrupoCliente} nombreDe={(g) => g.grupo} labelA={labelA} labelB={labelB} />
                </Card>
              )}
            </div>
          )}

          <ClientesSection resultado={resultado} labelA={labelA} labelB={labelB} deterioroCard={
              <Card className="border-danger/30 p-4">
                <p
                  className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-danger"
                  title="Clientes con al menos 3 meses de compra y entre 3 y 24 meses sin volver a comprar, calculado solo con los materiales que pasan los filtros de arriba (Gerente, Sector, Grupo artículo, Grupo cliente). Total = facturado en los 12 meses previos a su última compra; Prom./mes = total ÷ 12. Ordenado de mayor a menor total."
                >
                  <AlertTriangle className="size-3.5" />En riesgo de deterioro ({resultado.deterioro.length})
                </p>
                <p className="mb-2 text-[10px] text-text-faint">Ordenado por lo que facturaba (12m previos a su última compra)</p>
                {resultado.deterioro.length ? (
                  <div className="max-h-96 overflow-y-auto pr-1 text-xs">
                    <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-border bg-bg-elevated pb-1 text-[10px] font-medium text-text-faint">
                      <span>Cliente</span>
                      <span className="text-right" title="Meses desde su última compra">Sin comprar</span>
                      <span className="text-right" title="Facturado en los 12 meses previos a su última compra">Total 12m</span>
                      <span className="text-right" title="Total 12m ÷ 12">Prom./mes</span>
                    </div>
                    {resultado.deterioro.map((c) => (
                      <div
                        key={c.code}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 border-b border-border/60 py-1"
                        title={`${c.razon || c.code}${c.ejec ? ` · ${c.ejec}` : ''}${c.grupo ? ` · ${c.grupo}` : ''}\nÚltima compra: ${c.ultimaCompra}`}
                      >
                        <span className="min-w-0 truncate">{c.razon || c.code}</span>
                        <span className="text-right text-danger tabular-nums">{c.sinComprar}m</span>
                        <span className="text-right font-medium tabular-nums">{formatCurrency(c.total)}</span>
                        <span className="text-right tabular-nums text-text-muted">{formatCurrency(c.promMensual)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-text-muted">Sin clientes en riesgo con estos filtros.</p>}
              </Card>
          } />
        </>
      )}
    </div>
  );
}

function ComparativoTable<T extends { a: { imp: number }; b: { imp: number } }>({ rows, nombreDe, labelA, labelB }: {
  rows: T[];
  nombreDe: (row: T) => string;
  labelA: string;
  labelB: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead className="text-right">{`Venta ${labelA}`}</TableHead>
          <TableHead className="text-right">{`Venta ${labelB}`}</TableHead>
          <TableHead className="text-right" title="Variación porcentual de venta entre los dos periodos.">Δ%</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          const p = pct(row.a.imp, row.b.imp);
          return (
            <TableRow key={i}>
              <TableCell>{nombreDe(row)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.a.imp)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.b.imp)}</TableCell>
              <TableCell className={cn('flex items-center justify-end gap-1 text-right font-medium', deltaTone(p))}><DeltaIcon p={p} />{pctTxt(row.a.imp, row.b.imp)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

type Resultado = NonNullable<ReturnType<typeof analisisDirectivo>>;

/** Sección "Clientes" — la cartera vista como un BI: KPIs de retención, el
 * puente que explica el cambio de venta por movimiento de clientes, la
 * composición de la cartera, las listas COMPLETAS de altas/recuperados/bajas
 * con su impacto en $, el riesgo de deterioro, la concentración (top 10),
 * la vista por ejecutivo y por grupo de cliente. */
function ClientesSection({ resultado, labelA, labelB, deterioroCard }: { resultado: Resultado; labelA: string; labelB: string; deterioroCard: React.ReactNode }) {
  const { cartera: c, puente: p } = resultado;
  const ventaB = p.ventaB;
  const pctDeB = (n: number) => (ventaB ? `${((n / ventaB) * 100).toFixed(1)}% de la venta ${labelB}` : '');
  const dumbbellGrupo = resultado.porGrupoCliente.slice(0, 12).map((g) => ({ label: g.grupo, a: g.a.imp, b: g.b.imp }));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-text-muted">Clientes — cómo cambió la cartera de {labelA} a {labelB}</p>
        <p className="text-[11px] text-text-faint">Todos los números respetan los filtros de arriba. Un cliente es "activo" si compró en el periodo.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <StatTile
          hero icon={Users} label="Clientes activos" value={formatNumber(c.activosB)}
          deltaFrom={c.activosA} deltaTo={c.activosB} sub={`vs ${formatNumber(c.activosA)} en A`}
          hint={`Clientes con compra en ${labelB}, comparado contra los de ${labelA}.`}
        />
        <StatTile
          icon={ShieldCheck} label="Retención" value={c.retencionPct == null ? '—' : `${c.retencionPct.toFixed(1)}%`}
          valueClass={c.retencionPct == null ? undefined : c.retencionPct >= 85 ? 'text-success' : c.retencionPct < 70 ? 'text-danger' : 'text-warning'}
          sub={`${formatNumber(c.retenidos)} de ${formatNumber(c.activosA)} siguen`}
          hint="De los clientes que compraron en el periodo A, qué porcentaje volvió a comprar en el B. Arriba de 85% es sano; abajo de 70% requiere atención."
        />
        <StatTile
          icon={UserPlus} label="Altas" value={formatNumber(c.altas)} sub={`+${formatCurrency(p.altas)}`}
          hint={`Clientes que compraron por primera vez en ${labelB}. Aportaron ${formatCurrency(p.altas)} (${pctDeB(p.altas)}).`}
        />
        <StatTile
          icon={UserCheck} label="Recuperados" value={formatNumber(c.recuperados)} sub={`+${formatCurrency(p.recuperados)}`}
          hint={`Clientes que ya habían comprado, no compraron en ${labelA} y volvieron en ${labelB}. Aportaron ${formatCurrency(p.recuperados)}.`}
        />
        <StatTile
          icon={UserMinus} label="Bajas" value={formatNumber(c.bajas)} sub={`${c.bajaPct == null ? '' : `${c.bajaPct.toFixed(1)}% · `}−${formatCurrency(-p.bajas)}`}
          hint={`Clientes que compraron en ${labelA} y NO en ${labelB}. Facturaban ${formatCurrency(-p.bajas)} en A.`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="text-xs font-semibold text-text-muted">¿De dónde salió el cambio de venta? — puente {labelA} → {labelB}</p>
          <p className="mb-2 text-[11px] text-text-faint">Cada barra suma o resta al total según lo que hicieron los clientes; llega exacto a la venta de {labelB}.</p>
          <PuenteVentaChart puente={p} labelA={labelA} labelB={labelB} />
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-text-muted">Composición de la cartera</p>
          <p className="mb-3 text-[11px] text-text-faint">Clientes activos en cada periodo y de dónde vienen.</p>
          <ComposicionCartera cartera={c} labelA={labelA} labelB={labelB} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListaMovimiento
          titulo="Altas" icono={UserPlus} tono="success" filas={resultado.altas} campo="impB" total={p.altas} totalLabel="aportado"
          pctDeVenta={ventaB ? (p.altas / ventaB) * 100 : null}
          hint={`Clientes que compraron por primera vez en ${labelB}. Ordenados por lo que compraron.`} vacio="Sin clientes nuevos en el periodo."
        />
        <ListaMovimiento
          titulo="Recuperados" icono={UserCheck} tono="info" filas={resultado.recuperados} campo="impB" total={p.recuperados} totalLabel="aportado"
          pctDeVenta={ventaB ? (p.recuperados / ventaB) * 100 : null}
          hint={`Ya eran clientes, no compraron en ${labelA} y volvieron en ${labelB}.`} vacio="Sin clientes recuperados en el periodo."
        />
        <ListaMovimiento
          titulo="Bajas del periodo" icono={UserMinus} tono="danger" filas={resultado.bajas} campo="impA" total={-p.bajas} totalLabel="que facturaban"
          pctDeVenta={p.ventaA ? (-p.bajas / p.ventaA) * 100 : null} pctRef={`de la venta ${labelA}`}
          hint={`Compraron en ${labelA} y no en ${labelB}. Ordenados por lo que facturaban en A — son los que más duele perder.`} vacio="Ningún cliente dejó de comprar entre los dos periodos."
        />
        {deterioroCard}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted" title="Los 10 clientes con más venta en el periodo B y qué parte de la venta representan.">
            <Trophy className="size-3.5" />Top 10 clientes — concentración
          </p>
          <p className="mb-2 text-[11px] text-text-faint">
            Los 10 principales concentran <span className={cn('font-semibold', resultado.concentracionTop10 >= 60 ? 'text-danger' : 'text-text')}>{resultado.concentracionTop10.toFixed(0)}%</span> de la venta de {labelB}
            {resultado.concentracionTop10 >= 60 ? ' — cartera muy concentrada, riesgo si uno cae.' : '.'}
          </p>
          <TopClientes rows={resultado.topClientes} />
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-text-muted" title="Cada ejecutivo con su venta A vs B y cuántos clientes ganó, recuperó o perdió.">Por ejecutivo</p>
          <p className="mb-2 text-[11px] text-text-faint">Venta, variación y movimiento de clientes de cada cartera.</p>
          <PorEjecutivo rows={resultado.porEjecutivo} />
        </Card>
      </div>

      {dumbbellGrupo.length > 1 && (
        <Card className="p-4">
          <p className="text-xs font-semibold text-text-muted" title="Venta de cada grupo de cliente en los dos periodos.">Venta por grupo de cliente — {labelA} vs {labelB}</p>
          <p className="mb-2 text-[11px] text-text-faint">Qué canal creció y cuál cayó.</p>
          <DumbbellChart rows={dumbbellGrupo} labelA={labelA} labelB={labelB} />
        </Card>
      )}
    </div>
  );
}

const TONOS = {
  success: { txt: 'text-success', borde: 'border-success/30', barra: 'bg-success/15' },
  info: { txt: 'text-info', borde: 'border-info/30', barra: 'bg-info/15' },
  danger: { txt: 'text-danger', borde: 'border-danger/30', barra: 'bg-danger/15' },
} as const;

/** Lista COMPLETA (sin tope) de un movimiento de clientes, con su impacto total
 * en el encabezado y una barra de fondo proporcional al valor de cada fila. */
function ListaMovimiento({ titulo, icono: Icono, tono, filas, campo, total, totalLabel, pctDeVenta, pctRef, hint, vacio }: {
  titulo: string;
  icono: React.ComponentType<{ className?: string }>;
  tono: keyof typeof TONOS;
  filas: ClienteMovimiento[];
  campo: 'impA' | 'impB';
  total: number;
  totalLabel: string;
  pctDeVenta: number | null;
  pctRef?: string;
  hint: string;
  vacio: string;
}) {
  const t = TONOS[tono];
  const max = Math.max(1, ...filas.map((f) => f[campo]));
  return (
    <Card className={cn('p-4', t.borde)}>
      <p className={cn('flex items-center gap-1.5 text-xs font-semibold', t.txt)} title={hint}>
        <Icono className="size-3.5" />{titulo} ({formatNumber(filas.length)})
      </p>
      <p className="mb-2 text-[11px] text-text-faint">
        <span className="font-semibold text-text">{formatCurrency(total)}</span> {totalLabel}
        {pctDeVenta != null && filas.length > 0 && <> · {pctDeVenta.toFixed(1)}% {pctRef ?? 'de la venta del periodo B'}</>}
      </p>
      {filas.length === 0 ? <p className="text-xs text-text-muted">{vacio}</p> : (
        <div className="max-h-80 overflow-y-auto pr-1 text-xs">
          <div className="sticky top-0 z-10 flex justify-between border-b border-border bg-bg-elevated pb-1 text-[10px] font-medium text-text-faint">
            <span>Cliente</span><span>{campo === 'impA' ? 'Facturaba (A)' : 'Compró (B)'}</span>
          </div>
          {filas.map((f) => (
            <div key={f.code} className="relative flex items-baseline justify-between gap-2 border-b border-border/60 py-1" title={`${f.razon || f.code}${f.ejec ? ` · ${f.ejec}` : ''}${f.grupo ? ` · ${f.grupo}` : ''}`}>
              <span className={cn('absolute inset-y-0 left-0 rounded-sm', t.barra)} style={{ width: `${(f[campo] / max) * 100}%` }} />
              <span className="relative min-w-0 truncate pl-1">{f.razon || f.code}{f.ejec && <span className="ml-1.5 text-[10px] text-text-faint">{f.ejec}</span>}</span>
              <span className="relative shrink-0 pr-1 font-medium tabular-nums">{formatCurrency(f[campo])}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Dos barras apiladas — clientes activos en A y en B — para ver de dónde
 * viene la cartera de B (retenidos + altas + recuperados) y cuánto se perdió
 * de la de A. Cada segmento lleva su número y la leyenda repite el nombre. */
function ComposicionCartera({ cartera: c, labelA, labelB }: { cartera: Resultado['cartera']; labelA: string; labelB: string }) {
  const max = Math.max(1, c.activosA, c.activosB);
  const segs = (items: { n: number; cls: string; nombre: string }[]) => (
    <div className="flex h-7 overflow-hidden rounded-md">
      {items.filter((i) => i.n > 0).map((i) => (
        <div key={i.nombre} title={`${i.nombre}: ${i.n}`} className={cn('flex items-center justify-center text-[11px] font-semibold text-accent-fg', i.cls)} style={{ width: `${(i.n / max) * 100}%` }}>
          {i.n / max > 0.07 ? i.n : ''}
        </div>
      ))}
    </div>
  );
  const leyenda = [
    { cls: 'bg-text-faint', nombre: 'Retenidos', n: c.retenidos, hint: 'Compraron en A y en B' },
    { cls: 'bg-success', nombre: 'Altas', n: c.altas, hint: 'Nuevos en B' },
    { cls: 'bg-info', nombre: 'Recuperados', n: c.recuperados, hint: 'Volvieron en B' },
    { cls: 'bg-danger', nombre: 'Bajas', n: c.bajas, hint: 'Compraron en A, no en B' },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 flex justify-between text-[11px] text-text-muted"><span>{labelA}</span><span className="tabular-nums">{formatNumber(c.activosA)} activos</span></p>
        {segs([{ n: c.retenidos, cls: 'bg-text-faint', nombre: 'Retenidos' }, { n: c.bajas, cls: 'bg-danger', nombre: 'Bajas' }])}
      </div>
      <div>
        <p className="mb-1 flex justify-between text-[11px] text-text-muted"><span>{labelB}</span><span className="tabular-nums">{formatNumber(c.activosB)} activos</span></p>
        {segs([{ n: c.retenidos, cls: 'bg-text-faint', nombre: 'Retenidos' }, { n: c.altas, cls: 'bg-success', nombre: 'Altas' }, { n: c.recuperados, cls: 'bg-info', nombre: 'Recuperados' }])}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px]">
        {leyenda.map((l) => (
          <span key={l.nombre} className="flex items-center gap-1.5" title={l.hint}>
            <span className={cn('inline-block size-2.5 rounded-sm', l.cls)} />
            <span className="text-text-muted">{l.nombre}</span><span className="ml-auto font-semibold tabular-nums">{formatNumber(l.n)}</span>
          </span>
        ))}
      </div>
      {c.retenidos > 0 && (
        <p className="text-[11px] text-text-faint">De los {formatNumber(c.retenidos)} retenidos, <span className="text-success">{formatNumber(c.retenidosCrecen)} compraron más</span> y <span className="text-danger">{formatNumber(c.retenidosCaen)} compraron menos</span>.</p>
      )}
    </div>
  );
}

const ESTADO_TXT: Record<string, { txt: string; cls: string }> = {
  alta: { txt: 'Alta', cls: 'bg-success/15 text-success' },
  recuperado: { txt: 'Recuperado', cls: 'bg-info/15 text-info' },
  retenido: { txt: 'Retenido', cls: 'bg-bg-inset text-text-faint' },
};

function TopClientes({ rows }: { rows: Resultado['topClientes'] }) {
  if (!rows.length) return <p className="text-xs text-text-muted">Sin ventas en el periodo B.</p>;
  const max = Math.max(...rows.map((r) => r.share), 1);
  return (
    <div className="text-xs">
      {rows.map((r, i) => {
        const d = r.impB - r.impA;
        return (
          <div key={r.code} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-2 border-b border-border/60 py-1.5" title={`${r.razon || r.code}${r.ejec ? ` · ${r.ejec}` : ''}${r.grupo ? ` · ${r.grupo}` : ''}\nA: ${formatCurrency(r.impA)} → B: ${formatCurrency(r.impB)}`}>
            <span className="text-[10px] tabular-nums text-text-faint">{i + 1}</span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5">
                <span className="truncate font-medium">{r.razon || r.code}</span>
                <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium', ESTADO_TXT[r.estado].cls)}>{ESTADO_TXT[r.estado].txt}</span>
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-bg-inset"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.share / max) * 100}%` }} /></div>
                <span className="w-9 text-right text-[10px] tabular-nums text-text-muted">{r.share.toFixed(1)}%</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{formatCurrency(r.impB)}</p>
              <p className={cn('flex items-center justify-end gap-0.5 text-[10px] tabular-nums', d > 0 ? 'text-success' : d < 0 ? 'text-danger' : 'text-text-faint')}>
                {d > 0 ? <TrendingUp className="size-3" /> : d < 0 ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
                {d > 0 ? '+' : ''}{formatCurrency(d)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PorEjecutivo({ rows }: { rows: Resultado['porEjecutivo'] }) {
  if (!rows.length) return <p className="text-xs text-text-muted">Sin datos por ejecutivo.</p>;
  return (
    <div className="max-h-96 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ejecutivo</TableHead>
            <TableHead className="text-right">Venta B</TableHead>
            <TableHead className="text-right" title="Variación de venta entre A y B.">Δ%</TableHead>
            <TableHead className="text-right text-success" title="Clientes nuevos">Altas</TableHead>
            <TableHead className="text-right text-info" title="Clientes recuperados">Recup.</TableHead>
            <TableHead className="text-right text-danger" title="Clientes que dejaron de comprar">Bajas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => {
            const p = pct(e.a, e.b);
            return (
              <TableRow key={e.ejecutivo}>
                <TableCell className="max-w-40 truncate" title={`${e.ejecutivo} · ${e.activosB} clientes activos`}>{e.ejecutivo}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(e.b)}</TableCell>
                <TableCell className={cn('text-right font-medium tabular-nums', deltaTone(p))}>{pctTxt(e.a, e.b)}</TableCell>
                <TableCell className="text-right tabular-nums">{e.altas || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{e.recuperados || '—'}</TableCell>
                <TableCell className={cn('text-right tabular-nums', e.bajas ? 'font-medium text-danger' : '')}>{e.bajas || '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
