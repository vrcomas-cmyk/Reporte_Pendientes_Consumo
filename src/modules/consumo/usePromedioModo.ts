import { usePersistedState } from '@/hooks/usePersistedState';
import { promedioConsumo, type PromedioModo, type RangoMeses } from '@/core/consumoDesdeRF';
import { mesKey, serieCentroMatDest, type RFIndex } from '@/core/resumenFac';
import type { ConsumoRow } from '@/core/types';

/** Modo del "promedio mensual" de Consumo, compartido (vía localStorage) entre
 * la tabla de Consumo y los paneles que muestran el mismo número. */
export function usePromedioModo() {
  return usePersistedState<PromedioModo>('consumo.promedioModo', 'historia');
}

/** Rango del filtro de periodo de Consumo ('mm/aaaa') en escala `mesKey`. */
export function useRangoPeriodo(): RangoMeses {
  const [p] = usePersistedState<{ desde: string; hasta: string }>('consumo.periodoMeses', { desde: '', hasta: '' });
  return { lo: p.desde ? mesKey(p.desde) : null, hi: p.hasta ? mesKey(p.hasta) : null };
}

/** Promedio mensual de una fila según el modo; sin modo/rango activos devuelve
 * el valor ya precalculado (historia completa). */
export function promedioDeFila(rf: RFIndex | null, r: ConsumoRow, modo: PromedioModo, rango?: RangoMeses): number {
  if (!rf || (modo === 'historia' && rango?.lo == null && rango?.hi == null)) return r.consumoPromedioMensual;
  return promedioConsumo(serieCentroMatDest(rf, r.centro, r.destinatario, r.material), modo, rf.curmes, rango);
}
