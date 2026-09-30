import { memo, useMemo } from 'react';
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { formatCurrency, cn } from '@/lib/utils';
import { CHART_UI } from '@/lib/chartColors';
import type { PuenteVenta } from '@/core/analisisDirectivo';

interface Paso {
  nombre: string;
  hint: string;
  tipo: 'total' | 'delta';
  valor: number;
  /** Base invisible de la barra apilada (donde empieza el escalón). */
  base: number;
  /** Alto visible de la barra. */
  alto: number;
  etiqueta: string;
}

const compacto = (n: number): string => {
  const a = Math.abs(n);
  const v = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K` : a.toFixed(0);
  return `${n < 0 ? '−' : ''}$${v}`;
};

/** Puente de venta (gráfica de cascada): arranca en la venta del periodo A,
 * suma/resta el aporte de cada movimiento de clientes (altas, recuperados,
 * clientes que crecen, que caen, bajas) y llega exactamente a la venta del
 * periodo B — responde "¿de dónde salió el cambio?" de un vistazo. Totales en
 * gris neutro, aumentos en verde, disminuciones en rojo; cada barra lleva su
 * valor con signo (el color nunca es el único canal) y un tooltip que dice qué
 * significa el escalón y qué % de la venta A representa. */
export const PuenteVentaChart = memo(function PuenteVentaChart({ puente, labelA, labelB, height = 300 }: {
  puente: PuenteVenta;
  labelA: string;
  labelB: string;
  height?: number;
}) {
  const verde = CHART_UI.positive, rojo = CHART_UI.negative, neutro = CHART_UI.neutral;
  const gridColor = CHART_UI.grid;

  const pasos = useMemo<Paso[]>(() => {
    const defs: { nombre: string; hint: string; valor: number; omitirSiCero?: boolean }[] = [
      { nombre: 'Altas', hint: 'Clientes que compraron por primera vez en el periodo B.', valor: puente.altas },
      { nombre: 'Recuperados', hint: 'Clientes que ya habían comprado, no compraron en A y volvieron en B.', valor: puente.recuperados },
      { nombre: 'Crecen', hint: 'Clientes activos en A y B que compraron MÁS en B (suma del aumento).', valor: puente.crecimiento },
      { nombre: 'Caen', hint: 'Clientes activos en A y B que compraron MENOS en B (suma de la caída).', valor: puente.decrecimiento },
      { nombre: 'Bajas', hint: 'Clientes que compraron en A y ya no compraron en B (todo lo que facturaban).', valor: puente.bajas },
      { nombre: 'Otros', hint: 'Venta sin solicitante identificado — no se puede atribuir a un cliente.', valor: puente.otros, omitirSiCero: true },
    ];
    const out: Paso[] = [{ nombre: `Venta A`, hint: `Facturación de ${labelA}.`, tipo: 'total', valor: puente.ventaA, base: 0, alto: puente.ventaA, etiqueta: compacto(puente.ventaA) }];
    let acumulado = puente.ventaA;
    for (const d of defs) {
      if (d.omitirSiCero && d.valor === 0) continue;
      const fin = acumulado + d.valor;
      out.push({ nombre: d.nombre, hint: d.hint, tipo: 'delta', valor: d.valor, base: Math.min(acumulado, fin), alto: Math.abs(d.valor), etiqueta: `${d.valor >= 0 ? '+' : ''}${compacto(d.valor)}` });
      acumulado = fin;
    }
    out.push({ nombre: 'Venta B', hint: `Facturación de ${labelB}.`, tipo: 'total', valor: puente.ventaB, base: 0, alto: puente.ventaB, etiqueta: compacto(puente.ventaB) });
    return out;
  }, [puente, labelA, labelB]);

  const color = (p: Paso) => (p.tipo === 'total' ? neutro : p.valor >= 0 ? verde : rojo);

  return (
    <div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pasos} margin={{ top: 22, right: 8, bottom: 4, left: 4 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="nombre" tick={{ fontSize: 11 }} interval={0} />
            <YAxis tick={{ fontSize: 10 }} width={54} tickFormatter={(v) => compacto(Number(v))} />
            <ReferenceLine y={puente.ventaA} stroke={neutro} strokeDasharray="4 4" strokeOpacity={0.6} />
            <Tooltip
              cursor={{ fill: 'var(--text)', fillOpacity: 0.05 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Paso | undefined;
                if (!active || !p) return null;
                const pct = puente.ventaA ? (p.valor / puente.ventaA) * 100 : 0;
                return (
                  <div className="max-w-64 rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: CHART_UI.surface, borderColor: gridColor, color: CHART_UI.label }}>
                    <p className="font-display text-sm font-semibold">{p.nombre}</p>
                    <p className={cn('mt-0.5 text-base font-semibold tabular-nums', p.tipo === 'total' ? '' : p.valor >= 0 ? 'text-success' : 'text-danger')}>
                      {p.tipo === 'delta' && p.valor > 0 ? '+' : ''}{formatCurrency(p.valor)}
                    </p>
                    {p.tipo === 'delta' && <p className="text-text-faint">{pct > 0 ? '+' : ''}{pct.toFixed(1)}% de la venta A</p>}
                    <p className="mt-1 text-text-muted">{p.hint}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} legendType="none" />
            <Bar dataKey="alto" stackId="w" radius={[4, 4, 0, 0]} isAnimationActive={false} legendType="none">
              {pasos.map((p) => <Cell key={p.nombre} fill={color(p)} />)}
              <LabelList dataKey="etiqueta" position="top" style={{ fontSize: 11, fontWeight: 600, fill: CHART_UI.label }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: neutro }} />Venta del periodo</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: verde }} />Suma (+)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: rojo }} />Resta (−)</span>
        <span className="text-text-faint">Línea punteada = venta {labelA}</span>
      </div>
    </div>
  );
});
