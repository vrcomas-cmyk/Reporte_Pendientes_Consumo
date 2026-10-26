import { Moon, Sun, Palette,CheckCircle2, AlertCircle, Search, RefreshCcw, Menu } from 'lucide-react';
import { SOLO_LIBROS } from '@/lib/modoLibros';
import { useUiStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { useReportSheetsSyncStore } from '@/store/reportSheetsSyncStore';
import { usePedidosStore } from '@/store/pedidosStore';
import { useFacturacionStore } from '@/store/facturacionStore';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { Button } from '@/components/ui/button';
import { cn, formatDateTime } from '@/lib/utils';
import { isMac } from '@/hooks/useKeybindings';
import { NAV, NAV_GROUPS, ADMIN_NAV_ITEM } from '@/components/layout/Sidebar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import type { AnalysisResult, CatalogSnapshot, ProcessingProgress } from '@/core/types';

// A few routes read better with fuller copy than the Sidebar's short nav
// label ("Panel" -> "Panel general"). Anything NOT listed here falls back to
// NAV's label (single source of truth) instead of silently going blank — that
// fallback gap is exactly how Sugerencias/Consumo/Inventario/Análisis/
// Comodato/Solicitudes/Admin used to all show the bare "DEGASA" wordmark.
const TITLE_OVERRIDES: Record<string, string> = {
  '/oportunidades/clientes': 'Oportunidades — clientes',
  '/oportunidades/ofertas-cliente': 'Oportunidades — ofertas por cliente',
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

/** Grupo del menú al que pertenece la ruta (para la miga de pan); '' si no está en el menú. */
function groupFor(path: string): string {
  const base = '/' + (path.split('/')[1] ?? '');
  return NAV_GROUPS.find((g) => g.items.some((i) => i.to === path || i.to === base))?.label ?? '';
}

export function Topbar({ path, onOpenMobileNav }: { path: string; onOpenMobileNav: () => void }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const skin = useUiStore((s) => s.skin);
  const toggleSkin = useUiStore((s) => s.toggleSkin);
  const catalog = useDataStore((s) => s.catalog);
  const catalogError = useDataStore((s) => s.catalogError);
  const activeAnalysis = useDataStore((s) => s.activeAnalysis);
  const sheetsSyncing = useReportSheetsSyncStore((s) => s.syncing);
  const sheetsProgress = useReportSheetsSyncStore((s) => s.progress);
  const sheetsError = useReportSheetsSyncStore((s) => s.error);
  const librosSyncing = usePedidosStore((s) => s.syncing);
  const librosProgress = usePedidosStore((s) => s.progress);
  const librosError = usePedidosStore((s) => s.error);
  const librosFuentes = usePedidosStore((s) => s.fuentes);
  const facSyncing = useFacturacionStore((s) => s.syncing);
  const facProgress = useFacturacionStore((s) => s.progress);
  const facError = useFacturacionStore((s) => s.error);
  const facLeidoEn = useFacturacionStore((s) => s.leidoEn);
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
        <p className="truncate text-sm text-text-muted" aria-label="Ubicación">
          {groupFor(path) && <>{groupFor(path)} <span aria-hidden="true">›</span> </>}
          <span className="font-display font-semibold text-text">{titleFor(path)}</span>
        </p>
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
          <kbd className="rounded border border-border bg-bg-inset px-1 py-0.5 text-[11px] text-text-faint">
            {isMac ? '⌘' : 'Ctrl'}K
          </kbd>
        </button>
        {/* Report-sync status — deliberately global chrome (rendered by AppShell
            for every route), not gated by ModuleGuard: a role restricted to a
            single module (e.g. only Consumo) has no access to /carga and would
            otherwise have zero visibility into whether the daily report is
            still loading, done, or failed. Collapsed into ONE indicator
            (instead of two always-expanded badges) so it doesn't compete with
            the page title on every screen — detail lives in the popover. */}
        <SyncStatus
          sheetsSyncing={sheetsSyncing}
          sheetsProgress={sheetsProgress}
          sheetsError={sheetsError}
          activeAnalysis={activeAnalysis}
          catalog={catalog}
          catalogError={catalogError}
          librosSyncing={librosSyncing}
          librosProgress={librosProgress}
          librosError={librosError}
          librosActualizadoEn={Object.values(librosFuentes).map((f) => f.leidoEn).sort().pop() ?? null}
          facSyncing={facSyncing}
          facProgress={facProgress}
          facError={facError}
          facActualizadoEn={facLeidoEn}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSkin}
          aria-label="Cambiar estilo visual"
          title={skin === 'apple' ? 'Estilo Apple — clic para volver al clásico' : 'Estilo clásico — clic para probar Apple'}
          className={skin === 'apple' ? 'text-accent' : undefined}
        >
          <Palette className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}

const TONE_CLS = {
  danger: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  success: 'border-success/30 bg-success/10 text-success',
} as const;

interface SyncStatusProps {
  sheetsSyncing: boolean;
  sheetsProgress: ProcessingProgress | null;
  sheetsError: string | null;
  activeAnalysis: AnalysisResult | null;
  catalog: CatalogSnapshot | null;
  catalogError: string | null;
  /** Libros de Google Sheets (Seg pedidos, Disponibilidad, Inv_Condicion). */
  librosSyncing: boolean;
  librosProgress: { mensaje: string; porcentaje: number } | null;
  librosError: string | null;
  librosActualizadoEn: string | null;
  /** Libros trimestrales de facturación (módulo Facturación). */
  facSyncing: boolean;
  facProgress: { mensaje: string; porcentaje: number } | null;
  facError: string | null;
  facActualizadoEn: string | null;
}

/** Single collapsed indicator for report + catalog sync state — replaces two
 * always-expanded badges that competed with the page title on every screen.
 * Worst-of-both tone/label up front; both lines of detail (with timestamps)
 * live in the popover, opened on demand instead of always on. */
function SyncStatus({ sheetsSyncing, sheetsProgress, sheetsError, activeAnalysis, catalog, catalogError, librosSyncing, librosProgress, librosError, librosActualizadoEn, facSyncing, facProgress, facError, facActualizadoEn }: SyncStatusProps) {
  // Etapa "solo libros": el reporte diario no se carga, así que su ausencia no es una advertencia.
  const sinReporte = !SOLO_LIBROS && !activeAnalysis;
  const sincronizando = sheetsSyncing || librosSyncing || facSyncing;
  const tone = sheetsError || librosError || facError ? 'danger' : sincronizando || catalogError || sinReporte || !catalog ? 'warning' : 'success';
  const summary = sheetsSyncing
    ? (sheetsProgress?.message ?? 'Sincronizando…')
    : librosSyncing
      ? (librosProgress?.mensaje ?? 'Sincronizando libros…')
      : facSyncing
        ? (facProgress?.mensaje ?? 'Sincronizando facturación…')
        : librosError
        ? 'Libros: error de sync'
        : facError
        ? 'Facturación: error de sync'
    : sheetsError
      ? 'Reporte: error de sync'
      : catalogError && catalog
        ? 'Catálogo sin actualizar'
        : sinReporte && !catalog
        ? 'Sin datos cargados'
        : sinReporte
          ? 'Reporte no cargado'
          : !catalog
            ? 'Catálogo no cargado'
            : 'Todo sincronizado';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            TONE_CLS[tone],
          )}
        >
          {sincronizando ? (
            <RefreshCcw className="size-3 shrink-0 animate-spin" />
          ) : tone === 'success' ? (
            <CheckCircle2 className="size-3 shrink-0" />
          ) : (
            <AlertCircle className="size-3 shrink-0" />
          )}
          <span className="hidden sm:inline">{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-xs">
        <div className="flex flex-col gap-2.5">
          {!SOLO_LIBROS && <div>
            <p className="font-medium text-text">Reporte diario</p>
            {sheetsSyncing ? (
              <p className="text-text-muted">{sheetsProgress?.message ?? 'Sincronizando…'}{sheetsProgress ? ` · ${sheetsProgress.percent}%` : ''}</p>
            ) : sheetsError ? (
              <p className="text-danger">{sheetsError}</p>
            ) : activeAnalysis ? (
              <p className="text-text-muted">Actualizado · {formatDateTime(activeAnalysis.processedAt)}</p>
            ) : (
              <p className="text-text-muted">Aún no cargado</p>
            )}
          </div>}
          <div>
            <p className="font-medium text-text">Libros de Google Sheets</p>
            {librosSyncing ? (
              <p className="text-text-muted">{librosProgress?.mensaje ?? 'Sincronizando…'}{librosProgress ? ` · ${librosProgress.porcentaje}%` : ''}</p>
            ) : librosError ? (
              <p className="text-danger">{librosError}</p>
            ) : librosActualizadoEn ? (
              <p className="text-text-muted">Sincronizado · {formatDateTime(librosActualizadoEn)}</p>
            ) : (
              <p className="text-text-muted">Aún no cargado (Carga → Sincronizar libros)</p>
            )}
          </div>
          <div>
            <p className="font-medium text-text">Facturación (libros de Drive)</p>
            {facSyncing ? (
              <p className="text-text-muted">{facProgress?.mensaje ?? 'Sincronizando…'}{facProgress ? ` · ${facProgress.porcentaje}%` : ''}</p>
            ) : facError ? (
              <p className="text-danger">{facError}</p>
            ) : facActualizadoEn ? (
              <p className="text-text-muted">Sincronizado · {formatDateTime(facActualizadoEn)}</p>
            ) : (
              <p className="text-text-muted">Aún no cargado (Carga → Sincronizar facturación)</p>
            )}
          </div>
          <div>
            <p className="font-medium text-text">Catálogo</p>
            <p className="text-text-muted">
              {catalog ? <>Sincronizado · {formatDateTime(catalog.loadedAt)}</> : 'Aún no cargado'}
            </p>
            {catalogError && (
              <p className="mt-0.5 text-warning">
                No se pudo actualizar: {catalogError} Se usa el último catálogo guardado; se reintenta solo.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
