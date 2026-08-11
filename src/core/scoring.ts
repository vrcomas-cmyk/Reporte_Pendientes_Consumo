// ---------------------------------------------------------------------------
// scoring.ts · Motor de compatibilidad cliente↔material para el módulo
// Oportunidades Comerciales. Basado en reglas, SIN IA — cada criterio suma o
// resta puntos con una razón explicable en texto (nunca un número desnudo).
//
// Fase 1: criterios derivables de los reportes ya cargados (rf/bo/abc).
// Fase 2: activa `acepta-caducidad`, `acepta-condicion` y `descuento-viable`
// a partir de ClienteConocimiento. Fase 3: activa `acepto-condicionado` y
// `rechazo-reciente` a partir del historial de `Oferta`. Fase 5 (esta
// versión): cada criterio interno ya no calcula "puntos absolutos" sino una
// `fraccion` de su propio peso (0..1) — así el peso puede sobreescribirse
// desde /admin (ver `services/scoringWeightsService.ts`) sin tocar la lógica
// de negocio de cada regla, multiplicando `fraccion * peso` al final.
// ---------------------------------------------------------------------------
import { mesKey, mesAnterior, hoyMes, serieMatDest, type RFIndex } from './resumenFac';
import type { BOItem } from './buildBO';
import type { AbcResult } from './abc';
import type { ClienteConocimiento, CondicionEspecial, Oferta } from './types';
import { norm } from '@/lib/text';

export type CriterioKey =
  | 'compro-material' | 'acepto-condicionado' | 'compra-frecuente' | 'alta-rotacion'
  | 'pedido-abierto' | 'acepta-caducidad' | 'acepta-condicion' | 'descuento-viable'
  | 'rechazo-reciente' | 'sin-comprar';

/** Pesos por defecto (máximo de puntos que aporta cada criterio; negativo
 * para penalizaciones). Editable por admin desde /admin → Compatibilidad,
 * persistido en `degasa_connectors` con prefijo `scoring_weight_` (ver
 * `services/scoringWeightsService.ts`) — este objeto es el respaldo cuando
 * no hay override o falla la carga. */
export const PESOS_DEFAULT: Record<CriterioKey, number> = {
  'compro-material': 20,
  'acepto-condicionado': 18,
  'compra-frecuente': 12,
  'alta-rotacion': 10,
  'pedido-abierto': 12,
  'acepta-caducidad': 12,
  'acepta-condicion': 10,
  'descuento-viable': 8,
  'rechazo-reciente': -15,
  'sin-comprar': -10,
};

export const CRITERIO_LABELS: Record<CriterioKey, string> = {
  'compro-material': 'Ya compró este material',
  'acepto-condicionado': 'Ya aceptó material condicionado',
  'compra-frecuente': 'Compra con frecuencia',
  'alta-rotacion': 'Alta rotación (clase ABC)',
  'pedido-abierto': 'Tiene pedidos abiertos',
  'acepta-caducidad': 'Acepta esta caducidad',
  'acepta-condicion': 'Acepta este tipo de condición',
  'descuento-viable': 'Descuento habitual alcanzable',
  'rechazo-reciente': 'Rechazó este material hace < 30 días',
  'sin-comprar': 'Inactivo (sin comprar nada) > 6 meses',
};

export interface ScoreCriterio {
  key: CriterioKey;
  label: string;
  /** Peso efectivamente usado (override de admin o PESOS_DEFAULT). */
  peso: number;
  /** Puntos realmente obtenidos en este caso = fracción × peso. */
  puntos: number;
  cumple: boolean;
  detalle: string;
  fuente: string;
}

export interface ScoreResult {
  dest: string;
  razonSocial: string;
  score: number;
  nivel: 'alta' | 'media' | 'baja';
  criterios: ScoreCriterio[];
  /** Razones que excluyen al cliente de la lista principal (van a "Descartados"). */
  bloqueantes: string[];
}

export interface ScoreInput {
  dest: string;
  razonSocial: string;
  material: string;
  rf: RFIndex | null;
  bo: BOItem[];
  abc: AbcResult;
  /** Condición/caducidad/precio de la oportunidad concreta que se está
   * evaluando colocar — sin esto, `acepta-caducidad`/`acepta-condicion`/
   * `descuento-viable` no tienen nada que comparar y quedan neutros. */
  condicion?: CondicionEspecial;
  diasVigencia?: number | null;
  precioOferta?: number;
  precioLista?: number;
  /** Ficha de conocimiento del cliente (fase 2). Ausente = criterios
   * correspondientes quedan en 0 con detalle explicando por qué. */
  cliente?: ClienteConocimiento | null;
  /** Ofertas previas de ESTE cliente, cualquier material (fase 3). Ausente =
   * `acepto-condicionado`/`rechazo-reciente` quedan en 0. */
  ofertasCliente?: Oferta[];
  /** Overrides de peso por admin (fase 5). Ausente/parcial = usa PESOS_DEFAULT
   * para el/los criterio(s) faltante(s). */
  pesos?: Partial<Record<CriterioKey, number>>;
}

interface Fraccion { fraccion: number; detalle: string; bloqueante?: string | null; aplica?: boolean }

function fracPorCompra(rf: RFIndex | null, dest: string, material: string): Fraccion {
  const serie = serieMatDest(rf, dest, material);
  if (!serie.length) return { fraccion: 0, detalle: 'Sin compras registradas de este material.' };
  const refK = mesKey(mesAnterior(hoyMes()));
  const ultimoK = mesKey(serie[serie.length - 1].mes);
  const mesesDesde = refK - ultimoK;
  const fraccion = mesesDesde <= 3 ? 1 : mesesDesde <= 6 ? 0.7 : mesesDesde <= 12 ? 0.4 : 0;
  return { fraccion, detalle: fraccion ? `${serie.length} compra(s) registrada(s), última hace ${Math.max(0, mesesDesde)} mes(es).` : 'Última compra hace más de 12 meses.' };
}

function fracPorFrecuencia(rf: RFIndex | null, dest: string, material: string): Fraccion {
  const serie = serieMatDest(rf, dest, material);
  const refK = mesKey(mesAnterior(hoyMes()));
  const mesesConCompra = serie.filter((p) => p.cant > 0 && mesKey(p.mes) > refK - 12 && mesKey(p.mes) <= refK).length;
  const fraccion = mesesConCompra >= 9 ? 1 : mesesConCompra >= 6 ? 0.667 : mesesConCompra >= 3 ? 0.333 : 0;
  return { fraccion, detalle: `Compró en ${mesesConCompra} de los últimos 12 meses.` };
}

function fracPorRotacion(abc: AbcResult, dest: string): Fraccion {
  const clase = abc.classByCliente.get(norm(dest)) ?? null;
  const fraccion = clase === 'A' ? 1 : clase === 'B' ? 0.6 : clase === 'C' ? 0.2 : 0;
  return { fraccion, detalle: clase ? `Cliente clase ${clase} (ABC por facturación 12M).` : 'Sin clasificación ABC (facturación insuficiente).' };
}

function fracPorPedidoAbierto(bo: BOItem[], dest: string, material: string): Fraccion {
  const enDest = bo.filter((it) => norm(it.bo.destinatario) === norm(dest));
  if (!enDest.length) return { fraccion: 0, detalle: 'Sin pedidos abiertos.' };
  const mismoMaterial = enDest.some((it) => norm(it.bo.materialBase) === norm(material));
  return mismoMaterial
    ? { fraccion: 1, detalle: `Tiene ${enDest.length} pedido(s) abierto(s), incluyendo este material.` }
    : { fraccion: 0.833, detalle: `Tiene ${enDest.length} pedido(s) abierto(s) de otros materiales.` };
}

function fracPorCaducidad(cliente: ClienteConocimiento | null | undefined, diasVigencia: number | null | undefined): Fraccion {
  if (!cliente) return { fraccion: 0, detalle: 'Sin ficha de cliente todavía.' };
  if (cliente.caducidadMinimaDias == null) return { fraccion: 0.333, detalle: 'Ficha sin caducidad mínima registrada.' };
  if (diasVigencia == null) return { fraccion: 0.333, detalle: 'La oportunidad no tiene fecha de caducidad.' };
  if (diasVigencia >= cliente.caducidadMinimaDias) {
    return { fraccion: 1, detalle: `Acepta desde ${cliente.caducidadMinimaDias}d y quedan ${diasVigencia}d.` };
  }
  const motivo = `Requiere mínimo ${cliente.caducidadMinimaDias}d de vigencia y solo quedan ${diasVigencia}d.`;
  return { fraccion: 0, detalle: motivo, bloqueante: motivo };
}

function fracPorCondicionAceptada(cliente: ClienteConocimiento | null | undefined, condicion: CondicionEspecial | undefined): Fraccion {
  if (!condicion || condicion === 'normal') return { fraccion: 1, detalle: 'Material sin condición especial.' };
  if (!cliente) return { fraccion: 0.3, detalle: 'Sin ficha de cliente todavía.' };
  if (cliente.condicionesAceptadas.length === 0) return { fraccion: 0.3, detalle: 'Ficha sin condiciones registradas.' };
  if (cliente.condicionesAceptadas.includes(condicion)) {
    return { fraccion: 1, detalle: `Su ficha indica que acepta "${condicion}".` };
  }
  const motivo = `Su ficha indica que NO acepta "${condicion}".`;
  return { fraccion: 0, detalle: motivo, bloqueante: motivo };
}

function fracPorDescuento(cliente: ClienteConocimiento | null | undefined, precioLista: number | undefined, precioOferta: number | undefined): Fraccion {
  if (!cliente || cliente.descuentoHabitualPct == null) return { fraccion: 0.375, detalle: 'Sin descuento habitual registrado en la ficha.' };
  if (!precioLista || !precioOferta || precioLista <= 0) return { fraccion: 0.375, detalle: 'Sin precio de lista para comparar el descuento.' };
  const descuentoDisponible = ((precioLista - precioOferta) / precioLista) * 100;
  if (descuentoDisponible >= cliente.descuentoHabitualPct) {
    return { fraccion: 1, detalle: `Descuento ofrecido ${descuentoDisponible.toFixed(0)}% cubre su habitual del ${cliente.descuentoHabitualPct}%.` };
  }
  return { fraccion: 0.25, detalle: `Descuento ofrecido ${descuentoDisponible.toFixed(0)}% es menor a su habitual del ${cliente.descuentoHabitualPct}%.` };
}

function fracPorAceptoCondicionado(ofertas: Oferta[] | undefined): Fraccion {
  if (!ofertas || ofertas.length === 0) return { fraccion: 0, detalle: 'Sin historial de ofertas todavía.' };
  const aceptadasCondicionadas = ofertas.filter((o) => (o.resultado === 'aceptada' || o.resultado === 'parcial') && o.condicion !== 'normal');
  if (aceptadasCondicionadas.length === 0) return { fraccion: 0, detalle: 'Nunca aceptó un material con condición especial.' };
  const fraccion = aceptadasCondicionadas.length >= 3 ? 1 : aceptadasCondicionadas.length === 2 ? 0.778 : 0.556;
  return { fraccion, detalle: `Aceptó material condicionado ${aceptadasCondicionadas.length} vez(veces) antes.` };
}

function fracPorRechazoReciente(ofertas: Oferta[] | undefined, material: string): Fraccion {
  if (!ofertas) return { fraccion: 0, detalle: '', aplica: false };
  const rechazoReciente = ofertas.find((o) => norm(o.material) === norm(material) && o.resultado === 'rechazada' && o.fechaRespuesta
    && (Date.now() - new Date(o.fechaRespuesta).getTime()) / 86400000 <= 30);
  if (!rechazoReciente) return { fraccion: 0, detalle: '', aplica: false };
  return {
    fraccion: 1, aplica: true,
    detalle: `Rechazó este mismo material hace menos de 30 días${rechazoReciente.motivoRechazo ? ` (motivo: ${rechazoReciente.motivoRechazo})` : ''}.`,
  };
}

function fracPorInactividad(rf: RFIndex | null, dest: string): Fraccion {
  const serie = rf?.dest.get(norm(dest)) ?? [];
  if (!serie.length) return { fraccion: 0, detalle: '', aplica: false };
  const refK = mesKey(mesAnterior(hoyMes()));
  const ultimoK = mesKey(serie[serie.length - 1].mes);
  const mesesInactivo = refK - ultimoK;
  if (mesesInactivo > 6) return { fraccion: 1, aplica: true, detalle: `Sin ninguna compra en ${mesesInactivo} meses (cliente inactivo).` };
  return { fraccion: 0, detalle: '', aplica: false };
}

/** Calcula el score de compatibilidad de un cliente para colocar `material`.
 * Puro: sin I/O, sin React — testeable con datos sintéticos. */
export function scoreCliente(input: ScoreInput): ScoreResult {
  const { dest, razonSocial, material, rf, bo, abc, cliente, condicion, diasVigencia, precioOferta, precioLista, ofertasCliente, pesos } = input;
  const criterios: ScoreCriterio[] = [];
  const bloqueantes: string[] = [];

  const pesoDe = (key: CriterioKey) => pesos?.[key] ?? PESOS_DEFAULT[key];
  function add(key: CriterioKey, fuente: string, f: Fraccion, cumpleSiempreQueFraccion = true) {
    if (f.aplica === false) return; // criterios "solo si aplica" (penalizaciones) que no se disparan no se listan
    const peso = pesoDe(key);
    const puntos = Math.round(f.fraccion * peso);
    criterios.push({ key, label: CRITERIO_LABELS[key], peso, puntos, cumple: cumpleSiempreQueFraccion ? f.fraccion > 0 : puntos < 0, detalle: f.detalle, fuente });
    if (f.bloqueante) bloqueantes.push(f.bloqueante);
  }

  add('compro-material', 'Resumen_Fac', fracPorCompra(rf, dest, material));
  add('compra-frecuente', 'Resumen_Fac', fracPorFrecuencia(rf, dest, material));
  add('alta-rotacion', 'Clasificación ABC', fracPorRotacion(abc, dest));
  add('pedido-abierto', 'Sugerencias / BO', fracPorPedidoAbierto(bo, dest, material));
  add('acepto-condicionado', 'Ofertas', fracPorAceptoCondicionado(ofertasCliente));
  add('acepta-caducidad', 'Ficha de cliente', fracPorCaducidad(cliente, diasVigencia));
  add('acepta-condicion', 'Ficha de cliente', fracPorCondicionAceptada(cliente, condicion));
  add('descuento-viable', 'Ficha de cliente', fracPorDescuento(cliente, precioLista, precioOferta));
  add('sin-comprar', 'Resumen_Fac', fracPorInactividad(rf, dest), false);
  add('rechazo-reciente', 'Ofertas', fracPorRechazoReciente(ofertasCliente, material), false);

  const total = criterios.reduce((acc, c) => acc + c.puntos, 0);
  const maxPositivo = criterios.filter((c) => c.peso > 0).reduce((acc, c) => acc + c.peso, 0);
  const score = maxPositivo > 0 ? Math.max(0, Math.min(100, Math.round((total / maxPositivo) * 100))) : 0;
  const nivel: ScoreResult['nivel'] = score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baja';

  return { dest, razonSocial, score, nivel, criterios, bloqueantes };
}

/** Universo de destinatarios candidatos para `material`: quien lo consumió,
 * quien lo facturó (Resumen_Fac), o quien tiene un pedido abierto de él. */
function candidateDests(material: string, consumo: { destinatario: string; razonSocial: string; material: string }[], rf: RFIndex | null, bo: BOItem[]): Map<string, string> {
  const m = norm(material);
  const out = new Map<string, string>();
  for (const r of consumo) if (norm(r.material) === m && r.destinatario) out.set(norm(r.destinatario), r.razonSocial);
  if (rf) {
    rf.rows.forEach((r) => {
      if (norm(r.material) === m && r.destinatario && !out.has(norm(r.destinatario))) out.set(norm(r.destinatario), r.razonSocial);
    });
  }
  for (const it of bo) if (norm(it.bo.materialBase) === m && it.bo.destinatario && !out.has(norm(it.bo.destinatario))) out.set(norm(it.bo.destinatario), it.bo.razonSocial);
  return out;
}

/** Rankea todos los clientes candidatos para `material`, de mayor a menor
 * score. Los resultados con `bloqueantes` no se excluyen aquí — el llamador
 * decide cómo separarlos (ver `Section title="Descartados"` en MaterialHubPanel). */
export function rankClientes(
  material: string,
  ctx: {
    consumo: { destinatario: string; razonSocial: string; material: string }[];
    rf: RFIndex | null;
    bo: BOItem[];
    abc: AbcResult;
    condicion?: CondicionEspecial;
    diasVigencia?: number | null;
    precioOferta?: number;
    precioLista?: number;
    clientesByDest?: Map<string, ClienteConocimiento>;
    ofertas?: Oferta[];
    pesos?: Partial<Record<CriterioKey, number>>;
  },
): ScoreResult[] {
  const dests = candidateDests(material, ctx.consumo, ctx.rf, ctx.bo);
  const results: ScoreResult[] = [];
  dests.forEach((razonSocial, dest) => {
    results.push(scoreCliente({
      dest, razonSocial, material, rf: ctx.rf, bo: ctx.bo, abc: ctx.abc,
      condicion: ctx.condicion, diasVigencia: ctx.diasVigencia, precioOferta: ctx.precioOferta, precioLista: ctx.precioLista,
      cliente: ctx.clientesByDest?.get(dest) ?? null,
      ofertasCliente: ctx.ofertas?.filter((o) => norm(o.dest) === dest),
      pesos: ctx.pesos,
    }));
  });
  return results.sort((a, b) => b.score - a.score);
}
