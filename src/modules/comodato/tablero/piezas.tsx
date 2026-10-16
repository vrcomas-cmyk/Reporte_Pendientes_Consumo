import type { ReactNode } from 'react';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TooltipHint } from '@/components/ui/tooltip';
import { cn, formatCurrency } from '@/lib/utils';
import { type Fila, type TipoEquipo, num } from '@/core/comodatoTablero';

// Colores por rol (bueno / info / alerta / crítico / neutro) con las variables del tema de la app.
export const COLOR = {
  good: 'var(--success)', info: 'var(--info)', warn: 'var(--warning)', danger: 'var(--danger)', neutral: 'var(--text-faint)', neutral2: 'var(--text-muted)', accent: 'var(--accent)',
} as const;

export const STATUS_KEYS = ['Activo', 'En seguimiento', 'En riesgo', 'Inactivo', 'Sin compra', 'Complementario'] as const;
export const statusColor = (s: string): string => ({ Activo: COLOR.good, 'En seguimiento': COLOR.info, 'En riesgo': COLOR.warn, Inactivo: COLOR.danger, 'Sin compra': COLOR.neutral, Complementario: COLOR.neutral2 } as Record<string, string>)[s] ?? COLOR.neutral2;
export const rentColor = (r: string): string => ({ Rentable: COLOR.good, 'Margen positivo (no cubre inversión)': COLOR.warn, 'No rentable': COLOR.danger, 'Sin retorno aún': COLOR.neutral, 'Factura sin comodato': COLOR.info, Complementario: COLOR.neutral2 } as Record<string, string>)[r] ?? COLOR.neutral2;

export const DESC_STATUS: Record<string, string> = {
  Activo: 'Compró hace ≤45 días. Relación sana, seguimiento normal.',
  'En seguimiento': '46–90 días sin comprar. Consumo desacelerando: confirmar el próximo pedido.',
  'En riesgo': '91–150 días sin comprar. Señal fuerte de abandono: contactar.',
  Inactivo: 'Más de 150 días sin comprar. Cliente dormido o perdido.',
  'Sin compra': 'Canister en comodato que aún no ha comprado ninguna bolsa. El estado es por equipo: un cliente puede tener un equipo Activo y otro Sin compra.',
  Complementario: 'Equipo complementario (carro, placa o tubos): habilitador, no factura directo.',
};
export const DESC_TEND: Record<string, string> = {
  Creciendo: 'Últimos 90 días ≥110% de los 90 previos.',
  Reactivando: 'No tenía compra en los 90 previos y volvió a facturar.',
  Estable: 'Variación menor entre los últimos 90 días y los 90 previos.',
  Cayendo: 'Últimos 90 días ≤70% de los 90 previos.',
  'Sin actividad reciente': 'Sin facturación en los últimos 180 días.',
  'Complemento (no aplica)': 'Equipo complementario (carro, placa o tubos): no se mide tendencia.',
};
export const DESC_RENT: Record<string, string> = {
  Rentable: 'El margen acumulado ya cubre la inversión en el equipo.',
  'Margen positivo (no cubre inversión)': 'Deja margen, pero todavía no alcanza para pagar el equipo.',
  'No rentable': 'Lleva tiempo comprando y el margen no cubre la inversión.',
  'Sin retorno aún': 'Canister colocado que todavía no ha comprado bolsas.',
  'Factura sin comodato': 'Compra bolsas, pero no tiene equipo en comodato asignado en el libro.',
  Complementario: 'Equipo complementario: no se mide rentabilidad.',
};
export const DESC_RECUP: Record<string, string> = {
  'Vigente (nada que recuperar)': 'Cliente Activo o En seguimiento: está comprando, no hay equipo que recuperar.',
  'Complemento (no aplica)': 'Equipo complementario (carro, placa o tubos): no se recupera por rentabilidad.',
  'Sin equipo en comodato': 'Compra bolsas pero no tiene equipo en comodato: no hay equipo físico que recuperar.',
  'Por activar': 'Canister colocado sin primer pedido de bolsas.',
  'Sí - alta prioridad': 'Ya recuperó la inversión (ganancia neta >0) y dejó de comprar.',
  'Sí - media': 'Tiene margen positivo pero aún no cubre la inversión del equipo.',
  Baja: 'No rentable: evaluar retiro del equipo.',
};

const TONO_PILL: Record<string, string> = {
  Activo: 'bg-success/15 text-success', 'En seguimiento': 'bg-info/15 text-info', 'En riesgo': 'bg-warning/15 text-warning',
  Inactivo: 'bg-danger/15 text-danger', 'Sin compra': 'bg-bg-inset text-text-muted', Complementario: 'bg-bg-inset text-text-faint',
};

export function Pill({ s }: { s: unknown }) {
  const t = String(s ?? '');
  const el = <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', TONO_PILL[t] ?? 'bg-bg-inset text-text-muted')}>{t || '—'}</span>;
  return DESC_STATUS[t] ? <TooltipHint text={DESC_STATUS[t]}>{el}</TooltipHint> : el;
}

export function TendIcon({ t }: { t: unknown }) {
  const s = String(t ?? '');
  const arriba = ['Creciendo', 'Reactivando'].includes(s);
  const abajo = ['Cayendo', 'Sin actividad reciente'].includes(s);
  const el = <span className={cn('whitespace-nowrap text-xs font-medium', arriba ? 'text-success' : abajo ? 'text-danger' : 'text-text-muted')}>{arriba ? '▲' : abajo ? '▼' : '–'} {s}</span>;
  return DESC_TEND[s] ? <TooltipHint text={DESC_TEND[s]}>{el}</TooltipHint> : el;
}

export function RoiCell({ v }: { v: unknown }) {
  const n = num(v);
  return <span className={cn('tabular-nums font-medium', n >= 5 ? 'text-success' : n >= 1 ? 'text-warning' : 'text-danger')}>{n.toFixed(1)}x</span>;
}

export function RecupCell({ v }: { v: unknown }) {
  const s = String(v ?? '');
  return DESC_RECUP[s] ? <TooltipHint text={DESC_RECUP[s]}><span>{s}</span></TooltipHint> : <span>{s}</span>;
}

export function TipoTag({ tipo }: { tipo: TipoEquipo }) {
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', tipo === 'Canister' ? 'bg-accent-soft text-accent' : 'bg-bg-inset text-text-muted')}>{tipo}</span>;
}

export const fmtK = (n: unknown): string => {
  const v = num(n);
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${Math.round(v)}`;
};
export const fmt = (n: unknown): string => formatCurrency(Math.round(num(n)));
export const fmtN = (n: unknown): string => num(n).toLocaleString('es-MX');
export const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '0%');

/** Tarjeta de KPI; con `onClick` filtra el tablero. */
export function Kpi({ label, value, sub, onClick, active, desc }: { label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void; active?: boolean; desc?: string }) {
  const texto = desc ?? DESC_KPI[label];
  const cuerpo = (
    <>
      <div className="text-[11px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {sub != null && <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div>}
    </>
  );
  const cls = cn('rounded-xl border bg-bg-elevated p-3 text-left shadow-sm', active ? 'border-accent' : 'border-border', onClick && 'cursor-pointer transition-colors hover:border-accent/60');
  const el = onClick ? <button type="button" onClick={onClick} className={cls}>{cuerpo}</button> : <div className={cls}>{cuerpo}</div>;
  return texto ? <TooltipHint text={texto}>{el}</TooltipHint> : el;
}

export function KpiGrid({ children, cols }: { children: ReactNode; cols: 4 | 6 | 8 }) {
  return <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-4', cols === 6 && 'xl:grid-cols-6', cols === 8 && 'xl:grid-cols-8')}>{children}</div>;
}

export function Seccion({ titulo, hint, children, className, derecha }: { titulo: ReactNode; hint?: string; children: ReactNode; className?: string; derecha?: ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-border bg-bg-elevated p-4 shadow-sm', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{titulo}{hint && <span className="ml-2 text-[11px] font-normal text-text-faint">{hint}</span>}</h3>
        {derecha}
      </div>
      {children}
    </section>
  );
}

export interface Col { t: ReactNode; num?: boolean; className?: string; onSort?: () => void; title?: string }
/** Qué significa cada encabezado de tabla; se muestra al pasar el cursor (salvo que la columna traiga su propio `desc`). */
export const DESC_COL: Record<string, string> = {
  Cliente: 'Razón social del cliente (con el código de solicitante debajo).',
  Solicitante: 'Código SAP del cliente que hace el pedido.',
  Zona: 'Zona comercial (grupo de vendedores) a la que pertenece el cliente.',
  Grupo: 'Grupo de cliente (Hospitales, Gobierno, etc.).',
  Equipo: 'Equipo entregado en comodato (canister, carrito o complemento).',
  Tipo: 'Canister = equipo que consume bolsas; Carrito y Complemento (placa, tubos) son habilitadores que no facturan por sí mismos.',
  Estado: 'Actividad del equipo según los días desde la última compra de sus bolsas: Activo ≤45, En seguimiento 46–90, En riesgo 91–150, Inactivo >150; Sin compra si nunca ha comprado.',
  Tendencia: 'Facturación de los últimos 90 días contra los 90 previos: Creciendo (≥110%), Estable, Cayendo (≤70%), Reactivando o Sin actividad reciente.',
  Recuperable: 'Qué tan conveniente es recuperar el equipo: Sí (alta prioridad / media), Baja, Por activar, o sin acción necesaria.',
  'Equipos en comodato': 'Cantidad de equipos con comodato vigente en ese grupo.',
  'Equipos asignados': 'Número de equipos (registros de comodato) que tiene el cliente, incluidos carritos y complementos.',
  'Clientes con este equipo': 'Clientes distintos que tienen este equipo en comodato.',
  'Clientes que la compran': 'Clientes distintos que han comprado esta bolsa.',
  'Piezas en comodato': 'Piezas netas entregadas en comodato: entregas (YBFD) menos devoluciones (ZBRE).',
  Piezas: 'Piezas netas entregadas en comodato: entregas (YBFD) menos devoluciones (ZBRE).',
  'Inversión en comodato': 'Piezas en comodato × costo unitario del equipo en el catálogo de materiales.',
  'Bolsas facturadas': 'Bolsas (consumibles) facturadas a esos clientes con ese equipo.',
  'Facturación acumulada': 'Importe facturado en bolsas (en el periodo filtrado, o todo el histórico si no hay periodo).',
  'Margen acumulado': 'Importe facturado menos el costo de las bolsas (en el periodo filtrado, o todo el histórico).',
  'ROI (veces)': 'Margen acumulado ÷ inversión en comodato. 1x = ya recuperó el equipo; ≥5x = muy rentable.',
  'ROI (x)': 'Margen acumulado ÷ inversión en comodato.',
  '% de margen sobre venta': 'Margen ÷ facturación.',
  '% de margen': 'Margen ÷ importe vendido.',
  'Importe vendido': 'Importe facturado de esta bolsa.',
  'Margen total': 'Importe vendido menos el costo de las bolsas.',
  'Precio promedio por bolsa': 'Importe vendido ÷ bolsas facturadas.',
  Bolsa: 'Consumible (bolsa) que se factura con el equipo.',
  'Días sin compra': 'Días transcurridos desde la última facturación de bolsas de este equipo.',
  'Último mes facturado': 'Mes más reciente con facturación de bolsas.',
  'Importe último mes': 'Importe facturado en el último mes con venta.',
  'Penúltimo mes': 'Mes con venta anterior al último.',
  'Importe penúltimo': 'Importe facturado en el penúltimo mes con venta.',
  'Última facturación': 'Fecha de la última línea facturada (en libros mensuales, el último día con venta del mes).',
  'Última entrega de comodato': 'Fecha de la última entrega del equipo (pedido YBFD).',
  'Frecuencia (meses)': 'Meses promedio entre un mes con venta y el siguiente (0 = solo un mes con venta).',
  'Frecuencia de entrega (días)': 'Días promedio entre entregas de comodato.',
  'Acción sugerida': 'Recomendación automática según estado, ROI y tendencia.',
  'Piezas última entrega': 'Piezas de la última entrega de comodato.',
  'Penúltima entrega': 'Fecha de la entrega de comodato anterior a la última.',
  'Piezas penúltima entrega': 'Piezas de la entrega de comodato anterior a la última.',
  'Frecuencia de entrega (meses)': 'Meses promedio entre entregas de comodato.',
  'Importe último / Δ': 'Importe del último mes y su variación contra el penúltimo.',
  'Piezas última entrega / Δ': 'Piezas de la última entrega y su variación contra la anterior.',
  'Importe penúltimo mes': 'Importe facturado en el penúltimo mes con venta.',
};
/** Qué significa cada indicador del tablero. */
export const DESC_KPI: Record<string, string> = {
  'Facturación total': 'Suma de la facturación de bolsas de los registros que se ven (según filtros y periodo).',
  'Margen total': 'Facturación menos costo de las bolsas.',
  'Inversión comodato': 'Costo de los equipos entregados en comodato (piezas netas × costo).',
  'Ganancia neta': 'Margen total menos inversión en comodato.',
  'Clientes (solicitantes)': 'Solicitantes distintos entre los registros que se ven.',
  '% de equipos rentables': 'Equipos con ROI ≥ 1 entre el total de equipos en comodato.',
  'Carritos (piezas)': 'Piezas de carritos (equipo complementario). Clic filtra por carritos.',
  'Canisters sin facturar': 'Canisters colocados que aún no han comprado ninguna bolsa. Clic filtra.',
  'Equipos recuperables': 'Equipos cuyo estado de recuperación empieza con “Sí”: dejaron de comprar y conviene recuperarlos.',
  'Clientes a visitar': 'Registros con más de 90 días sin compra (sin contar complementos ni sin compra).',
  'Rentables apagándose': 'Equipos con ROI > 2 cuya tendencia va cayendo. Clic filtra.',
  'Inversión no recuperada': 'Inversión de equipos “No rentable” o con margen positivo que aún no cubre la inversión.',
  'En riesgo': 'Equipos con 91–150 días sin comprar. Clic filtra.',
  'Registros filtrados': 'Equipos (cliente + equipo) que cumplen los filtros actuales.',
  'En riesgo/inactivos': 'Equipos con más de 90 días sin comprar: conviene contactar al cliente.',
};
/** Tabla simple con encabezado fijo; `filas` ya son <TableRow>. */
export function Tabla({ titulo, cols, filas, cuenta, maxH = 'max-h-96' }: { titulo?: ReactNode; cols: Col[]; filas: ReactNode; cuenta?: string; maxH?: string }) {
  return (
    <section className="rounded-xl border border-border bg-bg-elevated shadow-sm">
      {titulo != null && (
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {cuenta && <span className="text-[11px] text-text-faint">{cuenta}</span>}
        </div>
      )}
      <Table wrapperClassName={cn(maxH, 'overflow-auto border-t border-border')}>
        <TableHeader>
          <TableRow>
            {cols.map((c, i) => {
              const clave = typeof c.t === 'string' ? c.t : '';
              const desc = c.title ?? (clave ? DESC_COL[clave] : undefined);
              return (
                <TableHead key={i} className={cn(c.num && 'text-right', c.onSort && 'cursor-pointer select-none', c.className)} onClick={c.onSort}>
                  {desc ? <TooltipHint text={desc}><span className="cursor-help border-b border-dotted border-text-faint">{c.t}</span></TooltipHint> : c.t}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>{filas}</TableBody>
      </Table>
    </section>
  );
}

/** Texto de un campo de la fila. */
export const t = (d: Fila, k: string): string => (d[k] == null ? '' : String(d[k]));
