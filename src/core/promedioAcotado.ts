/** Promedio "acotado": limita los meses con picos muy altos para que no inflen el promedio.
 *
 * Tope = Q3 + 3 × IQR (valores atípicos EXTREMOS de Tukey; con 1.5 se recortaba también la variación normal de la demanda) calculado sobre los meses CON venta (los meses en 0 no cuentan para fijar el tope,
 * pero sí para el promedio: un mes sin venta es consumo 0). Cada mes por encima del tope se toma como el tope y se promedia
 * sobre TODOS los meses del periodo. Con menos de 4 meses con venta no hay base para detectar picos y no se acota nada. */
export interface PromedioAcotado {
  /** Promedio mensual con los picos limitados al tope. */
  promedio: number;
  /** Promedio sin acotar (suma ÷ meses), para comparar. */
  normal: number;
  /** Tope aplicado (cantidad máxima por mes) o `null` si no se acotó nada. */
  tope: number | null;
  /** Meses que superaron el tope y se limitaron. */
  acotados: number;
}

/** Factor del rango intercuartil para el tope: 3 = solo picos extremos (compras únicas, errores de captura). */
export const FACTOR_IQR = 3;

const cuantil = (ordenados: number[], q: number): number => {
  if (!ordenados.length) return 0;
  const pos = (ordenados.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  return ordenados[i]! + ((ordenados[i + 1] ?? ordenados[i]!) - ordenados[i]!) * f;
};

/** `valores` = cantidad de cada mes del periodo (incluye los meses en 0). */
export function promedioAcotado(valores: readonly number[]): PromedioAcotado {
  const n = valores.length;
  if (!n) return { promedio: 0, normal: 0, tope: null, acotados: 0 };
  const normal = valores.reduce((s, v) => s + v, 0) / n;
  const conVenta = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (conVenta.length < 4) return { promedio: normal, normal, tope: null, acotados: 0 };
  const q1 = cuantil(conVenta, 0.25);
  const q3 = cuantil(conVenta, 0.75);
  const tope = q3 + FACTOR_IQR * (q3 - q1);
  let acotados = 0;
  let suma = 0;
  for (const v of valores) {
    if (v > tope) { acotados++; suma += tope; } else suma += v;
  }
  return { promedio: suma / n, normal, tope: acotados ? tope : null, acotados };
}
