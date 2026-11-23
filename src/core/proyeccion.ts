// ---------------------------------------------------------------------------
// proyeccion.ts · Proyección de dónde terminará el mes corriente (en curso)
// para las gráficas de línea mensual. Un mes parcial dibujado como dato real
// "se desploma" frente a los meses cerrados; esta proyección da la línea
// punteada que sigue la secuencia.
// ---------------------------------------------------------------------------

export interface ProyeccionMes {
  /** Lo facturado a la fecha en el mes corriente. */
  acumulado: number;
  /** Dónde se espera que cierre el mes. Nunca menor que `acumulado`. */
  proyectado: number;
  /** Promedio de los últimos meses cerrados usado como tendencia. */
  tendencia: number;
  /** Fracción del mes transcurrida (0-1). */
  fraccion: number;
}

export const MESES_TENDENCIA = 3;

/** Hacia dónde va el mes en curso: cierre proyectado contra el promedio de los últimos meses cerrados. */
export interface TendenciaMes {
  dir: 'up' | 'down' | 'flat';
  /** Variación porcentual (con signo) del cierre proyectado contra el promedio. */
  pct: number;
}
/** Por debajo de esta variación (en valor absoluto) se considera «estable». */
export const UMBRAL_TENDENCIA_PCT = 2;

/** Tendencia del mes en curso: `proyectado` contra `promedio` (la tendencia de `proyectarMesCorriente`). Sin promedio positivo no hay base de comparación → `null`. */
export function tendenciaVsPromedio(proyectado: number, promedio: number): TendenciaMes | null {
  if (!Number.isFinite(proyectado) || !Number.isFinite(promedio) || promedio <= 0) return null;
  const pct = ((proyectado - promedio) / promedio) * 100;
  return { dir: pct >= UMBRAL_TENDENCIA_PCT ? 'up' : pct <= -UMBRAL_TENDENCIA_PCT ? 'down' : 'flat', pct };
}

/** Promedio de los últimos `MESES_TENDENCIA` valores cerrados (los `null` no cuentan); `null` si no hay ninguno. */
export function promedioCerrados(valores: readonly (number | null | undefined)[]): number | null {
  const v = valores.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).slice(-MESES_TENDENCIA);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function diasDelMes(hoy: Date): number {
  return new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
}

/** Fracción transcurrida del mes de `hoy`. El reporte llega con corte del día
 * anterior, así que los días transcurridos son `día − 1` (mínimo 1). */
export function fraccionMes(hoy: Date): number {
  const dias = diasDelMes(hoy);
  return Math.min(1, Math.max(1, hoy.getDate() - 1) / dias);
}

/** Proyección de cierre del mes corriente combinando ritmo y tendencia:
 *
 *   ritmo      = acumulado / fracción            (lo que va, llevado al mes completo)
 *   proyectado = fracción·ritmo + (1−fracción)·tendencia
 *              = acumulado + (1−fracción)·tendencia
 *
 * A inicio de mes se apoya en la tendencia (no cae a 0); conforme avanza pesa
 * lo real; el último día converge al acumulado. `valoresCerrados` son los
 * meses ya cerrados en orden cronológico (ceros incluidos); la tendencia es el
 * promedio de los últimos `MESES_TENDENCIA`. Sin meses cerrados → `null`. */
export function proyectarMesCorriente(valoresCerrados: number[], acumulado: number, hoy: Date = new Date()): ProyeccionMes | null {
  const ultimos = valoresCerrados.slice(-MESES_TENDENCIA);
  if (!ultimos.length) return null;
  const tendencia = ultimos.reduce((s, v) => s + v, 0) / ultimos.length;
  const fraccion = fraccionMes(hoy);
  const proyectado = Math.max(acumulado, acumulado + (1 - fraccion) * tendencia);
  return { acumulado, proyectado, tendencia, fraccion };
}
