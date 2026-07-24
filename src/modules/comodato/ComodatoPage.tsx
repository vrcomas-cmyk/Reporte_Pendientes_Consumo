import { useCallback, useState } from 'react';
import { AlertTriangle, Loader2, PlayCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { DropZone } from '@/components/upload/DropZone';
import { FacturacionEstadoCard } from '@/modules/shared/FacturacionEstadoCard';
import { ApiLauncherCard } from '@/modules/shared/ApiLauncherCard';
import { runComodatoAnalysis, type ComodatoResult } from '@/services/comodatoService';
import { useDataStore } from '@/store/dataStore';
import { formatCurrency, formatNumber } from '@/lib/utils';

export function ComodatoPage() {
  const catalog = useDataStore((s) => s.catalog);
  const [mmFile, setMmFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ComodatoResult | null>(null);

  const materiales = catalog?.materiales ?? [];
  const ejecutivos = catalog?.ejecutivos ?? [];
  const listo = !!mmFile && materiales.length > 0 && ejecutivos.length > 0;

  const handleAnalizar = useCallback(async () => {
    if (!mmFile) return;
    setRunning(true);
    setError(null);
    setData(null);
    try {
      const res = await runComodatoAnalysis(mmFile, materiales, ejecutivos);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [mmFile, materiales, ejecutivos]);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Comodato vs. Facturación</h2>
        <p className="text-sm text-text-muted">
          Cruza equipos en comodato contra su consumo facturado — reusa el mismo query DuckDB del proyecto original,
          sin reescribirlo. Facturación viene del acumulado en R2 (no del Resumen_Fac de la app); Materiales y
          Ejecutivos/Zona, del catálogo sincronizado — solo pide el archivo de movimientos de comodato.
        </p>
      </div>

      <ApiLauncherCard />

      {!catalog && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          <AlertTriangle className="size-3.5" /> Sincroniza el catálogo primero en "Carga" — este módulo necesita Materiales y Ejecutivos.
        </div>
      )}

      <FacturacionEstadoCard />

      <Card>
        <CardHeader>
          <CardTitle>Insumo nuevo</CardTitle>
          <CardDescription>El único archivo que este módulo pide aparte de lo que la app ya tiene.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-xs text-text-faint">{mmFile ? mmFile.name : 'Movimientos de comodato (YBFD/ZBRE)'}</p>
          <DropZone onFile={setMmFile} accept=".xlsx,.xls" label="mm_ybfd_zbre" sub="reporte SAP de entregas/devoluciones de equipo" />
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
        </div>
      )}

      <Button disabled={!listo || running} onClick={handleAnalizar} className="self-start">
        {running ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
        {running ? 'Analizando…' : 'Analizar'}
      </Button>

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Seguimiento 360 · {data.seguimiento360.length.toLocaleString('es-MX')} filas</CardTitle>
            <CardDescription>Cliente × equipo — comodato instalado, facturación de bolsas, margen y ROI.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table wrapperClassName="max-h-[32rem] rounded-lg border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead><TableHead>Equipo</TableHead>
                  <TableHead className="text-right">Cant. comodato</TableHead>
                  <TableHead className="text-right">Facturación total</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.seguimiento360.slice(0, 500).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-64 truncate">{String(r.razon_social ?? r.cliente)}</TableCell>
                    <TableCell>{String(r.descripcion_comodato ?? r.material_comodato)}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(r.cantidad_comodato ?? 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(r.facturacion_total ?? 0))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(r.margen_total ?? 0))}</TableCell>
                    <TableCell>{String(r.status_actividad ?? '—')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.seguimiento360.length > 500 && (
              <p className="mt-2 text-[11px] text-text-faint">Mostrando las primeras 500 de {data.seguimiento360.length.toLocaleString('es-MX')} filas.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
