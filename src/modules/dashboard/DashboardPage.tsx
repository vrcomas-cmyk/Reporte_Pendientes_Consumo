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
import { Skeleton } from '@/components/ui/skeleton';
import { KpiTile } from './KpiTile';
import { Heatmap } from './Heatmap';
import { useDataStore } from '@/store/dataStore';
import { getLatestAnalysis } from '@/services/reportService';
import { useUiStore } from '@/store/uiStore';
import { categorical } from '@/lib/chartColors';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { topEjecutivos as computeTopEjecutivos } from '@/core/analysis';

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
    // Mirrors the real layout below (KPI strip + two-up card row) instead of
    // a bare centered word — a blank "Cargando…" read as unfinished next to
    // the otherwise-polished sidebar motion and sticky-table craft elsewhere.
    return (
      <div className="flex h-full flex-col gap-5 overflow-auto p-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[72px]" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  // Catalog and daily report sync independently (see UploadPage) — only bail
  // out to the empty state when NEITHER has landed yet. Whatever catalog-only
  // data is available (ejecutivos) should render right away instead of
  // waiting on the daily report, which obviously can't supply the rest
  // (materiales, facturación, inventario) until it syncs too.
  if (!activeAnalysis && !catalog) {
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

  const kpis = activeAnalysis?.kpis ?? null;
  const topMateriales = activeAnalysis?.topMateriales ?? [];
  const monthlyInvoicing = activeAnalysis?.monthlyInvoicing ?? [];
  const heatmap = activeAnalysis?.heatmap ?? [];
  // Ejecutivos only needs the catalog (see topEjecutivos()) — with no daily
  // report yet this is every catalog executive at 0, not an empty list.
  const topEjecutivos = activeAnalysis?.topEjecutivos ?? computeTopEjecutivos([], catalog);

  const barData = topMateriales.map((m) => ({ name: m.material, importe: Math.round(m.importePendiente) }));
  // `topEjecutivos` now holds every catalog executive (0 included) sorted by
  // importe — the pie chart still only wants the top slice, real 0-importe
  // slivers would just clutter it.
  const pieData = topEjecutivos.filter((e) => e.importePendiente > 0).slice(0, 5).map((e) => ({ name: e.ejecutivo, value: Math.round(e.importePendiente) }));
  const lineData = monthlyInvoicing.map((m) => ({ mes: m.mes, importe: Math.round(m.importe) }));

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Panel general</h2>
          <p className="text-sm text-text-muted">
            {activeAnalysis ? <>{activeAnalysis.fileName} · {formatNumber(activeAnalysis.rowCount)} filas</> : 'Reporte diario aún no sincronizado'} · catálogo {catalog ? 'sincronizado' : 'no disponible'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <KpiTile label="Materiales analizados" value={formatNumber(kpis?.materialesAnalizados ?? 0)} icon={Boxes} />
        {/* Ejecutivos comes from the catalog directly (topEjecutivos.length), not kpis —
            it must show real numbers the instant the catalog syncs, before any daily report. */}
        <KpiTile label="Ejecutivos" value={formatNumber(topEjecutivos.length)} icon={Users} />
        <KpiTile label="Sin consumo" value={formatNumber(kpis?.productosSinConsumo ?? 0)} icon={PackageX} tone="warning" />
        <KpiTile label="Corta caducidad" value={formatNumber(kpis?.productosCortaCaducidad ?? 0)} icon={Clock4} tone="danger" />
        <KpiTile label="Lento movimiento" value={formatNumber(kpis?.productosLentoMovimiento ?? 0)} icon={TrendingDown} tone="warning" />
        <KpiTile label="Inventario total" value={formatNumber(kpis?.inventarioTotal ?? 0)} icon={Warehouse} />
        <KpiTile label="Valor económico" value={formatCurrency(kpis?.valorEconomico ?? 0)} icon={CircleDollarSign} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 materiales por importe pendiente</CardTitle>
            <CardDescription>Todas las Sugerencias</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {!activeAnalysis ? (
              <div className="flex h-full items-center justify-center text-xs text-text-faint">Sin datos — carga el reporte diario.</div>
            ) : (
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribución de importe por ejecutivo (top 5)</CardTitle>
            <CardDescription>Todas las Sugerencias × catálogo</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {!activeAnalysis ? (
              <div className="flex h-full items-center justify-center text-xs text-text-faint">Sin datos — carga el reporte diario.</div>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Facturación mensual</CardTitle>
          <CardDescription>Resumen_Fac agrupado por mes</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {!activeAnalysis ? (
            <div className="flex h-full items-center justify-center text-xs text-text-faint">Sin datos — carga el reporte diario.</div>
          ) : (
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
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 materiales</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!activeAnalysis ? (
              <div className="text-xs text-text-faint">Sin datos — carga el reporte diario.</div>
            ) : topMateriales.map((m) => (
              <div key={m.material} className="flex items-center justify-between text-xs">
                <span className="truncate font-mono text-text-muted">{m.material}</span>
                <span className="font-medium">{formatCurrency(m.importePendiente)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ejecutivos</CardTitle>
            <CardDescription>{topEjecutivos.length} del catálogo · pendiente en 0 si no tienen venta</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-72 flex-col gap-2 overflow-auto">
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
            {!activeAnalysis ? (
              <div className="text-xs text-text-faint">Sin datos — carga el reporte diario.</div>
            ) : <Heatmap cells={heatmap} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
