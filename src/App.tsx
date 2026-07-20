import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/auth/AuthGate';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { AnalyticsProvider } from '@/modules/analytics/AnalyticsContext';
import { PanelHost } from '@/modules/analytics/PanelHost';

// Dashboard + shell stay eager for instant first paint. Every other route is
// code-split so its JS (and heavy deps like recharts/xlsx pulled in transitively)
// only downloads when the user actually navigates there. Cuts the initial bundle
// from a single ~1.5 MB chunk to shell + per-view chunks.
const UploadPage = lazy(() => import('@/modules/upload/UploadPage').then((m) => ({ default: m.UploadPage })));
const GenerarReportePage = lazy(() => import('@/modules/generar/GenerarReportePage').then((m) => ({ default: m.GenerarReportePage })));
const ComodatoPage = lazy(() => import('@/modules/comodato/ComodatoPage').then((m) => ({ default: m.ComodatoPage })));
const ProcessingPage = lazy(() => import('@/modules/processing/ProcessingPage').then((m) => ({ default: m.ProcessingPage })));
const ResultsPage = lazy(() => import('@/modules/results/ResultsPage').then((m) => ({ default: m.ResultsPage })));
const HistoryPage = lazy(() => import('@/modules/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const LogsPage = lazy(() => import('@/modules/logs/LogsPage').then((m) => ({ default: m.LogsPage })));
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const InventarioPage = lazy(() => import('@/modules/inventario/InventarioPage').then((m) => ({ default: m.InventarioPage })));
const SugerenciasPage = lazy(() => import('@/modules/sugerencias/SugerenciasPage').then((m) => ({ default: m.SugerenciasPage })));
const ConsumoPage = lazy(() => import('@/modules/consumo/ConsumoPage').then((m) => ({ default: m.ConsumoPage })));
const ResumenSinPage = lazy(() => import('@/modules/resumenSin/ResumenSinPage').then((m) => ({ default: m.ResumenSinPage })));
const AnalisisPage = lazy(() => import('@/modules/analisis/AnalisisPage').then((m) => ({ default: m.AnalisisPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <BrowserRouter>
          <AnalyticsProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/carga" element={<Suspense fallback={<RouteFallback />}><UploadPage /></Suspense>} />
                <Route path="/generar" element={<Suspense fallback={<RouteFallback />}><GenerarReportePage /></Suspense>} />
                <Route path="/procesamiento" element={<Suspense fallback={<RouteFallback />}><ProcessingPage /></Suspense>} />
                <Route path="/resultados" element={<Suspense fallback={<RouteFallback />}><ResultsPage /></Suspense>} />
                <Route path="/inventario" element={<Suspense fallback={<RouteFallback />}><InventarioPage /></Suspense>} />
                <Route path="/sugerencias" element={<Suspense fallback={<RouteFallback />}><SugerenciasPage /></Suspense>} />
                <Route path="/consumo" element={<Suspense fallback={<RouteFallback />}><ConsumoPage /></Suspense>} />
                <Route path="/resumen-sin" element={<Suspense fallback={<RouteFallback />}><ResumenSinPage /></Suspense>} />
                <Route path="/analisis" element={<Suspense fallback={<RouteFallback />}><AnalisisPage /></Suspense>} />
                <Route path="/comodato" element={<Suspense fallback={<RouteFallback />}><ComodatoPage /></Suspense>} />
                <Route path="/historial" element={<Suspense fallback={<RouteFallback />}><HistoryPage /></Suspense>} />
                <Route path="/registros" element={<Suspense fallback={<RouteFallback />}><LogsPage /></Suspense>} />
                <Route path="/ajustes" element={<Suspense fallback={<RouteFallback />}><SettingsPage /></Suspense>} />
              </Route>
            </Routes>
            <PanelHost />
          </AnalyticsProvider>
        </BrowserRouter>
      </AuthGate>
    </QueryClientProvider>
  );
}

export default App;
