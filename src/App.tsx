import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { RUTAS_RETIRADAS, SOLO_LIBROS } from '@/lib/modoLibros';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthGate } from '@/components/auth/AuthGate';
import { ModuleGuard, AdminGuard } from '@/components/auth/ModuleGuard';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Toaster } from '@/components/feedback/Toaster';
import { AnalyticsProvider } from '@/modules/analytics/AnalyticsContext';
import { PanelHost } from '@/modules/analytics/PanelHost';
import { TilesOcultosControl } from '@/modules/analytics/ui/TilesOcultosControl';
import { GlobalCopyMenu } from '@/components/navigation/GlobalCopyMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { useScoringWeightsStore } from '@/store/scoringWeightsStore';
import { useNombresStore } from '@/store/nombresStore';
import { useGruposExcluidosStore } from '@/store/gruposExcluidosStore';
import { useTrasladosStore, iniciarSeguimientoTraslados } from '@/store/trasladosStore';

// Only the shell (AppShell/Topbar/Sidebar) stays eager for instant first
// paint. Every route, INCLUDING Dashboard, is code-split so its JS — and
// heavy deps pulled in transitively (recharts for Dashboard, ~400KB+; xlsx;
// duckdb) — only downloads when the user actually navigates there. Dashboard
// used to be eager "for instant first paint", but with per-role module
// permissions (see ModuleGuard) a user restricted to a single non-Dashboard
// module (e.g. Consumo-only, common on a slow mobile connection) never
// renders it — yet was still paying to download recharts + Dashboard on
// every load before this. Cuts the initial bundle from a single ~1.5 MB
// chunk to shell + per-view chunks.
const DashboardPage = lazy(() => import('@/modules/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const HoyPage = lazy(() => import('@/modules/dashboard/HoyPage').then((m) => ({ default: m.HoyPage })));
const UploadPage = lazy(() => import('@/modules/upload/UploadPage').then((m) => ({ default: m.UploadPage })));
const ComodatoPage = lazy(() => import('@/modules/comodato/ComodatoPage').then((m) => ({ default: m.ComodatoPage })));
const ResultsPage = lazy(() => import('@/modules/results/ResultsPage').then((m) => ({ default: m.ResultsPage })));
const HistoryPage = lazy(() => import('@/modules/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const LogsPage = lazy(() => import('@/modules/logs/LogsPage').then((m) => ({ default: m.LogsPage })));
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const InventarioPage = lazy(() => import('@/modules/inventario/InventarioPage').then((m) => ({ default: m.InventarioPage })));
const SugerenciasPage = lazy(() => import('@/modules/sugerencias/SugerenciasPage').then((m) => ({ default: m.SugerenciasPage })));
const InvConCondicionPage = lazy(() => import('@/modules/inventario/InvConCondicionPage').then((m) => ({ default: m.InvConCondicionPage })));
const InvDisponibilidadPage = lazy(() => import('@/modules/resumenSin/InvDisponibilidadPage').then((m) => ({ default: m.InvDisponibilidadPage })));
const FacturacionPage = lazy(() => import('@/modules/facturacion/FacturacionPage').then((m) => ({ default: m.FacturacionPage })));
const ComparativoPage = lazy(() => import('@/modules/comparativo/ComparativoPage').then((m) => ({ default: m.ComparativoPage })));
const ComodatoLibrosPage = lazy(() => import('@/modules/comodato/ComodatoLibrosPage').then((m) => ({ default: m.ComodatoLibrosPage })));
const SegPedidosPage = lazy(() => import('@/modules/segPedidos/SegPedidosPage').then((m) => ({ default: m.SegPedidosPage })));
const ConsumoPage = lazy(() => import('@/modules/consumo/ConsumoPage').then((m) => ({ default: m.ConsumoPage })));
const ResumenSinPage = lazy(() => import('@/modules/resumenSin/ResumenSinPage').then((m) => ({ default: m.ResumenSinPage })));
const AnalisisPage = lazy(() => import('@/modules/analisis/AnalisisPage').then((m) => ({ default: m.AnalisisPage })));
const PreciosPage = lazy(() => import('@/modules/precios/PreciosPage').then((m) => ({ default: m.PreciosPage })));
const IncrementoPage = lazy(() => import('@/modules/incremento/IncrementoPage').then((m) => ({ default: m.IncrementoPage })));
const AnalisisDirectivoPage = lazy(() => import('@/modules/analisisDirectivo/AnalisisDirectivoPage').then((m) => ({ default: m.AnalisisDirectivoPage })));
const SolicitudesPage = lazy(() => import('@/modules/solicitudes/SolicitudesPage').then((m) => ({ default: m.SolicitudesPage })));
const AdminPage = lazy(() => import('@/modules/admin/AdminPage').then((m) => ({ default: m.AdminPage })));
const OportunidadesPage = lazy(() => import('@/modules/oportunidades/OportunidadesPage').then((m) => ({ default: m.OportunidadesPage })));
const Material360Page = lazy(() => import('@/modules/oportunidades/Material360Page').then((m) => ({ default: m.Material360Page })));
const ClientesPage = lazy(() => import('@/modules/oportunidades/ClientesPage').then((m) => ({ default: m.ClientesPage })));
const OfertasTrasladosPage = lazy(() => import('@/modules/ofertasTraslados/OfertasTrasladosPage').then((m) => ({ default: m.OfertasTrasladosPage })));
const OfertasClientePage = lazy(() => import('@/modules/oportunidades/OfertasClientePage').then((m) => ({ default: m.OfertasClientePage })));

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
  const hydrateConocimiento = useConocimientoStore((s) => s.hydrate);
  const hydrateScoringWeights = useScoringWeightsStore((s) => s.hydrate);
  const hydrateNombres = useNombresStore((s) => s.hydrate);
  const hydrateGruposExcluidos = useGruposExcluidosStore((s) => s.hydrate);
  const hydrateTraslados = useTrasladosStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateSolicitudes();
    void hydrateConocimiento();
    void hydrateScoringWeights();
    void hydrateNombres();
    void hydrateGruposExcluidos();
    void hydrateTraslados().then(iniciarSeguimientoTraslados);
  }, [hydrateSolicitudes, hydrateConocimiento, hydrateScoringWeights, hydrateNombres, hydrateGruposExcluidos, hydrateTraslados]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthGate>
          <BrowserRouter>
            <TooltipProvider delayDuration={300}>
            <AnalyticsProvider>
              <Routes>
                <Route element={<AppShell />}>
                  {!SOLO_LIBROS && <Route path="/" element={<ModuleGuard moduleKey="dashboard"><Suspense fallback={<RouteFallback />}><DashboardPage /></Suspense></ModuleGuard>} />}
                  <Route path="/hoy" element={<ModuleGuard moduleKey="hoy"><Suspense fallback={<RouteFallback />}><HoyPage /></Suspense></ModuleGuard>} />
                  <Route path="/carga" element={<ModuleGuard moduleKey="carga"><Suspense fallback={<RouteFallback />}><UploadPage /></Suspense></ModuleGuard>} />
                  {!SOLO_LIBROS && <Route path="/resultados" element={<ModuleGuard moduleKey="resultados"><Suspense fallback={<RouteFallback />}><ResultsPage /></Suspense></ModuleGuard>} />}
                  {!SOLO_LIBROS && <Route path="/inventario" element={<ModuleGuard moduleKey="inventario"><Suspense fallback={<RouteFallback />}><InventarioPage /></Suspense></ModuleGuard>} />}
                  {!SOLO_LIBROS && <Route path="/sugerencias" element={<ModuleGuard moduleKey="sugerencias"><Suspense fallback={<RouteFallback />}><SugerenciasPage /></Suspense></ModuleGuard>} />}
                  <Route path="/facturacion" element={<ModuleGuard moduleKey="facturacion"><Suspense fallback={<RouteFallback />}><FacturacionPage /></Suspense></ModuleGuard>} />
                  <Route path="/seg-pedidos" element={<ModuleGuard moduleKey="seg-pedidos"><Suspense fallback={<RouteFallback />}><SegPedidosPage /></Suspense></ModuleGuard>} />
                  <Route path="/inv-con-condicion" element={<ModuleGuard moduleKey="inv-con-condicion"><Suspense fallback={<RouteFallback />}><InvConCondicionPage /></Suspense></ModuleGuard>} />
                  <Route path="/inv-disponibilidad" element={<ModuleGuard moduleKey="inv-disponibilidad"><Suspense fallback={<RouteFallback />}><InvDisponibilidadPage /></Suspense></ModuleGuard>} />
                  {!SOLO_LIBROS && <Route path="/consumo" element={<ModuleGuard moduleKey="consumo"><Suspense fallback={<RouteFallback />}><ConsumoPage /></Suspense></ModuleGuard>} />}
                  {SOLO_LIBROS && RUTAS_RETIRADAS.map((p) => <Route key={p} path={p} element={<Navigate to="/seg-pedidos" replace />} />)}
                  {!SOLO_LIBROS && <Route path="/resumen-sin" element={<ModuleGuard moduleKey="resumen-sin"><Suspense fallback={<RouteFallback />}><ResumenSinPage /></Suspense></ModuleGuard>} />}
                  <Route path="/analisis" element={<ModuleGuard moduleKey="analisis"><Suspense fallback={<RouteFallback />}><AnalisisPage /></Suspense></ModuleGuard>} />
                  <Route path="/precios" element={<ModuleGuard moduleKey="precios"><Suspense fallback={<RouteFallback />}><PreciosPage /></Suspense></ModuleGuard>} />
                  <Route path="/incremento" element={<ModuleGuard moduleKey="incremento"><Suspense fallback={<RouteFallback />}><IncrementoPage /></Suspense></ModuleGuard>} />
                  <Route path="/analisis-directivo" element={<ModuleGuard moduleKey="analisis-directivo"><Suspense fallback={<RouteFallback />}><AnalisisDirectivoPage /></Suspense></ModuleGuard>} />
                  <Route path="/comparativo" element={<ModuleGuard moduleKey="comparativo"><Suspense fallback={<RouteFallback />}><ComparativoPage /></Suspense></ModuleGuard>} />
                  <Route path="/oportunidades" element={<ModuleGuard moduleKey="oportunidades"><Suspense fallback={<RouteFallback />}><OportunidadesPage /></Suspense></ModuleGuard>} />
                  <Route path="/ofertas-traslados" element={<ModuleGuard moduleKey="ofertas-traslados"><Suspense fallback={<RouteFallback />}><OfertasTrasladosPage /></Suspense></ModuleGuard>} />
                  <Route path="/oportunidades/material/:material" element={<ModuleGuard moduleKey="oportunidades"><Suspense fallback={<RouteFallback />}><Material360Page /></Suspense></ModuleGuard>} />
                  <Route path="/oportunidades/clientes" element={<ModuleGuard moduleKey="oportunidades"><Suspense fallback={<RouteFallback />}><ClientesPage /></Suspense></ModuleGuard>} />
                  <Route path="/oportunidades/ofertas-cliente" element={<ModuleGuard moduleKey="oportunidades"><Suspense fallback={<RouteFallback />}><OfertasClientePage /></Suspense></ModuleGuard>} />
                  <Route path="/solicitudes" element={<ModuleGuard moduleKey="solicitudes"><Suspense fallback={<RouteFallback />}><SolicitudesPage /></Suspense></ModuleGuard>} />
                  <Route path="/comodato-libros" element={<ModuleGuard moduleKey="comodato-libros"><Suspense fallback={<RouteFallback />}><ComodatoLibrosPage /></Suspense></ModuleGuard>} />
                  <Route path="/comodato" element={<ModuleGuard moduleKey="comodato"><Suspense fallback={<RouteFallback />}><ComodatoPage /></Suspense></ModuleGuard>} />
                  {!SOLO_LIBROS && <Route path="/historial" element={<ModuleGuard moduleKey="historial"><Suspense fallback={<RouteFallback />}><HistoryPage /></Suspense></ModuleGuard>} />}
                  <Route path="/registros" element={<ModuleGuard moduleKey="registros"><Suspense fallback={<RouteFallback />}><LogsPage /></Suspense></ModuleGuard>} />
                  <Route path="/ajustes" element={<ModuleGuard moduleKey="ajustes"><Suspense fallback={<RouteFallback />}><SettingsPage /></Suspense></ModuleGuard>} />
                  <Route path="/admin" element={<AdminGuard><Suspense fallback={<RouteFallback />}><AdminPage /></Suspense></AdminGuard>} />
                </Route>
              </Routes>
              <PanelHost />
              <TilesOcultosControl />
              <GlobalCopyMenu />
            </AnalyticsProvider>
            </TooltipProvider>
          </BrowserRouter>
        </AuthGate>
      </ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
