import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/auth/AuthGate';
import { ModuleGuard, AdminGuard } from '@/components/auth/ModuleGuard';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Toaster } from '@/components/feedback/Toaster';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { AnalyticsProvider } from '@/modules/analytics/AnalyticsContext';
import { PanelHost } from '@/modules/analytics/PanelHost';
import { useSolicitudStore } from '@/store/solicitudStore';

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
const SolicitudesPage = lazy(() => import('@/modules/solicitudes/SolicitudesPage').then((m) => ({ default: m.SolicitudesPage })));
const AdminPage = lazy(() => import('@/modules/admin/AdminPage').then((m) => ({ default: m.AdminPage })));

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
  const hydrateSolicitudes = useSolicitudStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateSolicitudes();
  }, [hydrateSolicitudes]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthGate>
          <BrowserRouter>
            <AnalyticsProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/" element={<ModuleGuard moduleKey="dashboard"><DashboardPage /></ModuleGuard>} />
                  <Route path="/carga" element={<ModuleGuard moduleKey="carga"><Suspense fallback={<RouteFallback />}><UploadPage /></Suspense></ModuleGuard>} />
                  <Route path="/generar" element={<ModuleGuard moduleKey="generar"><Suspense fallback={<RouteFallback />}><GenerarReportePage /></Suspense></ModuleGuard>} />
                  <Route path="/procesamiento" element={<ModuleGuard moduleKey="procesamiento"><Suspense fallback={<RouteFallback />}><ProcessingPage /></Suspense></ModuleGuard>} />
                  <Route path="/resultados" element={<ModuleGuard moduleKey="resultados"><Suspense fallback={<RouteFallback />}><ResultsPage /></Suspense></ModuleGuard>} />
                  <Route path="/inventario" element={<ModuleGuard moduleKey="inventario"><Suspense fallback={<RouteFallback />}><InventarioPage /></Suspense></ModuleGuard>} />
                  <Route path="/sugerencias" element={<ModuleGuard moduleKey="sugerencias"><Suspense fallback={<RouteFallback />}><SugerenciasPage /></Suspense></ModuleGuard>} />
                  <Route path="/consumo" element={<ModuleGuard moduleKey="consumo"><Suspense fallback={<RouteFallback />}><ConsumoPage /></Suspense></ModuleGuard>} />
                  <Route path="/resumen-sin" element={<ModuleGuard moduleKey="resumen-sin"><Suspense fallback={<RouteFallback />}><ResumenSinPage /></Suspense></ModuleGuard>} />
                  <Route path="/analisis" element={<ModuleGuard moduleKey="analisis"><Suspense fallback={<RouteFallback />}><AnalisisPage /></Suspense></ModuleGuard>} />
                  <Route path="/solicitudes" element={<ModuleGuard moduleKey="solicitudes"><Suspense fallback={<RouteFallback />}><SolicitudesPage /></Suspense></ModuleGuard>} />
                  <Route path="/comodato" element={<ModuleGuard moduleKey="comodato"><Suspense fallback={<RouteFallback />}><ComodatoPage /></Suspense></ModuleGuard>} />
                  <Route path="/historial" element={<ModuleGuard moduleKey="historial"><Suspense fallback={<RouteFallback />}><HistoryPage /></Suspense></ModuleGuard>} />
                  <Route path="/registros" element={<ModuleGuard moduleKey="registros"><Suspense fallback={<RouteFallback />}><LogsPage /></Suspense></ModuleGuard>} />
                  <Route path="/ajustes" element={<ModuleGuard moduleKey="ajustes"><Suspense fallback={<RouteFallback />}><SettingsPage /></Suspense></ModuleGuard>} />
                  <Route path="/admin" element={<AdminGuard><Suspense fallback={<RouteFallback />}><AdminPage /></Suspense></AdminGuard>} />
                </Route>
              </Routes>
              <PanelHost />
            </AnalyticsProvider>
          </BrowserRouter>
        </AuthGate>
      </ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
