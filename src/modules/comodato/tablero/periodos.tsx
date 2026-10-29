import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SegmentedControl } from '@/components/layout/report';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  alcanceDe, comparacionDeFiltro, deltaPct, lblMes, mesesEntre, mesesSerie, periodInfo, periodoAtajo, sumPeriods, trend3vs3, type Filtros, type KindAtajo, type TonoDelta,
} from '@/core/comodatoTablero';
import { Seccion, fmt, fmtN } from './piezas';
import { useTablero } from './contexto';

const TONO: Record<TonoDelta, string> = { up: 'text-success', down: 'text-danger', flat: 'text-text-faint' };
export function Delta({ act, prev }: { act: unknown; prev: unknown }) {
  const d = deltaPct(act, prev);
  return <span className={cn('font-medium', TONO[d.tono])}>{d.texto}</span>;
}

const rango = (r: readonly string[]): string => (!r.length ? '—' : r.length === 1 ? lblMes(r[0]!) : `${lblMes(r[0]!)} – ${lblMes(r[r.length - 1]!)}`);
const hayFiltrosDeFila = (f: Filtros): boolean => (Object.entries(f) as [string, string][]).some(([k, v]) => !!v && k !== 'pDesde' && k !== 'pHasta');

/** Estas tarjetas calculan sus propios meses: el usuario decide si además se limitan a los clientes/equipos del filtro general. */
function AlcanceFiltros({ conFiltros, onChange }: { conFiltros: boolean; onChange: (v: boolean) => void }) {
  const { filtros, rows, dataAll } = useTablero();
  const hay = hayFiltrosDeFila(filtros);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
      <span className="font-medium text-warning">Clientes y equipos:</span>
      <SegmentedControl<'si' | 'no'>
        ariaLabel="Alcance de la comparación"
        value={conFiltros ? 'si' : 'no'}
        onChange={(v) => onChange(v === 'si')}
        options={[{ value: 'si', label: 'Con los filtros' }, { value: 'no', label: 'Todos' }]}
      />
      <span className="text-text-muted">
        {conFiltros
          ? hay ? `Solo los ${rows.length.toLocaleString('es-MX')} registros del filtro actual.` : `Sin filtros activos: son todos los registros (${dataAll.length.toLocaleString('es-MX')}).`
          : `Ignora los filtros: todos los clientes y equipos (${dataAll.length.toLocaleString('es-MX')} registros).`}
      </span>
    </div>
  );
}

type Modo = 'auto' | 'atajo' | 'filtro' | 'libre';
interface Libre { aD: string; aH: string; bD: string; bH: string }

/** Qué meses se comparan: lo propio de la tarjeta (`auto`), el periodo del filtro del tablero contra el anterior / el año anterior, o dos rangos libres A y B. */
function useComparador(auto: { a: string[]; b: string[]; etA: string; etB: string; textoAuto: string }) {
  const { serie, filtros } = useTablero();
  const meses = useMemo(() => mesesSerie(serie), [serie]);
  const [modo, setModo] = useState<Modo>('auto');
  const [modoB, setModoB] = useState<'previo' | 'anio'>('anio');
  const [kind, setKind] = useState<KindAtajo>('mes');
  const [offset, setOffset] = useState(1);
  const ult = meses.length;
  const [libre, setLibre] = useState<Libre>(() => ({ aD: meses[Math.max(0, ult - 3)] ?? '', aH: meses[ult - 1] ?? '', bD: meses[Math.max(0, ult - 6)] ?? '', bH: meses[Math.max(0, ult - 4)] ?? '' }));

  const elegido = useMemo(() => {
    if (modo === 'filtro') {
      const { a, b } = comparacionDeFiltro(modoB, filtros.pDesde, filtros.pHasta, meses);
      return { a, b, etA: `Periodo del filtro · ${rango(a)}`, etB: `${modoB === 'anio' ? 'Mismo periodo del año anterior' : 'Periodo anterior'} · ${rango(b)}`, texto: filtros.pDesde || filtros.pHasta ? '' : 'No hay periodo filtrado arriba: A abarca toda la serie.' };
    }
    if (modo === 'atajo') {
      const { a, b, label } = periodoAtajo(kind, offset, modoB);
      return { a, b, etA: `${label} · ${rango(a)}`, etB: `${modoB === 'anio' ? 'Año anterior' : 'Periodo anterior'} · ${rango(b)}`, texto: '', labelAtajo: label };
    }
    if (modo === 'libre') {
      const a = mesesEntre(libre.aD, libre.aH);
      const b = mesesEntre(libre.bD, libre.bH);
      return { a, b, etA: `A · ${rango(a)}`, etB: `B · ${rango(b)}`, texto: a.some((p) => b.includes(p)) ? 'Los periodos A y B comparten meses.' : '' };
    }
    return { a: auto.a, b: auto.b, etA: auto.etA, etB: auto.etB, texto: auto.textoAuto };
  }, [modo, modoB, kind, offset, filtros.pDesde, filtros.pHasta, meses, libre, auto.a, auto.b, auto.etA, auto.etB, auto.textoAuto]);

  const mesSel = (valor: string, onChange: (v: string) => void, etiqueta: string) => (
    <Select value={valor} onChange={(ev) => onChange(ev.target.value)} className="w-auto" aria-label={etiqueta}>
      {meses.map((m) => <option key={m} value={m}>{lblMes(m)}</option>)}
    </Select>
  );
  const control = (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-inset px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-text">Periodos:</span>
        <SegmentedControl<Modo>
          ariaLabel="Qué periodos comparar"
          value={modo}
          onChange={setModo}
          options={[{ value: 'auto', label: 'Automático' }, { value: 'atajo', label: 'Mes / trimestre / año' }, { value: 'filtro', label: 'Periodo del filtro' }, { value: 'libre', label: 'A vs B libre' }]}
        />
        {(modo === 'filtro' || modo === 'atajo') && (
          <SegmentedControl<'previo' | 'anio'>
            ariaLabel="Contra qué periodo"
            value={modoB}
            onChange={setModoB}
            options={[{ value: 'previo', label: 'vs periodo anterior' }, { value: 'anio', label: 'vs año anterior' }]}
          />
        )}
      </div>
      {modo === 'atajo' && (
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<KindAtajo>
            ariaLabel="Mes, trimestre o año"
            value={kind}
            onChange={(k) => { setKind(k); setOffset(k === 'anio' ? 0 : 1); }}
            options={[{ value: 'mes', label: 'Mes' }, { value: 'trimestre', label: 'Trimestre' }, { value: 'anio', label: 'Año' }]}
          />
          <div className="flex items-center gap-2">
            <button type="button" className="rounded border border-border p-1 hover:bg-bg-inset" aria-label="Periodo anterior" title="Periodo anterior" onClick={() => setOffset((o) => o + 1)}><ChevronLeft className="size-4" /></button>
            <b className="min-w-24 text-center text-sm">{periodoAtajo(kind, offset, modoB).label}</b>
            <button type="button" className="rounded border border-border p-1 hover:bg-bg-inset disabled:opacity-40" aria-label="Periodo siguiente" title="Periodo siguiente" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))}><ChevronRight className="size-4" /></button>
          </div>
          {kind === 'anio' && offset === 0 && <span className="text-text-faint">El año en curso se compara solo con los mismos meses del anterior.</span>}
        </div>
      )}
      {modo === 'libre' && (
        <div className="flex flex-wrap items-center gap-2">
          <b>A</b> {mesSel(libre.aD, (v) => setLibre((l) => ({ ...l, aD: v })), 'A desde')} <span>a</span> {mesSel(libre.aH, (v) => setLibre((l) => ({ ...l, aH: v })), 'A hasta')}
          <b className="ml-3">B</b> {mesSel(libre.bD, (v) => setLibre((l) => ({ ...l, bD: v })), 'B desde')} <span>a</span> {mesSel(libre.bH, (v) => setLibre((l) => ({ ...l, bH: v })), 'B hasta')}
        </div>
      )}
      <span className="text-text-faint">
        {modo === 'auto' ? 'Meses propios de esta tarjeta (no siguen “Periodo desde / A la fecha”).' : modo === 'atajo' ? 'Periodo elegido aquí; no sigue “Periodo desde / A la fecha”.' : modo === 'filtro' ? 'A = “Periodo desde / A la fecha” de la barra de filtros.' : 'Rangos independientes del filtro de periodo.'}
        {elegido.texto ? ` ${elegido.texto}` : ''}
      </span>
    </div>
  );
  return { modo, ...elegido, control };
}

/** Cuatro cifras comparadas: A (actual) contra B. */
function Tile({ label, cur, prev, f, etA, etB }: { label: string; cur: number; prev: number; f: (n: number) => string; etA: string; etB: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums" title={etA}>{f(cur)}</div>
      <div className="text-[11px] text-text-muted"><Delta act={cur} prev={prev} /> vs <span title={etB}>{f(prev)}</span></div>
    </div>
  );
}

function Resultado({ cur, prev, etA, etB, conClientes }: { cur: ReturnType<typeof sumPeriods>; prev: ReturnType<typeof sumPeriods>; etA: string; etB: string; conClientes?: boolean }) {
  return (
    <>
      <div className={cn('grid grid-cols-2 gap-3', conClientes ? 'lg:grid-cols-4' : 'sm:grid-cols-3')}>
        <Tile label="Facturación" cur={cur.fac} prev={prev.fac} f={fmt} etA={etA} etB={etB} />
        <Tile label="Margen" cur={cur.mar} prev={prev.mar} f={fmt} etA={etA} etB={etB} />
        <Tile label="Bolsas facturadas" cur={cur.bol} prev={prev.bol} f={(n) => fmtN(n)} etA={etA} etB={etB} />
        {conClientes && <Tile label="Clientes con actividad" cur={cur.clientes.size} prev={prev.clientes.size} f={String} etA={etA} etB={etB} />}
      </div>
      <p className="mt-2 text-[11px] text-text-faint"><b>A</b>: {etA} · <b>B</b>: {etB}</p>
    </>
  );
}

/** Tendencia: por omisión los últimos 3 meses completos contra los 3 anteriores; también el periodo filtrado o dos rangos libres. */
export function Tendencia3Card() {
  const { serie, rows } = useTablero();
  const [conFiltros, setConFiltros] = useState(true);
  const alcance = useMemo(() => (conFiltros ? alcanceDe(rows) : null), [rows, conFiltros]);
  const t3 = useMemo(() => trend3vs3(serie, null), [serie]);
  const auto = useMemo(() => ({
    a: t3?.last3 ?? [], b: t3?.prev3 ?? [], etA: `Últimos 3 meses completos · ${rango(t3?.last3 ?? [])}`, etB: `3 anteriores · ${rango(t3?.prev3 ?? [])}`,
    textoAuto: t3 && (t3.last3.length < 3 || t3.prev3.length < 3) ? 'Datos insuficientes para 3+3 meses completos: se muestra lo disponible.' : '',
  }), [t3]);
  const cmp = useComparador(auto);
  const cur = useMemo(() => sumPeriods(serie, cmp.a, alcance), [serie, cmp.a, alcance]);
  const prev = useMemo(() => sumPeriods(serie, cmp.b, alcance), [serie, cmp.b, alcance]);
  if (!t3) return null;
  return (
    <Seccion titulo={cmp.modo === 'auto' ? '📊 Tendencia — últimos 3 meses completos vs 3 anteriores' : '📊 Tendencia — periodo A vs periodo B'}>
      <div className="mb-3 flex flex-col gap-2">
        {cmp.control}
        <AlcanceFiltros conFiltros={conFiltros} onChange={setConFiltros} />
      </div>
      <Resultado cur={cur} prev={prev} etA={cmp.etA} etB={cmp.etB} />
    </Seccion>
  );
}

/** Comparativo interanual: por omisión el mes (o trimestre) contra el mismo del año anterior, con navegación; también el periodo filtrado o rangos libres. */
export function ComparativoCard() {
  const { serie, rows } = useTablero();
  const [kind, setKind] = useState<'mes' | 'trimestre'>('mes');
  const [offset, setOffset] = useState(0);
  const [conFiltros, setConFiltros] = useState(true);
  const info = useMemo(() => periodInfo(kind, offset), [kind, offset]);
  const alcance = useMemo(() => (conFiltros ? alcanceDe(rows) : null), [rows, conFiltros]);
  const auto = useMemo(() => ({ a: info.curPeriods, b: info.yoyPeriods, etA: `${info.label} · ${rango(info.curPeriods)}`, etB: `${info.yoyLabel} · ${rango(info.yoyPeriods)}`, textoAuto: '' }), [info]);
  const cmp = useComparador(auto);
  const cur = useMemo(() => sumPeriods(serie, cmp.a, alcance), [serie, cmp.a, alcance]);
  const prev = useMemo(() => sumPeriods(serie, cmp.b, alcance), [serie, cmp.b, alcance]);
  return (
    <Seccion
      titulo={cmp.modo === 'auto' ? '📅 Comparativo interanual — mismo periodo, año anterior' : '📅 Comparativo — periodo A vs periodo B'}
      derecha={cmp.modo === 'auto' ? (
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<'mes' | 'trimestre'> ariaLabel="Periodo" value={kind} onChange={(k) => { setKind(k); setOffset(0); }} options={[{ value: 'mes', label: 'Mensual' }, { value: 'trimestre', label: 'Trimestral' }]} />
          <div className="flex items-center gap-2">
            <button type="button" className="rounded border border-border p-1 hover:bg-bg-inset" aria-label="Periodo anterior" title="Periodo anterior" onClick={() => setOffset((o) => o + 1)}><ChevronLeft className="size-4" /></button>
            <div className="text-center leading-tight">
              <div className="text-sm font-semibold">{info.label} vs {info.yoyLabel}</div>
              <div className="text-[11px] text-text-faint">{info.sub || (offset === 0 ? 'periodo actual' : `periodo anterior ×${offset}`)}</div>
            </div>
            <button type="button" className="rounded border border-border p-1 hover:bg-bg-inset disabled:opacity-40" aria-label="Periodo siguiente" title="Periodo siguiente" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))}><ChevronRight className="size-4" /></button>
          </div>
        </div>
      ) : undefined}
    >
      <div className="mb-3 flex flex-col gap-2">
        {cmp.control}
        <AlcanceFiltros conFiltros={conFiltros} onChange={setConFiltros} />
      </div>
      <Resultado cur={cur} prev={prev} etA={cmp.etA} etB={cmp.etB} conClientes />
    </Seccion>
  );
}

