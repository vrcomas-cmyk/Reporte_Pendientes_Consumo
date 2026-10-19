// ---------------------------------------------------------------------------
// politicaPrecios.ts · Precio base por material y precio de OFERTA por condición.
//
//  · Precio base = el punto medio del mercado: la MEDIANA (P50) de lo facturado, ponderada por
//    volumen. Si el material casi no se vende se usa la razón precio/costo de su grupo de
//    artículos (o del sector). Tope = LISTA 06; mínimo = margen mínimo sobre el precio.
//  · Precio de oferta = costo + (base − costo) × (1 − cede), donde `cede` es el % del MARGEN que se
//    cede por las condiciones del segmento (Corta caducidad, PNC, Status de Revision). Los % se
//    apilan: 1 − Π(1 − cᵢ). Mientras `cede` < 100 % el precio queda por encima del costo.
//  · Piso: margen mínimo que se quiere ganar, decidible por material, grupo de artículos, sector o
//    condición (gana el más específico) y, en un caso concreto, a mano: piso = costo / (1 − margenMín).
//    El margen mínimo es SIEMPRE > 0, así que el precio es siempre > costo.
//
// Todo es puro: la UI (`modules/precios`) y las pruebas lo usan sin tocar red.
// ---------------------------------------------------------------------------

/** Condición que acelera la venta: 'CC' (Corta caducidad, calculada en la app), 'PNC' (dañado / detalle, del archivo) o un Status de la
 * pestaña Revision del archivo (texto tal cual, p. ej. "Lento mov"). */
export type Bandera = string;
export const BANDERA_CC = 'CC';
export const BANDERA_PNC = 'PNC';
export const SEP_COMBINACION = ' + ';

/** Condición de la pestaña Revision (un Status): el usuario decide si entra, qué % del margen cede y el margen mínimo que quiere ganar. */
export interface CondicionRevision {
  incluida: boolean;
  /** % del margen (0–1) que cede esta condición. */
  pctCede: number;
  /** Margen mínimo sobre precio (> 0) que se quiere ganar con esta condición. */
  margenMin: number;
}
export const CONDICION_DEFECTO: CondicionRevision = { incluida: false, pctCede: 0.3, margenMin: 0.05 };

/** Tramo de meses de vigencia restante para Corta caducidad ('' = sin tramo / no aplica). */
export type TramoCc = '' | '<=3' | '<=6' | '<=12';

/** Margen mínimo cuando nadie lo define (1 %): garantiza precio > costo. */
export const MARGEN_MIN_ABSOLUTO = 0.01;
export const SECTOR_GLOBAL = '*';
/** Con menos facturas que éstas (filas de Resumen_Fac del material) se prefiere la referencia del grupo / sector. */
export const MIN_PUNTOS_MATERIAL = 6;

export interface ParamsSector {
  /** Margen mínimo sobre precio (0–1) del precio BASE: piso = costo / (1 − margenMin). */
  margenMin: number;
  /** Margen objetivo sobre precio (0–1): solo se usa si no hay ninguna referencia de mercado. */
  margenObjetivo: number;
}

export interface ReglaMarkdown {
  /** Sector (o `*` = todos). */
  sector: string;
  /** 'CC' (por tramo de vigencia) o 'PNC'. */
  combinacion: string;
  tramoCc: TramoCc;
  /** % del margen (0–1) que cede esta condición. */
  pctCede: number;
  /** Margen mínimo sobre precio (> 0) que se quiere ganar: piso = costo / (1 − margenMin). */
  margenMin: number;
}

/** Ámbito de una regla de margen mínimo, del más específico al más general: material › grupo de artículos › sector. */
export type AmbitoMargen = 'material' | 'grupo' | 'sector';
export const AMBITOS_MARGEN: readonly AmbitoMargen[] = ['material', 'grupo', 'sector'];

/** "En este material / grupo / sector quiero ganar al menos X %", opcionalmente solo para una condición ('' = cualquiera). */
export interface ReglaMargenMin {
  ambito: AmbitoMargen;
  clave: string;
  /** '' = toda condición; si no, 'CC', 'PNC', un Status o la combinación completa. */
  condicion: string;
  margenMin: number;
}

export interface Politica {
  global: ParamsSector;
  porSector: Record<string, ParamsSector>;
  markdown: ReglaMarkdown[];
  /** Status de la pestaña Revision → incluida / % que cede / margen mínimo. Sin entrada = no incluida. */
  condiciones: Record<string, CondicionRevision>;
  /** Márgenes mínimos decididos por material, grupo de artículos o sector (gana el más específico). */
  margenesMin: ReglaMargenMin[];
}

export const POLITICA_DEFECTO: Politica = {
  global: { margenMin: 0.15, margenObjetivo: 0.3 },
  porSector: {},
  condiciones: {},
  margenesMin: [],
  markdown: [
    { sector: SECTOR_GLOBAL, combinacion: 'CC', tramoCc: '', pctCede: 0.25, margenMin: 0.05 },
    { sector: SECTOR_GLOBAL, combinacion: 'CC', tramoCc: '<=12', pctCede: 0.25, margenMin: 0.05 },
    { sector: SECTOR_GLOBAL, combinacion: 'CC', tramoCc: '<=6', pctCede: 0.5, margenMin: 0.03 },
    { sector: SECTOR_GLOBAL, combinacion: 'CC', tramoCc: '<=3', pctCede: 0.75, margenMin: 0.02 },
    { sector: SECTOR_GLOBAL, combinacion: 'PNC', tramoCc: '', pctCede: 0.4, margenMin: 0.03 },
  ],
};

/** Combinación canónica: CC primero, luego los Status de Revision (alfabético), PNC al final; sin duplicados. '' si no hay banderas. */
export function combinacionDe(banderas: readonly Bandera[]): string {
  const u = [...new Set(banderas)];
  const estados = u.filter((b) => b !== BANDERA_CC && b !== BANDERA_PNC).sort((a, b) => a.localeCompare(b, 'es'));
  return [...(u.includes(BANDERA_CC) ? [BANDERA_CC] : []), ...estados, ...(u.includes(BANDERA_PNC) ? [BANDERA_PNC] : [])].join(SEP_COMBINACION);
}

/** Tramo de Corta caducidad según los meses de vigencia restantes (null/NaN → ''). */
export function tramoCcDe(meses: number | null | undefined): TramoCc {
  if (meses == null || !Number.isFinite(meses)) return '';
  if (meses <= 3) return '<=3';
  if (meses <= 6) return '<=6';
  if (meses <= 12) return '<=12';
  return '';
}

export interface PuntoPrecio { valor: number; peso: number }

/** Percentil `p` (0–1) ponderado por peso (volumen). Ignora valores ≤ 0 o pesos ≤ 0; 0 si no hay datos. */
export function percentilPonderado(puntos: readonly PuntoPrecio[], p: number): number {
  const v = puntos.filter((x) => x.valor > 0 && x.peso > 0).sort((a, b) => a.valor - b.valor);
  if (!v.length) return 0;
  const total = v.reduce((s, x) => s + x.peso, 0);
  const objetivo = Math.min(1, Math.max(0, p)) * total;
  let acum = 0;
  for (const x of v) {
    acum += x.peso;
    if (acum >= objetivo) return x.valor;
  }
  return v[v.length - 1].valor;
}

export type FlagPrecio = 'sin-costo' | 'sin-historial' | 'dispersion-anomala';

/** Qué fijó el precio base: la mediana del propio material, la razón del grupo / del sector, el margen objetivo (sin ninguna referencia), el
 * tope LISTA 06 o el margen mínimo. */
export type OrigenBase = 'mercado-p50' | 'grupo' | 'sector' | 'sin-historial' | 'tope-lista06' | 'piso-margen';

/** Referencia de mercado de un grupo o sector: mediana ponderada de precio ÷ costo de sus materiales. */
export interface ReferenciaRazon { razon: number; origen: 'grupo' | 'sector' }

export interface PrecioBase {
  costo: number;
  min: number; p25: number; p50: number; promedio: number; p90: number; max: number;
  /** El punto medio (P50 o referencia) ya acotado por el tope y el piso. `null` si no hay costo. */
  base: number | null;
  origenBase: OrigenBase | null;
  /** Antes de acotar: el valor de mercado que se tomó como punto medio. */
  referencia: number;
  techo: number;
  flags: FlagPrecio[];
}

const MAX_SPREAD_ANOMALO = 5; // mismo criterio que core/precios.ts::MAX_PLAUSIBLE_SPREAD

/** Redondeo hacia ARRIBA a centavos: nunca deja un precio por debajo de lo calculado (y por tanto del piso). */
const arriba2 = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

export function paramsDeSector(pol: Politica, sector: string): ParamsSector {
  return pol.porSector[sector] ?? pol.global;
}

export function calcularPrecioBase(
  input: { costo: number; precios: readonly PuntoPrecio[]; lista06?: number; minReal?: number; maxReal?: number; ref?: ReferenciaRazon },
  params: ParamsSector,
): PrecioBase {
  const validos = input.precios.filter((x) => x.valor > 0);
  const vals = validos.map((x) => x.valor);
  // Mín/Máx reales de las líneas facturadas si se conocen; si no, los de los puntos.
  const min = (input.minReal ?? 0) > 0 ? (input.minReal as number) : vals.length ? Math.min(...vals) : 0;
  const max = (input.maxReal ?? 0) > 0 ? (input.maxReal as number) : vals.length ? Math.max(...vals) : 0;
  const pesoTot = validos.reduce((s, x) => s + Math.max(0, x.peso), 0);
  const promedio = pesoTot > 0 ? validos.reduce((s, x) => s + x.valor * Math.max(0, x.peso), 0) / pesoTot : 0;
  const p25 = percentilPonderado(validos, 0.25);
  const p50 = percentilPonderado(validos, 0.5);
  const p90 = percentilPonderado(validos, 0.9);
  const flags: FlagPrecio[] = [];
  const salida: PrecioBase = { costo: input.costo, min, p25, p50, promedio, p90, max, base: null, origenBase: null, referencia: 0, techo: 0, flags };
  if (!(input.costo > 0)) { flags.push('sin-costo'); return salida; }
  if (!validos.length) flags.push('sin-historial');
  if (min > 0 && (max - min) / min > MAX_SPREAD_ANOMALO) flags.push('dispersion-anomala');

  const pisoMargen = input.costo / (1 - Math.min(0.95, Math.max(MARGEN_MIN_ABSOLUTO, params.margenMin)));
  // Punto medio: la mediana del material si tiene suficientes facturas; si no, la razón del grupo / sector aplicada a su costo; si tampoco hay, su
  // propia mediana (aunque sean pocos datos) y, sin nada, el margen objetivo.
  let referencia: number;
  let origen: OrigenBase;
  if (validos.length >= MIN_PUNTOS_MATERIAL && p50 > 0) { referencia = p50; origen = 'mercado-p50'; }
  else if (input.ref && input.ref.razon > 0) { referencia = input.costo * input.ref.razon; origen = input.ref.origen; }
  else if (p50 > 0) { referencia = p50; origen = 'mercado-p50'; }
  else { referencia = input.costo / (1 - Math.min(0.95, Math.max(0, params.margenObjetivo))); origen = 'sin-historial'; }

  const techo = (input.lista06 ?? 0) > 0 ? Math.max(input.lista06 as number, pisoMargen) : Number.POSITIVE_INFINITY;
  let base = referencia;
  if (base > techo) { base = techo; origen = 'tope-lista06'; }
  if (base < pisoMargen) { base = pisoMargen; origen = 'piso-margen'; }
  salida.referencia = arriba2(referencia);
  salida.techo = Number.isFinite(techo) ? arriba2(techo) : 0;
  salida.base = arriba2(base);
  salida.origenBase = origen;
  return salida;
}

/** Regla aplicable: (sector, cond, tramo) → (sector, cond, '') → (*, cond, tramo) → (*, cond, ''). */
export function reglaDe(pol: Politica, sector: string, combinacion: string, tramo: TramoCc): ReglaMarkdown | null {
  const busca = (s: string, t: TramoCc) => pol.markdown.find((r) => r.sector === s && r.combinacion === combinacion && r.tramoCc === t);
  return busca(sector, tramo) ?? busca(sector, '') ?? busca(SECTOR_GLOBAL, tramo) ?? busca(SECTOR_GLOBAL, '') ?? null;
}

/** Contexto de un caso para resolver su margen mínimo. */
export interface CasoMargen { material?: string; grupo?: string; sector?: string; banderas?: readonly Bandera[] }

/**
 * Margen mínimo decidido por el usuario para un caso: el ámbito más específico gana (material › grupo de artículos › sector); dentro de un
 * ámbito, una regla para una condición del caso (o su combinación completa) gana sobre la de "toda condición". `null` si ninguna aplica.
 */
export function resolverMargenMin(pol: Politica, c: CasoMargen): number | null {
  const claveDe: Record<AmbitoMargen, string | undefined> = { material: c.material, grupo: c.grupo, sector: c.sector };
  const comb = c.banderas ? combinacionDe(c.banderas) : '';
  const partes = new Set(c.banderas ?? []);
  for (const ambito of AMBITOS_MARGEN) {
    const clave = claveDe[ambito];
    if (!clave) continue;
    const reglas = pol.margenesMin.filter((r) => r.ambito === ambito && r.clave === clave && r.margenMin > 0);
    const conCondicion = reglas.filter((r) => r.condicion !== '' && (r.condicion === comb || partes.has(r.condicion)));
    const elegida = conCondicion.length ? conCondicion.reduce((a, b) => (b.margenMin > a.margenMin ? b : a)) : reglas.find((r) => r.condicion === '');
    if (elegida) return elegida.margenMin;
  }
  return null;
}

/** Piso: el precio con el margen mínimo que se quiere ganar, costo / (1 − margenMin). El margen mínimo es siempre > 0 (aunque llegue 0 o
 * negativo se usa el 1 %), así que el piso es estrictamente > costo. */
export function pisoDuro(costo: number, margenMin: number | undefined): number {
  const m = margenMin != null && margenMin > 0 ? Math.min(0.95, margenMin) : MARGEN_MIN_ABSOLUTO;
  return arriba2(costo / (1 - m));
}

/** Un precio desglosado contra la base y el costo: lo que se descuenta, qué parte del margen se cede y el margen que queda. */
export interface AnalisisPrecio {
  /** Descuento sobre el precio base: 1 − precio / base. */
  descuento: number;
  /** % del margen (base − costo) que se cede: (base − precio) / (base − costo). */
  cede: number;
  /** Margen sobre precio: (precio − costo) / precio. */
  margen: number;
  /** Ganancia por unidad: precio − costo. */
  utilidad: number;
}

/** CÁLCULO INVERSO: dado un precio (p. ej. el que autorizaron) devuelve cuánto descuento y margen implica. */
export function analisisPrecio(precio: number, base: number, costo: number): AnalisisPrecio | null {
  if (!(precio > 0) || !(base > 0) || !(costo > 0)) return null;
  const margenBase = base - costo;
  return {
    descuento: 1 - precio / base,
    cede: margenBase > 0 ? (base - precio) / margenBase : 0,
    margen: (precio - costo) / precio,
    utilidad: precio - costo,
  };
}

export interface PrecioOferta {
  combinacion: string;
  tramoCc: TramoCc;
  /** % del margen que se cede (apilado de todas las condiciones). */
  pctCede: number;
  /** Descuento resultante sobre el precio base. */
  descuento: number;
  precioSinPiso: number;
  /** Margen mínimo aplicado y de dónde salió. */
  margenMin: number;
  origenMargenMin: 'manual' | AmbitoMargen | 'condicion';
  piso: number;
  precio: number;
  /** Margen sobre precio. */
  margen: number;
  recortado: boolean;
}

/** Precio de oferta de un segmento: costo + (base − costo) × (1 − cede), recortado al piso. `null` si no hay costo/base.
 * Margen mínimo: `margenMinManual` (este caso) › regla por material › grupo › sector › el más alto de sus condiciones. */
export function calcularPrecioOferta(
  input: { base: number | null; costo: number; sector: string; banderas: readonly Bandera[]; mesesCc?: number | null; material?: string; grupo?: string; margenMinManual?: number | null },
  pol: Politica,
): PrecioOferta | null {
  if (!(input.costo > 0) || input.base == null || !(input.base > 0)) return null;
  const combinacion = combinacionDe(input.banderas);
  const tramoCc = input.banderas.includes(BANDERA_CC) ? tramoCcDe(input.mesesCc) : '';
  const comps = [...new Set(input.banderas)].map((b) => {
    if (b === BANDERA_CC || b === BANDERA_PNC) {
      const r = reglaDe(pol, input.sector, b, b === BANDERA_CC ? tramoCc : '');
      return { cede: r?.pctCede ?? 0, margenMin: r?.margenMin };
    }
    const c = pol.condiciones[b] ?? CONDICION_DEFECTO;
    return { cede: c.pctCede, margenMin: c.margenMin };
  });
  // Los % se APILAN (1 − Π(1 − cᵢ)): agregar una condición con % siempre cede más. Nunca 100 %: el precio no llega al costo.
  const apilado = 1 - comps.reduce((acc, c) => acc * (1 - Math.min(0.95, Math.max(0, c.cede))), 1);
  const pctCede = Math.round(Math.min(0.95, Math.max(0, apilado)) * 10000) / 10000;

  let margenMin: number;
  let origenMargenMin: PrecioOferta['origenMargenMin'];
  const manual = input.margenMinManual != null && input.margenMinManual > 0 ? input.margenMinManual : null;
  if (manual != null) { margenMin = manual; origenMargenMin = 'manual'; }
  else {
    const decidido = resolverMargenMin(pol, { material: input.material, grupo: input.grupo, sector: input.sector, banderas: input.banderas });
    if (decidido != null) {
      margenMin = decidido;
      const amb = AMBITOS_MARGEN.find((a) => resolverMargenMin({ ...pol, margenesMin: pol.margenesMin.filter((r) => r.ambito === a) }, { material: input.material, grupo: input.grupo, sector: input.sector, banderas: input.banderas }) != null);
      origenMargenMin = amb ?? 'sector';
    } else {
      const margenes = comps.map((c) => c.margenMin).filter((x): x is number => x != null && x > 0);
      margenMin = margenes.length ? Math.max(...margenes) : MARGEN_MIN_ABSOLUTO;
      origenMargenMin = 'condicion';
    }
  }
  const piso = pisoDuro(input.costo, margenMin);
  const margenBase = Math.max(0, input.base - input.costo);
  const sinPiso = input.costo + margenBase * (1 - pctCede);
  const precio = Math.max(arriba2(sinPiso), piso);
  return {
    combinacion, tramoCc, pctCede, descuento: 1 - precio / input.base, precioSinPiso: sinPiso, margenMin, origenMargenMin, piso, precio,
    margen: (precio - input.costo) / precio,
    recortado: arriba2(sinPiso) < piso,
  };
}

/** ¿Un precio (propuesto a mano o ya autorizado) es válido frente al costo vigente? */
export const precioValido = (precio: number, costo: number): boolean => Number.isFinite(precio) && costo > 0 && precio > costo;
