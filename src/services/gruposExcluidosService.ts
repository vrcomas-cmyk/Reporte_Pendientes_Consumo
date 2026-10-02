import { listConnectors, setConnectorValue } from '@/services/permissionsService';
import { parseGruposExcluidos, GRUPOS_EXCLUIDOS_DEFAULT } from '@/lib/gruposCliente';

/** Los grupos de cliente excluidos por defecto viven como una fila de
 * `degasa_connectors` (mismo patrón que nombresService): JSON con el arreglo de
 * códigos Gpo. Cte. El prefijo la oculta del listado de Conectores. */
export const FILTROS_PREFIX = 'filtros_';
const KEY = `${FILTROS_PREFIX}grupos_excluidos`;

/** Sin fila (o con un valor inválido) → el default (18 = GOBIERNO). Una fila
 * con `[]` es una decisión explícita de no excluir nada. */
export async function loadGruposExcluidos(): Promise<string[]> {
  const rows = await listConnectors();
  return parseGruposExcluidos(rows.find((r) => r.key === KEY)?.value) ?? [...GRUPOS_EXCLUIDOS_DEFAULT];
}

export async function saveGruposExcluidos(codigos: string[], updatedBy: string): Promise<void> {
  const limpio = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  await setConnectorValue(KEY, JSON.stringify(limpio), updatedBy);
}
