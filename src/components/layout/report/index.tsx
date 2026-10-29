import { useState, type ReactNode } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ClearFiltersButton } from '@/modules/analytics/ui';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn, formatCurrency, formatDelta } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Piezas de layout COMUNES de los reportes (Seg. de pedidos, Facturación, Inventario · Disponibilidad, Inv con Condición):
//   ReportPage → PageHeader (+ ExportButton) → KpiStrip → FilterBar (+ FilterSelect) → tabla → CollapsibleCard…
// Así las 4 vistas comparten estructura, espaciado, orden de filtros y altura de tabla.
// ---------------------------------------------------------------------------

/** Alto único de la tabla principal de los reportes: llena la ventana (mínimo 30 rem) para no quedar corta en pantallas grandes. */
export const ALTURA_TABLA = 'h-[max(30rem,calc(100dvh-10rem))]';

/** Raíz de un reporte: columna con scroll, mismo padding y separación en todas las vistas. */
export function ReportPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-full flex-col gap-3 overflow-y-auto p-5', className)}>{children}</div>;
}

/** Encabezado estándar: título, subtítulo/contador y acciones (Columnas, Vistas, Exportar…) a la derecha. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-2">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {subtitle != null && <p className="text-sm text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}

/** Botón "Exportar a Excel" (mismo texto, tamaño e ícono en todos los reportes). */
export function ExportButton({ onClick, label = 'Exportar a Excel' }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Download className="mr-1 size-3.5" />{label}
    </Button>
  );
}

/** Tira de KPIs: el dato principal (hero) primero y más grande, 3-4 de apoyo y, a un lado, el ranking. */
export function KpiStrip({ hero, children, aside }: { hero?: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-stretch gap-3">
      {hero}
      {children && <div className="inline-grid grid-cols-2 gap-2 lg:grid-cols-3">{children}</div>}
      {aside}
    </div>
  );
}

/** Barra de filtros estándar. Orden fijo: búsqueda → filtros de la vista (children) → Limpiar → Zoom a la derecha;
 * debajo, la fila de chips activos (códigos pegados…) y la barra de filtros por columna. */
export function FilterBar({ search, children, onClear, zoom, chips, columnFilters }: {
  search?: ReactNode;
  children?: ReactNode;
  onClear?: () => void;
  zoom?: ReactNode;
  chips?: ReactNode;
  columnFilters?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {search}
        {children}
        {onClear && <ClearFiltersButton onClear={onClear} />}
        {zoom && <div className="ml-auto">{zoom}</div>}
      </div>
      {chips && <div className="-mt-1 flex items-center gap-1.5">{chips}</div>}
      {columnFilters && <div className="flex flex-wrap items-center gap-2">{columnFilters}</div>}
    </div>
  );
}

/** Lista desplegable de filtro con el mismo estilo/tamaño que el resto (reemplaza los `<select>` sueltos). La primera opción ("X (todos)") limpia. */
export function FilterSelect<T extends string>({ value, onChange, todos, options, title, className }: {
  value: T | '';
  onChange: (v: T | '') => void;
  /** Texto de la opción que limpia el filtro, p. ej. "Estado (todos)". */
  todos: string;
  options: readonly { value: T; label: string }[];
  title?: string;
  className?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as T | '')} className={cn('w-auto', className)} title={title}>
      <option value="">{todos}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}

/** Interruptor segmentado (Agrupar/Desagrupar, Periodo corriente/anterior, Unidades/Riesgo…). */
export function SegmentedControl<T extends string>({ value, onChange, options, ariaLabel }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; title?: string }[];
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex items-center gap-0.5 rounded-md border border-border bg-bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-accent text-accent-fg' : 'text-text-muted hover:bg-bg-inset hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Sección plegable de página (cuadre, dispersión, grupos, lotes por vencer…). Recuerda si estaba abierta (`storageKey` único por vista). */
export function CollapsibleCard({ title, storageKey, defaultOpen = false, right, children }: {
  title: ReactNode;
  storageKey: string;
  defaultOpen?: boolean;
  /** Contenido a la derecha del título (contador, botones). */
  right?: ReactNode;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = usePersistedState<boolean>(storageKey, defaultOpen);
  return (
    <div className="shrink-0 rounded-xl border border-border bg-bg-elevated">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => setAbierto(!abierto)}
          className="flex min-w-0 items-center gap-1.5 rounded text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn('size-4 shrink-0 text-text-faint transition-transform', !abierto && '-rotate-90')} aria-hidden />
          <span className="truncate">{title}</span>
        </button>
        {right}
      </div>
      {abierto && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

/** Resumen (banda de KPIs, comparativos, top) que se puede plegar para dar toda la altura a la tabla principal.
 * Plegado deja una sola línea con `linea` (la cifra principal). Recuerda su estado por `storageKey`. */
export function ResumenColapsable({ storageKey, linea, children }: { storageKey: string; linea: ReactNode; children: ReactNode }) {
  const [oculto, setOculto] = usePersistedState<boolean>(storageKey, false);
  if (oculto) {
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-2 text-sm">
        <span className="min-w-0 truncate tabular-nums">{linea}</span>
        <button type="button" onClick={() => setOculto(false)} aria-expanded={false} className="shrink-0 text-xs text-accent hover:underline">Mostrar resumen</button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-col gap-3">
      <div className="-mb-1 flex justify-end">
        <button type="button" onClick={() => setOculto(true)} aria-expanded className="text-xs text-text-faint hover:text-accent hover:underline">Ocultar resumen</button>
      </div>
      {children}
    </div>
  );
}

/** Leyenda de lo que significan los símbolos de las celdas de inventario (misma en Disponibilidad e Inv con Condición). */
export function CellLegend({ children }: { children?: ReactNode }) {
  return <p className="text-xs text-text-faint">{children}</p>;
}

/** Mensaje y destino cuando faltan los libros de cada origen de datos (un solo lugar para los textos de "sin sincronizar"). */
export const SIN_DATOS: Record<'segPedidos' | 'facturacion' | 'inventario', { title: string; description: string; to: string; label: string }> = {
  segPedidos: { title: 'Aún no se han sincronizado los libros de Seg. de pedidos.', description: 'Sincroniza Seg pedidos, Disponibilidad e Inv_Condicion desde Carga.', to: '/carga', label: 'Ir a Carga' },
  facturacion: { title: 'Aún no se han sincronizado los libros de Facturación.', description: 'Sincroniza la facturación desde Carga.', to: '/carga', label: 'Ir a Carga' },
  inventario: { title: 'Aún no se han sincronizado los libros de Inventario.', description: 'Sincroniza Disponibilidad e Inv_Condicion desde Carga.', to: '/carga', label: 'Ir a Carga' },
};

/** Estado del plegado inicial de un grupo de filtros avanzados (por si una vista lo necesita). */
export function useAbierto(inicial = false): [boolean, () => void] {
  const [v, setV] = useState(inicial);
  return [v, () => setV((x) => !x)];
}

/** Tarjeta de comparativo contra el año anterior (importe actual, variación ▲▼ con tono y el importe previo). */
export function ComparisonCard({ titulo, actual, previo, pct }: { titulo: ReactNode; actual: number; previo: number; pct: number }) {
  const d = formatDelta(pct);
  const tono = d.tono === 'success' ? 'text-success' : d.tono === 'danger' ? 'text-danger' : 'text-text-muted';
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-xs font-medium text-text-faint">{titulo}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-xl font-semibold tabular-nums">{formatCurrency(actual)}</span>
        <span className={cn('text-sm font-medium tabular-nums', tono)}>{d.texto}</span>
      </div>
      <div className="text-[11px] text-text-faint">vs {formatCurrency(previo)} año anterior</div>
    </div>
  );
}

/** Botón de filtro tipo interruptor (Ocultar pendiente 0, Solo accionables…): misma altura y estados que los demás controles. */
export function ToggleButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-bg-elevated text-text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// KpiBand · banda de KPIs ÚNICA de los reportes. Integra lo mejor de las tres bandas anteriores:
//   · Facturación  → cifra principal grande + métricas + pie de contexto (+ comparativos dentro de la banda);
//   · Inventario · Disponibilidad → estado con color (ícono, tinte), distribución en barra apilada clicable que filtra;
//   · Incremento de costos → impacto principal + métricas con ReactNode (p. ej. margen A → B) + tarjetas de contexto.
// Estructura (de arriba abajo): [ícono] título · cifra principal · sub   |   métricas a la derecha
//                                barra de distribución (opcional) · contexto (opcional) · extra (opcional) · pie
// ---------------------------------------------------------------------------
export interface MetricaKpi {
  etiqueta: string;
  valor: ReactNode;
  /** Línea pequeña bajo el valor (p. ej. "● libre · ● bloqueado" o unidades). */
  sub?: ReactNode;
  /** Solo se pinta cuando aporta información (p. ej. riesgo > 0). */
  tono?: 'danger' | 'success' | 'warning' | 'info';
  title?: string;
  /** Ícono pequeño junto a la etiqueta (solo en las métricas de contexto). */
  icono?: ReactNode;
}

const TONO_CLS: Record<NonNullable<MetricaKpi['tono']>, string> = {
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
};

/** Tinte de la banda según su estado: neutral usa el borde de acento; danger/warning/success tiñen la tarjeta (contrato de color del tema). */
export type EstadoBanda = 'neutral' | 'danger' | 'warning' | 'success';
const BANDA_CLS: Record<EstadoBanda, string> = {
  neutral: 'border-border border-t-2 border-t-accent bg-bg-elevated',
  danger: 'border-danger/25 bg-danger/5',
  warning: 'border-warning/25 bg-warning/5',
  success: 'border-success/25 bg-success/5',
};
const ICONO_CLS: Record<EstadoBanda, string> = {
  neutral: 'bg-accent-soft text-accent',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success/15 text-success',
};
const PRINCIPAL_TONO: Record<EstadoBanda, string> = { neutral: '', danger: 'text-danger', warning: 'text-warning', success: 'text-success' };

/** Un segmento de la barra de distribución (p. ej. cada estado de cobertura, libre/bloqueado, cada condición). */
export interface SegmentoKpi {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Clase de color del segmento (p. ej. `bg-success`). */
  cls: string;
  /** Texto de ayuda al pasar el cursor. */
  title?: string;
}

function KpiMetric({ m, grande, derecha }: { m: MetricaKpi; grande?: boolean; derecha?: boolean }) {
  return (
    <div title={m.title} className={cn(derecha && 'text-right')}>
      <div className={cn('flex items-center gap-1 text-[11px] uppercase tracking-wide text-text-faint', derecha && 'justify-end')}>{m.icono}{m.etiqueta}</div>
      <span className={cn('font-display font-semibold tabular-nums', grande ? 'text-3xl tracking-tight' : 'text-2xl', m.tono && TONO_CLS[m.tono])}>{m.valor}</span>
      {m.sub != null && <div className="text-[11px] text-text-faint">{m.sub}</div>}
    </div>
  );
}

export function KpiBand({ titulo, estado = 'neutral', icono, principal, metricas = [], distribucion, contexto = [], contextoCols = 4, extra, pie, className, distribuir = false }: {
  /** Las métricas se reparten a lo largo de todo el ancho de la banda (en vez de agruparse a la derecha). */
  distribuir?: boolean;
  titulo: ReactNode;
  /** Tinte y color de la cifra principal; `neutral` = banda con borde de acento. */
  estado?: EstadoBanda;
  icono?: ReactNode;
  principal?: MetricaKpi;
  /** Métricas de apoyo, a la derecha de la cifra principal. */
  metricas?: readonly MetricaKpi[];
  /** Barra apilada (cobertura, libre/bloqueado, condiciones…). Con `onToggle` cada segmento filtra la tabla. */
  distribucion?: {
    titulo?: string;
    segmentos: readonly SegmentoKpi[];
    activo?: string;
    onToggle?: (clave: string) => void;
    formato?: (n: number) => string;
  };
  /** Tarjetas de contexto secundarias dentro de la misma banda (venta del periodo, % del portafolio…). */
  contexto?: readonly MetricaKpi[];
  /** Columnas de las tarjetas de contexto en pantallas anchas (2 para una banda de media ventana). */
  contextoCols?: 2 | 4;
  /** Contenido libre dentro de la banda (comparativos, controles). */
  extra?: ReactNode;
  pie?: ReactNode;
  className?: string;
}) {
  const grande = estado !== 'neutral';
  const total = distribucion ? distribucion.segmentos.reduce((s, x) => s + Math.max(0, x.valor), 0) : 0;
  const visibles = distribucion ? distribucion.segmentos.filter((s) => s.valor > 0) : [];
  const fmt = distribucion?.formato ?? ((n: number) => n.toLocaleString('es-MX'));
  return (
    <div className={cn('shrink-0 rounded-xl border p-4 shadow-sm', BANDA_CLS[estado], className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          {icono && <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', ICONO_CLS[estado])}>{icono}</div>}
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{titulo}</div>
            {principal && (
              <div className="mt-1" title={principal.title}>
                <div className="text-[11px] uppercase tracking-wide text-text-faint">{principal.etiqueta}</div>
                <span className={cn('font-display font-bold tabular-nums tracking-tight', grande ? 'text-4xl' : 'text-3xl', PRINCIPAL_TONO[estado])}>{principal.valor}</span>
                {principal.sub != null && <div className="mt-0.5 text-sm text-text-muted">{principal.sub}</div>}
              </div>
            )}
          </div>
        </div>
        {metricas.length > 0 && (
          <div className={cn('flex flex-wrap items-start gap-x-8 gap-y-2', distribuir ? 'min-w-0 flex-1 justify-between' : 'justify-end')}>
            {metricas.map((m) => <KpiMetric key={m.etiqueta} m={m} derecha={!distribuir} />)}
          </div>
        )}
      </div>

      {distribucion && total > 0 && (
        <div className="mt-4">
          {distribucion.titulo && <div className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">{distribucion.titulo}</div>}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-border/40" role="group" aria-label={distribucion.titulo ?? 'Distribución'}>
            {visibles.map((s) => (
              <button
                key={s.clave}
                type="button"
                disabled={!distribucion.onToggle}
                title={s.title ?? `${s.etiqueta}: ${fmt(s.valor)} (${((s.valor / total) * 100).toFixed(0)}%)`}
                aria-label={`${s.etiqueta}: ${fmt(s.valor)}`}
                aria-pressed={distribucion.activo === s.clave}
                onClick={() => distribucion.onToggle?.(s.clave)}
                className={cn('h-full transition-opacity disabled:cursor-default', s.cls, distribucion.activo && distribucion.activo !== s.clave && 'opacity-30')}
                style={{ width: `${(s.valor / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
            {visibles.map((s) => (
              <button
                key={s.clave}
                type="button"
                disabled={!distribucion.onToggle}
                onClick={() => distribucion.onToggle?.(s.clave)}
                className={cn('inline-flex items-center gap-1.5 enabled:hover:text-text disabled:cursor-default', distribucion.activo === s.clave && 'font-semibold text-text')}
              >
                <span className={cn('inline-block size-2 rounded-full', s.cls)} />
                {s.etiqueta} <span className="tabular-nums">{fmt(s.valor)}</span>
              </button>
            ))}
            {distribucion.activo && distribucion.onToggle && (
              <button type="button" onClick={() => distribucion.onToggle?.(distribucion.activo ?? '')} className="text-accent hover:underline">Quitar filtro</button>
            )}
          </div>
        </div>
      )}

      {contexto.length > 0 && (
        <div className={cn('grid grid-cols-2 gap-3', contextoCols === 4 && 'lg:grid-cols-4', principal || metricas.length > 0 || distribucion ? 'mt-4 border-t border-border/60 pt-3' : 'mt-3')}>
          {contexto.map((m) => <KpiMetric key={m.etiqueta} m={m} />)}
        </div>
      )}

      {extra && <div className="mt-4">{extra}</div>}
      {pie != null && <div className="mt-2 text-[11px] text-text-faint">{pie}</div>}
    </div>
  );
}

/** Estado de espera mientras se arman los índices de un reporte (por tramos, sin trabar la pantalla): título, barra de avance y nota. */
export function CalculandoIndices({ titulo, progreso, nota }: { titulo: string; progreso: number; nota?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(progreso * 100)));
  return (
    <div className="flex h-full items-center justify-center p-8" role="status" aria-live="polite">
      <div className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <p className="font-display text-lg font-semibold">{titulo}</p>
        <p className="mt-1 text-sm text-text-muted">{nota ?? 'Estoy armando los índices con todos los libros; la pantalla sigue respondiendo.'}</p>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={pct} />
          <span className="w-10 text-right font-mono text-xs tabular-nums text-text-muted">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
