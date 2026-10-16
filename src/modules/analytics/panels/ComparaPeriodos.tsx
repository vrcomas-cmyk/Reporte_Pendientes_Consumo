import { useMemo, useState, type ReactNode } from 'react';
import { StatePill, DetailChevron } from '../ui';
import { SubFilter } from './_shared';
import { matchesQuery } from '../helpers';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { MonthRangeFilter } from '../ui/MonthRangeFilter';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { clasificarEstado, mesKey, mesLabel, mesAnterior, hoyMes, type Serie } from '@/core/resumenFac';
import { mesDeKey } from '@/core/facMensual';

export interface PeriodoAB { desde: string; hasta: string }

/** Periodos por defecto: A = últimos 3 meses cerrados, B = los 3 anteriores (la misma ventana de la tendencia). */
export function periodosPorDefecto(): { a: PeriodoAB; b: PeriodoAB } {
  const R = mesKey(mesAnterior(hoyMes()));
  return {
    a: { desde: mesDeKey(R - 2), hasta: mesDeKey(R) },
    b: { desde: mesDeKey(R - 5), hasta: mesDeKey(R - 3) },
  };
}

const completo = (p: PeriodoAB) => !!mesKey(p.desde) && !!mesKey(p.hasta) && mesKey(p.hasta) >= mesKey(p.desde);

export interface ResumenPeriodo {
  imp: number;
  cant: number;
  /** Meses del periodo con compra / meses de calendario del periodo. */
  mesesConCompra: number;
  meses: number;
  /** Último mes con compra DENTRO del periodo (mm/aaaa) o ''. */
  ultima: string;
  /** Estado de negocio con el último mes del periodo como referencia. */
  estado: ReturnType<typeof clasificarEstado>;
}

/** Resume una serie mensual dentro de [desde, hasta] (mm/aaaa). */
export function resumenPeriodo(serie: Serie, p: PeriodoAB): ResumenPeriodo | null {
  if (!completo(p)) return null;
  const lo = mesKey(p.desde);
  const hi = mesKey(p.hasta);
  let imp = 0; let cant = 0; let con = 0; let ult = 0;
  for (const s of serie) {
    const k = mesKey(s.mes);
    if (k < lo || k > hi) continue;
    imp += s.imp; cant += s.cant;
    if (s.imp > 0 || s.cant > 0) { con++; if (k > ult) ult = k; }
  }
  return { imp, cant, mesesConCompra: con, meses: hi - lo + 1, ultima: ult ? mesDeKey(ult) : '', estado: clasificarEstado(serie, false, p.hasta) };
}

/** Estado de los periodos A y B + controles (dos filtros mm/aaaa). */
export function usePeriodosAB() {
  const def = periodosPorDefecto();
  const [a, setA] = useState<PeriodoAB>(def.a);
  const [b, setB] = useState<PeriodoAB>(def.b);
  return { a, b, setA, setB, reset: () => { setA(def.a); setB(def.b); }, listoA: completo(a), listoB: completo(b) };
}

export function ControlesAB({ ab }: { ab: ReturnType<typeof usePeriodosAB> }) {
  return (
    <div className="mb-2 flex flex-wrap items-end gap-x-6 gap-y-2">
      <div className="border-l-4 border-accent pl-2"><MonthRangeFilter label="Periodo A" desde={ab.a.desde} hasta={ab.a.hasta} onChange={ab.setA} /></div>
      <div className="border-l-4 border-info pl-2"><MonthRangeFilter label="Periodo B" desde={ab.b.desde} hasta={ab.b.hasta} onChange={ab.setB} /></div>
      <button type="button" className="text-xs text-accent hover:underline" onClick={ab.reset}>Últimos 3 meses vs 3 anteriores</button>
    </div>
  );
}

/** Celda de un periodo: estado + importe, cantidad, meses con compra y última compra del periodo (mmm/aaaa). */
export function CeldaPeriodo({ r }: { r: ResumenPeriodo | null }) {
  if (!r) return <span className="text-text-faint">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <StatePill label={r.estado.label} cls={r.estado.cls} />
      <span className="tabular-nums">{formatCurrency(r.imp)} · {formatNumber(r.cant)} u.</span>
      <span className="text-[11px] text-text-faint">
        {r.mesesConCompra}/{r.meses} meses con compra{r.ultima ? ` · últ. ${mesLabel(r.ultima)}` : ''}
        {r.estado.dias !== undefined ? ` · ${formatNumber(r.estado.dias)} d sin comprar` : ''}
      </span>
    </div>
  );
}

const pctDe = (a: number, b: number) => (b ? (a / b - 1) * 100 : a ? 100 : 0);

/** Variación de A contra B (importe y cantidad). */
export function CeldaVariacion({ a, b }: { a: ResumenPeriodo | null; b: ResumenPeriodo | null }) {
  if (!a || !b) return <span className="text-text-faint">—</span>;
  const dImp = a.imp - b.imp;
  const pImp = pctDe(a.imp, b.imp);
  const pCant = pctDe(a.cant, b.cant);
  const chip = (v: number) => (v > 0 ? 'bg-success/15 text-success' : v < 0 ? 'bg-danger/15 text-danger' : 'bg-bg-elevated text-text-muted');
  const flecha = (v: number) => (v > 0 ? '▲' : v < 0 ? '▼' : '=');
  const max = Math.max(a.imp, b.imp, 1);
  return (
    <div className="flex min-w-40 flex-col gap-1 tabular-nums">
      <span className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 font-semibold ${chip(dImp)}`}>{flecha(dImp)} {formatCurrency(Math.abs(dImp))} · {Math.abs(pImp).toFixed(1)}%</span>
      <span className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${chip(pCant)}`}>Cant. {flecha(pCant)} {formatNumber(Math.abs(a.cant - b.cant))} · {Math.abs(pCant).toFixed(1)}%</span>
      <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
        <span className="bg-accent" style={{ width: `${(a.imp / max) * 50}%` }} />
        <span className="ml-auto bg-info" style={{ width: `${(b.imp / max) * 50}%` }} />
      </span>
    </div>
  );
}

/** Resumen A vs B de UNA serie (cliente, material, grupo…): tres tarjetas de color con importe, cantidad y variación. */
export function ResumenAB({ serie, ab, titulo = 'Periodo A vs periodo B' }: { serie: Serie; ab: ReturnType<typeof usePeriodosAB>; titulo?: string }) {
  const ra = resumenPeriodo(serie, ab.a);
  const rb = resumenPeriodo(serie, ab.b);
  const et = (p: PeriodoAB) => `${p.desde ? mesLabel(p.desde) : '…'} – ${p.hasta ? mesLabel(p.hasta) : '…'}`;
  const tarjeta = (cls: string, nombre: string, p: PeriodoAB, r: ResumenPeriodo | null) => (
    <div className={`rounded-lg border-l-4 bg-bg-elevated px-3 py-2 ${cls}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{nombre} · {et(p)}</p>
      <p className="font-mono text-lg tabular-nums text-text">{r ? formatCurrency(r.imp) : '—'}</p>
      <p className="text-[11px] text-text-muted">{r ? `${formatNumber(r.cant)} u. · ${r.mesesConCompra}/${r.meses} meses con compra` : 'Elige un periodo completo'}</p>
    </div>
  );
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{titulo}</p>
      <ControlesAB ab={ab} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {tarjeta('border-accent text-accent', 'A', ab.a, ra)}
        {tarjeta('border-info text-info', 'B', ab.b, rb)}
        <div className="flex items-center rounded-lg border border-border px-3 py-2"><CeldaVariacion a={ra} b={rb} /></div>
      </div>
    </div>
  );
}

export interface FilaAB { key: string; titulo: ReactNode; sub?: ReactNode; serie: Serie; onOpen?: () => void }

/** Tabla genérica "periodo A vs periodo B" (cliente, material, grupo…): estado y detalle de cada periodo y su variación.
 * Ordenada por el importe del periodo A; doble clic (o la flecha) abre el detalle de la fila. */
export function TablaAB({ filas, ab, colTitulo, maxH = 'max-h-96', conEstado = true }: {
  filas: FilaAB[];
  ab: ReturnType<typeof usePeriodosAB>;
  colTitulo: string;
  maxH?: string;
  /** false = sin estado de negocio (p. ej. materiales: el estado aplica a clientes). */
  conEstado?: boolean;
}) {
  const [f, setF] = useState('');
  const comparadas = useMemo(() => filas
    .map((x) => ({ x, ra: resumenPeriodo(x.serie, ab.a), rb: resumenPeriodo(x.serie, ab.b) }))
    .sort((p, q) => (q.ra?.imp ?? 0) - (p.ra?.imp ?? 0)), [filas, ab.a, ab.b]);
  const shown = f ? comparadas.filter(({ x }) => matchesQuery(f, `${typeof x.titulo === 'string' ? x.titulo : ''} ${x.key}`)) : comparadas;
  const et = (p: PeriodoAB) => `${p.desde ? mesLabel(p.desde) : '…'} – ${p.hasta ? mesLabel(p.hasta) : '…'}`;
  const celda = (r: ResumenPeriodo | null) => (conEstado ? <CeldaPeriodo r={r} /> : <CeldaPeriodoSimple r={r} />);
  return (
    <div>
      <SubFilter value={f} onChange={setF} placeholder={`Filtrar ${colTitulo.toLowerCase()}…`} />
      <Table wrapperClassName={`${maxH} rounded-lg border border-border`}>
        <TableHeader>
          <TableRow>
            <TableHead>{colTitulo}</TableHead>
            <TableHead className="border-b-2 border-accent text-accent">Periodo A ({et(ab.a)})</TableHead>
            <TableHead className="border-b-2 border-info text-info">Periodo B ({et(ab.b)})</TableHead>
            <TableHead className="border-b-2 border-success text-success">A vs B</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(({ x, ra, rb }) => (
            <TableRow key={x.key} className={x.onOpen ? 'group cursor-pointer' : 'group'} title={x.onOpen ? 'Doble clic para ver el detalle' : undefined} onDoubleClick={x.onOpen}>
              <TableCell className="max-w-72">{x.titulo}{x.sub && <div className="truncate text-[11px] text-text-faint">{x.sub}</div>}</TableCell>
              <TableCell>{celda(ra)}</TableCell>
              <TableCell>{celda(rb)}</TableCell>
              <TableCell><CeldaVariacion a={ra} b={rb} /></TableCell>
              <TableCell>{x.onOpen && <DetailChevron onOpen={x.onOpen} />}</TableCell>
            </TableRow>
          ))}
          {shown.length > 0 && <FilaTotalAB series={shown.map(({ x }) => x.serie)} ab={ab} etiqueta={`Total ${colTitulo.toLowerCase()}`} />}
        </TableBody>
      </Table>
    </div>
  );
}

/** Como `CeldaPeriodo` pero sin el estado de negocio. */
function CeldaPeriodoSimple({ r }: { r: ResumenPeriodo | null }) {
  if (!r) return <span className="text-text-faint">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="tabular-nums">{formatCurrency(r.imp)} · {formatNumber(r.cant)} u.</span>
      <span className="text-[11px] text-text-faint">{r.mesesConCompra}/{r.meses} meses con venta{r.ultima ? ` · últ. ${mesLabel(r.ultima)}` : ''}</span>
    </div>
  );
}

/** Suma varias series mensuales en una (para la fila de total). */
export function sumarSeries(series: readonly Serie[]): Serie {
  const m = new Map<string, { mes: string; imp: number; cant: number }>();
  for (const s of series) for (const p of s) { const c = m.get(p.mes) ?? { mes: p.mes, imp: 0, cant: 0 }; c.imp += p.imp; c.cant += p.cant; m.set(p.mes, c); }
  return [...m.values()];
}

/** Fila de totales (lo que se está viendo, ya filtrado) para las tablas A vs B. */
export function FilaTotalAB({ series, ab, etiqueta, colsExtra = 0 }: { series: readonly Serie[]; ab: ReturnType<typeof usePeriodosAB>; etiqueta: string; colsExtra?: number }) {
  const total = sumarSeries(series);
  const ra = resumenPeriodo(total, ab.a);
  const rb = resumenPeriodo(total, ab.b);
  return (
    <TableRow className="bg-bg-elevated font-semibold">
      <TableCell>{etiqueta} <span className="text-[11px] font-normal text-text-faint">({formatNumber(series.length)})</span></TableCell>
      <TableCell><CeldaPeriodoSimple r={ra} /></TableCell>
      <TableCell><CeldaPeriodoSimple r={rb} /></TableCell>
      <TableCell><CeldaVariacion a={ra} b={rb} /></TableCell>
      {Array.from({ length: colsExtra }, (_, i) => <TableCell key={i} />)}
      <TableCell />
    </TableRow>
  );
}
