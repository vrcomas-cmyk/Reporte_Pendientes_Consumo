// ---------------------------------------------------------------------------
// ofertaSustituto.ts · Textos y comparación cuando lo que se ofrece NO es el material del pedido sino su sustituto.
// Puro: lo usan el copiado de datos de oferta (Seg. de pedidos y detalle de material) y la ventana de comparación de costo.
// ---------------------------------------------------------------------------
import { norm } from '@/lib/text';

/** ¿Lo ofertado es OTRO código distinto al que viene en el pedido (un sustituto)? El mismo código bajo otra condición (corta caducidad, PNC…) no lo es. */
export function esSustituto(materialPedido: string, materialOfertado: string): boolean {
  const a = norm(materialPedido);
  const b = norm(materialOfertado);
  return a !== '' && b !== '' && a !== b;
}

/** Línea que se agrega al copiar la oferta de un sustituto: indica qué código cambiar por cuál. */
export function textoCambioCodigo(original: string, sustituto: string): string {
  return `Cambiar el código ${norm(original)} (que viene en el pedido) que estamos visualizando por el código ${norm(sustituto)} (sustituto)`;
}

export interface ComparacionCosto {
  costoOriginal: number;
  costoSustituto: number;
  /** sustituto − original (positivo = el sustituto cuesta más). */
  diferencia: number;
  /** diferencia / costo original (null si el original no tiene costo). */
  pct: number | null;
  /** 'mas-caro' | 'mas-barato' | 'igual' | 'sin-costo' (falta el costo de alguno). */
  veredicto: 'mas-caro' | 'mas-barato' | 'igual' | 'sin-costo';
}

/** Compara el costo del material del pedido contra el de su sustituto. */
export function compararCosto(costoOriginal: number, costoSustituto: number): ComparacionCosto {
  if (!(costoOriginal > 0) || !(costoSustituto > 0)) {
    return { costoOriginal, costoSustituto, diferencia: 0, pct: null, veredicto: 'sin-costo' };
  }
  const diferencia = costoSustituto - costoOriginal;
  const pct = diferencia / costoOriginal;
  const veredicto = Math.abs(diferencia) < 0.005 ? 'igual' : diferencia > 0 ? 'mas-caro' : 'mas-barato';
  return { costoOriginal, costoSustituto, diferencia, pct, veredicto };
}

/** Existencia de un material sumando solo los centros que pasan el filtro «Considerar centros» (`invByCenter`: centro → cantidad). */
export function disponibleEnCentros(invByCenter: Readonly<Record<string, number>>, pasaCentro: (centro: string) => boolean): number {
  return Object.entries(invByCenter).reduce((s, [c, q]) => (pasaCentro(c) ? s + (Number(q) || 0) : s), 0);
}
