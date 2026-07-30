import { useMemo } from 'react';
import { AlertTriangle, Users, Clock4 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatTile, Chip, RowContextMenu } from '@/modules/analytics/ui';
import { norm, num } from '@/modules/analytics/helpers';
import { analisisVentas } from '@/core/comercial';

/** "Hoy" — lo que vale la pena revisar en la sesión, en un solo lugar: pedidos
 * bloqueados con más importe en juego, clientes en riesgo de abandono, y
 * lotes por vencer pronto. Es una foto del ESTADO ACTUAL, no un diff contra
 * ayer — la app no guarda snapshots históricos fila por fila (solo un resumen
 * de KPIs en el historial de sincronización), así que "qué cambió desde
 * ayer" no es algo que se pueda calcular todavía sin agregar esa infraestructura. */
export function HoyPage() {
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);

  const bloqueados = useMemo(() => {
    return a.bo
      .filter((it) => it.bo.bloqueado && num(it.bo.cantidadPendiente) > 0)
      .map((it) => ({ it, imp: num(it.bo.cantidadPendiente) * num(it.bo.precio) }))
      .sort((x, y) => y.imp - x.imp);
  }, [a.bo]);
  const bloqueadosImp = bloqueados.reduce((s, x) => s + x.imp, 0);

  const A = useMemo(() => analisisVentas(a.rf, a.bo, a.enrich), [a.rf, a.bo, a.enrich]);
  const riesgo = A?.riesgo ?? [];

  const consumoActivoPorMaterial = useMemo(() => {
    const s = new Set<string>();
    (a.result?.consumo ?? []).forEach((r) => { if (r.consumoActual > 0) s.add(norm(r.material)); });
    return s;
  }, [a.result]);

  const lotesPorVencer = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return a.lotes
      .map((l) => {
        if (!l.fechaCaducidad) return null;
        const d = new Date(l.fechaCaducidad);
        if (Number.isNaN(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        const dias = Math.round((d.getTime() - now.getTime()) / 86400000);
        if (dias < 0 || dias > 30) return null;
        return { ...l, dias, conDemanda: consumoActivoPorMaterial.has(norm(l.material)) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((x, y) => (y.conDemanda ? 1 : 0) - (x.conDemanda ? 1 : 0) || x.dias - y.dias);
  }, [a.lotes, consumoActivoPorMaterial]);

  if (!a.result && !a.rss) {
    return <EmptyState title="Aún no hay reporte cargado" description="Carga el reporte diario para ver el resumen de hoy." action={{ to: '/carga', label: 'Ir a Carga' }} />;
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Hoy</h2>
        <p className="text-sm text-text-muted">Estado actual — pedidos bloqueados, clientes en riesgo y lotes por vencer, en un vistazo</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Pedidos bloqueados" value={formatNumber(bloqueados.length)} sub={formatCurrency(bloqueadosImp)} tone="text-danger" />
        <StatTile label="Clientes en riesgo" value={formatNumber(riesgo.length)} sub="≥3 compras, 3-24m sin comprar" tone="text-warning" />
        <StatTile label="Lotes por vencer (≤30d)" value={formatNumber(lotesPorVencer.length)} sub={`${lotesPorVencer.filter((l) => l.conDemanda).length} con demanda activa`} tone="text-danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-danger" /> Pedidos bloqueados · mayor importe</CardTitle>
          <CardDescription>De Pedidos — pendiente × precio, bloqueado ≠ vacío</CardDescription>
        </CardHeader>
        <CardContent>
          {bloqueados.length === 0 ? <p className="text-sm text-text-muted">Sin pedidos bloqueados.</p> : (
            <Table wrapperClassName="max-h-72 rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Material</TableHead><TableHead className="text-right">Imp. pendiente</TableHead></TableRow></TableHeader>
              <TableBody>
                {bloqueados.slice(0, 15).map(({ it, imp }) => (
                  <RowContextMenu
                    key={it.k}
                    label={it.bo.pedido}
                    onVerDetalle={() => open({ type: 'sugDetalle', boKey: it.k })}
                    copyItems={[{ label: 'Pedido', value: it.bo.pedido }, { label: 'Material', value: it.bo.materialBase }]}
                  >
                    <TableRow className="cursor-pointer bg-amber-400/20 hover:bg-amber-400/30" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'sugDetalle', boKey: it.k })}>
                      <TableCell><Chip onClick={() => open({ type: 'pedido', pedido: it.bo.pedido })}>{it.bo.pedido}</Chip></TableCell>
                      <TableCell className="max-w-64 truncate">{it.bo.razonSocial}</TableCell>
                      <TableCell><Chip onClick={() => open({ type: 'material', material: it.bo.materialBase })}>{it.bo.materialBase}</Chip></TableCell>
                      <TableCell className="text-right">{formatCurrency(imp)}</TableCell>
                    </TableRow>
                  </RowContextMenu>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-4 text-warning" /> Clientes en riesgo de abandono</CardTitle>
          <CardDescription>De Análisis — compraban seguido y llevan 3-24 meses sin volver</CardDescription>
        </CardHeader>
        <CardContent>
          {riesgo.length === 0 ? <p className="text-sm text-text-muted">Sin clientes en riesgo.</p> : (
            <Table wrapperClassName="max-h-72 rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Base 12m</TableHead><TableHead>Situación</TableHead></TableRow></TableHeader>
              <TableBody>
                {riesgo.map((c) => (
                  <RowContextMenu key={c.code} label={c.razon || c.code} onVerDetalle={() => open({ type: 'evol', kind: 'solic', key: c.code })} copyItems={[{ label: 'Cliente', value: c.razon }]}>
                    <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'evol', kind: 'solic', key: c.code })}>
                      <TableCell className="max-w-72 truncate"><Chip onClick={() => open({ type: 'evol', kind: 'solic', key: c.code })}>{c.razon || '—'}</Chip><div className="text-[11px] text-text-faint">{c.ejec || '—'}</div></TableCell>
                      <TableCell className="text-right">{formatCurrency(c.base ?? 0)}</TableCell>
                      <TableCell>{c.sinComprar} m sin comprar</TableCell>
                    </TableRow>
                  </RowContextMenu>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock4 className="size-4 text-danger" /> Lotes por vencer (≤30 días)</CardTitle>
          <CardDescription>De Inv Condición — priorizados por si el material tiene consumo reciente</CardDescription>
        </CardHeader>
        <CardContent>
          {lotesPorVencer.length === 0 ? <p className="text-sm text-text-muted">Sin lotes por vencer en 30 días.</p> : (
            <Table wrapperClassName="max-h-72 rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Lote / Centro</TableHead><TableHead className="text-right">Disp.</TableHead><TableHead>Vence</TableHead><TableHead>Demanda</TableHead></TableRow></TableHeader>
              <TableBody>
                {lotesPorVencer.slice(0, 15).map((l, i) => (
                  <RowContextMenu key={i} label={l.material} onVerDetalle={() => open({ type: 'material', material: l.material })} copyItems={[{ label: 'Material', value: l.material }, { label: 'Lote', value: l.lote }]}>
                    <TableRow className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'material', material: l.material })}>
                      <TableCell><Chip onClick={() => open({ type: 'material', material: l.material })}>{l.material}</Chip><div className="text-[11px] text-text-faint max-w-56 truncate">{l.textoBreve}</div></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{l.lote || '—'} · {l.centro}</TableCell>
                      <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{l.dias} d<div className="text-[10px] text-text-faint">{formatFechaCaducidad(l.fechaCaducidad)}</div></TableCell>
                      <TableCell>{l.conDemanda ? <span className="text-emerald-500">Activa</span> : <span className="text-text-faint">Sin consumo reciente</span>}</TableCell>
                    </TableRow>
                  </RowContextMenu>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
