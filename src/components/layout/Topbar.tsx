import { Moon, Sun, CheckCircle2, AlertCircle, Search, RefreshCcw, Menu } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { useReportSheetsSyncStore } from '@/store/reportSheetsSyncStore';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { isMac } from '@/hooks/useKeybindings';

const TITLES: Record<string, string> = {
  '/': 'Panel general',
  '/carga': 'Carga de archivos',
  '/procesamiento': 'Procesamiento',
  '/resultados': 'Resultados del análisis',
  '/historial': 'Historial de análisis',
  '/registros': 'Registros del sistema',
  '/ajustes': 'Ajustes',
};

export function Topbar({ path, onOpenMobileNav }: { path: string; onOpenMobileNav: () => void }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const catalog = useDataStore((s) => s.catalog);
  const sheetsSyncing = useReportSheetsSyncStore((s) => s.syncing);
  const sheetsProgress = useReportSheetsSyncStore((s) => s.progress);
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
        <h1 className="truncate font-display text-[15px] font-semibold text-text">{TITLES[path] ?? 'DEGASA'}</h1>
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
        {sheetsSyncing && (
          <Badge variant="warning" className="gap-1" title={sheetsProgress?.message}>
            <RefreshCcw className="size-3 shrink-0 animate-spin" />
            <span className="hidden sm:inline">Sincronizando reporte…</span>
            <span className="sm:hidden">Sync…</span>
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
