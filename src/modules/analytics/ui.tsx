import { TrendingUp, TrendingDown, Minus, ZoomIn, ZoomOut, Plus, X, Search, ChevronRight } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { completarSerie, mesLabel, comparativa, type Serie, type Tendencia } from '@/core/resumenFac';

// ---------------------------------------------------------------------------
// Fluidity: self-contained search box. Holds its own input state and only
// notifies the parent with the *debounced* value, so typing re-renders just
// this small component — never the whole (~80k-row) page on every keystroke.
// `onChange` must be a stable reference (e.g. a useState setter).
// ---------------------------------------------------------------------------
export const DebouncedSearch = memo(function DebouncedSearch({
  onChange, placeholder, delay = 200, className = 'w-64',
}: { onChange: (v: string) => void; placeholder?: string; delay?: number; className?: string }) {
  const [local, setLocal] = useState('');
  const debounced = useDebouncedValue(local, delay);
  useEffect(() => { onChange(debounced); }, [debounced, onChange]);
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-2.5 top-2.5 size-3.5 text-text-faint" />
      <Input placeholder={placeholder} value={local} onChange={(e) => setLocal(e.target.value)} className="pl-8" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Per-table zoom control · port of legacy js/zoom.js (zoomHTML/wireZoom).
// Shrinks/grows font size + row density for a single table without affecting
// the rest of the page. Levels: 0 = compact, 1 = normal (default), 2 = comfortable.
// ---------------------------------------------------------------------------
const ZOOM_LEVELS = ['text-[11px]', 'text-xs', 'text-sm'] as const;
const ZOOM_ROW = ['[&_td]:py-1 [&_th]:h-7', '[&_td]:py-2 [&_th]:h-9', '[&_td]:py-3 [&_th]:h-10'] as const;

export function useZoom(initial = 1) {
  const [level, setLevel] = useState(initial);
  const className = cn(ZOOM_LEVELS[level], ZOOM_ROW[level]);
  return { level, setLevel, className };
}

export function ZoomControl({ level, setLevel }: { level: number; setLevel: (n: number) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-bg-elevated p-0.5">
      <button type="button" title="Reducir" disabled={level <= 0} onClick={() => setLevel(Math.max(0, level - 1))} className="rounded p-1 text-text-faint hover:bg-bg-inset disabled:opacity-30">
        <ZoomOut className="size-3.5" />
      </button>
      <button type="button" title="Ampliar" disabled={level >= ZOOM_LEVELS.length - 1} onClick={() => setLevel(Math.min(ZOOM_LEVELS.length - 1, level + 1))} className="rounded p-1 text-text-faint hover:bg-bg-inset disabled:opacity-30">
        <ZoomIn className="size-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Un solo clic, siempre visible (no requiere recordar doble-clic ni hover para
// descubrirlo), y con un hit-target propio para que un clic accidental en el
// resto de la fila no dispare la apertura del detalle.
// ---------------------------------------------------------------------------
export function DetailChevron({ onOpen, label = 'Ver detalle' }: { onOpen: () => void; label?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className="inline-flex size-6 items-center justify-center rounded-md text-text-faint opacity-60 transition-opacity hover:bg-bg-inset hover:text-accent hover:opacity-100 group-hover:opacity-100"
    >
      <ChevronRight className="size-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// #2 Multi-column filter bar: stack per-column filters (Material AND Ejecutivo AND
// Estado...) beyond the single global search box, each picked from an autocomplete
// of that column's distinct values. Distinct-value lists are memoized on `rows`
// identity so they aren't recomputed per keystroke. Conceptually the legacy
// data-addf filter-chip pattern, generalized into a proper filter bar.
// ---------------------------------------------------------------------------
export interface FilterColumn<T> { key: string; label: string; get: (row: T) => string }
export interface ActiveFilter { col: string; value: string }

/** Applies the active quick-filters to one row: values selected for the SAME column are
 * OR'd (Sector = GASAS or SUTURAS), and different columns are AND'd (Sector=… AND
 * Ejecutivo=…). Shared by every view so the semantics can't drift per page. */
export function passesFilters<T>(row: T, columns: FilterColumn<T>[], active: ActiveFilter[]): boolean {
  if (!active.length) return true;
  const byCol = new Map<string, string[]>();
  for (const f of active) {
    const arr = byCol.get(f.col);
    if (arr) arr.push(f.value); else byCol.set(f.col, [f.value]);
  }
  for (const [key, values] of byCol) {
    const col = columns.find((c) => c.key === key);
    if (!col) continue;
    if (!values.includes(col.get(row))) return false; // OR within column
  }
  return true; // AND across columns
}

export function ColumnFilterBar<T>({ columns, rows, active, onChange }: {
  columns: FilterColumn<T>[];
  rows: T[];
  active: ActiveFilter[];
  onChange: (next: ActiveFilter[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pickCol, setPickCol] = useState('');
  const [typed, setTyped] = useState('');

  // Distinct values are computed lazily, one column at a time, only once the user has
  // actually picked that column — not eagerly for all columns on every mount/rows change.
  // Eagerly scanning every column x every row (e.g. 5 cols x 82k rows on Consumo) blocked
  // the main thread long enough on first render to visibly stall other work on the page
  // (including the chart's first paint).
  const distinctForCol = useMemo(() => {
    if (!pickCol) return [] as string[];
    const col = columns.find((c) => c.key === pickCol);
    if (!col) return [] as string[];
    const s = new Set<string>();
    rows.forEach((r) => { const v = col.get(r); if (v) s.add(v); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [pickCol, columns, rows]);

  const options = pickCol
    ? distinctForCol.filter((v) => v.toLowerCase().includes(typed.toLowerCase())).slice(0, 25)
    : [];

  const addFilter = (col: string, value: string) => {
    if (!value) return;
    onChange([...active.filter((f) => f.col !== col), { col, value }]);
    setAdding(false); setPickCol(''); setTyped('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((f) => {
        const col = columns.find((c) => c.key === f.col);
        return (
          <button key={f.col} type="button" onClick={() => onChange(active.filter((x) => x.col !== f.col))} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-xs text-accent">
            {col?.label || f.col}: {f.value} <X className="size-3" />
          </button>
        );
      })}
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-text-faint hover:border-accent hover:text-accent">
          <Plus className="size-3" /> Filtro
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <select value={pickCol} onChange={(ev) => { setPickCol(ev.target.value); setTyped(''); }} className="h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs" autoFocus>
            <option value="">Columna…</option>
            {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {pickCol && (
            <div className="relative">
              <input
                autoFocus
                value={typed}
                onChange={(ev) => setTyped(ev.target.value)}
                placeholder="Buscar valor…"
                className="h-8 w-40 rounded-md border border-border bg-bg-elevated px-2 text-xs"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && options[0]) addFilter(pickCol, options[0]);
                  if (ev.key === 'Escape') { setAdding(false); setPickCol(''); }
                }}
              />
              {options.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-56 overflow-auto rounded-md border border-border bg-bg-elevated shadow-lg">
                  {options.map((o) => (
                    <button key={o} type="button" onClick={() => addFilter(pickCol, o)} className="block w-full truncate px-2 py-1 text-left text-xs hover:bg-bg-inset">{o}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={() => { setAdding(false); setPickCol(''); }} className="text-text-faint hover:text-text"><X className="size-3.5" /></button>
        </div>
      )}
    </div>
  );
}

// Maps the legacy semantic color classes to Tailwind utility combos.
const CLS: Record<string, string> = {
  verde: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  rojo: 'bg-danger/15 text-danger',
  amb: 'bg-warning/15 text-warning',
  azul: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  vio: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  gris: 'bg-bg-inset text-text-muted',
};

export const StatePill = memo(function StatePill({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', CLS[cls] || CLS.gris)}>
      {label}
    </span>
  );
});

export const TrendBadge = memo(function TrendBadge({ t }: { t: Tendencia }) {
  const Icon = t.dir === 'up' ? TrendingUp : t.dir === 'down' ? TrendingDown : Minus;
  const color = t.dir === 'up' ? 'text-emerald-500' : t.dir === 'down' ? 'text-danger' : 'text-text-faint';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', color)}>
      <Icon className="size-3" /> {t.txt}
    </span>
  );
});

/** Clickable chip used for cross-navigation / quick filters (legacy .lnk).
 * Requires a *double* click to fire: a single stray click does nothing (and is
 * stopped from bubbling to the surrounding row), which prevents accidental
 * navigations/filters from mis-clicks. */
export function Chip({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  if (!onClick) return <span>{children}</span>;
  return (
    <button
      type="button"
      title={title ?? 'Doble clic para abrir'}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer select-none text-accent underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

export const EvolChart = memo(function EvolChart({ serie, onMonth, height = 220 }: { serie: Serie; onMonth?: (mes: string) => void; height?: number }) {
  // Recompute the chart series only when `serie` changes, not on every unrelated
  // parent re-render (zoom, hover, filter chips…).
  const data = useMemo(() => completarSerie(serie).map((p) => ({ ...p, label: mesLabel(p.mes) })), [serie]);
  if (!data.length) return <p className="text-sm text-text-muted">Sin datos para graficar.</p>;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          onClick={(s: { activeLabel?: string | number }) => {
            if (!onMonth || s?.activeLabel == null) return;
            const pt = data.find((d) => d.label === String(s.activeLabel));
            if (pt) onMonth(pt.mes);
          }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} width={54} tickFormatter={(v) => formatCurrency(Number(v))} />
          <Tooltip
            formatter={(v) => formatCurrency(Number(v))}
            labelClassName="text-xs"
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: '#f3f4f6',
              borderColor: '#d1d5db',
              color: '#111827',
            }}
          />
          {/* isAnimationActive=false: the entrance "draw" animation (rAF-driven) can get
              starved and stick at its initial 0-length dash-array frame when heavy synchronous
              work runs right after mount (e.g. Consumo's ~80k-row unfiltered aggregation),
              leaving the line permanently invisible. Static render avoids that failure mode. */}
          <Line type="monotone" dataKey="imp" stroke="var(--color-accent, #6366f1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

function pctTxt(p: number) {
  const up = p >= 0;
  return (
    <span className={up ? 'text-emerald-500' : 'text-danger'}>
      {up ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%
    </span>
  );
}

export function ComparativaDual({ serie }: { serie: Serie }) {
  const c = comparativa(serie);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-border p-3">
        <p className="text-[11px] uppercase tracking-wide text-text-faint">Mes {c.mesActLbl} vs {c.mesAntLbl}</p>
        <p className="mt-1 font-mono text-lg">{formatCurrency(c.mesAct.imp)}</p>
        <p className="text-xs text-text-muted">ant. {formatCurrency(c.mesAnt.imp)} · {pctTxt(c.mesPct)}</p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <p className="text-[11px] uppercase tracking-wide text-text-faint">Q{c.q} {c.cy} vs Q{c.q} {c.cy - 1}</p>
        <p className="mt-1 font-mono text-lg">{formatCurrency(c.qAct.imp)}</p>
        <p className="text-xs text-text-muted">ant. {formatCurrency(c.qAnt.imp)} · {pctTxt(c.qPct)}</p>
      </div>
    </div>
  );
}

export function InvGrid({ items }: { items: [string, number][] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-md border border-border px-2.5 py-1.5">
          <p className="text-[11px] text-text-faint">{k}</p>
          <p className="font-mono text-sm">{formatNumber(v)}</p>
        </div>
      ))}
    </div>
  );
}

export const Ranking = memo(function Ranking({ title, items, money = false, onRow, wide = false, className }: {
  title: string;
  items: { code: string; desc: string; val: number }[];
  money?: boolean;
  onRow?: (code: string) => void;
  /** Full-width layout: two-line rows (code / full description) instead of the compact truncated single line. */
  wide?: boolean;
  className?: string;
}) {
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.val)), [items]);
  if (wide) {
    return (
      <div className={cn('rounded-xl border border-border p-3', className)}>
        <h4 className="mb-2 text-xs font-semibold text-text-muted">{title}</h4>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.length === 0 && <p className="text-xs text-text-faint">Sin datos.</p>}
          {items.map((it) => (
            <button
              key={it.code}
              type="button"
              onClick={() => onRow?.(it.code)}
              className="group flex flex-col rounded px-2 py-1.5 text-left hover:bg-bg-inset border border-border/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn('font-medium text-xs', onRow && 'text-accent')}>{it.code}</span>
                <span className="font-mono text-xs tabular-nums shrink-0">{money ? formatCurrency(it.val) : formatNumber(it.val)}</span>
              </div>
              <div className="text-[11px] text-text-faint whitespace-normal break-words">{it.desc}</div>
              <div className="mt-1 h-1 rounded-full bg-bg-inset">
                <div className="h-1 rounded-full bg-accent" style={{ width: `${(it.val / max) * 100}%` }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border p-3">
      <h4 className="mb-2 text-xs font-semibold text-text-muted">{title}</h4>
      <div className="flex max-h-[132px] flex-col gap-1 overflow-y-auto pr-1">
        {items.length === 0 && <p className="text-xs text-text-faint">Sin datos.</p>}
        {items.map((it) => (
          <button
            key={it.code}
            type="button"
            onClick={() => onRow?.(it.code)}
            className="group grid grid-cols-[1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-bg-inset"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs">
                <span className={cn('truncate font-medium', onRow && 'text-accent')}>{it.code}</span>
                <span className="truncate text-text-faint">{it.desc}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-bg-inset">
                <div className="h-1 rounded-full bg-accent" style={{ width: `${(it.val / max) * 100}%` }} />
              </div>
            </div>
            <span className="font-mono text-xs tabular-nums">{money ? formatCurrency(it.val) : formatNumber(it.val)}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

export function StatTile({ label, value, sub, tone, compact = false }: { label: string; value: string; sub?: React.ReactNode; tone?: string; compact?: boolean }) {
  return (
    <div className={cn('w-fit min-w-[132px] rounded-xl border border-border bg-bg-elevated', compact ? 'px-2.5 py-2' : 'p-3')}>
      <p className="text-[10px] uppercase tracking-wide text-text-faint whitespace-nowrap">{label}</p>
      <p className={cn('mt-0.5 font-mono font-medium', compact ? 'text-base' : 'text-lg', tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
    </div>
  );
}
