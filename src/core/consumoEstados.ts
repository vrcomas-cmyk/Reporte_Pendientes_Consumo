// ---------------------------------------------------------------------------
// consumoEstados.ts · Estado (al corriente / en riesgo / reactivación / nueva compra), tendencia y meses con movimiento de cada fila de
// Consumo/Facturación. Es lo más pesado de la tabla (una serie por fila, ~80 mil filas), así que se arma por tramos y fuera de la pantalla.
// ---------------------------------------------------------------------------
import type { ConsumoRow } from './types';
import { clasificarEstado, mesKey, serieMatDest, tendenciaTexto, type Estado, type RFIndex, type Tendencia } from './resumenFac';
import { correrPorTramos, correrSincrono } from '@/lib/tramos';

export interface EstadoFila {
  status: Estado;
  tend: Tendencia;
  /** Meses (escala `mesKey`) en los que la fila REALMENTE facturó: base del filtro de periodo. */
  meses: number[];
}

/** Índice por identidad de fila. */
export type IndiceEstados = Map<ConsumoRow, EstadoFila>;

/** Generador: cede el paso (`yield` con el avance 0-1) cada ~1,000 filas. */
export function* estadosConsumoGen(rows: ConsumoRow[], rf: RFIndex | null): Generator<number, IndiceEstados> {
  const m: IndiceEstados = new Map();
  let i = 0;
  for (const r of rows) {
    if ((++i & 1023) === 0) yield i / (rows.length || 1);
    const serie = serieMatDest(rf, r.destinatario, r.material);
    const meses: number[] = [];
    for (const p of serie) {
      if (!p.cant && !p.imp) continue;
      const k = mesKey(p.mes);
      if (k) meses.push(k);
    }
    m.set(r, { status: clasificarEstado(serie.length ? serie : null, false), tend: tendenciaTexto(serie), meses });
  }
  return m;
}

/** De golpe (mismo resultado que la versión por tramos). */
export function estadosConsumo(rows: ConsumoRow[], rf: RFIndex | null): IndiceEstados {
  return correrSincrono(estadosConsumoGen(rows, rf));
}

/** Por tramos cortos: la pantalla sigue respondiendo; `null` si se canceló. */
export function estadosConsumoAsync(rows: ConsumoRow[], rf: RFIndex | null, control?: { cancelado?: () => boolean; onProgreso?: (fraccion: number) => void }): Promise<IndiceEstados | null> {
  return correrPorTramos(estadosConsumoGen(rows, rf), control);
}
