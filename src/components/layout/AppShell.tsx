import { useEffect, useState } from 'react';
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
import { getLatestAnalysis } from '@/services/reportService';
import { reportRepository } from '@/repositories';
import { logWarn, logError } from '@/lib/logError';
import { toast } from '@/store/toastStore';

export function AppShell() {
  const location = useLocation();
  const setLastViewPath = useUiStore((s) => s.setLastViewPath);
  const setCatalog = useDataStore((s) => s.setCatalog);
  const setSettings = useDataStore((s) => s.setSettings);
  const setActiveAnalysis = useDataStore((s) => s.setActiveAnalysis);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Remember the last "real" view so processing can return the user to where
  // they were, instead of always bouncing to the Dashboard.
  useEffect(() => {
    if (location.pathname === '/carga' || location.pathname === '/procesamiento') return;
    setLastViewPath(location.pathname);
  }, [location.pathname, setLastViewPath]);

  // Close the mobile drawer on every navigation — otherwise it'd stay open
  // over the newly-loaded page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Single sequential bootstrap: restore catalog + last analysis + settings
  // from the browser BEFORE anything else runs, so any page mounted on boot
  // sees real data immediately (not just the Dashboard, which used to be the
  // only place that restored `activeAnalysis`). The report-sheets auto-check
  // below only starts once this settles, so it always diffs against the real
  // restored analysis instead of `null` — previously that race could wipe
  // `inventarioCondicion`/`lotesCortaCaducidad` on a cold boot.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const [cached, analysis, cfg] = await Promise.all([
        getCachedCatalog().catch((e) => {
          logError('catalog-get-failed', e instanceof Error ? e.message : String(e));
          return null;
        }),
        getLatestAnalysis().catch((e) => {
          logWarn('analysis-restore-failed', e instanceof Error ? e.message : String(e));
          return null;
        }),
        reportRepository.getSettings().catch((e) => {
          logWarn('settings-load-failed', e instanceof Error ? e.message : String(e));
          return null;
        }),
      ]);
      if (cancelled) return;

      setCatalog(cached);
      if (analysis) setActiveAnalysis(analysis);
      if (cfg) setSettings(cfg);

      // First-ever boot with nothing cached yet: sync automatically so the
      // user isn't required to find and click a button before anything works.
      if (!cached) {
        syncCatalogFromAppScript()
          .then((c) => !cancelled && setCatalog(c))
          .catch((e) => {
            logError('catalog-sync-failed', e instanceof Error ? e.message : String(e));
          });
      }

      startReportSheetsWatch();
    }

    // "Revisar al abrir/enfocar": on mount (after the restore above) and
    // whenever the tab regains focus, cheap-check the report-sheets
    // spreadsheet for changes (throttled inside checkForReportSheetsUpdate)
    // and silently re-sync + toast if it changed. Reads fresh state via
    // getState() (not the effect's closured values) since this can fire long
    // after mount, from the visibilitychange listener. `silent: true` because
    // this is a background check the user didn't ask for — it should update
    // local storage but not add Supabase history/log rows.
    function startReportSheetsWatch() {
      const check = () => {
        const { catalog: cat, settings: cfg, activeAnalysis: prev, setActiveAnalysis: applyResult } = useDataStore.getState();
        checkForReportSheetsUpdate({ catalog: cat, settings: cfg, previous: prev, silent: true })
          .then(({ changed, result }) => {
            if (changed && result) {
              applyResult(result);
              toast.info('Reporte actualizado', 'Se sincronizó automáticamente desde Google Sheets.');
            }
          })
          .catch((e) => logWarn('report-sheets-check-failed', e instanceof Error ? e.message : String(e)));
      };

      // Defer the first mount-triggered check to the browser's next idle slot
      // (with a setTimeout fallback for Safari < 17 / older browsers that lack
      // `requestIdleCallback`). We don't want the cheap `?meta=1` fetch racing
      // the first paint's React commit / Tailwind hydration — it's tiny, but
      // "as soon as the page is interactive" beats "right after bootstrap"
      // when bootstrap itself already restored catalog+analysis+settings.
      // Defer the first mount-triggered check past the first paint — we
      // don't want the cheap `?meta=1` fetch competing with the React commit /
      // Tailwind hydration that just played out right after bootstrap. A
      // setTimeout(0) is enough: `check()` itself only fires the meta fetch,
      // the heavy work (if any) still goes to the worker later. The throttle
      // inside checkForReportSheetsUpdate caps subsequent re-checks anyway.
      const idleHandle = window.setTimeout(check, 0);

      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          // On focus regain the user is already active — fire promptly, no
          // delay (the throttle inside checkForReportSheetsUpdate still caps
          // how often these actually hit the network).
          check();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      cleanupVisibility = () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.clearTimeout(idleHandle);
      };
    }

    let cleanupVisibility: (() => void) | undefined;
    void bootstrap();

    return () => {
      cancelled = true;
      cleanupVisibility?.();
    };
  }, [setCatalog, setSettings, setActiveAnalysis]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-text">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar path={location.pathname} onOpenMobileNav={() => setMobileNavOpen(true)} />
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
