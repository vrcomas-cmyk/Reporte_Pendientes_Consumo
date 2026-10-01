import { listConnectors, setConnectorValue } from '@/services/permissionsService';
import { parseNombres, type NombresMap } from '@/lib/nombres';

/** Los nombres de centros/almacenes viven como filas de `degasa_connectors`
 * (mismo patrón que scoringWeightsService). Cada fila guarda un JSON
 * {codigo: nombre}. El prefijo permite ocultarlas del listado de Conectores. */
export const NOMBRES_PREFIX = 'nombres_';
export type NombresKind = 'centros' | 'almacenes';

const keyOf = (kind: NombresKind) => `${NOMBRES_PREFIX}${kind}`;

export async function loadNombres(): Promise<Record<NombresKind, NombresMap>> {
  const rows = await listConnectors();
  const get = (kind: NombresKind) => parseNombres(rows.find((r) => r.key === keyOf(kind))?.value);
  return { centros: get('centros'), almacenes: get('almacenes') };
}

export async function saveNombres(kind: NombresKind, map: NombresMap, updatedBy: string): Promise<void> {
  const limpio: NombresMap = {};
  for (const [k, v] of Object.entries(map)) {
    const code = k.trim();
    if (code && v.trim()) limpio[code] = v.trim();
  }
  await setConnectorValue(keyOf(kind), JSON.stringify(limpio), updatedBy);
}
