import { useMemo, useState } from 'react';
import { ChevronDown, Filter, PanelRightOpen } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/layout/report';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn, formatCurrency } from '@/lib/utils';
import type { PtoFila, VentasPtoRow } from '@/core/facturacionLibros';
import { esMesValido, mesCanon, mesKey, mesLabel } from '@/core/resumenFac';
import {
  ETIQUETA_DIM_CUMPL, ORDEN_DIM_CUMPL, mesElegidoPorOmision, mesesDisponibles, ptoPorMes, rangoCumplimiento, rankingCumplimiento, rankingSectorGrupo,
  type DimCumplimiento, type FiltroActivo, type ModoCumplimiento, type ResolverDetalle,
} from '@/core/ventasPto';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';
import { claseCumpl } from './cumplimiento';
import { DetalleColaboradorPto } from './DetalleColaboradorPto';
import { indiceVentasPorVdor } from './useDetalleColaboradorPto';

const pct = (c: number | null): string => (c == null ? '—' : `${Math.round(c * 100)}%`);

const MODOS: { value: ModoCumplimiento; label: string; title: string }[] = [
  { value: 'periodo', label: 'Periodo', title: 'Todo el periodo de la página (como la gráfica de arriba)' },
  { value: 'mes', label: 'Mes', title: 'Un solo mes' },
  { value: 'acum', label: 'Acumulado', title: 'Acumulado del año: de enero hasta el mes elegido' },
];

/** Resumen y desglose del cumplimiento que acompañan a la gráfica unificada «Facturación mensual vs presupuesto». Se puede colapsar (el resumen queda a la vista).
 *  · Vista de TODA la sección: Periodo (el de la página), un Mes, o el Acumulado del año hasta un mes. Resumen, desglose y detalle de colaborador siguen esa vista.
 *  · Resumen: ventas de la gráfica (misma serie, mismos filtros) contra el presupuesto YA filtrado, en la vista elegida.
 *  · Desglose por Región / Gerencia de ventas / Gpo. cliente / Gpo. vendedor / Sector / Grupo de artículo. En Gpo. vendedor se muestra el NOMBRE del colaborador; un clic en
 *    su fila abre debajo su presupuesto y venta mes a mes, y dos botones: filtrar la página por él, o abrir ese detalle en el panel lateral. En las demás dimensiones un clic
 *    APLICA ese valor como filtro de la página, así gráfica, tabla y paneles siguen coincidiendo. */
export function CumplimientoPresupuesto({
  ventasSerie, ventas, pto, lo, hi, mesesSel, ignorados, hayDetalle, storageKey, onFiltrar, nombreDe, a, filtros, sectorPasa, onAbrirColaborador,
}: {
  /** Serie de importe de la gráfica «Facturación mensual» (con todos los filtros): de aquí salen las ventas del resumen, para que coincidan con ella. */
  ventasSerie: readonly { mes: string; imp: number }[];
  /** Ventas por región/gerencia/gpo. (solo con los filtros que tienen esas dimensiones) y presupuesto filtrado. */
  ventas: readonly VentasPtoRow[];
  pto: readonly PtoFila[];
  /** Ventana de meses de la página (escala `mesKey`) y selección concreta de meses. */
  lo: number;
  hi: number;
  mesesSel: ReadonlySet<number> | null;
  /** Filtros activos de la página que el presupuesto no puede aplicar (cliente, material, estado…). */
  ignorados: readonly string[];
  /** Los libros cargados traen presupuesto. */
  hayDetalle: boolean;
  storageKey: string;
  onFiltrar: (dim: DimCumplimiento, clave: string) => void;
  /** Nombre legible de un valor del desglose (colaborador de un gpo. vendedor, nombre de un gpo. cliente); '' si no hay. */
  nombreDe?: (dim: DimCumplimiento, clave: string) => string;
  /** Catálogo y facturación para el detalle del colaborador y el desglose por sector / grupo. */
  a: Pick<Analytics, 'rf' | 'enrich'>;
  /** Filtros activos de la página (el desglose y el detalle aplican los que existen en su dimensión). */
  filtros: readonly FiltroActivo[];
  /** Filtro «Gerente de marca» de la página (sector → gerente), si hay uno. */
  sectorPasa?: (sector: string) => boolean;
  /** Abre el detalle del colaborador en el panel lateral. */
  onAbrirColaborador: (gpoVdor: string, rango: { lo: number; hi: number; meses: number[] | undefined }) => void;
}) {
  const [abierto, setAbierto] = usePersistedState<boolean>(`${storageKey}.cumpl.abierto`, true);
  const [dim, setDim] = usePersistedState<DimCumplimiento>(`${storageKey}.cumpl.dim`, 'region');
  const [modo, setModo] = usePersistedState<ModoCumplimiento>(`${storageKey}.cumpl.modo`, 'periodo');
  const [mesGuardado, setMesGuardado] = usePersistedState<string>(`${storageKey}.cumpl.mes`, '');
  const [colab, setColab] = useState<string | null>(null);

  // ---- Vista: ventana efectiva de meses según Periodo / Mes / Acumulado ----
  const disponibles = useMemo(() => mesesDisponibles(ventasSerie, pto, lo, hi, mesesSel), [ventasSerie, pto, lo, hi, mesesSel]);
  const kOmision = useMemo(() => mesElegidoPorOmision(ventasSerie, disponibles), [ventasSerie, disponibles]);
  // El mes guardado puede ya no existir (otro periodo, otros filtros): entonces se usa el de omisión.
  const kElegido = useMemo(() => {
    const m = mesCanon(mesGuardado);
    return mesGuardado && esMesValido(m) && disponibles.includes(mesKey(m)) ? mesKey(m) : kOmision;
  }, [mesGuardado, disponibles, kOmision]);
  const ef = useMemo(() => rangoCumplimiento(modo, kElegido, lo, hi, mesesSel), [modo, kElegido, lo, hi, mesesSel]);
  const kALbl = (k: number) => `${String(((k - 1) % 12) + 1).padStart(2, '0')}/${Math.floor((k - 1) / 12)}`;
  const etiquetaVista = modo === 'periodo' || kElegido == null
    ? 'Periodo'
    : modo === 'mes' ? mesLabel(kALbl(kElegido)) : `Acumulado ${mesLabel(kALbl(Math.max(ef.lo, 1)))} – ${mesLabel(kALbl(kElegido))}`;

  const ventasTotal = useMemo(() => {
    let t = 0;
    for (const p of ventasSerie) {
      const m = mesCanon(p.mes);
      if (!esMesValido(m)) continue;
      const k = mesKey(m);
      if (k >= ef.lo && k <= ef.hi && (!ef.meses || ef.meses.has(k))) t += p.imp;
    }
    return t;
  }, [ventasSerie, ef]);
  const ptoTotal = useMemo(() => { let t = 0; ptoPorMes(pto, ef.lo, ef.hi, ef.meses).forEach((m) => { t += m; }); return t; }, [pto, ef]);
  const cumpl = ptoTotal > 0 ? ventasTotal / ptoTotal : null;

  // ---- Desglose ----
  const resolver = useMemo<ResolverDetalle>(() => ({
    ejecutivo: (c) => a.enrich.ejecutivoNombre(c),
    grupoCli: (c) => a.enrich.grupoCliente(c) || c,
    ventas: (c) => a.enrich.ejecutivoAtributos(c),
    sector: (m) => a.enrich.matSector(m),
    grupo: (m) => a.enrich.matGrupo(m),
  }), [a.enrich]);
  const ranking = useMemo(() => {
    if (!abierto) return [];
    if (dim === 'sector' || dim === 'grupo') {
      return rankingSectorGrupo(a.rf ? indiceVentasPorVdor(a.rf.rows) : new Map(), pto, dim, filtros, resolver, ef.lo, ef.hi, ef.meses, sectorPasa);
    }
    return rankingCumplimiento(ventas, pto, dim, ef.lo, ef.hi, ef.meses);
  }, [abierto, dim, a.rf, ventas, pto, filtros, resolver, ef, sectorPasa]);

  if (!hayDetalle) {
    return (
      <p className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
        Los libros cargados no traen presupuesto. Verifica que el Apps Script nuevo esté desplegado y sincroniza facturación en modo forzado (Carga → Sincronizar facturación).
      </p>
    );
  }

  const esColab = dim === 'gpoVdor';
  const alClicFila = (clave: string) => {
    if (esColab) setColab((c) => (c === clave ? null : clave));
    else onFiltrar(dim, clave);
  };

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className={cn('size-4 shrink-0 text-text-faint transition-transform duration-150', !abierto && '-rotate-90')} aria-hidden />
        <span className="font-display text-sm font-semibold">Cumplimiento por {ETIQUETA_DIM_CUMPL[dim].toLowerCase()}</span>
        <span className="hidden text-xs text-text-faint sm:inline">· {etiquetaVista}</span>
        <span className="ml-auto text-right text-sm tabular-nums">
          <span className="text-text-muted">Ventas</span> <span className="font-medium">{formatCurrency(ventasTotal)}</span>
          <span className="hidden text-text-muted sm:inline"> de presupuesto </span><span className="hidden font-medium sm:inline">{formatCurrency(ptoTotal)}</span>
          <span className="text-text-muted"> · </span><span className={cn('font-semibold', claseCumpl(cumpl))}>{pct(cumpl)}</span>
        </span>
      </button>

      {abierto && (
        <>
          {/* Vista de toda la sección */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-text-faint">Ver</span>
            <SegmentedControl<ModoCumplimiento> ariaLabel="Vista del cumplimiento" value={modo} onChange={(v) => { setModo(v); setColab(null); }} options={MODOS} />
            {modo !== 'periodo' && (
              <Select
                value={kElegido != null ? kALbl(kElegido) : ''}
                onChange={(e) => setMesGuardado(e.target.value)}
                className="w-auto"
                aria-label={modo === 'mes' ? 'Mes' : 'Acumulado hasta el mes'}
                disabled={disponibles.length === 0}
              >
                {disponibles.length === 0 && <option value="">Sin meses</option>}
                {[...disponibles].reverse().map((k) => <option key={k} value={kALbl(k)}>{modo === 'acum' ? `hasta ${mesLabel(kALbl(k))}` : mesLabel(kALbl(k))}</option>)}
              </Select>
            )}
            <span className="text-[11px] text-text-faint">
              {modo === 'periodo' && 'Todo el periodo de la página.'}
              {modo === 'mes' && 'Solo el mes elegido.'}
              {modo === 'acum' && 'De enero del año del mes elegido hasta ese mes (sin salirse del periodo de la página).'}
            </span>
          </div>

          {ptoTotal === 0 && <p className="text-xs text-text-muted">No hay presupuesto para los filtros y la vista actuales.</p>}
          {ignorados.length > 0 && (
            <p className="text-xs text-text-muted">
              El presupuesto no tiene {ignorados.join(', ')}: {ignorados.length === 1 ? 'ese filtro afecta' : 'esos filtros afectan'} las ventas pero no el presupuesto. Sí respeta Ejecutivo, Grupo cliente, Gerencia / Gerente / Canal / Oficina de ventas, Sector y Grupo de artículo.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-text-faint">Cumplimiento por</span>
            <SegmentedControl<DimCumplimiento>
              ariaLabel="Ver cumplimiento por"
              value={dim}
              onChange={(v) => { setDim(v); setColab(null); }}
              options={ORDEN_DIM_CUMPL.map((d) => ({ value: d, label: ETIQUETA_DIM_CUMPL[d] }))}
            />
            <span className="text-[11px] text-text-faint">
              {esColab ? 'Clic en un colaborador: ver su presupuesto y venta por mes.' : 'Clic en una fila: filtra la página por ese valor.'}
            </span>
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <Table wrapperClassName="overflow-visible">
              <TableHeader><TableRow>
                <TableHead>{esColab ? 'Colaborador (gpo. vendedor)' : ETIQUETA_DIM_CUMPL[dim]}</TableHead>
                <TableHead className="text-right">Ventas</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
                <TableHead className="text-right">% cumpl.</TableHead>
                {esColab && <TableHead className="w-20"><span className="sr-only">Acciones</span></TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {ranking.map((r) => {
                  const nombre = nombreDe?.(dim, r.clave) ?? '';
                  return (
                    <TableRow
                      key={r.clave}
                      className={cn('cursor-pointer', esColab && colab === r.clave && 'bg-accent-soft')}
                      onClick={() => alClicFila(r.clave)}
                      title={esColab ? 'Clic para ver su presupuesto y venta por mes' : 'Clic para filtrar la página por este valor'}
                    >
                      <TableCell>
                        {nombre ? (
                          <><span className="font-medium">{nombre}</span><span className="ml-1.5 text-[11px] text-text-faint">{r.clave}</span></>
                        ) : (
                          <span className="font-medium">{r.clave}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(r.ventas)}</TableCell>
                      <TableCell className="text-right">{r.presupuesto ? formatCurrency(r.presupuesto) : '—'}</TableCell>
                      <TableCell className={cn('text-right font-medium', claseCumpl(r.cumplimiento))}>{pct(r.cumplimiento)}</TableCell>
                      {esColab && (
                        <TableCell className="text-right">
                          <span className="inline-flex gap-0.5">
                            <button type="button" aria-label={`Filtrar la página por ${nombre || r.clave}`} title="Filtrar la página por este colaborador"
                              className="flex size-7 items-center justify-center rounded text-text-muted hover:bg-bg-inset hover:text-text"
                              onClick={(e) => { e.stopPropagation(); onFiltrar('gpoVdor', r.clave); }}><Filter className="size-3.5" /></button>
                            <button type="button" aria-label={`Abrir el detalle de ${nombre || r.clave} en un panel`} title="Abrir el detalle en el panel lateral"
                              className="flex size-7 items-center justify-center rounded text-text-muted hover:bg-bg-inset hover:text-text"
                              onClick={(e) => { e.stopPropagation(); onAbrirColaborador(r.clave, { lo: ef.lo, hi: ef.hi, meses: ef.meses ? [...ef.meses] : undefined }); }}><PanelRightOpen className="size-3.5" /></button>
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {ranking.length === 0 && <TableRow><TableCell colSpan={esColab ? 5 : 4} className="text-center text-text-muted">Sin datos en la vista elegida.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>

          {esColab && colab && (
            <div className="rounded-lg border border-border bg-bg p-3">
              <DetalleColaboradorPto a={a} compacto gpoVdor={colab} lo={ef.lo} hi={ef.hi} meses={ef.meses} filtros={filtros} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
