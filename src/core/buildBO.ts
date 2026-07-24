// ---------------------------------------------------------------------------
// buildBO.ts · BO deduplication engine. Pure port of legacy buildBO() from
// js/sugerencias.js. Groups "Todas las Sugerencias" rows by
//   Pedido | MaterialBase | Centro | Almacén | Destinatario
// Within each group the row with an empty `Fuente` is the ORIGIN (the real
// demand); rows with a non-empty `Fuente` are alternate supply sources and must
// never be counted as separate demand (avoids double counting pending qty/$).
// ---------------------------------------------------------------------------
import type { Sugerencia } from './types';
import {
  clasificarEstado,
  tendenciaTexto,
  consumoDe,
  serieMatDest,
  type RFIndex,
  type Serie,
  type Estado,
  type Tendencia,
  type ConsumoInfo,
} from './resumenFac';
import { norm, num } from '@/lib/text';

export interface BOItem {
  bo: Sugerencia;
  fuentes: Sugerencia[];
  k: string;
  serie: Serie;
  consumoProm: number;
  status: Estado;
  tend: Tendencia;
  cons: ConsumoInfo;
}

const keyOf = (r: Sugerencia): string =>
  [norm(r.pedido), norm(r.materialBase), norm(r.centroPedido), norm(r.almacen), norm(r.destinatario)].join('|');

const hasFuente = (r: Sugerencia): boolean => norm(r.fuente) !== '';

export function buildBO(rows: Sugerencia[], rf: RFIndex | null): BOItem[] {
  const map = new Map<string, { origen: Sugerencia | null; fuentes: Sugerencia[]; any: Sugerencia }>();
  for (const r of rows) {
    const k = keyOf(r);
    let g = map.get(k);
    if (!g) {
      g = { origen: null, fuentes: [], any: r };
      map.set(k, g);
    }
    if (hasFuente(r)) g.fuentes.push(r);
    else if (!g.origen) g.origen = r;
  }
  return [...map.values()].map((g) => {
    const b = g.origen || g.any;
    const serie = serieMatDest(rf, b.destinatario, b.materialBase);
    let cp = num(b.consumoPromedio);
    if (!cp) {
      for (const rr of [g.origen, g.any, ...g.fuentes].filter(Boolean) as Sugerencia[]) {
        const v = num(rr.consumoPromedio);
        if (v) {
          cp = v;
          break;
        }
      }
    }
    return {
      bo: b,
      fuentes: g.fuentes,
      k: keyOf(b),
      serie,
      consumoProm: cp,
      status: clasificarEstado(serie, num(b.cantidadPendiente) > 0),
      tend: tendenciaTexto(serie),
      cons: consumoDe(serie, rf?.curmes || ''),
    };
  });
}
