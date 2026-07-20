import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CloudUpload, Loader2, RefreshCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { consultarFacturacionEstado, actualizarFacturacion, type FacturacionEstado } from '@/services/facturacionService';
import { formatDateTime } from '@/lib/utils';

/** Estado de la Facturación acumulada en R2 + botón para subir solo la
 * ventana reciente (mes corriente + ~7 días) y fusionarla — se usa tanto en
 * "Generar reporte" como en "Comodato vs. Facturación", ambos dependen del
 * mismo acumulado. */
export function FacturacionEstadoCard({ onActualizado }: { onActualizado?: () => void }) {
  const [estado, setEstado] = useState<FacturacionEstado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setEstado(await consultarFacturacionEstado());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setLoading(true);
    setError(null);
    try {
      await actualizarFacturacion(f);
      await cargar();
      onActualizado?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cargar, onActualizado]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Facturación acumulada</CardTitle>
          <CardDescription>Sube solo la ventana reciente (mes corriente + ~7 días) — se fusiona con el historial en R2, no lo reemplaza.</CardDescription>
        </div>
        <button onClick={cargar} className="text-text-faint hover:text-text"><RefreshCcw className="size-3.5" /></button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
          </div>
        )}
        {estado?.existe ? (
          <div className="rounded-md border border-border bg-bg-inset p-3 text-xs text-text-muted">
            <div className="font-medium text-text">{estado.filas?.toLocaleString('es-MX')} filas · {estado.size_kb} KB</div>
            <div className="mt-1">Rango: {estado.fecha_min} → {estado.fecha_max}</div>
            <div className="mt-1">Actualizado: {estado.actualizado ? formatDateTime(estado.actualizado) : '—'}</div>
          </div>
        ) : estado ? (
          <p className="text-xs text-text-faint">Aún no hay facturación acumulada — sube el archivo completo la primera vez.</p>
        ) : null}
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-bg-inset">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
          {loading ? 'Fusionando…' : 'Subir ventana reciente de Facturación'}
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={loading} onChange={handleFile} />
        </label>
      </CardContent>
    </Card>
  );
}
