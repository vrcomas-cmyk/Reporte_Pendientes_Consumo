// Genera URLs prefirmadas para subir/bajar archivos de Cloudflare R2.
// El cliente NUNCA ve las llaves de R2 — solo pide esta función (protegida
// por JWT de Supabase Auth) y sube/baja directo a R2 con la URL temporal.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const MAX_UPLOAD_BYTES = Number(Deno.env.get("R2_MAX_UPLOAD_BYTES") ?? 100 * 1024 * 1024);
// Secreto compartido que valida las subidas del snapshot nocturno (el Apps
// Script que las hace no tiene sesión de Supabase — no puede pasar un JWT de
// usuario). Ver docs/apps-script-report-sheets.md §8. Debe configurarse como
// secret de esta función (`supabase secrets set SNAPSHOT_UPLOAD_SECRET=...`);
// si no está configurado, el modo "snapshot-upload" queda deshabilitado.
const SNAPSHOT_UPLOAD_SECRET = Deno.env.get("SNAPSHOT_UPLOAD_SECRET");
const SNAPSHOT_PREFIX = "snapshots/";

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// Valida el JWT contra Supabase Auth (verifica firma y expiración server-side)
// en vez de decodificar el payload con atob — decodificar sin verificar dejaba
// todo el control de acceso al flag verify_jwt de la Edge Function.
async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json().catch(() => null) as
    | { mode: "upload"; fileName: string; contentType: string; size?: number }
    | { mode: "download"; key: string }
    | { mode: "snapshot-upload"; key: string; contentType?: string }
    | { mode: "snapshot-download"; key: string }
    | null;
  if (!body) {
    return new Response(JSON.stringify({ error: "Body inválido" }), { status: 400 });
  }

  // "snapshot-upload" es la ÚNICA rama que NO pide sesión de Supabase: la
  // llama el Apps Script del snapshot nocturno, que no tiene un usuario
  // logueado — se autentica con el secreto compartido en vez de un JWT.
  // Todo lo demás (incluido "snapshot-download") sigue requiriendo sesión.
  if (body.mode === "snapshot-upload") {
    if (!SNAPSHOT_UPLOAD_SECRET || req.headers.get("x-snapshot-secret") !== SNAPSHOT_UPLOAD_SECRET) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }
    if (!body.key.startsWith(SNAPSHOT_PREFIX)) {
      return new Response(JSON.stringify({ error: "Key inválida" }), { status: 400 });
    }
    const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: body.key, ContentType: body.contentType ?? "application/octet-stream" });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    return new Response(JSON.stringify({ url }), { headers: { "Content-Type": "application/json" } });
  }

  const userId = await getUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
  }

  if (body.mode === "snapshot-download") {
    // Solo lectura y solo bajo snapshots/ — a diferencia de "download", no se
    // exige que la key empiece con el propio userId (el snapshot es
    // compartido por todo el equipo, no un archivo subido por un usuario).
    if (!body.key.startsWith(SNAPSHOT_PREFIX)) {
      return new Response(JSON.stringify({ error: "Key fuera de snapshots/" }), { status: 403 });
    }
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: body.key });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    return new Response(JSON.stringify({ url }), { headers: { "Content-Type": "application/json" } });
  }

  if (body.mode === "upload") {
    // Limite de tamaño del archivo (cota del cliente; R2 no aplica Content-Length).
    if (body.size && body.size > MAX_UPLOAD_BYTES) {
      return new Response(JSON.stringify({ error: "Archivo demasiado grande" }), { status: 413 });
    }
    // Cada usuario sube solo bajo su propio prefijo: userId/timestamp-nombre.xlsx
    const safeName = body.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 100);
    const key = `${userId}/${Date.now()}-${safeName}`;
    const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: body.contentType });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    return new Response(JSON.stringify({ url, key }), { headers: { "Content-Type": "application/json" } });
  }

  if (body.mode === "download") {
    // Solo puede pedir descargas de objetos bajo su propio prefijo.
    if (!body.key.startsWith(`${userId}/`)) {
      return new Response(JSON.stringify({ error: "No autorizado para este archivo" }), { status: 403 });
    }
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: body.key });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    return new Response(JSON.stringify({ url }), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "mode inválido" }), { status: 400 });
});
