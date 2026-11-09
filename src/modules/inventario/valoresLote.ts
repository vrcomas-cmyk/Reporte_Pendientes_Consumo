import { norm } from '@/lib/text';
import { mesKey } from '@/core/resumenFac';

/** Pendiente y consumo de un material: generales (todos los centros) y del centro de un lote, con su promedio mensual y su última facturación ('mm/aaaa'). */
export interface ValoresMaterial {
  pendGeneral: number;
  pendCentro: number;
  consumo: number;
  consumoCentro: number;
  /** Consumo promedio mensual (historia): suma de los clientes, en todos los centros y en el del lote. */
  promGeneral: number;
  promCentro: number;
  /** Último mes con facturación ('' si nunca): en cualquier centro y en el del lote. */
  ultGeneral: string;
  ultCentro: string;
}

/** Los valores numéricos de `ValoresMaterial` (los que se pueden sumar y mostrar como «+N»). */
export type CampoNum = 'pendGeneral' | 'pendCentro' | 'consumo' | 'consumoCentro';

export interface SustitutoRef { material: string; texto: string }

/** Detalle de un sustituto: sus valores con el código y la descripción. */
export interface ValoresSustituto extends ValoresMaterial { material: string; texto: string }

export interface ValoresConSustitutos {
  propio: ValoresMaterial;
  /** Suma de los sustitutos (promedios sumados, última facturación = la más reciente); el valor propio NUNCA se mezcla con ella. */
  sust: ValoresMaterial & { detalle: ValoresSustituto[] };
}

/** Consumo de un material ya agregado por centro. */
export interface ConsumoMaterial {
  total: number;
  porCentro: Map<string, number>;
  prom: number;
  promPorCentro: Map<string, number>;
  ultMes: string;
  ultPorCentro: Map<string, string>;
}

/** Fuentes de datos (inyectadas): `pendDe(llave, centro)` con centro `null` = todos los centros; `consumoDe(llave)` = consumo agregado del material. */
export interface FuentesValores {
  pendDe: (materialKey: string, centro: string | null) => number;
  consumoDe: (materialKey: string) => ConsumoMaterial | undefined;
}

const masReciente = (x: string, y: string) => (mesKey(y) > mesKey(x) ? y : x);

export function valoresMaterial(materialKey: string, centro: string, f: FuentesValores): ValoresMaterial {
  const cons = f.consumoDe(materialKey);
  return {
    pendGeneral: f.pendDe(materialKey, null),
    pendCentro: f.pendDe(materialKey, centro),
    consumo: cons?.total ?? 0,
    consumoCentro: cons?.porCentro.get(centro) ?? 0,
    promGeneral: cons?.prom ?? 0,
    promCentro: cons?.promPorCentro.get(centro) ?? 0,
    ultGeneral: cons?.ultMes ?? '',
    ultCentro: cons?.ultPorCentro.get(centro) ?? '',
  };
}

/** Valores del material del lote y, aparte, los de sus sustitutos (suma y detalle por código). `centro` va normalizado. */
export function valoresConSustitutos(material: string, centro: string, sustitutos: readonly SustitutoRef[], f: FuentesValores): ValoresConSustitutos {
  const propioK = norm(material);
  const detalle: ValoresSustituto[] = sustitutos
    .filter((s) => norm(s.material) !== propioK)
    .map((s) => ({ material: s.material, texto: s.texto, ...valoresMaterial(norm(s.material), centro, f) }));
  const suma = (k: CampoNum | 'promGeneral' | 'promCentro') => detalle.reduce((acc, d) => acc + d[k], 0);
  return {
    propio: valoresMaterial(propioK, centro, f),
    sust: {
      pendGeneral: suma('pendGeneral'), pendCentro: suma('pendCentro'), consumo: suma('consumo'), consumoCentro: suma('consumoCentro'),
      promGeneral: suma('promGeneral'), promCentro: suma('promCentro'),
      ultGeneral: detalle.reduce((m, d) => masReciente(m, d.ultGeneral), ''),
      ultCentro: detalle.reduce((m, d) => masReciente(m, d.ultCentro), ''),
      detalle,
    },
  };
}
