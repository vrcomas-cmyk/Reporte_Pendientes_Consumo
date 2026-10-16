import { useCallback, useState } from 'react';
import { SOLO_LIBROS } from '@/lib/modoLibros';
import { RefreshCcw, Cloud, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useDataStore } from '@/store/dataStore';
import { checkForCatalogUpdate } from '@/services/catalogService';
import { syncReportSheets, REPORT_SHEET_ROLES, SNAPSHOT_ROLES } from '@/services/reportSheetsService';
import { useReportSheetsSyncStore } from '@/store/reportSheetsSyncStore';
import { ROLE_LABEL } from '@/core/roleDetection';
import type { SheetRole } from '@/core/types';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { FUENTES_PEDIDOS } from '@/core/pedidos';
import { pedidosConfigurado, syncPedidos } from '@/services/pedidosService';
import { usePedidosStore } from '@/store/pedidosStore';
import { useFacturacionStore } from '@/store/facturacionStore';
import { syncFacturacion } from '@/services/facturacionLibrosService';
import { toast } from '@/store/toastStore';

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

  // Libros de Google Sheets (Seg pedidos, Disponibilidad, Inv_Condicion): estado global, igual que el del reporte.
  const librosFuentes = usePedidosStore((s) => s.fuentes);
  const librosSyncing = usePedidosStore((s) => s.syncing);
  const librosProgress = usePedidosStore((s) => s.progress);
  const librosError = usePedidosStore((s) => s.error);

  /** `forzar`: borra y vuelve a traer los libros completos. Sin él, solo los que cambiaron en Drive. */
  const handleSyncLibros = useCallback(async (forzar: boolean) => {
    if (!(await pedidosConfigurado())) {
      toast.warning('Falta configurar el Apps Script', 'Define el conector "Seg. de pedidos" en Admin o VITE_PEDIDOS_URL.');
      return;
    }
    try {
      const r = await syncPedidos({ forzar, libros: FUENTES_PEDIDOS.map((f) => f.clave) });
      if (forzar || r.descargados.length > 0) {
        toast.success('Libros actualizados', r.descargados.length > 0 ? `Se volvieron a traer: ${r.descargados.map((c) => FUENTES_PEDIDOS.find((f) => f.clave === c)?.etiqueta ?? c).join(', ')}.` : undefined);
      }
    } catch {
      // usePedidosStore ya trae el mensaje de error para el aviso de la tarjeta.
    }
  }, []);

  // Facturación (libros trimestrales de la carpeta de Drive): su propia carga, independiente del reporte diario.
  const facLibros = useFacturacionStore((s) => s.libros);
  const facLeidoEn = useFacturacionStore((s) => s.leidoEn);
  const facSyncing = useFacturacionStore((s) => s.syncing);
  const facAsignados = useFacturacionStore((s) => s.almacenesAsignados);
  const facProgress = useFacturacionStore((s) => s.progress);
  const facError = useFacturacionStore((s) => s.error);

  /** `forzar`: borra la copia local y vuelve a traer TODOS los libros. Sin él: todo la primera vez y después solo los que cambiaron. */
  const handleSyncFacturacion = useCallback(async (forzar: boolean) => {
    if (!(await pedidosConfigurado())) {
      toast.warning('Falta configurar el Apps Script', 'Define el conector "Seg. de pedidos" en Admin o VITE_PEDIDOS_URL.');
      return;
    }
    try {
      const r = await syncFacturacion({ forzar });
      toast.success('Facturación actualizada', `${r.libros} libro(s) en la carpeta.`);
    } catch {
      // useFacturacionStore ya trae el mensaje de error para el aviso de la tarjeta.
    }
  }, []);

  /** Libros (Seg pedidos, Disponibilidad, Inv_Condicion) y facturación (carpeta pesada) a la vez; comparten el tope de peticiones. */
  const handleSyncTodoLibros = useCallback(async () => {
    await Promise.allSettled([handleSyncLibros(false), handleSyncFacturacion(false)]);
  }, [handleSyncLibros, handleSyncFacturacion]);

  const handleSyncCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const { catalog: c } = await checkForCatalogUpdate({ force: true });
      if (c) setCatalog(c);
      useDataStore.getState().setCatalogError(null);
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

  const handleSyncReportSheets = useCallback(async (forceFull = false, liveOverride?: SheetRole[]) => {
    try {
      const result = await syncReportSheets({
        catalog,
        settings,
        previous: activeAnalysis,
        selectedRoles: [...sheetsRoles],
        forceFull,
        liveOverride,
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
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void handleSyncTodoLibros()}
          disabled={librosSyncing || facSyncing}
          title="Sincroniza a la vez los libros (Seg pedidos, Disponibilidad, Inv_Condicion) y la facturación de la carpeta de Drive. La primera vez trae todo; después solo lo modificado."
        >
          <RefreshCcw className={`size-4 ${librosSyncing || facSyncing ? 'animate-spin' : ''}`} />
          {librosSyncing || facSyncing ? 'Sincronizando…' : 'Sincronizar libros y facturación'}
        </Button>
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

        {/* Etapa "solo libros": el reporte diario no se carga (ver lib/modoLibros.ts). */}
        {!SOLO_LIBROS && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Reporte diario · Google Sheets</CardTitle>
              <CardDescription>Todas las Sugerencias y Resumen Sin Sug. en vivo · Reporte de Consumo y Resumen_Fac desde el snapshot nocturno</CardDescription>
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
            <div className="flex flex-wrap gap-3">
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSyncReportSheets(false, SNAPSHOT_ROLES)}
                disabled={sheetsSyncing || sheetsRoles.size === 0}
                className="self-start text-[11px]"
                title="Reporte de Consumo y Resumen_Fac normalmente se sirven del snapshot nocturno (generado cada madrugada). Este botón ignora el snapshot y las trae en vivo desde Google Sheets, para ver un cambio de hoy mismo sin esperar a la noche."
              >
                Actualizar Consumo/Resumen_Fac en vivo
              </Button>
            </div>
          </CardContent>
        </Card>
        )}

        <Card className="md:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Libros · Seg pedidos, Disponibilidad, Inv_Condicion y Comodato</CardTitle>
              <CardDescription>Libros crudos de Google Sheets para Seg. de pedidos, Inventario · Disponibilidad, Inv con Condición y Comodato (libros)</CardDescription>
            </div>
            {FUENTES_PEDIDOS.every((f) => librosFuentes[f.clave]) ? <Badge variant="success">Sincronizado</Badge> : <Badge variant="warning">Pendiente</Badge>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {FUENTES_PEDIDOS.map((f) => {
                const info = librosFuentes[f.clave];
                return (
                  <div key={f.clave} className="flex items-center gap-2 rounded-md border border-border bg-bg-inset p-3 text-xs">
                    <FileSpreadsheet className="size-4 shrink-0 text-text-faint" />
                    <div className="min-w-0">
                      <div className="font-medium text-text">{f.etiqueta}</div>
                      <div className="truncate text-text-muted" title={info ? `${info.nombre} · modificado ${formatDateTime(info.modificado)}` : 'Aún no descargado'}>
                        {info ? `${formatNumber(info.filas)} filas · actualizado ${formatDateTime(info.leidoEn)}` : 'Sin descargar'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {librosError && (
              <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {librosError}
              </div>
            )}

            {librosProgress && librosSyncing && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
                  <span>{librosProgress.mensaje}</span>
                  <span className="font-mono">{librosProgress.porcentaje}%</span>
                </div>
                <Progress value={librosProgress.porcentaje} />
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => void handleSyncLibros(true)}
                disabled={librosSyncing}
                className="self-start"
                title="Borra lo descargado y vuelve a traer completos los 3 libros de Google Sheets"
              >
                <RefreshCcw className={`size-4 ${librosSyncing ? 'animate-spin' : ''}`} />
                {librosSyncing ? 'Sincronizando…' : 'Sincronizar libros'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleSyncLibros(false)}
                disabled={librosSyncing}
                className="self-start text-[11px]"
                title="Solo vuelve a traer los libros que cambiaron en Drive"
              >
                Solo los que cambiaron
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Facturación · libros trimestrales de Drive</CardTitle>
              <CardDescription>Libros "1Q 2024", "2Q 2024"… de la carpeta de Drive · alimentan el módulo Facturación. La primera carga trae todo; después solo los libros modificados</CardDescription>
            </div>
            {facLibros.length > 0 ? <Badge variant="success">Sincronizado</Badge> : <Badge variant="warning">Pendiente</Badge>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {facLibros.length > 0 ? (
              <div className="rounded-md border border-border bg-bg-inset p-3 text-xs text-text-muted">
                <div className="flex items-center gap-2 font-medium text-text">
                  <Cloud className="size-3.5" /> {facLibros.length} libro(s) · {formatNumber(facLibros.reduce((s, l) => s + l.filas, 0))} filas
                </div>
                {!facLibros.every((l) => l.conFechas) && (
                  <div className="mt-1 text-warning">Algunos libros se bajaron sin la fecha de la última línea (Comodato: “días sin compra” aproximado). Publica la versión nueva del Apps Script y usa “Sincronización completa”.</div>
                )}
                {facAsignados.renglones > 0 && (
                  <div className="mt-1" title="Facturas de los libros sin almacén: Hospitales → 1031, Gobierno → 1060, el resto → 1030. Solo afecta el desglose por almacén.">
                    {formatNumber(facAsignados.renglones)} renglones sin almacén se asignaron por grupo de cliente
                  </div>
                )}
                <div className="mt-1">{facLeidoEn ? `Última descarga: ${formatDateTime(facLeidoEn)}` : 'Copia local (aún no se ha revisado Drive en esta sesión)'}</div>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                  {facLibros.map((l) => (
                    <div key={l.nombre} className="flex justify-between gap-2" title={`${l.nombre} · modificado ${formatDateTime(l.modificado)}`}>
                      <span className="truncate">{l.nombre}</span>
                      <span className="font-mono">{formatNumber(l.filas)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-faint">Aún no se han descargado los libros de facturación. La primera carga trae todos.</p>
            )}

            {facError && (
              <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {facError}
              </div>
            )}

            {facProgress && facSyncing && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
                  <span>{facProgress.mensaje}</span>
                  <span className="font-mono">{facProgress.porcentaje}%</span>
                </div>
                <Progress value={facProgress.porcentaje} />
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant={facLibros.length > 0 ? 'outline' : 'default'}
                onClick={() => void handleSyncFacturacion(false)}
                disabled={facSyncing}
                className="self-start"
                title="Sin copia local trae todos los libros; con copia, solo los que cambiaron en Drive"
              >
                <RefreshCcw className={`size-4 ${facSyncing ? 'animate-spin' : ''}`} />
                {facSyncing ? 'Sincronizando…' : 'Sincronizar facturación'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleSyncFacturacion(true)}
                disabled={facSyncing}
                className="self-start text-[11px]"
                title="Borra la copia local y vuelve a traer TODOS los libros"
              >
                Sincronización completa
              </Button>
            </div>
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
