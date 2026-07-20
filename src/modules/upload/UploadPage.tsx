import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileSpreadsheet, RefreshCcw, ArrowRight, Cloud, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDataStore } from '@/store/dataStore';
import { syncCatalogFromAppScript } from '@/services/catalogService';
import { peekReportSheets, type ReportSheetInfo } from '@/services/reportPeek';
import type { SheetRole } from '@/core/types';
import { formatDateTime } from '@/lib/utils';

// Exported so GenerarReportePage.tsx (fase B de la migración a API) reusa el
// mismo control en vez de duplicarlo.
export function DropZone({
  onFile,
  accept,
  label,
  sub,
}: {
  onFile: (f: File) => void;
  accept: string;
  label: string;
  sub: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
        dragOver ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-border-strong hover:bg-bg-inset/50'
      }`}
    >
      <UploadCloud className="size-7 text-text-faint" />
      <p className="text-sm font-medium text-text">{label}</p>
      <p className="text-xs text-text-faint">{sub}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function UploadPage() {
  const navigate = useNavigate();
  const catalog = useDataStore((s) => s.catalog);
  const catalogLoading = useDataStore((s) => s.catalogLoading);
  const setCatalog = useDataStore((s) => s.setCatalog);
  const setCatalogLoading = useDataStore((s) => s.setCatalogLoading);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ReportSheetInfo[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Set<SheetRole>>(new Set());
  const [peeking, setPeeking] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const setActiveAnalysis = useDataStore((s) => s.setActiveAnalysis);

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

  const handleReportFile = useCallback(async (f: File) => {
    setReportFile(f);
    setActiveAnalysis(null);
    // Cheap peek: detect which tabs the workbook contains (reads only the header
    // row of each sheet) so the user can choose which to load before processing.
    setPeeking(true);
    setSheets([]);
    try {
      const detected = await peekReportSheets(f);
      setSheets(detected);
      setSelectedRoles(new Set(detected.filter((s) => s.role).map((s) => s.role as SheetRole)));
    } catch {
      setSheets([]);
      setSelectedRoles(new Set());
    } finally {
      setPeeking(false);
    }
  }, [setActiveAnalysis]);

  const toggleRole = useCallback((role: SheetRole) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });
  }, []);

  // Recognized (role !== null) sheets are selectable; a role can appear on more
  // than one physical sheet, so dedupe by role for the checklist.
  const selectableSheets = sheets.filter((s) => s.role);
  const seenRoles = new Set<SheetRole>();
  const roleChecklist = selectableSheets.filter((s) => {
    if (seenRoles.has(s.role as SheetRole)) return false;
    seenRoles.add(s.role as SheetRole);
    return true;
  });

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Carga de archivos</h2>
        <p className="text-sm text-text-muted">Sincroniza el catálogo maestro una vez y sube el reporte diario para analizarlo.</p>
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
          <CardHeader>
            <CardTitle>Reporte diario de análisis</CardTitle>
            <CardDescription>Sugerencias, consumo y facturación del día</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {reportFile ? (
              <div className="rounded-md border border-border bg-bg-inset p-3 text-xs text-text-muted">
                <div className="flex items-center gap-2 font-medium text-text">
                  <FileSpreadsheet className="size-3.5" /> {reportFile.name}
                </div>
                <div className="mt-1">{(reportFile.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            ) : (
              <p className="text-xs text-text-faint">Sube el "Reporte_Completo_*.xlsx" generado hoy.</p>
            )}
            <DropZone
              onFile={handleReportFile}
              accept=".xlsx,.xls"
              label="Arrastra el reporte aquí"
              sub="o haz clic para seleccionar un archivo .xlsx"
            />

            {peeking && (
              <div className="flex items-center gap-2 text-xs text-text-faint">
                <RefreshCcw className="size-3.5 animate-spin" /> Detectando pestañas del reporte…
              </div>
            )}

            {roleChecklist.length > 0 && (
              <div className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-text">Pestañas a cargar</span>
                  <span className="text-[11px] text-text-faint">{selectedRoles.size} de {roleChecklist.length}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {roleChecklist.map((s) => {
                    const role = s.role as SheetRole;
                    const checked = selectedRoles.has(role);
                    return (
                      <label key={role} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={checked} onChange={() => toggleRole(role)} className="size-4 accent-[var(--color-accent)]" />
                        <span className={checked ? 'text-text' : 'text-text-faint line-through'}>{s.label}</span>
                        <span className="text-[11px] text-text-faint">({s.name})</span>
                      </label>
                    );
                  })}
                </div>
                {sheets.some((s) => !s.role) && (
                  <p className="mt-2 text-[11px] text-text-faint">
                    {sheets.filter((s) => !s.role).length} hoja(s) sin rol reconocido se ignoran.
                  </p>
                )}
              </div>
            )}

            <Button
              disabled={!reportFile || peeking || selectedRoles.size === 0}
              onClick={() => navigate('/procesamiento', { state: { file: reportFile, selectedRoles: [...selectedRoles] } })}
              className="self-end"
            >
              Procesar <ArrowRight className="size-4" />
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
