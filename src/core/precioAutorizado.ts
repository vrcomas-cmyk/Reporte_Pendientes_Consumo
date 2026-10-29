// ---------------------------------------------------------------------------
// precioAutorizado.ts · Precio de oferta AUTORIZADO (módulo Precios) para cualquier lugar donde aparezcan materiales ofertables
// (Inv con Condición, detalles, lotes, sustitutos…), con las MISMAS condiciones de Precios.
//
// En Precios cada precio es de un material + una combinación de condiciones: Corta caducidad (CC), PNC y los Status de Revision que el usuario
// incluyó. Todos los segmentos de un material llevan además sus Status incluidos (un material «lento» ofrece su existencia general como «Lento mov»
// y sus lotes de corta caducidad como «CC + Lento mov»). Aquí se arma esa MISMA combinación a partir del texto de condición de la fila donde se
// va a mostrar el precio. Sin precio autorizado para esa combinación → `null` (quien llama decide qué mostrar, p. ej. «-»).
// ---------------------------------------------------------------------------
import { BANDERA_CC, BANDERA_PNC, combinacionDe } from './politicaPrecios';

/** Un precio autorizado y vigente (> costo hoy) de una oferta con condición. */
export interface PrecioAutorizadoEntrada { material: string; combinacion: string; precio: number }

export interface PreciosAutorizados {
  /** Precio autorizado del material para la condición del texto («Corta caducidad», «PNC», «Sustituto/Corta caducidad», «Revision Liz»…).
   * Se le suman los Status incluidos del material, como hace Precios. `null` = sin precio autorizado para esa combinación. */
  precio(material: string, condicionTexto: string): number | null;
  /** La combinación de Precios («CC + Lento mov») que corresponde a ese material y texto; '' si no hay condición. */
  combinacion(material: string, condicionTexto: string): string;
  /** Todos los precios autorizados del material. */
  deMaterial(material: string): { combinacion: string; precio: number }[];
}

export const SIN_PRECIOS_AUTORIZADOS: PreciosAutorizados = { precio: () => null, combinacion: () => '', deMaterial: () => [] };

const normMat = (m: string) => m.trim().replace(/\.0+$/, '');

/** Qué condiciones fijas (Corta caducidad / PNC) menciona un texto de condición o de fuente. «Sustituto», «General» y similares no cuentan. */
export function condicionesDeTexto(texto: string): { cc: boolean; pnc: boolean } {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return { cc: /corta\s+caducidad|\bcc\b/.test(t), pnc: /\bpnc\b/.test(t) };
}

/**
 * @param entradas        ofertas autorizadas vigentes (una por material + combinación)
 * @param estadosIncluidos Status de Revision INCLUIDOS en Precios que tiene ese material
 */
export function crearPreciosAutorizados(entradas: readonly PrecioAutorizadoEntrada[], estadosIncluidos: (material: string) => readonly string[]): PreciosAutorizados {
  const porClave = new Map<string, number>();
  const porMaterial = new Map<string, { combinacion: string; precio: number }[]>();
  for (const e of entradas) {
    const m = normMat(e.material);
    porClave.set(`${m}|${e.combinacion}`, e.precio);
    porMaterial.set(m, [...(porMaterial.get(m) ?? []), { combinacion: e.combinacion, precio: e.precio }]);
  }
  const combinacion = (material: string, texto: string): string => {
    const { cc, pnc } = condicionesDeTexto(texto);
    return combinacionDe([...(cc ? [BANDERA_CC] : []), ...(pnc ? [BANDERA_PNC] : []), ...estadosIncluidos(material)]);
  };
  return {
    combinacion,
    precio: (material, texto) => {
      const c = combinacion(material, texto);
      return c ? porClave.get(`${normMat(material)}|${c}`) ?? null : null;
    },
    deMaterial: (material) => porMaterial.get(normMat(material)) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Condición REAL de un lote: un lote de PNC con 12 meses o menos de caducidad es también «Corta caducidad» (en Precios: «CC + PNC»).
// ---------------------------------------------------------------------------
import { inicioDeDia, sumarMeses } from './pedidos';
import { MESES_MAX_CORTA_CADUCIDAD } from './inventoryRules';

/** Fecha de una celda de caducidad: `aaaa-mm-dd` o `d/m/aaaa`. null si no es una fecha. */
export function fechaDeCaducidad(texto: string | Date | null | undefined): Date | null {
  if (texto instanceof Date) return Number.isNaN(texto.getTime()) ? null : texto;
  const t = (texto ?? '').trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return dmy ? new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])) : null;
}

/** Texto de condición de un lote para buscar su precio: la fuente más «Corta caducidad» si es un lote de PNC que vence en ≤ 12 meses. */
export function condicionDeLote(fuente: string, caducidad: string | Date | null | undefined, hoy: Date = new Date()): string {
  const { cc, pnc } = condicionesDeTexto(fuente);
  if (cc || !pnc) return fuente;
  const f = fechaDeCaducidad(caducidad);
  return f && f.getTime() <= sumarMeses(inicioDeDia(hoy), MESES_MAX_CORTA_CADUCIDAD).getTime() ? `${fuente}/Corta caducidad` : fuente;
}
