import { listConnectors } from '@/services/permissionsService';
import { DATOS_PROXY_BASE, datosProxyActivo, urlProxy } from '@/services/datosProxy';

/** Connector keys the admin /admin · Conectores tab can edit — must match
 * `degasa_connectors.key` rows from the 0002 migration. Extending this to
 * cover the rest of .env.example's URLs (report API, DRP webhook, R2) is a
 * three-step process: add a row to the migration's `insert into
 * degasa_connectors`, add the key here, and swap the `import.meta.env.VITE_*`
 * read in that service for `getConnector(key, fallbackEnv)`. */
export const CONNECTOR_KEYS = {
  appscriptCatalogUrl: 'appscript_catalog_url',
  incrementoCostosUrl: 'incremento_costos_url',
  pedidosSheetsUrl: 'pedidos_sheets_url',
} as const;

let cache: Map<string, string> | null = null;
let inFlight: Promise<Map<string, string>> | null = null;

async function loadAll(): Promise<Map<string, string>> {
  const rows = await listConnectors();
  const m = new Map<string, string>();
  for (const r of rows) if (r.value) m.set(r.key, r.value);
  return m;
}

/** Fetched once per page load (cached in-memory) and re-fetched only via
 * `invalidateConnectorsCache` after an admin edit. Falls back silently to
 * `fallbackEnv` (the existing `VITE_*` var) whenever the Supabase-stored
 * value is empty/missing OR the fetch itself fails (table not migrated yet,
 * offline, etc.) — so this can roll out without breaking anyone still
 * relying on the .env value. */
export async function getConnector(key: string, fallbackEnv: string | undefined): Promise<string | undefined> {
  // Con el proxy de datos activo la app nunca conoce la URL real del Apps Script: recibe la del proxy (y ya no cae a la variable VITE_*).
  if (datosProxyActivo() && (Object.values(CONNECTOR_KEYS) as string[]).includes(key)) return urlProxy(key);
  try {
    if (!cache) {
      inFlight ??= loadAll();
      cache = await inFlight;
      inFlight = null;
    }
    return cache.get(key) || fallbackEnv || viaProxy(key);
  } catch {
    return fallbackEnv || viaProxy(key);
  }
}

/** Un usuario que no es admin no puede leer las URLs de los conectores (migración 0027): si no hay URL a la mano, se pide a la función `datos`, que las
 * lee en el servidor. Así el rol sin acceso a Conectores puede cargar datos sin conocer jamás la URL del Apps Script. */
function viaProxy(key: string): string | undefined {
  return DATOS_PROXY_BASE && (Object.values(CONNECTOR_KEYS) as string[]).includes(key) ? urlProxy(key) : undefined;
}

/** Call after an admin saves a connector value from /admin so the next read
 * (in this tab) picks it up without a full page reload. */
export function invalidateConnectorsCache(): void {
  cache = null;
  inFlight = null;
}
