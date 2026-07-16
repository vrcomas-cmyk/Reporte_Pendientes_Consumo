import { useMemo } from 'react';
import { Inbox, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { usePanelStore } from '@/store/panelStore';
import { StatTile, EvolChart, ComparativaDual, Chip } from '@/modules/analytics/ui';
import { analisisVentas, type ClienteAna, type MatAna } from '@/core/analisis';

function pct(a: number, b: number) {
  const p = b ? (a / b - 1) * 100 : a ? 100 : 0;
  return <span className={p >= 0 ? 'text-emerald-500' : 'text-danger'}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>;
}

export function AnalisisPage() {
  const a = useAnalytics();
  const open = usePanelStore((s) => s.open);
  const A = useMemo(() => analisisVentas(a.rf, a.bo, a.enrich), [a.rf, a.bo, a.enrich]);

  if (!A) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Inbox className="size-8 text-text-faint" />
        <p className="text-sm text-text-muted">Para el análisis se necesita la hoja Resumen_Fac.</p>
        <Button asChild><Link to="/carga">Ir a Carga</Link></Button>
      </div>
    );
  }
  const k = A.kpi;

  const clientTable = (list: ClienteAna[], title: string, kind: 'riesgo' | 'var') => (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title} · {list.length}</h3>
      <div>
        <Table wrapperClassName="max-h-64">
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">{kind === 'riesgo' ? 'Base 12m' : '3m previos'}</TableHead><TableHead className="text-right">{kind === 'riesgo' ? '—' : 'Últ. 3m'}</TableHead><TableHead>{kind === 'riesgo' ? 'Situación' : 'Var.'}</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((c) => (
              <TableRow key={c.code} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'evol', kind: 'solic', key: c.code })}>
                <TableCell className="max-w-72 truncate">{c.razon || '—'}<div className="text-[11px] text-text-faint">Solic {c.code} · {c.ejec || '—'}</div></TableCell>
                <TableCell className="text-right">{formatCurrency(kind === 'riesgo' ? c.base ?? 0 : c.p3)}</TableCell>
                <TableCell className="text-right">{kind === 'riesgo' ? '—' : formatCurrency(c.a3)}</TableCell>
                <TableCell>{kind === 'riesgo' ? `${c.sinComprar} m sin comprar` : pct(c.a3, c.p3)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );

  const matTable = (list: MatAna[], title: string) => (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title} · {list.length}</h3>
      <div>
        <Table wrapperClassName="max-h-64">
          <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">3m previos</TableHead><TableHead className="text-right">Últ. 3m</TableHead><TableHead>Var.</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map((m) => (
              <TableRow key={m.code} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'material', material: m.code })}>
                <TableCell>{m.code}<div className="text-[11px] text-text-faint max-w-72 truncate">{m.texto}</div></TableCell>
                <TableCell className="text-right">{formatCurrency(m.p3)}</TableCell>
                <TableCell className="text-right">{formatCurrency(m.a3)}</TableCell>
                <TableCell>{pct(m.a3, m.p3)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );

  const exportar = () => {
    exportXlsxMultiSheet(`analisis_${stamp()}.xlsx`, [
      {
        name: 'Oportunidades',
        rows: A.ops.top.map((o) => ({ Pedido: o.pedido, Cliente: o.razon, Material: o.mat, 'Imp. pendiente': o.imp })),
      },
      {
        name: 'Sectores',
        rows: A.sectores.map((s) => ({ Sector: s.sector, '3m previos': s.p3, 'Últ. 3m': s.a3, 'Imp. 12m': s.i12, Grupos: s.grupos.size })),
      },
      {
        name: 'Clientes en riesgo',
        rows: A.riesgo.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, 'Base 12m': c.base ?? 0, 'Meses sin comprar': c.sinComprar })),
      },
      {
        name: 'Clientes a la baja',
        rows: A.caen.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, '3m previos': c.p3, 'Últ. 3m': c.a3 })),
      },
      {
        name: 'Clientes en crecimiento',
        rows: A.crecen.map((c) => ({ Cliente: c.razon, Solicitante: c.code, Ejecutivo: c.ejec, '3m previos': c.p3, 'Últ. 3m': c.a3 })),
      },
      {
        name: 'Materiales a la baja',
        rows: A.matCaen.map((m) => ({ Material: m.code, Descripción: m.texto, '3m previos': m.p3, 'Últ. 3m': m.a3 })),
      },
      {
        name: 'Materiales en crecimiento',
        rows: A.matSuben.map((m) => ({ Material: m.code, Descripción: m.texto, '3m previos': m.p3, 'Últ. 3m': m.a3 })),
      },
    ]);
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="font-display text-2xl font-semibold">Análisis</h2>
          <p className="text-sm text-text-muted">Inteligencia comercial sobre las series de Resumen_Fac</p></div>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={`Fact. ${k.refLbl} (últ. mes completo)`} value={formatCurrency(k.mesPrevImp)} sub={<>{pct(k.mesPrevImp, k.mesPrevAnt)} vs año ant.</>} />
        <StatTile label="Q corriente (a la fecha)" value={formatCurrency(k.qImp)} sub={<>{pct(k.qImp, k.qAnt)} vs año ant.</>} />
        <StatTile label="Clientes activos (≤3m)" value={formatNumber(k.activos3m)} sub={`de ${formatNumber(A.conc.nClientes)} en 12m`} />
        <StatTile label="Concentración 12m" value={`${(A.conc.top5 * 100).toFixed(0)}% top 5`} sub={`${(A.conc.top10 * 100).toFixed(0)}% top 10`} />
      </div>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Facturación mensual total</h3>
        <EvolChart serie={A.serieTotal} height={220} />
        <div className="mt-3"><ComparativaDual serie={A.serieTotal} /></div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Oportunidades en Sugerencias · pendiente × precio</h3>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <StatTile label="Importe pendiente total" value={formatCurrency(A.ops.total)} />
          <StatTile label="Surtible (con fuentes)" value={formatCurrency(A.ops.conFuente)} tone="text-emerald-500" />
          <StatTile label="Detenido por bloqueo" value={formatCurrency(A.ops.bloq)} tone="text-danger" />
        </div>
        <div>
          <Table wrapperClassName="max-h-64">
            <TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Material</TableHead><TableHead className="text-right">Imp. pendiente</TableHead></TableRow></TableHeader>
            <TableBody>
              {A.ops.top.map((o, i) => (
                <TableRow key={i} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'pedido', pedido: o.pedido })}>
                  <TableCell><span className="text-accent">{o.pedido}</span></TableCell>
                  <TableCell className="max-w-64 truncate">{o.razon}</TableCell>
                  <TableCell>{o.mat}</TableCell>
                  <TableCell className="text-right">{formatCurrency(o.imp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Sectores — alza / baja</h3>
        <div>
          <Table wrapperClassName="max-h-64">
            <TableHeader><TableRow><TableHead>Sector</TableHead><TableHead className="text-right">3m previos</TableHead><TableHead className="text-right">Últ. 3m</TableHead><TableHead className="text-right">Imp. 12m</TableHead><TableHead>Var.</TableHead></TableRow></TableHeader>
            <TableBody>
              {A.sectores.map((s) => (
                <TableRow key={s.sector} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => open({ type: 'sector', sector: s.sector })}>
                  <TableCell><Chip onClick={() => open({ type: 'sector', sector: s.sector })}>{s.sector}</Chip><div className="text-[11px] text-text-faint">{s.grupos.size} grupo(s)</div></TableCell>
                  <TableCell className="text-right">{formatCurrency(s.p3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.a3)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.i12)}</TableCell>
                  <TableCell>{pct(s.a3, s.p3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {clientTable(A.riesgo, 'Clientes en riesgo de abandono', 'riesgo')}
        {clientTable(A.caen, 'Clientes a la baja', 'var')}
        {clientTable(A.crecen, 'Clientes en crecimiento', 'var')}
        {matTable(A.matCaen, 'Materiales a la baja')}
        {matTable(A.matSuben, 'Materiales en crecimiento')}
      </div>
    </div>
  );
}
