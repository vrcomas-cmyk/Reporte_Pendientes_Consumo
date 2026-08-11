import { Moon, Sun, CheckCircle2, AlertCircle, Search, RefreshCcw, Menu } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { useReportSheetsSyncStore } from '@/store/reportSheetsSyncStore';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { isMac } from '@/hooks/useKeybindings';
import { NAV, ADMIN_NAV_ITEM } from '@/components/layout/Sidebar';
import { TooltipHint } from '@/components/ui/tooltip';

// A few routes read better with fuller copy than the Sidebar's short nav
// label ("Panel" -> "Panel general"). Anything NOT listed here falls back to
// NAV's label (single source of truth) instead of silently going blank — that
// fallback gap is exactly how Sugerencias/Consumo/Inventario/Análisis/
// Comodato/Solicitudes/Admin used to all show the bare "DEGASA" wordmark.
const TITLE_OVERRIDES: Record<string, string> = {
  '/': 'Panel general',
  '/carga': 'Carga de archivos',
  '/resultados': 'Resultados del análisis',
  '/historial': 'Historial de análisis',
  '/registros': 'Registros del sistema',
  '/oportunidades/clientes': 'Clientes — fichas comerciales',
};

// Prefijo — /oportunidades/material/:material no está en NAV (es un
// deep-link, no una entrada de menú), así que titleFor necesita un match por
// prefijo para no caer al wordmark "DEGASA".
const TITLE_PREFIX_OVERRIDES: [string, string][] = [
  ['/oportunidades/material', 'Material 360'],
];

function titleFor(path: string): string {
  if (TITLE_OVERRIDES[path]) return TITLE_OVERRIDES[path];
  if (path === ADMIN_NAV_ITEM.to) return ADMIN_NAV_ITEM.label;
  const prefixMatch = TITLE_PREFIX_OVERRIDES.find(([prefix]) => path.startsWith(prefix));
  if (prefixMatch) return prefixMatch[1];
  return NAV.find((n) => n.to === path)?.label ?? 'DEGASA';
}

export function Topbar({ path, onOpenMobileNav }: { path: string; onOpenMobileNav: () => void }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const catalog = useDataStore((s) => s.catalog);
  const activeAnalysis = useDataStore((s) => s.activeAnalysis);
  const sheetsSyncing = useReportSheetsSyncStore((s) => s.syncing);
  const sheetsProgress = useReportSheetsSyncStore((s) => s.progress);
  const sheetsError = useReportSheetsSyncStore((s) => s.error);
  const openPalette = useCommandPaletteStore((s) => s.openPalette);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-elevated/80 px-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Abrir menú"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-inset hover:text-text md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <h1 className="truncate font-display text-[15px] font-semibold text-text">{titleFor(path)}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={openPalette}
          aria-label="Abrir paleta de comandos"
          title="Buscar páginas y acciones (Cmd/Ctrl + K)"
          className="hidden items-center gap-2 rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-bg-inset hover:text-text sm:inline-flex"
        >
          <Search className="size-3.5" aria-hidden />
          <span>Buscar…</span>
          <kbd className="rounded border border-border bg-bg-inset px-1 py-0.5 text-[10px] text-text-faint">
            {isMac ? '⌘' : 'Ctrl'}K
          </kbd>
        </button>
        {/* Report-sync status — deliberately global chrome (rendered by AppShell
            for every route), not gated by ModuleGuard: a role restricted to a
            single module (e.g. only Consumo) has no access to /carga and would
            otherwise have zero visibility into whether the daily report is
            still loading, done, or failed — especially on mobile, where the
            tooltip on the old spinner-only badge was never reachable. */}
        {sheetsSyncing ? (
          <TooltipHint text={sheetsProgress?.message ?? 'Sincronizando reporte…'}>
            <Badge variant="warning" className="gap-1">
              <RefreshCcw className="size-3 shrink-0 animate-spin" />
              <span className="hidden sm:inline">{sheetsProgress?.message ?? 'Sincronizando reporte…'}</span>
              <span className="sm:hidden">Sync {sheetsProgress ? `${sheetsProgress.percent}%` : '…'}</span>
            </Badge>
          </TooltipHint>
        ) : sheetsError ? (
          <TooltipHint text={sheetsError}>
            <Badge variant="danger" className="gap-1">
              <AlertCircle className="size-3 shrink-0" />
              <span className="hidden sm:inline">Reporte: falló la sincronización</span>
              <span className="sm:hidden">Reporte: error</span>
            </Badge>
          </TooltipHint>
        ) : activeAnalysis ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3 shrink-0" />
            <span className="hidden sm:inline">Reporte actualizado · {formatDateTime(activeAnalysis.processedAt)}</span>
            <span className="sm:hidden">Reporte</span>
          </Badge>
        ) : (
          <Badge variant="warning" className="gap-1">
            <AlertCircle className="size-3 shrink-0" />
            <span className="hidden sm:inline">Reporte no cargado</span>
            <span className="sm:hidden">Sin reporte</span>
          </Badge>
        )}
        {catalog ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3 shrink-0" />
            <span className="hidden sm:inline">Catálogo sincronizado · {formatDateTime(catalog.loadedAt)}</span>
            <span className="sm:hidden">Catálogo</span>
          </Badge>
        ) : (
          <Badge variant="warning" className="gap-1">
            <AlertCircle className="size-3 shrink-0" />
            <span className="hidden sm:inline">Catálogo no cargado</span>
            <span className="sm:hidden">Sin catálogo</span>
          </Badge>
        )}
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
