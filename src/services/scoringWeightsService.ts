import { listConnectors, setConnectorValue } from '@/services/permissionsService';
import { PESOS_DEFAULT, type CriterioKey } from '@/core/scoring';

/** Los pesos del motor de compatibilidad se guardan como filas más de
 * `degasa_connectors` (mismo patrón key/value genérico que las URLs de Apps
 * Script) — no hace falta una tabla nueva. Prefijo para no chocar con otros
 * conectores y para poder filtrarlos de un listado genérico. */
export const SCORING_WEIGHT_PREFIX = 'scoring_weight_';

export function weightKey(criterio: CriterioKey): string {
  return `${SCORING_WEIGHT_PREFIX}${criterio}`;
}

/** Lee los pesos guardados en Supabase; cualquier criterio sin fila o con
 * valor no numérico cae a `PESOS_DEFAULT` — nunca falla ni deja el motor de
 * scoring sin pesos. */
export async function loadScoringWeights(): Promise<Partial<Record<CriterioKey, number>>> {
  const rows = await listConnectors();
  const out: Partial<Record<CriterioKey, number>> = {};
  for (const [criterio] of Object.entries(PESOS_DEFAULT) as [CriterioKey, number][]) {
    const row = rows.find((r) => r.key === weightKey(criterio));
    const n = row?.value != null ? Number(row.value) : NaN;
    out[criterio] = Number.isFinite(n) ? n : PESOS_DEFAULT[criterio];
  }
  return out;
}

export async function saveScoringWeight(criterio: CriterioKey, value: number, updatedBy: string): Promise<void> {
  await setConnectorValue(weightKey(criterio), String(value), updatedBy);
}
