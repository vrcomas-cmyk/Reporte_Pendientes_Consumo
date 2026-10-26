import { listConnectors, setConnectorValue } from '@/services/permissionsService';

/** Correos predeterminados de la solicitud de traslado: una fila de `degasa_connectors` con un arreglo JSON (el prefijo `filtros_` la oculta del
 * listado de Conectores; la lee todo el equipo y solo escribe un admin). El correo NUNCA se envía desde la app: son solo los destinatarios que se
 * muestran para que el usuario los copie. */
const KEY = 'filtros_traslado_destinatarios';

export function parseDestinatarios(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

/** «a@x.com, b@x.com; c@x.com» → lista limpia y sin repetidos. */
export function listaDeCorreos(texto: string): string[] {
  return [...new Set(texto.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
}

export async function loadDestinatariosTraslado(): Promise<string[]> {
  const rows = await listConnectors();
  return parseDestinatarios(rows.find((r) => r.key === KEY)?.value);
}

export async function saveDestinatariosTraslado(correos: string[], updatedBy: string): Promise<void> {
  await setConnectorValue(KEY, JSON.stringify(listaDeCorreos(correos.join(','))), updatedBy);
}
