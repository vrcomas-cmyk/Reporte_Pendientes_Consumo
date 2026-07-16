import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  Users,
  PackageX,
  Clock4,
  TrendingDown,
  Warehouse,
  CircleDollarSign,
  UploadCloud,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KpiTile } from './KpiTile';
import { Heatmap } from './Heatmap';
import { useDataStore } from '@/store/dataStore';
import { getLatestAnalysis } from '@/services/reportService';
import { useUiStore } from '@/store/uiStore';
import { categorical } from '@/lib/chartColors';
import { formatCurrency, formatNumber } from '@/lib/utils';

export function DashboardPage() {
  const activeAnalysis = useDataStore((s) => s.activeAnalysis);
  const setActiveAnalysis = useDataStore((s) => s.setActiveAnalysis);
  const catalog = useDataStore((s) => s.catalog);
  const theme = useUiStore((s) => s.theme);
  const [loading, setLoading] = useState(!activeAnalysis);
  const palette = categorical(theme === 'dark');
  const gridColor = theme === 'dark' ? '#2d2d2b' : '#e4e3e0';
  const axisColor = theme === 'dark' ? '#a3a09a' : '#6c6963';

  useEffect(() => {
    if (activeAnalysis) {
      setLoading(false);
      return;
    }
    getLatestAnalysis()
      .then((r) => r && setActiveAnalysis(r))
      .finally(() => setLoading(false));
  }, [activeAnalysis, setActiveAnalysis]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-text-faint">Cargando…</div>;
  }

  if (!activeAnalysis) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Warehouse className="size-7" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Aún no hay análisis</h2>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Sube el catálogo maestro y el reporte diario para ver KPIs, tendencias y el top de materiales y ejecutivos.
          </p>
        </div>
        <Button asChild>
          <Link to="/carga">
            <UploadCloud className="size-4" /> Ir a Carga
          </Link>
        </Button>
      </div>
    );
  }

  const { kpis, topMateriales, topEjecutivos, monthlyInvoicing, heatmap } = activeAnalysis;

  const barData = topMateriales.map((m) => ({ name: m.material, importe: Math.round(m.importePendiente) }));
  const pieData = topEjecutivos.map((e) => ({ name: e.ejecutivo, value: Math.round(e.importePendiente) }));
  const lineData = monthlyInvoicing.map((m) => ({ mes: m.mes, importe: Math.round(m.importe) }));

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Panel general</h2>
          <p className="text-sm text-text-muted">
            {activeAnalysis.fileName} · {formatNumber(activeAnalysis.rowCount)} filas · catálogo {catalog ? 'sincronizado' : 'no disponible'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <KpiTile label="Materiales analizados" value={formatNumber(kpis.materialesAnalizados)} icon={Boxes} />
        <KpiTile label="Ejecutivos" value={formatNumber(kpis.ejecutivosCount)} icon={Users} />
        <KpiTile label="Sin consumo" value={formatNumber(kpis.productosSinConsumo)} icon={PackageX} tone="warning" />
        <KpiTile label="Corta caducidad" value={formatNumber(kpis.productosCortaCaducidad)} icon={Clock4} tone="danger" />
        <KpiTile label="Lento movimiento" value={formatNumber(kpis.productosLentoMovimiento)} icon={TrendingDown} tone="warning" />
        <KpiTile label="Inventario total" value={formatNumber(kpis.inventarioTotal)} icon={Warehouse} />
        <KpiTile label="Valor económico" value={formatCurrency(kpis.valorEconomico)} icon={CircleDollarSign} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 materiales por importe pendiente</CardTitle>
            <CardDescription>Todas las Sugerencias</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke={gridColor} horizontal={false} />
                <XAxis type="number" stroke={axisColor} fontSize={11} tickFormatter={(v) => formatNumber(v)} />
                <YAxis type="category" dataKey="name" stroke={axisColor} fontSize={11} width={90} />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  contentStyle={{ background: theme === 'dark' ? '#1c1c1b' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="importe" fill={palette[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribución de importe por ejecutivo (top 5)</CardTitle>
            <CardDescription>Todas las Sugerencias × catálogo</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={palette[i % palette.length]} stroke={theme === 'dark' ? '#1c1c1b' : '#ffffff'} strokeWidth={2} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  contentStyle={{ background: theme === 'dark' ? '#1c1c1b' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Facturación mensual</CardTitle>
          <CardDescription>Resumen_Fac agrupado por mes</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" stroke={axisColor} fontSize={11} />
              <YAxis stroke={axisColor} fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <Tooltip
                formatter={(v) => formatCurrency(Number(v))}
                contentStyle={{ background: theme === 'dark' ? '#1c1c1b' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="importe" stroke={palette[0]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 materiales</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topMateriales.map((m) => (
              <div key={m.material} className="flex items-center justify-between text-xs">
                <span className="truncate font-mono text-text-muted">{m.material}</span>
                <span className="font-medium">{formatCurrency(m.importePendiente)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top 5 ejecutivos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topEjecutivos.map((e) => (
              <div key={e.ejecutivo} className="flex items-center justify-between text-xs">
                <span className="truncate text-text-muted">{e.ejecutivo}</span>
                <span className="font-medium">{formatCurrency(e.importePendiente)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Inventario por sector × centro</CardTitle>
            <CardDescription>Mapa de calor</CardDescription>
          </CardHeader>
          <CardContent>
            <Heatmap cells={heatmap} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
