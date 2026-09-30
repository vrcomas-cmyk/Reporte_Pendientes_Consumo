import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from './ErrorBoundary';
import { GlobalKeybindings } from '@/components/navigation/GlobalKeybindings';
import { CalculatorWidget } from '@/components/widgets/CalculatorWidget';
import { useUiStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { getCachedCatalog, checkForCatalogUpdate } from '@/services/catalogService';
import { getCachedIncremento } from '@/services/incrementoService';
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
  const setIncremento = useDataStore((s) => s.setIncremento);
  const setBootstrapped = useDataStore((s) => s.setBootstrapped);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Remember the last "real" view so returning from Carga bounces back to
  // where the user was, instead of always landing on el Dashboard.
  useEffect(() => {
    if (location.pathname === '/carga') return;
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
      const [cached, analysis, cfg, incremento] = await Promise.all([
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
        getCachedIncremento().catch((e) => {
          logWarn('incremento-get-failed', e instanceof Error ? e.message : String(e));
          return null;
        }),
      ]);
      if (cancelled) return;

      setCatalog(cached);
      if (analysis) setActiveAnalysis(analysis);
      if (cfg) setSettings(cfg);
      if (incremento) setIncremento(incremento);
      setBootstrapped(true);

      startCatalogWatch();
      startReportSheetsWatch();
    }

    // Catálogo maestro: se revisa al abrir, al volver a la pestaña y cada 10 min
    // mientras esté visible. Antes solo se descargaba si NO había cache, así que
    // los cambios del Sheet no llegaban nunca sin el botón manual. La revisión
    // es barata (`?meta=1` → modifiedTime) y solo descarga si algo cambió; ver
    // `checkForCatalogUpdate`. Si falla, se conserva el catálogo cacheado y el
    // error queda visible en el Topbar (`catalogError`).
    function startCatalogWatch() {
      const check = () => {
        const st = useDataStore.getState();
        const hadCatalog = !!st.catalog;
        // Solo el primer arranque sin cache muestra "Sincronizando…"; las
        // revisiones en segundo plano son silenciosas.
        if (!hadCatalog) st.setCatalogLoading(true);
        checkForCatalogUpdate({ cachedLoadedAt: st.catalog?.loadedAt })
          .then(({ changed, catalog }) => {
            if (cancelled) return;
            st.setCatalogError(null);
            if (changed && catalog) {
              st.setCatalog(catalog);
              if (hadCatalog) toast.info('Catálogo actualizado', 'Se sincronizó automáticamente desde Google Sheets.');
            }
          })
          .catch((e) => {
            const msg = e instanceof Error ? e.message : String(e);
            logError('catalog-sync-failed', msg);
            if (!cancelled) st.setCatalogError(msg);
          })
          .finally(() => {
            if (!hadCatalog) st.setCatalogLoading(false);
          });
      };

      const first = window.setTimeout(check, 0);
      const interval = window.setInterval(() => {
        if (document.visibilityState === 'visible') check();
      }, 10 * 60_000);
      const onVisible = () => {
        if (document.visibilityState === 'visible') check();
      };
      document.addEventListener('visibilitychange', onVisible);
      cleanupCatalog = () => {
        window.clearTimeout(first);
        window.clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
      };
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
        // `onPartialResult` aplica cada pestaña (Pedidos/Consumo/Resumen_Sin/
        // Resumen_Fac) apenas termina de llegar, en vez de esperar a las 4 —
        // mismo mecanismo que ya usa la sync manual de Carga (UploadPage.tsx),
        // solo que aquí faltaba conectarlo: sin esto, el chequeo automático al
        // abrir/enfocar el portal (el que corre en la práctica todos los días)
        // dejaba la pantalla sin datos hasta que la pestaña más lenta terminaba.
        checkForReportSheetsUpdate({ catalog: cat, settings: cfg, previous: prev, silent: true, onPartialResult: applyResult })
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
    let cleanupCatalog: (() => void) | undefined;
    void bootstrap();

    return () => {
      cancelled = true;
      cleanupVisibility?.();
      cleanupCatalog?.();
    };
  }, [setCatalog, setSettings, setActiveAnalysis, setIncremento, setBootstrapped]);

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
      <CalculatorWidget />
    </div>
  );
}
