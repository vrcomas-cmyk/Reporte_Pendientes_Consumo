import { useCallback, useState } from 'react';
import { RefreshCcw, Cloud, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useDataStore } from '@/store/dataStore';
import { syncCatalogFromAppScript } from '@/services/catalogService';
import { syncReportSheets, REPORT_SHEET_ROLES } from '@/services/reportSheetsService';
import { useReportSheetsSyncStore } from '@/store/reportSheetsSyncStore';
import { ROLE_LABEL } from '@/core/roleDetection';
import type { SheetRole } from '@/core/types';
import { formatDateTime } from '@/lib/utils';

/** Carga: sincroniza el catálogo maestro y el reporte diario, ambos en vivo
 * desde Google Sheets — no hay flujo manual de xlsx (el pipeline Python +
 * "Generar reporte" + "Procesamiento" que existían para eso se retiraron: la
 * sincronización automática de AppShell ya cubre ese caso, ver reportSheetsService.ts). */
export function UploadPage() {
  const catalog = useDataStore((s) => s.catalog);
  const catalogLoading = useDataStore((s) => s.catalogLoading);
  const setCatalog = useDataStore((s) => s.setCatalog);
  const setCatalogLoading = useDataStore((s) => s.setCatalogLoading);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const activeAnalysis = useDataStore((s) => s.activeAnalysis);
  const setActiveAnalysis = useDataStore((s) => s.setActiveAnalysis);
  const settings = useDataStore((s) => s.settings);
  const [sheetsRoles, setSheetsRoles] = useState<Set<SheetRole>>(new Set(REPORT_SHEET_ROLES));
  // Global (not local) state: survives navigating away from Carga and back
  // while a sync is still running, so it can't be forgotten and re-triggered
  // by accident — see reportSheetsSyncStore.ts.
  const sheetsSyncing = useReportSheetsSyncStore((s) => s.syncing);
  const sheetsProgress = useReportSheetsSyncStore((s) => s.progress);
  const sheetsError = useReportSheetsSyncStore((s) => s.error);

  const handleSyncCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const c = await syncCatalogFromAppScript();
      setCatalog(c);
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : String(e));
    } finally {
      setCatalogLoading(false);
    }
  }, [setCatalog, setCatalogLoading]);

  const toggleSheetsRole = useCallback((role: SheetRole) => {
    setSheetsRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });
  }, []);

  const handleSyncReportSheets = useCallback(async (forceFull = false) => {
    try {
      const result = await syncReportSheets({
        catalog,
        settings,
        previous: activeAnalysis,
        selectedRoles: [...sheetsRoles],
        forceFull,
        // Apply each tab's data the moment it lands (e.g. "Todas las
        // Sugerencias" shows up immediately) instead of leaving the page
        // blank until every selected tab has synced.
        onPartialResult: setActiveAnalysis,
      });
      setActiveAnalysis(result);
    } catch {
      // useReportSheetsSyncStore already carries the error message for the
      // banner below — nothing else to do here.
    }
  }, [catalog, settings, activeAnalysis, sheetsRoles, setActiveAnalysis]);

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Carga de archivos</h2>
        <p className="text-sm text-text-muted">Sincroniza el catálogo maestro y el reporte diario — ambos en vivo desde Google Sheets.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Catálogo maestro</CardTitle>
              <CardDescription>Ejecutivos, materiales e inventario · sincronizado desde Google Sheets</CardDescription>
            </div>
            {catalog ? <Badge variant="success">Sincronizado</Badge> : <Badge variant="warning">Pendiente</Badge>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {catalog ? (
              <div className="rounded-md border border-border bg-bg-inset p-3 text-xs text-text-muted">
                <div className="flex items-center gap-2 font-medium text-text">
                  <Cloud className="size-3.5" /> Catálogo sincronizado
                </div>
                <div className="mt-1">Última actualización: {formatDateTime(catalog.loadedAt)}</div>
                <div className="mt-1">
                  {catalog.materiales.length.toLocaleString('es-MX')} materiales · {catalog.ejecutivos.length.toLocaleString('es-MX')} ejecutivos ·{' '}
                  {catalog.invConsolidado.length.toLocaleString('es-MX')} filas de inventario
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-faint">
                Aún no se ha sincronizado el catálogo. Se lee en vivo del mismo AppScript que usa el equipo de ventas — no hace falta subir ningún archivo.
              </p>
            )}
            {catalogError && (
              <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {catalogError}
              </div>
            )}
            <Button variant={catalog ? 'outline' : 'default'} onClick={handleSyncCatalog} disabled={catalogLoading} className="self-start">
              <RefreshCcw className={`size-4 ${catalogLoading ? 'animate-spin' : ''}`} />
              {catalogLoading ? 'Sincronizando…' : catalog ? 'Actualizar catálogo' : 'Sincronizar catálogo'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Reporte diario · Google Sheets</CardTitle>
              <CardDescription>Todas las Sugerencias, Resumen Sin Sug., Reporte de Consumo y Resumen_Fac — sincronizado en vivo</CardDescription>
            </div>
            {activeAnalysis ? <Badge variant="success">Sincronizado</Badge> : <Badge variant="warning">Pendiente</Badge>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {activeAnalysis ? (
              <div className="rounded-md border border-border bg-bg-inset p-3 text-xs text-text-muted">
                <div className="flex items-center gap-2 font-medium text-text">
                  <Cloud className="size-3.5" /> Último análisis
                </div>
                <div className="mt-1">Última actualización: {formatDateTime(activeAnalysis.processedAt)}</div>
                <div className="mt-1">
                  {activeAnalysis.sugerencias.length.toLocaleString('es-MX')} sugerencias · {activeAnalysis.consumo.length.toLocaleString('es-MX')} filas de consumo
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-faint">
                Aún no se ha sincronizado el reporte diario desde Google Sheets. Se lee en vivo del AppScript configurado.
              </p>
            )}

            {sheetsError && (
              <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {sheetsError}
              </div>
            )}

            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-text">Pestañas a sincronizar</span>
                <span className="text-[11px] text-text-faint">{sheetsRoles.size} de {REPORT_SHEET_ROLES.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-4">
                {REPORT_SHEET_ROLES.map((role) => {
                  const checked = sheetsRoles.has(role);
                  return (
                    <label key={role} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={checked} onChange={() => toggleSheetsRole(role)} className="size-4 accent-[var(--color-accent)]" />
                      <span className={checked ? 'text-text' : 'text-text-faint line-through'}>{ROLE_LABEL[role]}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {sheetsProgress && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
                  <span>{sheetsProgress.message}</span>
                  <span className="font-mono">{sheetsProgress.percent}%</span>
                </div>
                <Progress value={sheetsProgress.percent} />
              </div>
            )}

            <Button
              variant={activeAnalysis ? 'outline' : 'default'}
              onClick={() => handleSyncReportSheets()}
              disabled={sheetsSyncing || sheetsRoles.size === 0}
              className="self-start"
            >
              <RefreshCcw className={`size-4 ${sheetsSyncing ? 'animate-spin' : ''}`} />
              {sheetsSyncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSyncReportSheets(true)}
              disabled={sheetsSyncing || sheetsRoles.size === 0}
              className="self-start text-[11px]"
              title="Vuelve a pedir las pestañas enteras en vez de solo las filas nuevas — útil si se editó una celda existente. Borra la cache local de filas."
            >
              Sincronización completa
            </Button>
          </CardContent>
        </Card>
      </div>

      {!catalog && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          <RefreshCcw className="size-3.5" /> Carga el catálogo maestro primero para poder cruzarlo contra el reporte diario.
        </div>
      )}
    </div>
  );
}
