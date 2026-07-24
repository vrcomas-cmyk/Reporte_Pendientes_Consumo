import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from './ErrorBoundary';
import { GlobalKeybindings } from '@/components/navigation/GlobalKeybindings';
import { useUiStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { getCachedCatalog, syncCatalogFromAppScript } from '@/services/catalogService';
import { checkForReportSheetsUpdate } from '@/services/reportSheetsService';
import { reportRepository } from '@/repositories';
import { logWarn, logError } from '@/lib/logError';
import { toast } from '@/store/toastStore';

export function AppShell() {
  const location = useLocation();
  const setLastViewPath = useUiStore((s) => s.setLastViewPath);
  const setCatalog = useDataStore((s) => s.setCatalog);
  const setSettings = useDataStore((s) => s.setSettings);

  // Remember the last "real" view so processing can return the user to where
  // they were, instead of always bouncing to the Dashboard.
  useEffect(() => {
    if (location.pathname === '/carga' || location.pathname === '/procesamiento') return;
    setLastViewPath(location.pathname);
  }, [location.pathname, setLastViewPath]);

  useEffect(() => {
    getCachedCatalog()
      .then((cached) => {
        setCatalog(cached);
        // First-ever boot with nothing cached yet: sync automatically so the
        // user isn't required to find and click a button before anything works.
        if (!cached) {
          syncCatalogFromAppScript()
            .then(setCatalog)
            .catch((e) => {
              logError('catalog-sync-failed', e instanceof Error ? e.message : String(e));
            });
        }
      })
      .catch((e) => {
        logError('catalog-get-failed', e instanceof Error ? e.message : String(e));
      });
    reportRepository
      .getSettings()
      .then(setSettings)
      .catch((e) => logWarn('settings-load-failed', e instanceof Error ? e.message : String(e)));
  }, [setCatalog, setSettings]);

  // "Revisar al abrir/enfocar": on mount and whenever the tab regains focus,
  // cheap-check the report-sheets spreadsheet for changes (throttled inside
  // checkForReportSheetsUpdate) and silently re-sync + toast if it changed.
  // Reads fresh state via getState() (not the render's closured values) since
  // this can fire long after mount, from the visibilitychange listener.
  useEffect(() => {
    const check = () => {
      const { catalog: cat, settings: cfg, activeAnalysis: prev, setActiveAnalysis: applyResult } = useDataStore.getState();
      checkForReportSheetsUpdate({ catalog: cat, settings: cfg, previous: prev })
        .then(({ changed, result }) => {
          if (changed && result) {
            applyResult(result);
            toast.info('Reporte actualizado', 'Se sincronizó automáticamente desde Google Sheets.');
          }
        })
        .catch((e) => logWarn('report-sheets-check-failed', e instanceof Error ? e.message : String(e)));
    };

    check();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar path={location.pathname} />
        <main className="min-h-0 flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="h-full"
            >
              <ErrorBoundary resetKey={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <GlobalKeybindings />
    </div>
  );
}
