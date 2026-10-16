import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow, SortableTableHead } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ReportPage, PageHeader, ExportButton, KpiBand, SegmentedControl, CalculandoIndices, ALTURA_TABLA } from '@/components/layout/report';
import { MonthRangeFilter } from '@/modules/analytics/ui/MonthRangeFilter';
import { PasteCodesChip, PasteCodesFilter } from '@/modules/analytics/ui';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useFacturacionLibros } from '@/modules/analytics/useFacturacionLibros';
import { useFaseFacturacion } from '@/modules/analytics/faseFacturacion';
import { usePanelStore } from '@/store/panelStore';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useSort } from '@/hooks/useSort';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import {
  compararPeriodos, desplazarPeriodo, etiquetaPeriodo, opcionesPeriodo, periodoAnioEnCurso, periodoAnterior, serieMensualMaterial, ultimosMesesCerrados, valorPeriodo, variacionPct,
  type FilaComparativo, type Granularidad, type NivelComparativo, type Periodo, type Ruta,
} from '@/core/comparativoPeriodos';

type Vista = 'comparar' | 'solo';
type Preset = 'anio' | 'm3' | 'm6' | 'm12' | 'libre';

const NIVELES: { value: NivelComparativo; label: string; col: string }[] = [
  { value: 'gerente', label: 'Gerencia', col: 'Gerencia (de marca)' },
  { value: 'sector', label: 'Sector', col: 'Sector' },
  { value: 'grupo', label: 'Grupo artículo', col: 'Grupo de artículo' },
  { value: 'material', label: 'Material', col: 'Material' },
];
const SIGUIENTE: Record<NivelComparativo, NivelComparativo> = { gerente: 'sector', sector: 'grupo', grupo: 'material', material: 'material' };
const CAMPO_RUTA: Record<Exclude<NivelComparativo, 'material'>, keyof Ruta> = { gerente: 'gerente', sector: 'sector', grupo: 'grupo' };
const PRESETS: { value: Preset; label: string; title: string }[] = [
  { value: 'anio', label: 'Año en curso', title: 'De enero del último año con datos hasta el último mes con datos' },
  { value: 'm3', label: 'Últimos 3 meses', title: 'Los últimos 3 meses cerrados (sin contar el mes en curso)' },
  { value: 'm6', label: 'Últimos 6 meses', title: 'Los últimos 6 meses cerrados (sin contar el mes en curso)' },
  { value: 'm12', label: 'Últimos 12 meses', title: 'Los últimos 12 meses cerrados (sin contar el mes en curso)' },
  { value: 'libre', label: 'Periodo libre', title: 'Elige tú el mes inicial y el final' },
];

const tono = (p: number) => (p > 0.5 ? 'text-success' : p < -0.5 ? 'text-danger' : 'text-text-faint');
const signo = (n: number) => (n > 0 ? '+' : '');
const pctTxt = (p: number) => `${signo(p)}${p.toFixed(1)}%`;
const precio = (n: number) => (n ? formatCurrency(n) : '—');

/** Módulo "Comparativo de periodos". Dos vistas:
 *  · Comparar: periodo A contra periodo B (mes, trimestre, año o rango libre).
 *  · Un solo periodo (sin comparación): año en curso, últimos meses cerrados o un periodo libre — para ver cómo se ha comportado un material
 *    (venta, cantidad, precio promedio, mínimo y máximo, y el mes a mes).
 * En ambas, por Gerencia → Sector → Grupo de artículo → Material, pudiendo pegar varios materiales. */
export function ComparativoPage() {
  const a = useAnalytics();
  useFacturacionLibros();
  const fase = useFaseFacturacion(a);
  const open = usePanelStore((s) => s.open);

  const [vista, setVista] = usePersistedState<Vista>('comparativo.vista', 'comparar');
  const [gran, setGran] = usePersistedState<Granularidad>('comparativo.gran', 'mes');
  const [periodoA, setPeriodoA] = usePersistedState<Periodo>('comparativo.A', { desde: '', hasta: '' });
  const [periodoB, setPeriodoB] = usePersistedState<Periodo>('comparativo.B', { desde: '', hasta: '' });
  const [preset, setPreset] = usePersistedState<Preset>('comparativo.preset', 'anio');
  const [periodoUnico, setPeriodoUnico] = usePersistedState<Periodo>('comparativo.unico', { desde: '', hasta: '' });
  const [nivel, setNivel] = usePersistedState<NivelComparativo>('comparativo.nivel', 'gerente');
  const [ruta, setRuta] = usePersistedState<Ruta>('comparativo.ruta', {});
  const [pegados, setPegados] = usePersistedState<string[]>('comparativo.pegados', []);
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());

  const solo = vista === 'solo';
  const meses = a.mesesDisponibles;
  const opciones = useMemo(() => (gran === 'rango' ? [] : opcionesPeriodo(gran, meses)), [gran, meses]);

  // Comparar: B = el periodo más reciente de esa granularidad, A = el inmediato anterior.
  const ponerPorOmision = (g: Granularidad) => {
    if (g === 'rango') return;
    const b = opcionesPeriodo(g, meses)[0];
    if (!b) return;
    setPeriodoB({ desde: b.desde, hasta: b.hasta });
    setPeriodoA(periodoAnterior(b));
  };
  useEffect(() => {
    if (!periodoB.desde && opciones[0]) ponerPorOmision(gran);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opciones]);
  const cambiarGran = (g: Granularidad) => { setGran(g); ponerPorOmision(g); };

  // Un solo periodo: el preset calcula el rango; "libre" lo deja como esté.
  const aplicarPreset = (p: Preset) => {
    setPreset(p);
    const r = p === 'anio' ? periodoAnioEnCurso(meses) : p === 'm3' ? ultimosMesesCerrados(meses, 3) : p === 'm6' ? ultimosMesesCerrados(meses, 6) : p === 'm12' ? ultimosMesesCerrados(meses, 12) : null;
    if (r) setPeriodoUnico(r);
  };
  useEffect(() => {
    if (solo && meses.length && (!periodoUnico.desde || preset !== 'libre')) aplicarPreset(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo, meses, preset]);

  const periodoVisto: Periodo = solo ? periodoUnico : periodoB;
  const listo = solo ? !!(periodoUnico.desde && periodoUnico.hasta) : !!(periodoA.desde && periodoA.hasta && periodoB.desde && periodoB.hasta);
  const labelA = !solo && listo ? etiquetaPeriodo(periodoA) : 'A';
  const labelB = listo ? etiquetaPeriodo(periodoVisto) : 'B';

  const resultado = useMemo(
    () => (listo && a.facturacion.rf ? compararPeriodos(a.facturacion.rf, a.enrich, solo ? null : periodoA, periodoVisto, nivel, ruta, pegados) : null),
    [listo, solo, a.facturacion.rf, a.enrich, periodoA, periodoVisto, nivel, ruta, pegados],
  );
  const filas = resultado?.filas ?? [];

  // Pegar materiales lleva directo al nivel Material (es lo que se espera ver).
  const cambiarPegados = (codes: string[]) => {
    if (codes.length && !pegados.length) setNivel('material');
    setPegados(codes);
  };

  const bajar = (f: FilaComparativo) => {
    if (nivel === 'material') {
      if (solo) setAbiertos((prev) => { const n = new Set(prev); if (n.has(f.clave)) n.delete(f.clave); else n.add(f.clave); return n; });
      else open({ type: 'material', material: f.clave });
      return;
    }
    setRuta({ ...ruta, [CAMPO_RUTA[nivel]]: f.clave });
    setNivel(SIGUIENTE[nivel]);
  };
  const quitarRuta = (campo: keyof Ruta) => {
    const orden: (keyof Ruta)[] = ['gerente', 'sector', 'grupo'];
    const next: Ruta = { ...ruta };
    for (const c of orden.slice(orden.indexOf(campo))) delete next[c];
    setRuta(next);
    setNivel(campo === 'grupo' ? 'grupo' : campo === 'sector' ? 'sector' : 'gerente');
  };

  const total = resultado?.total;
  const acc = useMemo(() => ({
    clave: (f: FilaComparativo) => f.clave,
    ventaA: (f: FilaComparativo) => f.a.imp, ventaB: (f: FilaComparativo) => f.b.imp,
    dImp: (f: FilaComparativo) => f.dImp, dImpPct: (f: FilaComparativo) => f.dImpPct,
    cantA: (f: FilaComparativo) => f.a.cant, cantB: (f: FilaComparativo) => f.b.cant, dCantPct: (f: FilaComparativo) => f.dCantPct,
    promA: (f: FilaComparativo) => f.precios?.a.prom ?? 0, promB: (f: FilaComparativo) => f.precios?.b.prom ?? 0, dProm: (f: FilaComparativo) => f.precios?.dPromPct ?? 0,
    minA: (f: FilaComparativo) => f.precios?.a.min ?? 0, minB: (f: FilaComparativo) => f.precios?.b.min ?? 0,
    maxA: (f: FilaComparativo) => f.precios?.a.max ?? 0, maxB: (f: FilaComparativo) => f.precios?.b.max ?? 0,
    share: (f: FilaComparativo) => f.b.imp, mesesVenta: (f: FilaComparativo) => f.precios?.b.meses ?? 0,
  }), []);
  const { sorted, sortKey, dir, toggleSort } = useSort(filas, acc);
  // Sin elegir un orden: en comparar, por mayor cambio; en un solo periodo, por mayor venta.
  const visibles = useMemo(() => (solo && !sortKey ? [...sorted].sort((x, y) => y.b.imp - x.b.imp) : sorted), [solo, sortKey, sorted]);

  const exportar = () => {
    if (!resultado) return;
    const esMat = nivel === 'material';
    const col = NIVELES.find((n) => n.value === nivel)!.col;
    const rows = visibles.map((f) => (solo
      ? {
        [col]: f.clave,
        ...(esMat ? { Descripción: f.descripcion } : { Materiales: f.materiales }),
        [`Venta ${labelB}`]: f.b.imp, [`Cant. ${labelB}`]: f.b.cant,
        ...(esMat && f.precios ? {
          'Precio prom.': f.precios.b.prom, 'Precio mín.': f.precios.b.min, 'Mes del mín.': f.precios.b.mesMin,
          'Precio máx.': f.precios.b.max, 'Mes del máx.': f.precios.b.mesMax, 'Meses con venta': f.precios.b.meses,
        } : {}),
      }
      : {
        [col]: f.clave,
        ...(esMat ? { Descripción: f.descripcion } : { Materiales: f.materiales }),
        [`Venta ${labelA}`]: f.a.imp, [`Venta ${labelB}`]: f.b.imp, 'Δ Venta': f.dImp, 'Δ Venta %': Number(f.dImpPct.toFixed(2)),
        [`Cant. ${labelA}`]: f.a.cant, [`Cant. ${labelB}`]: f.b.cant, 'Δ Cant. %': Number(f.dCantPct.toFixed(2)),
        ...(esMat && f.precios ? {
          [`Precio prom. ${labelA}`]: f.precios.a.prom, [`Precio prom. ${labelB}`]: f.precios.b.prom, 'Δ Precio prom. %': Number(f.precios.dPromPct.toFixed(2)),
          [`Precio mín. ${labelA}`]: f.precios.a.min, [`Precio mín. ${labelB}`]: f.precios.b.min,
          [`Precio máx. ${labelA}`]: f.precios.a.max, [`Precio máx. ${labelB}`]: f.precios.b.max,
        } : {}),
      }));
    void exportXlsx(solo ? `periodo-${labelB}-${stamp()}.xlsx` : `comparativo-${labelA}-vs-${labelB}-${stamp()}.xlsx`, rows, solo ? 'Periodo' : 'Comparativo');
  };

  const selector = (cual: 'A' | 'B') => {
    const p = cual === 'A' ? periodoA : periodoB;
    const set = cual === 'A' ? setPeriodoA : setPeriodoB;
    const valor = p.desde ? valorPeriodo(p) : '';
    const enLista = opciones.some((o) => o.valor === valor);
    return (
      <label className="flex items-center gap-1.5 text-sm" title={cual === 'A' ? 'Periodo base — normalmente el más antiguo.' : 'Periodo que se compara contra el A — normalmente el más reciente.'}>
        <span className="font-medium text-text-muted">Periodo {cual}</span>
        <Select value={valor} onChange={(ev) => { const o = opciones.find((x) => x.valor === ev.target.value); if (o) set({ desde: o.desde, hasta: o.hasta }); }} className="w-auto" aria-label={`Periodo ${cual}`}>
          {!enLista && valor && <option value={valor}>{etiquetaPeriodo(p)}</option>}
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </Select>
      </label>
    );
  };

  if (!a.facturacion.rf) {
    if (fase.fase === 'error') return <EmptyState title="No se pudo cargar la facturación." description={fase.texto} action={{ to: '/carga', label: 'Ir a Carga' }} />;
    if (fase.fase !== 'vacia') return <CalculandoIndices titulo={fase.texto || 'Calculando facturación…'} progreso={fase.fase === 'calculando' ? a.facturacionProgreso : (fase.porcentaje ?? 0) / 100} />;
    return <EmptyState title="Aún no se han sincronizado los libros de Facturación." description="Sincroniza la facturación desde Carga." action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  const dTotal = total ? total.b.imp - total.a.imp : 0;
  const pTotal = total ? variacionPct(total.a.imp, total.b.imp) : 0;
  const esMaterial = nivel === 'material';
  const colNivel = NIVELES.find((n) => n.value === nivel)!.col;
  const rutaChips = (['gerente', 'sector', 'grupo'] as const).filter((c) => ruta[c]);
  const nCols = (esMaterial ? 1 : 2) + (solo ? 3 : 7) + (esMaterial ? (solo ? 6 : 7) : 0);

  return (
    <ReportPage>
      <PageHeader
        title="Comparativo de periodos"
        subtitle={solo
          ? <>Un solo periodo, sin comparación · por Gerencia, Sector, Grupo de artículo y Material · precios mínimo, máximo y promedio</>
          : <>Periodo A vs periodo B por Gerencia, Sector, Grupo de artículo y Material · precios mínimo, máximo y promedio por material</>}
        actions={<ExportButton onClick={exportar} />}
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <SegmentedControl<Vista>
          ariaLabel="Vista"
          value={vista}
          onChange={setVista}
          options={[{ value: 'comparar', label: 'Comparar A vs B' }, { value: 'solo', label: 'Un solo periodo' }]}
        />
        <div className="h-6 w-px bg-border" />
        {solo ? (
          <>
            <SegmentedControl<Preset> ariaLabel="Periodo" value={preset} onChange={aplicarPreset} options={PRESETS} />
            {preset === 'libre' && <MonthRangeFilter label="Periodo" desde={periodoUnico.desde} hasta={periodoUnico.hasta} onChange={setPeriodoUnico} />}
            {listo && <span className="text-xs text-text-muted">{etiquetaPeriodo(periodoUnico)}</span>}
          </>
        ) : (
          <>
            <SegmentedControl<Granularidad>
              ariaLabel="Tipo de comparación"
              value={gran}
              onChange={cambiarGran}
              options={[{ value: 'mes', label: 'Mes vs mes' }, { value: 'trimestre', label: 'Trimestre vs trimestre' }, { value: 'anio', label: 'Año vs año' }, { value: 'rango', label: 'Rango libre' }]}
            />
            {gran === 'rango' ? (
              <>
                <MonthRangeFilter label="Periodo A" desde={periodoA.desde} hasta={periodoA.hasta} onChange={setPeriodoA} />
                <MonthRangeFilter label="Periodo B" desde={periodoB.desde} hasta={periodoB.hasta} onChange={setPeriodoB} />
              </>
            ) : (
              <>
                {selector('A')}
                {selector('B')}
              </>
            )}
            <Button variant="outline" size="sm" title="Intercambia el periodo A con el B" onClick={() => { const x = periodoA; setPeriodoA(periodoB); setPeriodoB(x); }} disabled={!listo}>
              <ArrowLeftRight className="mr-1 size-3.5" />A ↔ B
            </Button>
            <Button variant="outline" size="sm" title="Pone en A el periodo inmediato anterior al B" onClick={() => setPeriodoA(periodoAnterior(periodoB))} disabled={!listo}>A = periodo anterior</Button>
            <Button variant="outline" size="sm" title="Pone en A el mismo periodo del año anterior al B" onClick={() => setPeriodoA(desplazarPeriodo(periodoB, -12))} disabled={!listo}>A = año anterior</Button>
          </>
        )}
        <div className="h-6 w-px bg-border" />
        <PasteCodesFilter value={pegados} onChange={cambiarPegados} label="material" />
        <PasteCodesChip value={pegados} onChange={cambiarPegados} label="material" />
      </Card>

      {!listo && <EmptyState title={solo ? 'Elige el periodo a revisar.' : 'Elige los dos periodos a comparar.'} description={solo ? 'Año en curso, últimos meses cerrados o un periodo libre.' : 'Periodo A = base, Periodo B = el que se compara contra A.'} />}

      {resultado && total && (
        <>
          {solo ? (
            <KpiBand
              titulo={`Periodo ${labelB}`}
              principal={{ etiqueta: 'Venta', valor: formatCurrency(total.b.imp), sub: `${formatNumber(total.b.cant)} u. · ${formatNumber(resultado.materiales)} materiales` }}
              pie="Venta = importe facturado del periodo (las devoluciones restan). Precio promedio = importe ÷ cantidad del periodo; mínimo y máximo = la fila de facturación (cliente + centro + mes) más barata y más cara."
            />
          ) : (
            <KpiBand
              titulo={`Venta ${labelA} vs ${labelB}`}
              principal={{
                etiqueta: `Venta ${labelB}`,
                valor: formatCurrency(total.b.imp),
                sub: <span className={cn('font-medium', tono(pTotal))}>{signo(dTotal)}{formatCurrency(dTotal)} · {pctTxt(pTotal)} vs {labelA}</span>,
              }}
              metricas={[
                { etiqueta: `Venta ${labelA}`, valor: formatCurrency(total.a.imp) },
                { etiqueta: `Cant. ${labelA}`, valor: formatNumber(total.a.cant) },
                { etiqueta: `Cant. ${labelB}`, valor: formatNumber(total.b.cant), sub: <span className={tono(variacionPct(total.a.cant, total.b.cant))}>{pctTxt(variacionPct(total.a.cant, total.b.cant))}</span> },
                { etiqueta: 'Materiales', valor: formatNumber(resultado.materiales) },
              ]}
              pie="Venta = importe facturado del periodo (las devoluciones restan). Precio promedio = importe ÷ cantidad del periodo; mínimo y máximo = la fila de facturación (cliente + centro + mes) más barata y más cara."
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<NivelComparativo>
              ariaLabel="Nivel de detalle"
              value={nivel}
              onChange={(v) => {
                // Cambiar de nivel a mano conserva solo la ruta de los niveles de arriba.
                const orden = ['gerente', 'sector', 'grupo', 'material'] as const;
                const next: Ruta = {};
                for (const c of ['gerente', 'sector', 'grupo'] as const) if (orden.indexOf(c) < orden.indexOf(v) && ruta[c]) next[c] = ruta[c];
                setRuta(next);
                setNivel(v);
              }}
              options={NIVELES.map((n) => ({ value: n.value, label: n.label }))}
            />
            {rutaChips.map((c) => (
              <button key={c} type="button" onClick={() => quitarRuta(c)} title="Quitar este filtro y los de abajo" className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                {ruta[c]}<X className="size-3" />
              </button>
            ))}
            <span className="text-xs text-text-faint">
              {formatNumber(filas.length)} {esMaterial ? 'materiales' : 'filas'} · clic en una fila para {esMaterial ? (solo ? 'ver su mes a mes' : 'ver el material') : 'bajar al siguiente nivel'}
            </span>
          </div>

          {resultado.faltantes.length > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-text">
              Sin venta {solo ? 'en el periodo' : 'en ninguno de los dos periodos'}: {resultado.faltantes.slice(0, 20).join(', ')}{resultado.faltantes.length > 20 ? ` y ${resultado.faltantes.length - 20} más` : ''}.
            </p>
          )}

          {filas.length === 0 ? (
            <EmptyState title={solo ? 'Sin ventas con estos filtros en el periodo.' : 'Sin ventas con estos filtros en los dos periodos.'} />
          ) : (
            <Card className={cn(ALTURA_TABLA, 'shrink-0 overflow-hidden')}>
              <div className="h-full overflow-auto">
                <Table wrapperClassName="overflow-visible">
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="clave" activeKey={sortKey} dir={dir} onSort={toggleSort}>{colNivel}</SortableTableHead>
                      {!esMaterial && <SortableTableHead sortKey="clave" activeKey={null} dir={null} onSort={() => undefined} className="text-right">Materiales</SortableTableHead>}
                      {!solo && <SortableTableHead sortKey="ventaA" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Venta {labelA}</SortableTableHead>}
                      <SortableTableHead sortKey="ventaB" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Venta {solo ? '' : labelB}</SortableTableHead>
                      {!solo && (
                        <>
                          <SortableTableHead sortKey="dImp" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Δ Venta</SortableTableHead>
                          <SortableTableHead sortKey="dImpPct" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Δ %</SortableTableHead>
                          <SortableTableHead sortKey="cantA" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Cant. {labelA}</SortableTableHead>
                        </>
                      )}
                      <SortableTableHead sortKey="cantB" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Cant. {solo ? '' : labelB}</SortableTableHead>
                      {!solo && <SortableTableHead sortKey="dCantPct" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Δ Cant. %</SortableTableHead>}
                      {solo && <SortableTableHead sortKey="share" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end" title="Parte de la venta total del periodo (con los filtros actuales)">% de la venta</SortableTableHead>}
                      {esMaterial && !solo && (
                        <>
                          <SortableTableHead sortKey="promA" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end" title="Importe ÷ cantidad de todo el periodo">Prom. {labelA}</SortableTableHead>
                          <SortableTableHead sortKey="promB" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Prom. {labelB}</SortableTableHead>
                          <SortableTableHead sortKey="dProm" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Δ Prom. %</SortableTableHead>
                          <SortableTableHead sortKey="minA" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end" title="Menor precio unitario de una fila de facturación (cliente + centro + mes) del periodo; pasa el cursor sobre el precio para ver de quién">Mín. {labelA}</SortableTableHead>
                          <SortableTableHead sortKey="minB" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Mín. {labelB}</SortableTableHead>
                          <SortableTableHead sortKey="maxA" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end" title="Mayor precio unitario de una fila de facturación (cliente + centro + mes) del periodo; pasa el cursor sobre el precio para ver de quién">Máx. {labelA}</SortableTableHead>
                          <SortableTableHead sortKey="maxB" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end">Máx. {labelB}</SortableTableHead>
                        </>
                      )}
                      {esMaterial && solo && (
                        <>
                          <SortableTableHead sortKey="promB" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end" title="Importe ÷ cantidad de todo el periodo">Precio prom.</SortableTableHead>
                          <SortableTableHead sortKey="minB" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end" title="Menor precio unitario de una fila de facturación (cliente + centro + mes) del periodo; pasa el cursor sobre el precio para ver de quién">Precio mín.</SortableTableHead>
                          <SortableTableHead sortKey="clave" activeKey={null} dir={null} onSort={() => undefined} className="text-right" title="Mes en que se dio el mínimo">Mes mín.</SortableTableHead>
                          <SortableTableHead sortKey="maxB" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end" title="Mayor precio unitario de una fila de facturación (cliente + centro + mes) del periodo; pasa el cursor sobre el precio para ver de quién">Precio máx.</SortableTableHead>
                          <SortableTableHead sortKey="clave" activeKey={null} dir={null} onSort={() => undefined} className="text-right" title="Mes en que se dio el máximo">Mes máx.</SortableTableHead>
                          <SortableTableHead sortKey="mesesVenta" activeKey={sortKey} dir={dir} onSort={toggleSort} className="text-right justify-end" title="Meses del periodo con venta">Meses c/venta</SortableTableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibles.map((f) => {
                      const expandido = solo && esMaterial && abiertos.has(f.clave);
                      return (
                        <Fragment key={f.clave}>
                          <TableRow className="cursor-pointer" onClick={() => bajar(f)} title={esMaterial ? (solo ? 'Ver su mes a mes' : 'Ver el material') : 'Bajar al siguiente nivel'}>
                            <TableCell>
                              <span className="inline-flex items-center gap-1 font-medium text-accent">
                                {solo && esMaterial ? (expandido ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />) : null}
                                {solo && esMaterial ? (
                                  <button type="button" className="hover:underline" title="Abrir el detalle del material" onClick={(ev) => { ev.stopPropagation(); open({ type: 'material', material: f.clave }); }}>{f.clave}</button>
                                ) : f.clave}
                                {!esMaterial && <ChevronRight className="size-3.5" />}
                              </span>
                              {esMaterial && <div className="max-w-64 truncate text-[11px] text-text-faint">{f.descripcion}</div>}
                            </TableCell>
                            {!esMaterial && <TableCell className="text-right tabular-nums">{formatNumber(f.materiales)}</TableCell>}
                            {!solo && <TableCell className="text-right tabular-nums">{formatCurrency(f.a.imp)}</TableCell>}
                            <TableCell className="text-right tabular-nums">{formatCurrency(f.b.imp)}</TableCell>
                            {!solo && (
                              <>
                                <TableCell className={cn('text-right tabular-nums', tono(f.dImpPct))}>{signo(f.dImp)}{formatCurrency(f.dImp)}</TableCell>
                                <TableCell className={cn('text-right tabular-nums font-medium', tono(f.dImpPct))}>{pctTxt(f.dImpPct)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatNumber(f.a.cant)}</TableCell>
                              </>
                            )}
                            <TableCell className="text-right tabular-nums">{formatNumber(f.b.cant)}</TableCell>
                            {!solo && <TableCell className={cn('text-right tabular-nums', tono(f.dCantPct))}>{pctTxt(f.dCantPct)}</TableCell>}
                            {solo && <TableCell className="text-right tabular-nums text-text-muted">{total.b.imp ? `${((f.b.imp / total.b.imp) * 100).toFixed(1)}%` : '—'}</TableCell>}
                            {esMaterial && !solo && f.precios && (
                              <>
                                <TableCell className="text-right tabular-nums">{precio(f.precios.a.prom)}</TableCell>
                                <TableCell className="text-right tabular-nums">{precio(f.precios.b.prom)}</TableCell>
                                <TableCell className={cn('text-right tabular-nums font-medium', tono(f.precios.dPromPct))}>{f.precios.a.prom && f.precios.b.prom ? pctTxt(f.precios.dPromPct) : '—'}</TableCell>
                                <TableCell className="text-right tabular-nums" title={f.precios.a.refMin ? `${f.precios.a.mesMin} · ${f.precios.a.refMin}` : undefined}>{precio(f.precios.a.min)}</TableCell>
                                <TableCell className="text-right tabular-nums" title={f.precios.b.refMin ? `${f.precios.b.mesMin} · ${f.precios.b.refMin}` : undefined}>{precio(f.precios.b.min)}</TableCell>
                                <TableCell className="text-right tabular-nums" title={f.precios.a.refMax ? `${f.precios.a.mesMax} · ${f.precios.a.refMax}` : undefined}>{precio(f.precios.a.max)}</TableCell>
                                <TableCell className="text-right tabular-nums" title={f.precios.b.refMax ? `${f.precios.b.mesMax} · ${f.precios.b.refMax}` : undefined}>{precio(f.precios.b.max)}</TableCell>
                              </>
                            )}
                            {esMaterial && solo && f.precios && (
                              <>
                                <TableCell className="text-right tabular-nums">{precio(f.precios.b.prom)}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium" title={f.precios.b.refMin ? `Mínimo: ${f.precios.b.mesMin} · ${f.precios.b.refMin}` : undefined}>{precio(f.precios.b.min)}</TableCell>
                                <TableCell className="text-right text-xs text-text-muted" title={f.precios.b.refMin}>{f.precios.b.mesMin || '—'}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium" title={f.precios.b.refMax ? `Máximo: ${f.precios.b.mesMax} · ${f.precios.b.refMax}` : undefined}>{precio(f.precios.b.max)}</TableCell>
                                <TableCell className="text-right text-xs text-text-muted" title={f.precios.b.refMax}>{f.precios.b.mesMax || '—'}</TableCell>
                                <TableCell className="text-right tabular-nums">{f.precios.b.meses}</TableCell>
                              </>
                            )}
                          </TableRow>
                          {expandido && a.facturacion.rf && (
                            <TableRow className="bg-bg-inset/40 hover:bg-bg-inset/40">
                              <TableCell colSpan={nCols}>
                                <MesAMes mat={f.clave} rf={a.facturacion.rf} periodo={periodoUnico} minimo={f.precios?.b.mesMin ?? ''} maximo={f.precios?.b.mesMax ?? ''} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </ReportPage>
  );
}

/** Mes a mes de un material en el periodo: cantidad, venta y precio unitario, con el mínimo y el máximo resaltados. */
function MesAMes({ mat, rf, periodo, minimo, maximo }: { mat: string; rf: NonNullable<ReturnType<typeof useAnalytics>['facturacion']['rf']>; periodo: Periodo; minimo: string; maximo: string }) {
  const meses = useMemo(() => serieMensualMaterial(rf, mat, periodo), [rf, mat, periodo]);
  return (
    <div className="overflow-x-auto py-1">
      <table className="text-xs">
        <thead>
          <tr className="text-left text-text-faint">
            <th className="pr-4 font-medium">Mes</th>
            {meses.map((m) => <th key={m.mes} className="px-3 text-right font-medium tabular-nums">{m.mes}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="pr-4 text-text-faint">Cantidad</td>
            {meses.map((m) => <td key={m.mes} className="px-3 text-right tabular-nums">{m.cant ? formatNumber(m.cant) : '—'}</td>)}
          </tr>
          <tr>
            <td className="pr-4 text-text-faint">Venta</td>
            {meses.map((m) => <td key={m.mes} className="px-3 text-right tabular-nums">{m.imp ? formatCurrency(m.imp) : '—'}</td>)}
          </tr>
          <tr>
            <td className="pr-4 text-text-faint">Precio unitario</td>
            {meses.map((m) => (
              <td
                key={m.mes}
                className={cn('px-3 text-right tabular-nums font-medium', m.mes === minimo && 'text-success', m.mes === maximo && m.mes !== minimo && 'text-danger')}
                title={m.mes === minimo ? 'Precio mínimo del periodo' : m.mes === maximo ? 'Precio máximo del periodo' : undefined}
              >
                {m.precio ? formatCurrency(m.precio) : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
