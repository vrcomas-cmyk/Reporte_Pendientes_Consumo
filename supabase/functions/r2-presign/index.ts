// Genera URLs prefirmadas para subir/bajar archivos de Cloudflare R2.
// El cliente NUNCA ve las llaves de R2 — solo pide esta función (protegida
// por JWT de Supabase Auth) y sube/baja directo a R2 con la URL temporal.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { S3Client, PutObjectCommand, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

function getUserId(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const userId = getUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
  }

  const body = await req.json().catch(() => null) as
    | { mode: "upload"; fileName: string; contentType: string }
    | { mode: "download"; key: string }
    | null;
  if (!body) {
    return new Response(JSON.stringify({ error: "Body inválido" }), { status: 400 });
  }

  if (body.mode === "upload") {
    // Cada usuario sube solo bajo su propio prefijo: userId/timestamp-nombre.xlsx
    const safeName = body.fileName.replace(/[^\w.\-]+/g, "_");
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
