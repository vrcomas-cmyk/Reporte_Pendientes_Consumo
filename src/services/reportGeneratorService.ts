import { supabase } from '@/lib/supabaseClient';

const API_URL = import.meta.env.VITE_REPORT_API_URL as string | undefined;

export interface GenerarReporteFlags {
  genTodas: boolean;
  genResumen: boolean;
  genReporteConsumo: boolean;
  genResumenFac: boolean;
  genSugConsumo: boolean;
  fuentesActivas: string[];
}

export interface GenerarReporteFiles {
  pedidos: File;
  inventario: File;
  externas: File;
  facturacion?: File;
}

export interface JobStatus {
  id: string;
  status: 'pendiente' | 'procesando' | 'listo' | 'error';
  fase: string;
  progreso: number;
  error?: string | null;
  filename?: string | null;
}

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('No hay sesión activa');
  return { Authorization: `Bearer ${token}` };
}

export function requireApiUrl(): string {
  if (!API_URL) throw new Error('Falta VITE_REPORT_API_URL en .env.local — apunta al servicio que reemplaza Streamlit.');
  return API_URL;
}

/** fetch() throws a bare "Failed to fetch" (TypeError) for anything from "el
 * servidor no está prendido" a CORS a DNS — sin distinguir la causa. Envuelve
 * con un mensaje accionable en vez de dejar pasar el genérico. */
export async function fetchApi(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(
      `No se pudo conectar con la API en ${API_URL} — ¿está corriendo? ` +
      `(local: "uvicorn api:app --reload --port 8000" dentro de Sugerencias_SQL; ` +
      `si ya la desplegaste, revisa VITE_REPORT_API_URL en .env.local y CORS/ALLOWED_ORIGINS en el servicio).`,
    );
  }
}

/** Kicks off report generation on the Python API (replaces running Streamlit
 * locally). Returns the job id to poll with pollJobUntilDone(). */
export async function iniciarGeneracionReporte(files: GenerarReporteFiles, flags: GenerarReporteFlags): Promise<string> {
  const base = requireApiUrl();
  const form = new FormData();
  form.set('pedidos', files.pedidos);
  form.set('inventario', files.inventario);
  form.set('externas', files.externas);
  if (files.facturacion) form.set('facturacion', files.facturacion);
  form.set('fuentes_activas', flags.fuentesActivas.join(','));
  form.set('gen_todas', String(flags.genTodas));
  form.set('gen_resumen', String(flags.genResumen));
  form.set('gen_reporte_consumo', String(flags.genReporteConsumo));
  form.set('gen_resumen_fac', String(flags.genResumenFac));
  form.set('gen_sug_consumo', String(flags.genSugConsumo));

  const res = await fetchApi(`${base}/reportes`, { method: 'POST', headers: await authHeader(), body: form });
  if (!res.ok) throw new Error(`No se pudo iniciar el reporte (${res.status}): ${await res.text()}`);
  const { job_id } = await res.json();
  return job_id as string;
}

export async function consultarJob(jobId: string): Promise<JobStatus> {
  const base = requireApiUrl();
  const res = await fetchApi(`${base}/reportes/${jobId}`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`No se pudo consultar el reporte (${res.status})`);
  return res.json();
}

/** Polls until the job finishes (listo/error), calling onUpdate on every tick. */
export async function esperarJob(jobId: string, onUpdate?: (s: JobStatus) => void, intervalMs = 1500): Promise<JobStatus> {
  for (;;) {
    const status = await consultarJob(jobId);
    onUpdate?.(status);
    if (status.status === 'listo' || status.status === 'error') return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Downloads the finished report as a File (same shape UploadPage.tsx expects
 * from a manually-dropped file), so it can feed straight into the existing
 * peekReportSheets/processReport flow — no round-trip through the disk. */
export async function descargarReporteComoArchivo(jobId: string, filename: string): Promise<File> {
  const base = requireApiUrl();
  const res = await fetchApi(`${base}/reportes/${jobId}/archivo`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`No se pudo descargar el reporte (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
