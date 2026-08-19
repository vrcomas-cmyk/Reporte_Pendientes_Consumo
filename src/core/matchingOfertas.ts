// ---------------------------------------------------------------------------
// matchingOfertas.ts · Motor puro de matching material↔cliente para el módulo
// Oportunidades Comerciales. Sin React, sin I/O.
//
// Tras la fusión "ficha = regla global", la fuente de verdad de qué acepta un
// cliente es SU FICHA (`ClienteConocimiento`); `ReglaAceptacion` solo guarda
// excepciones por material. Este motor las combina y devuelve si aplica y por
// qué (para el badge "Acepta · caducidad ≥ 3m · buen estado").
// ---------------------------------------------------------------------------
import type { ClienteConocimiento, CondicionEspecial, EstadoMaterialAceptado, ReglaAceptacion } from './types';
import { norm } from '@/lib/text';

/** `norm()` solo recorta espacios — para texto libre de negocio (Cosmopark,
 * PNC…) hace falta ignorar también mayúsculas/minúsculas. */
const normKey = (s: string): string => norm(s).toLowerCase();

/** Contexto real de un lote/material a ofertar — deriva de `lotes`/`invCondicion`. */
export interface ContextoMaterial {
  /** Categoría normalizada (para las 4 clásicas: corta-caducidad, etc.). */
  condicion: CondicionEspecial | null;
  /** Texto REAL de la condición tal como viene de Inv Condición/Fuentes —
   * p. ej. "Cosmopark", "PNC" — no todo cabe en las 4 categorías fijas. */
  condicionTexto: string | null;
  /** Días restantes de vigencia del lote. */
  diasCaducidad: number | null;
  danado: boolean;
}

/** Regla ya resuelta para un (cliente, material) — global (de la ficha) o
 * override (de `ReglaAceptacion`). Un solo vocabulario para evaluar. */
export interface ReglaEfectiva {
  dest: string;
  /** Valores que acepta: categoría conocida (corta-caducidad, ...) o texto
   * libre real (Cosmopark, PNC, ...) — ver `condicionAceptaValor`. */
  condiciones: string[];
  estadoMaterial: EstadoMaterialAceptado;
  caducidadMinimaDias: number | null;
  activa: boolean;
  notas: string;
}

const CATEGORIAS_CONOCIDAS = new Set<CondicionEspecial>(['corta-caducidad', 'lento-movimiento', 'calidad', 'danado']);

/** Un valor aceptado por el cliente puede ser (a) una de las 4 categorías
 * conocidas — se compara contra la categoría YA NORMALIZADA del lote — o
 * (b) cualquier texto real de negocio (p. ej. "Cosmopark") — se compara
 * literal (sin distinguir mayúsculas/espacios) contra el texto crudo del
 * lote, porque ese texto nunca pasa por el normalizador de 4 categorías. */
function condicionAceptaValor(valor: string, ctx: ContextoMaterial): boolean {
  if (CATEGORIAS_CONOCIDAS.has(valor as CondicionEspecial) && ctx.condicion === valor) return true;
  return !!ctx.condicionTexto && normKey(valor) === normKey(ctx.condicionTexto);
}

/** Una ficha SIN ningún criterio marcado no cuenta como "acepta cualquier
 * cosa" — eso fue un bug real: un cliente recién dado de alta (o importado
 * en lote sin marcar nada) aparecía aceptando cualquier material. Solo
 * cuenta como regla global si el usuario marcó al menos una condición, un
 * estado de material distinto de "indistinto", o una caducidad mínima. */
export function fichaConfigurada(c: ClienteConocimiento): boolean {
  return (c.condicionesAceptadas?.length ?? 0) > 0 || c.estadoMaterial !== 'indistinto' || c.caducidadMinimaDias != null;
}

/** Regla efectiva a partir de la ficha del cliente (la regla global). */
export function reglaFicha(c: ClienteConocimiento): ReglaEfectiva {
  return {
    dest: c.dest,
    condiciones: c.condicionesAceptadas ?? [],
    estadoMaterial: c.estadoMaterial ?? 'indistinto',
    caducidadMinimaDias: c.caducidadMinimaDias ?? null,
    activa: c.activa !== false,
    notas: c.notasComerciales ?? '',
  };
}

/** Regla efectiva a partir de un override por material (meses → días). */
export function reglaOverride(r: ReglaAceptacion): ReglaEfectiva {
  return {
    dest: r.dest,
    condiciones: r.condiciones ?? [],
    estadoMaterial: r.estadoMaterial,
    caducidadMinimaDias: r.caducidadMinimaMeses != null ? Math.round(r.caducidadMinimaMeses * 30) : null,
    activa: r.activa !== false,
    notas: r.notas ?? '',
  };
}

/** La regla aplicable a un (dest, material): el override de ese material si
 * existe y está activo, si no la ficha del cliente (regla global), si no
 * `null` (el cliente no tiene nada configurado). */
export function reglaAplicable(clientes: ClienteConocimiento[], overrides: ReglaAceptacion[], dest: string, material: string): ReglaEfectiva | null {
  const d = norm(dest);
  const m = norm(material);
  const especifica = overrides.find((r) => r.activa !== false && norm(r.dest) === d && r.material != null && norm(r.material) === m);
  if (especifica) return reglaOverride(especifica);
  const global = clientes.find((c) => norm(c.dest) === d);
  if (global && global.activa !== false && fichaConfigurada(global)) return reglaFicha(global);
  return null;
}

export interface EvaluacionAceptacion {
  acepta: boolean;
  /** Frases cortas ya listas para el badge, p. ej. "caducidad ≥ 3m", "buen estado". */
  motivos: string[];
}

/** Evalúa una regla contra el contexto real de un lote. Sin regla, no acepta. */
export function evaluarAceptacion(regla: ReglaEfectiva | null, ctx: ContextoMaterial): EvaluacionAceptacion {
  if (!regla) return { acepta: false, motivos: ['Sin regla configurada'] };
  const motivos: string[] = [];
  let acepta = true;

  if (regla.condiciones.length > 0) {
    const ok = regla.condiciones.some((v) => condicionAceptaValor(v, ctx));
    const etiqueta = ctx.condicionTexto ?? ctx.condicion ?? 'esta condición';
    motivos.push(ok ? `condición ${etiqueta}` : `no acepta ${etiqueta}`);
    if (!ok) acepta = false;
  }

  if (regla.estadoMaterial !== 'indistinto') {
    const requiereBueno = regla.estadoMaterial === 'buen-estado';
    const ok = requiereBueno ? !ctx.danado : true;
    motivos.push(ok ? (requiereBueno ? 'buen estado' : 'acepta dañado') : 'solo buen estado');
    if (!ok) acepta = false;
  }

  if (regla.caducidadMinimaDias != null) {
    const meses = Math.round(regla.caducidadMinimaDias / 30);
    const ok = ctx.diasCaducidad != null && ctx.diasCaducidad >= regla.caducidadMinimaDias;
    motivos.push(ok ? `caducidad ≥ ${meses}m` : `requiere caducidad ≥ ${meses}m`);
    if (!ok) acepta = false;
  }

  if (!motivos.length) motivos.push('Sin restricciones');
  return { acepta, motivos };
}

export interface MatchDestinatario {
  dest: string;
  razonSocial: string;
  regla: ReglaEfectiva;
  /** De dónde salió la regla efectiva: la ficha (global) o un override. */
  origen: 'ficha' | 'override';
  evaluacion: EvaluacionAceptacion;
  /** Consumo histórico del cliente para ese material (unidades), para priorizar. */
  consumoHistorico: number;
}

/** Todos los clientes con una regla efectiva para `material` (ficha global u
 * override), evaluados contra el contexto real del lote, ordenados: primero
 * los que sí aceptan, luego por consumo histórico descendente. */
export function destinatariosParaMaterial(
  clientes: ClienteConocimiento[],
  overrides: ReglaAceptacion[],
  material: string,
  ctx: ContextoMaterial,
  opts: { razonSocialDe?: (dest: string) => string; consumoDe?: (dest: string) => number } = {},
): MatchDestinatario[] {
  const m = norm(material);
  const porDest = new Map<string, ReglaEfectiva>();
  const origen = new Map<string, 'ficha' | 'override'>();
  // Los overrides del material mandan sobre la ficha del mismo cliente.
  for (const r of overrides) {
    if (r.activa === false || r.material == null) continue;
    if (norm(r.material) !== m) continue;
    const d = norm(r.dest);
    if (!porDest.has(d)) { porDest.set(d, reglaOverride(r)); origen.set(d, 'override'); }
  }
  // Toda ficha activa Y CONFIGURADA (al menos un criterio marcado) cuenta
  // como regla global para cualquier material — una ficha en blanco no
  // cuenta como "acepta cualquier cosa".
  for (const c of clientes) {
    if (c.activa === false || !fichaConfigurada(c)) continue;
    const d = norm(c.dest);
    if (!porDest.has(d)) { porDest.set(d, reglaFicha(c)); origen.set(d, 'ficha'); }
  }
  const out: MatchDestinatario[] = [];
  for (const [d, regla] of porDest) {
    out.push({
      dest: d,
      razonSocial: opts.razonSocialDe?.(d) ?? d,
      regla,
      origen: origen.get(d) ?? 'ficha',
      evaluacion: evaluarAceptacion(regla, ctx),
      consumoHistorico: opts.consumoDe?.(d) ?? 0,
    });
  }
  return out.sort((a, b) => {
    if (a.evaluacion.acepta !== b.evaluacion.acepta) return a.evaluacion.acepta ? -1 : 1;
    return b.consumoHistorico - a.consumoHistorico;
  });
}

/** Un lote/material del inventario, ya con su condición y caducidad
 * resueltas — ver `core/oportunidad.ts` `lotesParaAlertas`. Entrada de
 * `alertasColocacion`, agnóstica de cómo se construyó. */
export interface LoteOfertable {
  material: string;
  descripcion: string;
  lote?: string;
  centro?: string;
  almacen?: string;
  condicion: CondicionEspecial;
  /** Texto real de la condición (Inv Condición/Fuentes) — ver `ContextoMaterial.condicionTexto`. */
  condicionTexto: string | null;
  /** Fecha cruda del lote (para mostrar dd/mm/aaaa) — `diasCaducidad` es la derivada, ya calculada. */
  fechaCaducidad?: string | null;
  diasCaducidad: number | null;
  cantidadDisponible: number;
  precioOferta?: number;
}

export interface AlertaColocacion {
  dest: string;
  razonSocial: string;
  material: string;
  descripcion: string;
  /** Cuántos lotes distintos de este material aceptaría este cliente — el
   * detalle por lote (centro, fecha) queda en Material 360, no aquí. */
  lotesCount: number;
  /** Suma de la cantidad disponible entre todos los lotes que califican. */
  cantidadDisponible: number;
  /** La caducidad más próxima entre los lotes que califican — el más urgente. */
  diasCaducidad: number | null;
  origen: 'ficha' | 'override';
  motivos: string[];
  consumoHistorico: number;
}

/** Cruza TODO el inventario ofertable contra TODAS las reglas de todos los
 * clientes de una sola vez — el "avísame" que pidió el negocio: en vez de
 * revisar material por material o cliente por cliente, aquí salen ya
 * resueltos los pares (cliente, material) donde la regla configurada
 * ACEPTA lo que hay disponible ahora mismo. Una fila por (cliente, material)
 * — no por lote: varios lotes del mismo material que un mismo cliente
 * aceptaría se suman en una sola alerta (`lotesCount`, `cantidadDisponible`
 * acumulada, `diasCaducidad` = el más próximo de todos). Ordenado por
 * caducidad más próxima primero y, en empate, por consumo histórico. */
export function alertasColocacion(
  clientes: ClienteConocimiento[],
  overrides: ReglaAceptacion[],
  lotes: LoteOfertable[],
  opts: { razonSocialDe?: (dest: string) => string; consumoDe?: (dest: string, material: string) => number } = {},
): AlertaColocacion[] {
  const consumoDe = opts.consumoDe;
  const porClienteMaterial = new Map<string, AlertaColocacion>();
  for (const l of lotes) {
    const ctx: ContextoMaterial = { condicion: l.condicion, condicionTexto: l.condicionTexto, diasCaducidad: l.diasCaducidad, danado: l.condicion === 'danado' };
    const matches = destinatariosParaMaterial(clientes, overrides, l.material, ctx, {
      razonSocialDe: opts.razonSocialDe,
      consumoDe: consumoDe ? (d) => consumoDe(d, l.material) : undefined,
    });
    for (const m of matches) {
      if (!m.evaluacion.acepta) continue;
      const key = `${m.dest}|${norm(l.material)}`;
      const prev = porClienteMaterial.get(key);
      if (!prev) {
        porClienteMaterial.set(key, {
          dest: m.dest, razonSocial: m.razonSocial, material: l.material, descripcion: l.descripcion,
          lotesCount: 1, cantidadDisponible: l.cantidadDisponible, diasCaducidad: l.diasCaducidad,
          origen: m.origen, motivos: m.evaluacion.motivos, consumoHistorico: m.consumoHistorico,
        });
      } else {
        prev.lotesCount += 1;
        prev.cantidadDisponible += l.cantidadDisponible;
        if (l.diasCaducidad != null && (prev.diasCaducidad == null || l.diasCaducidad < prev.diasCaducidad)) prev.diasCaducidad = l.diasCaducidad;
      }
    }
  }
  return [...porClienteMaterial.values()].sort(
    (a, b) => (a.diasCaducidad ?? Infinity) - (b.diasCaducidad ?? Infinity) || b.consumoHistorico - a.consumoHistorico,
  );
}

export interface MaterialColocacion {
  material: string;
  descripcion: string;
  /** Lotes/cantidad totales del material — calculados UNA vez desde el
   * inventario (`lotes`), no sumando las alertas por cliente: cada lote
   * puede calificar para varios clientes a la vez, así que sumar
   * `cantidadDisponible` de las alertas duplicaría el mismo inventario una
   * vez por cliente que lo acepta. Este total es el real, sin importar
   * cuántos clientes lo acepten. */
  lotesCount: number;
  cantidadDisponible: number;
  diasCaducidad: number | null;
  /** Clientes candidatos para este material — cada uno con SU propia
   * `cantidadDisponible`/`lotesCount` (los lotes que ESE cliente acepta,
   * que pueden ser un subconjunto de los del material si su regla es más
   * estricta que la de otro cliente). */
  clientes: AlertaColocacion[];
  /** Detalle real de cada lote del material — lote, centro, condición
   * (categoría + texto), caducidad, cantidad, precio — para "ver qué estoy
   * ofertando" al entrar al material, sin tener que adivinar a partir de los
   * totales agregados de arriba. */
  lotes: LoteOfertable[];
}

/** Agrupa las alertas de colocación (una por cliente↔material) por material
 * — el enfoque "para el código A tengo 3 lotes y N clientes califican" en
 * vez de una fila por cliente. Solo incluye materiales con al menos un
 * cliente candidato (si nadie califica no es una alerta, es simplemente
 * inventario sin regla que lo cubra — ver "Candidatas sugeridas"). */
export function agruparAlertasPorMaterial(alertas: AlertaColocacion[], lotes: LoteOfertable[]): MaterialColocacion[] {
  const porMaterial = new Map<string, MaterialColocacion>();
  for (const l of lotes) {
    const m = norm(l.material);
    const prev = porMaterial.get(m);
    if (!prev) {
      porMaterial.set(m, { material: l.material, descripcion: l.descripcion, lotesCount: 1, cantidadDisponible: l.cantidadDisponible, diasCaducidad: l.diasCaducidad, clientes: [], lotes: [l] });
    } else {
      prev.lotesCount += 1;
      prev.cantidadDisponible += l.cantidadDisponible;
      if (l.diasCaducidad != null && (prev.diasCaducidad == null || l.diasCaducidad < prev.diasCaducidad)) prev.diasCaducidad = l.diasCaducidad;
      prev.lotes.push(l);
    }
  }
  for (const al of alertas) {
    porMaterial.get(norm(al.material))?.clientes.push(al);
  }
  return [...porMaterial.values()]
    .filter((g) => g.clientes.length > 0)
    .sort((a, b) => b.clientes.length - a.clientes.length || (a.diasCaducidad ?? Infinity) - (b.diasCaducidad ?? Infinity));
}