import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from './ErrorBoundary';
import { useUiStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { getCachedCatalog, syncCatalogFromAppScript } from '@/services/catalogService';
import { reportRepository } from '@/repositories';

export function AppShell() {
  const location = useLocation();
  const theme = useUiStore((s) => s.theme);
  const setLastViewPath = useUiStore((s) => s.setLastViewPath);
  const setCatalog = useDataStore((s) => s.setCatalog);
  const setSettings = useDataStore((s) => s.setSettings);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

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
        if (!cached) syncCatalogFromAppScript().then(setCatalog).catch(() => {});
      })
      .catch(() => {});
    reportRepository.getSettings().then(setSettings).catch(() => {});
  }, [setCatalog, setSettings]);

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
    </div>
  );
}
