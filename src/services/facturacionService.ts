// Facturación acumulada en R2 (fase de migración: reemplaza tener que
// resubir el historial completo cada vez — ver Sugerencias_SQL/api.py).
import { authHeader, fetchApi, requireApiUrl } from './reportGeneratorService';

export interface FacturacionEstado {
  existe: boolean;
  filas?: number;
  size_kb?: number;
  actualizado?: string;
  fecha_min?: string;
  fecha_max?: string;
}

export async function consultarFacturacionEstado(): Promise<FacturacionEstado> {
  const base = requireApiUrl();
  const res = await fetchApi(`${base}/facturacion/estado`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`No se pudo consultar el estado de facturación (${res.status})`);
  return res.json();
}

/** Sube solo la ventana reciente (mes corriente + ~7 días) — se fusiona en
 * R2 con lo ya acumulado, reemplazando esa ventana de fechas. */
export async function actualizarFacturacion(file: File): Promise<{ filas_nuevas: number; filas_totales: number }> {
  const base = requireApiUrl();
  const form = new FormData();
  form.set('archivo', file);
  const res = await fetchApi(`${base}/facturacion`, { method: 'POST', headers: await authHeader(), body: form });
  if (!res.ok) throw new Error(`No se pudo actualizar facturación (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Bytes Parquet de la facturación acumulada — el módulo Comodato los carga
 * directo en DuckDB-wasm (parquet_scan), sin pasar por JSON. */
export async function descargarFacturacionParquet(): Promise<Uint8Array> {
  const base = requireApiUrl();
  const res = await fetchApi(`${base}/facturacion/parquet`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`No se pudo descargar facturación acumulada (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}
