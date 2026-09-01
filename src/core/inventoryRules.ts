/**
 * RN-INV-001 — Corta caducidad (regla canónica de negocio).
 *
 * Ver "Reportes En uno Para APP/business-rules/03-inventario.md" y
 * "09-parametros.yaml". Un inventario se considera de corta caducidad cuando
 * su vigencia restante es <= 12 meses, O cuando está en el almacén 1032,
 * independientemente de su fecha de caducidad. Se conserva el motivo:
 * VIGENCIA / ALMACEN_1032 / AMBOS.
 *
 * Esta regla NO es configurable por usuario (a diferencia del antiguo
 * `shortExpiryDays` de Settings, que usaba 90 días y no evaluaba el
 * almacén): es un umbral de negocio fijo. Si en el futuro se necesita una
 * alerta comercial más agresiva y separada, debe modelarse como una métrica
 * con nombre distinto (p.ej. "alertaVencimientoProximo"), nunca reutilizando
 * la etiqueta "corta caducidad" — ver business-rules/10-divergencias.md D1.
 */

export const MESES_MAX_CORTA_CADUCIDAD = 12;
export const ALMACEN_CORTA_CADUCIDAD = '1032';

export type MotivoCortaCaducidad = 'VIGENCIA' | 'ALMACEN_1032' | 'AMBOS';

export interface ResultadoCortaCaducidad {
  esCortaCaducidad: boolean;
  motivo: MotivoCortaCaducidad | null;
  mesesRestantes: number | null;
}

/** Días hasta la fecha dada, o null si la fecha es inválida/ausente. */
function diasHasta(fecha: string | null | undefined, hoy: Date): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getTime() - hoy.getTime()) / 86_400_000;
}

/**
 * Evalúa RN-INV-001 para un lote. `mesesMaximos` en meses calendario
 * (aproximados como 30.44 días, igual criterio que "Meses vigencia lote").
 */
export function evaluarCortaCaducidad(
  fechaCaducidad: string | null | undefined,
  almacen: string | null | undefined,
  hoy: Date = new Date(),
  mesesMaximos: number = MESES_MAX_CORTA_CADUCIDAD,
): ResultadoCortaCaducidad {
  const dias = diasHasta(fechaCaducidad, hoy);
  const mesesRestantes = dias == null ? null : Math.round((dias / 30.4375) * 10) / 10;
  const porVigencia = mesesRestantes != null && mesesRestantes <= mesesMaximos;
  const porAlmacen = (almacen ?? '').toString().trim() === ALMACEN_CORTA_CADUCIDAD;

  if (!porVigencia && !porAlmacen) {
    return { esCortaCaducidad: false, motivo: null, mesesRestantes };
  }
  const motivo: MotivoCortaCaducidad = porVigencia && porAlmacen ? 'AMBOS' : porVigencia ? 'VIGENCIA' : 'ALMACEN_1032';
  return { esCortaCaducidad: true, motivo, mesesRestantes };
}

/**
 * RN-INV-002 — Almacenes aplicables según la condición del material (módulo
 * Inv Condición). Confirmado por negocio: cuando el texto de la condición
 * indica caducidad, el inventario de un centro es SOLO su almacén 1032; en
 * cualquier otro caso (lento movimiento, calidad, dañado, normal, texto
 * libre tipo "Cosmopark"/"PNC") es la suma de los almacenes generales
 * 1030+1031+1060 de ese centro — la misma agregación que ya usa
 * `resumenSin.invGen`.
 *
 * A diferencia de RN-INV-001 (que evalúa vigencia + almacén 1032 de un
 * LOTE), esta regla solo mira el TEXTO de la condición del material — no
 * hay fecha de caducidad a nivel de fila en Inv Condición.
 */

export const ALMACENES_GENERALES = ['1030', '1031', '1060'] as const;
export const ALMACEN_CADUCIDAD_CONDICION = '1032';

/** Coincide con "caducidad" en cualquier parte del texto (case/accent-insensitive),
 * más laxo que el `/corta/i` usado ad-hoc en la UI — cubre "Corta caducidad",
 * "Caducidad próxima", etc. */
export function esCondicionCortaCaducidad(condicion: string | null | undefined): boolean {
  const s = (condicion ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /caducidad/.test(s);
}

/** Almacenes de los que se debe leer/sumar el inventario de un material en un
 * centro, según el texto de su condición. */
export function almacenesDeCondicion(condicion: string | null | undefined): readonly string[] {
  return esCondicionCortaCaducidad(condicion) ? [ALMACEN_CADUCIDAD_CONDICION] : ALMACENES_GENERALES;
}
