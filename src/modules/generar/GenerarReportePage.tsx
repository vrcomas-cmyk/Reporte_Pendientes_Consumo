import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, AlertTriangle, Sheet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropZone } from '@/modules/upload/UploadPage';
import { FacturacionEstadoCard } from '@/modules/shared/FacturacionEstadoCard';
import { ApiLauncherCard } from '@/modules/shared/ApiLauncherCard';
import { iniciarGeneracionReporte, esperarJob, descargarReporteComoArchivo, type JobStatus } from '@/services/reportGeneratorService';
import { peekReportSheets, type ReportSheetInfo } from '@/services/reportPeek';
import type { SheetRole } from '@/core/types';

// Espejo del sidebar de Streamlit (app.py) — mismas 7 fuentes, mismos 5 flags.
const FUENTES_DISPONIBLES = ['Corta caducidad', 'Lento mov', 'Cosmopark', 'Sustituto', 'PNC', 'Caduco', 'Revision'];

// Estas 2 son las que hoy subes a mano a Google Sheets — el botón "Descargar
// para Sheets" extrae SOLO estas pestañas del xlsx completo (más liviano
// para pegar, sin las otras ~5 hojas de por medio). El pipeline (api.py,
// reportes/inventario_por_condicion.py, sin tocar) las genera automáticamente
// cuando "Hojas externas" trae las pestañas Revision2 y/o Corta caducidad —
// no dependen de ningún checkbox de este formulario.
const SHEETS_PARA_GOOGLE = ['Inventario por condicion', 'Detalle Lotes Corta Caducidad'];

/** Extrae un subconjunto de hojas de un workbook ya generado a un xlsx nuevo,
 * más chico, listo para copiar/pegar a Google Sheets. Corre 100% en el
 * navegador (SheetJS), no vuelve a llamar a la API. */
async function extraerHojas(file: File, sheetNames: string[]): Promise<File | null> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const out = XLSX.utils.book_new();
  let found = 0;
  for (const name of sheetNames) {
    const match = wb.SheetNames.find((n) => n.toLowerCase() === name.toLowerCase());
    if (!match) continue;
    XLSX.utils.book_append_sheet(out, wb.Sheets[match], match);
    found++;
  }
  if (!found) return null;
  const outBuf = XLSX.write(out, { type: 'array', bookType: 'xlsx' });
  return new File([outBuf], `Para_Google_Sheets_${Date.now()}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

type FileKey = 'pedidos' | 'inventario' | 'externas' | 'facturacion';

function FilePickedRow({ file, label }: { file: File | undefined; label: string }) {
  if (!file) return <p className="text-xs text-text-faint">{label}: sin seleccionar</p>;
  return (
    <p className="flex items-center gap-1.5 text-xs text-text-muted">
      <FileSpreadsheet className="size-3.5" /> {label}: <span className="text-text">{file.name}</span>
    </p>
  );
}

export function GenerarReportePage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<Partial<Record<FileKey, File>>>({});
  const [fuentes, setFuentes] = useState<Set<string>>(new Set(FUENTES_DISPONIBLES));
  const [flags, setFlags] = useState({
    genTodas: true,
    genResumen: true,
    genReporteConsumo: false,
    genResumenFac: false,
    genSugConsumo: false,
  });
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [resultSheets, setResultSheets] = useState<ReportSheetInfo[]>([]);
  const [running, setRunning] = useState(false);

  // Facturación ya no es obligatoria aquí: si no adjuntas archivo, la API usa
  // el acumulado en R2 (FacturacionEstadoCard abajo muestra si hay algo). Si
  // no hay nada acumulado Y no adjuntaste archivo, la API responde 400 —
  // error claro en vez de bloquear el botón sin explicar por qué.
  const listo = !!files.pedidos && !!files.inventario && !!files.externas;

  const setFile = useCallback((key: FileKey) => (f: File) => setFiles((prev) => ({ ...prev, [key]: f })), []);

  const toggleFuente = useCallback((f: string) => {
    setFuentes((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }, []);

  const handleGenerar = useCallback(async () => {
    if (!listo) return;
    setError(null);
    setRunning(true);
    setJob(null);
    setResultFile(null);
    setResultSheets([]);
    try {
      const jobId = await iniciarGeneracionReporte(
        { pedidos: files.pedidos!, inventario: files.inventario!, externas: files.externas!, facturacion: files.facturacion },
        { fuentesActivas: [...fuentes], ...flags },
      );
      const final = await esperarJob(jobId, setJob);
      if (final.status === 'error') throw new Error(final.error ?? 'El reporte falló sin mensaje de error');
      const file = await descargarReporteComoArchivo(jobId, final.filename ?? 'Reporte_Completo.xlsx');
      setResultFile(file);
      setResultSheets(await peekReportSheets(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [listo, files, fuentes, flags]);

  const descargarArchivo = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleDescargar = useCallback(() => {
    if (resultFile) descargarArchivo(resultFile);
  }, [resultFile, descargarArchivo]);

  const handleDescargarParaSheets = useCallback(async () => {
    if (!resultFile) return;
    const extracted = await extraerHojas(resultFile, SHEETS_PARA_GOOGLE);
    if (!extracted) {
      setError(
        'El reporte generado no incluye "Inventario por condicion" ni "Detalle Lotes Corta Caducidad" — ' +
        'revisa que el archivo de "Hojas externas" tenga las pestañas Revision2 y/o Corta caducidad.',
      );
      return;
    }
    descargarArchivo(extracted);
  }, [resultFile, descargarArchivo]);

  const faltanHojasSheets = resultFile
    ? SHEETS_PARA_GOOGLE.filter((n) => !resultSheets.some((s) => s.name.toLowerCase() === n.toLowerCase()))
    : [];

  const handleUsarEnApp = useCallback(() => {
    if (!resultFile) return;
    const selectedRoles = resultSheets.filter((s) => s.role).map((s) => s.role as SheetRole);
    navigate('/procesamiento', { state: { file: resultFile, selectedRoles } });
  }, [resultFile, resultSheets, navigate]);

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Generar reporte</h2>
        <p className="text-sm text-text-muted">
          Reemplaza correr Streamlit local — sube los mismos 4 archivos y el reporte de 7 hojas se genera aquí.
        </p>
      </div>

      <ApiLauncherCard />

      <Card>
        <CardHeader>
          <CardTitle>Archivos de entrada</CardTitle>
          <CardDescription>Pedidos, Inventario y Hojas externas son obligatorios. Facturación solo si activas Reporte de Consumo, Resumen_Fac o Sug. desde Consumo.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <FilePickedRow file={files.pedidos} label="1. Pedidos" />
            <DropZone onFile={setFile('pedidos')} accept=".xlsx,.xls" label="Pedidos" sub="hoja 'Seg pedidos' o 'sheets1'" />
          </div>
          <div className="flex flex-col gap-2">
            <FilePickedRow file={files.inventario} label="2. Inventario" />
            <DropZone onFile={setFile('inventario')} accept=".xlsx,.xls" label="Inventario" sub="hoja 'Inventario' o 'sheets1'" />
          </div>
          <div className="flex flex-col gap-2">
            <FilePickedRow file={files.externas} label="3. Hojas externas" />
            <DropZone onFile={setFile('externas')} accept=".xlsx,.xls" label="Hojas externas" sub="Corta caducidad, Lento mov, Revision, Revision2…" />
          </div>
          <div className="flex flex-col gap-2">
            <FilePickedRow file={files.facturacion} label="4. Facturación" />
            <DropZone onFile={setFile('facturacion')} accept=".xlsx,.xls" label="Facturación" sub="ventana reciente — se fusiona con lo acumulado en R2, no hace falta el historial completo" />
          </div>
        </CardContent>
      </Card>

      <FacturacionEstadoCard />

      <Card>
        <CardHeader>
          <CardTitle>Qué generar</CardTitle>
          <CardDescription>Igual que el panel lateral de Streamlit.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {FUENTES_DISPONIBLES.map((f) => (
              <label key={f} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs">
                <input type="checkbox" checked={fuentes.has(f)} onChange={() => toggleFuente(f)} className="size-3.5 accent-[var(--color-accent)]" />
                {f}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            {([
              ['genTodas', 'Todas las Sugerencias'],
              ['genResumen', 'Resumen Sin Sugerencias'],
              ['genReporteConsumo', 'Reporte de Consumo'],
              ['genResumenFac', 'Resumen_Fac (requiere Facturación)'],
              ['genSugConsumo', 'Sugerencias desde Consumo (requiere Reporte de Consumo + Facturación)'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={flags[key]}
                  onChange={() => setFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
        </div>
      )}

      {job && (
        <div className="rounded-md border border-border bg-bg-inset p-3 text-xs">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-text">
              {job.status === 'listo' ? <CheckCircle2 className="size-3.5 text-success" /> : <Loader2 className="size-3.5 animate-spin" />}
              {job.fase || job.status}
            </span>
            <span className="text-text-faint">{Math.round(job.progreso * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(job.progreso * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button disabled={!listo || running} onClick={handleGenerar}>
          {running ? <Loader2 className="size-4 animate-spin" /> : null}
          {running ? 'Generando…' : 'Generar reporte'}
        </Button>

        {resultFile && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDescargar}>
              <Download className="size-4" /> Descargar completo ({resultSheets.length} hojas)
            </Button>
            <Button variant="outline" onClick={handleDescargarParaSheets}>
              <Sheet className="size-4" /> Descargar para Google Sheets (2 hojas)
            </Button>
            <Button onClick={handleUsarEnApp}>
              Usar en la app <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {resultFile && (
        <div className="rounded-md border border-border p-3 text-xs">
          <p className="mb-1.5 font-medium text-text">Pestañas en el archivo generado</p>
          <div className="flex flex-wrap gap-1.5">
            {resultSheets.map((s) => (
              <span key={s.name} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">{s.name}</span>
            ))}
          </div>
          {faltanHojasSheets.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-warning">
              <AlertTriangle className="size-3.5" /> Falta{faltanHojasSheets.length > 1 ? 'n' : ''}: {faltanHojasSheets.join(', ')} —
              sube un archivo de "Hojas externas" con las pestañas Revision2 y/o Corta caducidad para generarlas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
