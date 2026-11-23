// Función `envios`: puente entre el portal y el Apps Script de «Envíos» (Transmisión, DRP y Mercancía sin cargo).
//
// El navegador NUNCA llama al Apps Script ni conoce su URL o su token. Pide esta función (con su sesión de Supabase) y ella:
//   1) valida el JWT y que el usuario esté invitado (degasa_allowed_users),
//   2) valida la ACCIÓN contra una lista blanca y sanea sus parámetros (acceso.ts),
//   3) comprueba que el ROL del usuario tenga permiso del módulo de esa acción (misma regla que el cliente),
//   4) llama al Apps Script con el secreto compartido y el correo del usuario YA VALIDADO (el navegador no puede suplantarlo),
//   5) responde. CORS por lista de orígenes (secret ALLOWED_ORIGINS), no `*`.
//
// POST /functions/v1/envios   cuerpo: { "accion": "tx_indice" | "tx_historial", ...parámetros }
//
// Secrets: ENVIOS_APPS_TOKEN (el mismo valor que la propiedad PORTAL_TOKEN del Apps Script), ALLOWED_ORIGINS (orígenes del portal separados por comas; localhost siempre se permite).
// El conector `envios_apps_url` (degasa_connectors, solo lo lee un admin) tiene la URL /exec del Apps Script. SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY los inyecta
// Supabase. Guía de despliegue: docs/apps-script-envios.md.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { configTransmision, listaDeOrigenes, moduloDeAccion, moduloPermitido, ordenarPermisos, origenPermitido, parametrosDeAccion, type FilaPermiso } from "./acceso.ts";
import { CacheUsuarios, validarSesion, type ResultadoAuth } from "./usuarioCache.ts";

const ORIGENES = listaDeOrigenes(Deno.env.get("ALLOWED_ORIGINS"));
const TIMEOUT_MS = 110_000;
const CORS_BASE: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function corsDe(req: Request): Record<string, string> {
  const origen = origenPermitido(req.headers.get("Origin"), ORIGENES);
  return origen ? { ...CORS_BASE, "Access-Control-Allow-Origin": origen } : { ...CORS_BASE };
}

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const sesiones = new CacheUsuarios();

/** Valida la sesión del navegador. Un token ya validado en los últimos 60 s no vuelve a consultar Auth; si Auth no responde se distingue de un token inválido. */
function usuarioDe(req: Request): Promise<ResultadoAuth> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return validarSesion(token, sesiones, async (t) => {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data, error } = await supabase.auth.getUser(t);
    return { email: data?.user?.email ?? null, error: error ? { status: (error as { status?: number }).status } : null };
  });
}

/** Escapa los comodines de LIKE (`%`, `_`, `\`) para comparar un correo con `ilike` sin que `_` coincida con otro carácter. */
const escLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

Deno.serve(async (req: Request) => {
  const cors = corsDe(req);
  const json = (data: unknown, status = 200): Response =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sesion = await usuarioDe(req);
  if (!sesion.ok) {
    // Auth caído/saturado ≠ token inválido: 503 le dice al navegador que reintente en vez de darse por no autorizado.
    if (sesion.motivo === "no-disponible") return new Response(JSON.stringify({ error: "Servicio de autenticación no disponible; reintenta en unos segundos." }), { status: 503, headers: { ...cors, "Content-Type": "application/json", "Retry-After": "5" } });
    return json({ error: "No autorizado" }, 401);
  }
  const usuario = { email: sesion.email };

  let body: Record<string, unknown>;
  try {
    const crudo = await req.json();
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return json({ error: "Solicitud inválida" }, 400);
    body = crudo as Record<string, unknown>;
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }

  const accion = body.accion;
  const modulo = moduloDeAccion(accion);
  if (!modulo) return json({ error: "Acción no soportada" }, 400);
  const params = parametrosDeAccion(accion, body);
  if (!params) return json({ error: "Parámetros inválidos" }, 400);

  const db = admin();

  // Solo usuarios invitados.
  const { data: fila, error: errUsuario } = await db
    .from("degasa_allowed_users")
    .select("email, role_id, degasa_roles(is_admin)")
    .ilike("email", escLike(usuario.email))
    .maybeSingle();
  if (errUsuario) return json({ error: "No se pudo validar el acceso" }, 500);
  if (!fila) return json({ error: "Usuario no invitado" }, 403);

  // Permiso del módulo según el rol (y las excepciones del usuario, que ganan).
  const rol = (fila.degasa_roles ?? null) as { is_admin?: boolean } | null;
  const esAdmin = !!rol?.is_admin;
  const tieneRol = !!fila.role_id;
  let permisos: FilaPermiso[] = [];
  if (!esAdmin && tieneRol) {
    const base = () => db.from("degasa_permissions").select("subject_type, scope, module_key, allowed").eq("scope", "module").eq("module_key", modulo);
    const [delRol, delUsuario] = await Promise.all([
      base().eq("subject_type", "role").eq("subject_id", fila.role_id),
      base().eq("subject_type", "user").ilike("subject_id", escLike(usuario.email)),
    ]);
    if (delRol.error || delUsuario.error) return json({ error: "No se pudo validar el permiso" }, 500);
    permisos = ordenarPermisos([...(delRol.data ?? []), ...(delUsuario.data ?? [])] as FilaPermiso[]);
  }
  if (!moduloPermitido(esAdmin, tieneRol, permisos, modulo)) return json({ error: "Sin acceso a este módulo" }, 403);

  // Configuración de Transmisión (libros y pestañas): la guarda un admin desde Administración → Envíos y se lee AQUÍ, del servidor.
  // El navegador no manda URLs de libros al script (solo la `url` de `tx_pestanas`, ya validada y exclusiva de administradores).
  let paramsScript: Record<string, unknown> = params;
  if (accion === "tx_indice" || accion === "tx_historial") {
    const { data: filaCfg } = await db.from("degasa_connectors").select("value").eq("key", "envios_cfg_transmision").maybeSingle();
    const cfg = configTransmision(filaCfg?.value);
    if (!cfg) return json({ error: "Transmisión sin configurar: un administrador debe agregar los libros en Administración → Envíos." }, 404);
    if (accion === "tx_historial" && !cfg.histUrl) return json({ error: "Falta el libro histórico en Administración → Envíos." }, 404);
    paramsScript = accion === "tx_indice" ? { ...params, libros: cfg.libros } : { ...params, histUrl: cfg.histUrl };
  }

  // Destino: el Apps Script configurado por un admin (conector) + el secreto del servidor.
  const secreto = Deno.env.get("ENVIOS_APPS_TOKEN");
  if (!secreto) return json({ error: "Falta configurar el secreto ENVIOS_APPS_TOKEN" }, 500);
  const { data: conector } = await db.from("degasa_connectors").select("value").eq("key", "envios_apps_url").maybeSingle();
  const base = String(conector?.value ?? "").trim();
  if (!base) return json({ error: "Conector envios_apps_url sin configurar" }, 404);

  try {
    const res = await fetch(base, {
      method: "POST",
      // text/plain: Apps Script no exige preflight y lee el cuerpo en e.postData.contents.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // El script original despacha por `action`; las del portal llevan el prefijo `portal_` (docs/apps-script-envios-portal.gs).
      body: JSON.stringify({ token: secreto, usuario: usuario.email, action: `portal_${accion}`, ...paramsScript }),
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = await res.text();
    let data: Record<string, unknown> | null = null;
    try { data = JSON.parse(texto); } catch { /* respuesta que no es JSON: se trata abajo */ }
    if (!data) return json({ error: "Respuesta inesperada del origen de datos" }, 502);
    if (data.exito !== true) return json({ error: String(data.mensaje ?? "El origen de datos devolvió un error").slice(0, 300) }, 502);
    return json({ ok: true, datos: data });
  } catch (e) {
    return json({ error: `No se pudo leer el origen de datos: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) }, 502);
  }
});
