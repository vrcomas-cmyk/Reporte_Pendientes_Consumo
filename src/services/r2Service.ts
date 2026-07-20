import { supabase } from '@/lib/supabaseClient';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Uploads a file straight to R2 via a presigned URL (obtained from the
 * r2-presign Edge Function, which never exposes the R2 secret to the
 * client). Returns the object key to store alongside the history entry. */
export async function uploadFileToR2(file: File): Promise<string> {
  const { data: presign, error: presignError } = await supabase.functions.invoke<{ url: string; key: string }>(
    'r2-presign',
    { body: { mode: 'upload', fileName: file.name, contentType: file.type || XLSX_CONTENT_TYPE } },
  );
  if (presignError || !presign) throw presignError ?? new Error('No se pudo obtener la URL de subida a R2');

  const putRes = await fetch(presign.url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || XLSX_CONTENT_TYPE },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Falló la subida a R2: ${putRes.status}`);

  return presign.key;
}

/** Resolves a temporary download URL for a previously uploaded object. */
export async function getR2DownloadUrl(key: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('r2-presign', {
    body: { mode: 'download', key },
  });
  if (error || !data) throw error ?? new Error('No se pudo obtener la URL de descarga de R2');
  return data.url;
}
