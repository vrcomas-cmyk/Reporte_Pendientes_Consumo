// Proxy de datos: el navegador NUNCA llama a los Apps Script; pide esta función (con su sesión de Supabase) y ella
//   1) valida el JWT y busca el rol / permisos de datos del usuario,
//   2) llama al Apps Script con un token secreto (el Apps Script rechaza cualquier llamada sin él),
//   3) recorta la respuesta según la política del usuario (zona, precio, costo, condiciones, caducidad, regla 1032) y
//   4) responde. Admin / rol sin restricciones: la respuesta pasa tal cual.
//
// GET /functions/v1/datos/<conector>?<mismos parámetros que el Apps Script>
//   conector ∈ appscript_catalog_url | pedidos_sheets_url | incremento_costos_url
//
// Secrets: DATOS_APPS_TOKEN (el mismo valor que la propiedad API_TOKEN de cada Apps Script). SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase. Ver docs/acceso-por-roles.md.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CONECTORES_SIN_FILTRO, filtrarFacturacion, filtrarHoja, filtrarPestanaCatalogo, filtrarRelacion, mapaZonas, normCode, politicaDe,
  type FilaRol, type MapaZonas, type OverrideUsuario,
} from "./accesoDatos.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const CONECTORES = new Set(["appscript_catalog_url", "pedidos_sheets_url", "incremento_costos_url"]);
const TIMEOUT_MS = 55_000;
const CACHE_ZONAS_MS = 10 * 60_000;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function usuarioDe(req: Request): Promise<{ email: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email) return null;
    return { email: data.user.email.toLowerCase() };
  } catch {
    return null;
  }
}

async function llamarAppsScript(base: string, params: URLSearchParams): Promise<string> {
  const url = new URL(base);
  for (const [k, v] of params) if (k !== "token") url.searchParams.set(k, v);
  const secreto = Deno.env.get("DATOS_APPS_TOKEN");
  if (secreto) url.searchParams.set("token", secreto);
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
  return await res.text();
}

let cacheZonas: { en: number; mapa: MapaZonas } | null = null;
async function zonasDelCatalogo(urlCatalogo: string): Promise<MapaZonas> {
  if (cacheZonas && Date.now() - cacheZonas.en < CACHE_ZONAS_MS) return cacheZonas.mapa;
  const texto = await llamarAppsScript(urlCatalogo, new URLSearchParams({ tab: "Ejecutivos" }));
  const data = JSON.parse(texto);
  const mapa = mapaZonas(Array.isArray(data) ? data as Record<string, unknown>[] : []);
  cacheZonas = { en: Date.now(), mapa };
  return mapa;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const usuario = await usuarioDe(req);
  if (!usuario) return json({ error: "No autorizado" }, 401);

  const url = new URL(req.url);
  const conector = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!CONECTORES.has(conector)) return json({ error: "Conector no soportado" }, 404);

  const db = admin();
  // Solo usuarios invitados; el rol decide qué datos ven.
  const { data: fila, error: errUsuario } = await db
    .from("degasa_allowed_users")
    .select("email, zonas_manual, datos_override, degasa_roles(is_admin, restringir_zona, ver_costo, ver_precio_otras_zonas, condiciones_permitidas, caducidad_max_meses, ver_regla_cc_1032)")
    .ilike("email", usuario.email)
    .maybeSingle();
  if (errUsuario) return json({ error: "No se pudo validar el acceso" }, 500);
  if (!fila) return json({ error: "Usuario no invitado" }, 403);

  const { data: filas } = await db.from("degasa_connectors").select("key, value").in("key", ["appscript_catalog_url", conector]);
  const urlDe = (k: string) => (filas ?? []).find((f: { key: string; value: string | null }) => f.key === k)?.value ?? "";
  const base = urlDe(conector);
  if (!base) return json({ error: "Conector sin configurar" }, 404);

  const rol = (fila.degasa_roles ?? null) as FilaRol | null;
  const override = (fila.datos_override ?? null) as OverrideUsuario | null;

  let texto: string;
  try {
    // Zonas del usuario: las asignadas a mano o, si no hay, las del catálogo de ejecutivos por su correo.
    const manual = ((fila.zonas_manual ?? []) as string[]).map(normCode).filter(Boolean);
    const necesitaZonas = !!rol && !rol.is_admin;
    const mapa = necesitaZonas && urlDe("appscript_catalog_url") ? await zonasDelCatalogo(urlDe("appscript_catalog_url")) : null;
    const zonas = manual.length ? manual : (mapa?.zonasDeCorreo(usuario.email) ?? []);
    const politica = politicaDe(rol, override, zonas);

    if (!politica.sinRestriccion && CONECTORES_SIN_FILTRO.has(conector)) return json({ error: "Sin acceso a esta fuente" }, 403);

    texto = await llamarAppsScript(base, url.searchParams);
    if (politica.sinRestriccion) return new Response(texto, { headers: { ...CORS, "Content-Type": "application/json" } });

    const zonaDe = mapa?.zonaDe ?? (() => "");
    let data: unknown;
    try { data = JSON.parse(texto); } catch { return json({ error: "Respuesta inesperada del origen de datos" }, 502); }
    const accion = url.searchParams.get("action") ?? "";

    if (conector === "pedidos_sheets_url" && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (accion === "hoja" && Array.isArray(d.columnas) && Array.isArray(d.rows)) {
        const h = filtrarHoja(url.searchParams.get("libro") ?? "", String(d.hoja ?? url.searchParams.get("hoja") ?? ""), { columnas: d.columnas.map(String), rows: d.rows as unknown[][] }, politica, zonaDe);
        data = { ...d, rows: h.rows };
      } else if (accion === "fac_chunk" && Array.isArray(d.columnas) && Array.isArray(d.rows)) {
        const h = filtrarFacturacion({ columnas: d.columnas.map(String), rows: d.rows as unknown[][] }, politica, zonaDe);
        data = { ...d, rows: h.rows };
      } else if (accion === "relacion" && Array.isArray(d.relacion)) {
        data = { ...d, relacion: filtrarRelacion(d.relacion, politica) };
      } else if (accion !== "relacion" && accion !== "fac_manifest") {
        // Acción desconocida (incluye las antiguas manifest/chunk, que traen clientes de todas las zonas): no pasa sin filtro.
        return json({ error: "Acción no soportada" }, 400);
      }
    } else if (conector === "appscript_catalog_url") {
      const tab = url.searchParams.get("tab");
      if (tab && Array.isArray(data)) data = filtrarPestanaCatalogo(tab, data as Record<string, unknown>[], politica);
    }
    return json(data);
  } catch (e) {
    return json({ error: `No se pudo leer el origen de datos: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
});
