import { useMemo } from 'react';
import { Download, TrendingUp, TrendingDown, Minus, DollarSign, PiggyBank, Users, UserPlus, UserCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { GerenteSelect } from '@/components/ui/gerente-select';
import { MonthRangeFilter } from '@/modules/analytics/ui/MonthRangeFilter';
import { DumbbellChart } from '@/modules/analytics/ui/DumbbellChart';
import { YearComparisonChart } from '@/modules/analytics/ui/YearComparisonChart';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePersistedState } from '@/hooks/usePersistedState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { analisisDirectivo, buildPeriodo, narrativaDirectivo, serieAnualComparada } from '@/core/analisisDirectivo';
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

function StatTile({ icon: Icon, label, hint, value, deltaFrom, deltaTo, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  value: string;
  deltaFrom?: number;
  deltaTo?: number;
  sub?: string;
}) {
  const p = deltaFrom != null && deltaTo != null ? pct(deltaFrom, deltaTo) : null;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3" title={hint}>
      <div className="flex items-center gap-1.5 text-text-faint"><Icon className="size-3.5" /><p className="text-xs">{label}</p></div>
      <p className="mt-1.5 font-display text-xl font-semibold tabular-nums">{value}</p>
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
      { name: 'En riesgo (deterioro)', rows: resultado.deterioro.map((c) => ({ Cliente: c.razon || c.code, Ejecutivo: c.ejec, 'Sin comprar (meses)': c.sinComprar, 'Base 12m': c.base ?? 0 })) },
    ]);
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto bg-bg p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Análisis Directivo</h2>
          <p className="text-sm text-text-muted">Venta, margen aproximado y clientes — comparativo entre dos periodos, listo para presentar</p>
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
                icon={PiggyBank} label={`Margen aprox. ${labelB}`} value={formatCurrency(resultado.totalB.margen)}
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
                    icon={Sparkles} label={`Proyección cierre ${anioActual.anio}`} value={formatCurrency(proyeccionCierre)}
                    hint={`Suma de los meses ya facturados de ${anioActual.anio} + el promedio mensual real (${formatCurrency(anioActual.promedioImpReal)}) aplicado a los meses que faltan. Es "si el ritmo se mantiene", no un pronóstico estadístico.`}
                  />
                  {totalAnioAnterior != null && (
                    <StatTile
                      icon={DollarSign} label={`${anioActual.anio} proyectado vs ${anioActual.anio - 1}`} value={pctTxt(totalAnioAnterior, proyeccionCierre)}
                      hint={`Compara la proyección de cierre de ${anioActual.anio} contra la venta total ya cerrada de ${anioActual.anio - 1} (${formatCurrency(totalAnioAnterior)}).`}
                    />
                  )}
                  <StatTile
                    icon={Users} label="Meses reales considerados" value={String(anioActual.meses.filter((m) => !m.esProyeccion).length)}
                    hint="Cuántos meses de Resumen_Fac ya tienen dato real para este año — entre más meses, más confiable el promedio de proyección."
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <p className="mb-2 text-xs font-semibold text-text-muted">Venta mensual</p>
                  <YearComparisonChart anios={anios} metric="imp" />
                </Card>
                <Card className="p-4">
                  <p className="mb-2 text-xs font-semibold text-text-muted">Margen aproximado mensual</p>
                  <YearComparisonChart anios={anios} metric="margen" />
                </Card>
              </div>
              {anioActual && (
                <p className="mt-1.5 text-[11px] text-text-faint">
                  La línea punteada de {anioActual.anio} proyecta los meses que faltan al promedio mensual real hasta ahora ({formatCurrency(anioActual.promedioImpReal)}/mes) — no es un pronóstico, es "si el ritmo se mantiene".
                </p>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-text-muted" title="Compara los dos periodos elegidos, no el año completo.">
              Venta y margen por sector — {labelA} vs {labelB}
            </p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <p className="mb-2 text-xs font-semibold text-text-muted">Venta</p>
                <DumbbellChart rows={dumbbellVenta} labelA={labelA} labelB={labelB} />
              </Card>
              <Card className="p-4">
                <p className="mb-2 text-xs font-semibold text-text-muted">Margen aproximado</p>
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

          <div>
            <p className="mb-2 text-sm font-semibold text-text-muted">Clientes</p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="border-success/30 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-success" title="Clientes cuya primera compra registrada cae dentro del periodo B.">
                  <UserPlus className="size-3.5" />Altas ({resultado.altas.length})
                </p>
                <ClienteLista rows={resultado.altas} vacio="Sin clientes nuevos en el periodo." />
              </Card>
              <Card className="border-accent/30 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent" title="Compraron antes, no compraron en el periodo A y volvieron a comprar en el periodo B.">
                  <UserCheck className="size-3.5" />Recuperados ({resultado.recuperados.length})
                </p>
                <ClienteLista rows={resultado.recuperados} vacio="Sin clientes recuperados en el periodo." />
              </Card>
              <Card className="border-danger/30 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-danger" title="Al menos 3 compras históricas y entre 3 y 24 meses sin volver a comprar — mismo criterio que 'En riesgo' de Análisis.">
                  <AlertTriangle className="size-3.5" />En riesgo de deterioro ({resultado.deterioro.length})
                </p>
                {resultado.deterioro.length ? (
                  <div className="flex flex-col gap-1 text-xs">
                    {resultado.deterioro.map((c) => (
                      <div key={c.code} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                        <span className="min-w-0 truncate">{c.razon || c.code}</span>
                        <span className="shrink-0 text-danger">{c.sinComprar}m sin comprar</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-text-muted">Sin clientes en riesgo.</p>}
              </Card>
            </div>
          </div>
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

function ClienteLista({ rows, vacio }: { rows: { code: string; razon: string; impB: number }[]; vacio: string }) {
  if (!rows.length) return <p className="text-xs text-text-muted">{vacio}</p>;
  return (
    <div className="flex flex-col gap-1 text-xs">
      {rows.map((c) => (
        <div key={c.code} className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
          <span className="min-w-0 truncate">{c.razon || c.code}</span>
          <span className="shrink-0 font-medium tabular-nums">{formatCurrency(c.impB)}</span>
        </div>
      ))}
    </div>
  );
}
