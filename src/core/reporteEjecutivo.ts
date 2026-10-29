// ---------------------------------------------------------------------------
// reporteEjecutivo.ts · Reporte Excel por ejecutivo/zona: Resumen + Pedidos + Consumo clientes + Inventario disponible + Materiales con condición + Oportunidades.
// Puro: recibe lo ya calculado (pedidos, consumo, pivote de disponibilidad, condiciones) y devuelve las hojas como filas { Columna: valor }.
// ---------------------------------------------------------------------------
import { norm } from '@/lib/text';
import { invGen, type RSSIndex } from './resumenSin';
import { mesKey, type Serie } from './resumenFac';
import { esSustituto } from './ofertaSustituto';
import { filasPorCentros } from './ofertasEjecutivo';
import { CENTERS, type ConsumoRow, type InvConsolidadoRow, type Sugerencia } from './types';
import type { FilaCondicionMaterial } from './invCondicionLibros';
import { sumarMeses } from './pedidos';

type Fila = Record<string, unknown>;
export interface HojaReporte { name: string; rows: Fila[] }

/** Lo ofertable de un material (lotes con condición, sustituto, general) con su precio autorizado: `filasOfertablesDe` en el módulo de analytics. */
export type OfertableDe = (material: string) => { filas: Sugerencia[]; precioDe: (f: Sugerencia) => number };

export interface EntradaReporteEjecutivo {
  ejecutivo: string;
  zona: string;
  /** Pedidos de Seg pedidos YA filtrados a la zona del ejecutivo. */
  pedidos: readonly Sugerencia[];
  /** Consumo YA filtrado a la zona del ejecutivo. */
  consumo: readonly ConsumoRow[];
  rssDisp: RSSIndex | null;
  /** Una fila por material × condición (Inv con Condición): define qué materiales tienen alguna condición. */
  invCondicion: readonly InvConsolidadoRow[];
  condicionesDe: (material: string) => FilaCondicionMaterial[];
  ofertableDe: OfertableDe;
  /** Con `true` la hoja Inventario trae todo el catálogo; si no, solo los materiales que el ejecutivo pide o consume. */
  inventarioCompleto?: boolean;
  generadoEn?: string;
  /** Etiqueta de un centro tal como se ve en otros reportes («1001 (Tijuana)»). */
  etiquetaCentro?: (centro: string) => string;
  /** P50 mensual del cliente para ese material (ver `p50Mensual`); 0 si no se conoce. */
  p50De?: (c: ConsumoRow) => number;
  /** Centros que se INFORMAN (columnas de inventario de todas las hojas); vacío = todos. No afecta qué se ofrece. */
  centrosInforme?: readonly string[];
  /** «Considerar centros» para OFERTAR: lotes de esos centros + el del pedido (vacío = todos). No afecta las columnas. */
  centrosOferta?: readonly string[];
  /** Condiciones que se mandan (Corta caducidad, PNC, Lento mov, Sustituto, General…); vacío = todas. */
  condiciones?: readonly string[];
  /** Tope de meses de caducidad por condición para lo que se manda (ver `dentroDeCaducidadMax`). */
  caducidadMaxMeses?: CaducidadMaxMeses;
  /** Fecha de referencia del tope de caducidad (por omisión hoy). */
  hoy?: Date;
}

/** Contexto de las hojas que muestran inventario por centro. */
interface CtxCentros { etiqueta: (centro: string) => string; centros: readonly string[]; invPorCentro: (material: string) => Record<string, number> }

const entero = (n: number) => Math.round(n);
const redondeo = (n: number) => Math.round(n * 100) / 100;
const clave = (m: string) => norm(m);

/** Condición a mostrar según lo elegido: sin selección, el texto tal cual; con ella, SOLO las partes elegidas («Liz/Lento mov» con «Lento mov» → «Lento mov»).
 * `null` si no coincide ninguna parte: esa fila no se manda. */
export function condicionElegida(texto: string, elegidas: readonly string[] | undefined): string | null {
  if (!elegidas?.length) return texto;
  const set = new Set(elegidas.map((c) => clave(c).toLowerCase()));
  const partes = texto.split('/').map((t) => t.trim()).filter(Boolean).filter((p) => set.has(clave(p).toLowerCase()));
  return partes.length ? partes.join('/') : null;
}

/** Meses máximos de caducidad por condición para lo que se MANDA (p. ej. { 'Corta caducidad': 12 } = solo lotes que vencen en menos de un año).
 * Condición sin límite = sin tope. Solo afecta al envío: no cambia la regla de inventario de «Corta caducidad». */
export type CaducidadMaxMeses = Readonly<Record<string, number>>;

/** ¿El lote cabe en el límite de caducidad de su condición? `condicion` es la mostrada («A/B»): basta que UNA de sus partes lo admita (sin límite, sin fecha
 * legible o con fecha dentro del tope). `caducidad` en ISO (yyyy-mm-dd) o ''; un lote sin fecha no se descarta. */
export function dentroDeCaducidadMax(condicion: string, caducidad: string, maximos: CaducidadMaxMeses | undefined, hoy: Date = new Date()): boolean {
  if (!maximos) return true;
  const limites = new Map(Object.entries(maximos).filter(([, m]) => Number.isFinite(m) && m > 0).map(([c, m]) => [clave(c).toLowerCase(), m]));
  if (!limites.size) return true;
  const fecha = /^\d{4}-\d{2}-\d{2}/.test(caducidad) ? new Date(`${caducidad.slice(0, 10)}T00:00:00`) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return true;
  const partes = condicion.split('/').map((t) => t.trim()).filter(Boolean);
  if (!partes.length) return true;
  return partes.some((p) => {
    const meses = limites.get(clave(p).toLowerCase());
    return meses === undefined || fecha.getTime() < sumarMeses(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()), meses).getTime();
  });
}

/** «Corta caducidad ≤ 12 m; PNC ≤ 6 m», o «Sin límite». */
export const textoCaducidadMax = (m: CaducidadMaxMeses | undefined): string => {
  const partes = Object.entries(m ?? {}).filter(([, v]) => v > 0).map(([c, v]) => `${c} < ${v} m`);
  return partes.length ? partes.join('; ') : 'Sin límite';
};

/** ¿Se manda con ese filtro de condiciones? Basta una parte elegida; lo que se muestra es `condicionElegida`. */
export const pasaCondicion = (texto: string, elegidas: readonly string[] | undefined): boolean => condicionElegida(texto, elegidas) !== null;

// ---- Lista de envío por correo ---------------------------------------------------------------------------------------------------------
export interface EnvioEjecutivo { zona: string; ejecutivo: string; correos: readonly string[]; archivo: string }

/** Una fila por ejecutivo/zona para el envío masivo (combinar correspondencia): correo(s) sin repetir, archivo a adjuntar, asunto y mensaje.
 * La app no envía nada; el correo se manda a mano. Un correo repetido en varias zonas se avisa en «Nota». */
export function hojaEnvios(envios: readonly EnvioEjecutivo[], fecha: string): HojaReporte {
  const zonasDe = new Map<string, string[]>();
  for (const e of envios) for (const c of e.correos) zonasDe.set(c.toLowerCase(), [...(zonasDe.get(c.toLowerCase()) ?? []), e.zona || 'sin zona']);
  const rows = envios.map((e) => {
    const nombre = e.ejecutivo || 'Sin ejecutivo';
    const compartido = e.correos.flatMap((c) => zonasDe.get(c.toLowerCase()) ?? []).filter((z) => z !== (e.zona || 'sin zona'));
    return {
      'Zona': e.zona, 'Ejecutivo': nombre, 'Correo': e.correos.join('; '), 'Archivo a adjuntar': e.archivo,
      'Asunto': `Reporte de pedidos, consumo e inventarios – ${nombre} (zona ${e.zona || 's/z'}) – ${fecha}`,
      'Mensaje': `Hola ${nombre}, te comparto tu reporte con tus pedidos de Seg pedidos, el consumo de tus clientes, el inventario disponible, los materiales con condición y las oportunidades de oferta. Saludos.`,
      'Estatus': e.correos.length ? 'Listo para enviar' : 'Sin correo en el catálogo',
      'Nota': compartido.length ? `Mismo correo en las zonas: ${[...new Set(compartido)].join(', ')}` : '',
    };
  });
  return { name: 'Envíos', rows };
}

/** Condiciones que se pueden elegir: las partes de cada condición presente más las fijas (Corta caducidad, PNC, Sustituto, General). */
export function condicionesElegibles(invCondicion: readonly InvConsolidadoRow[]): string[] {
  const m = new Map<string, string>();
  for (const t of ['Corta caducidad', 'PNC', 'Sustituto', 'General', ...invCondicion.flatMap((r) => r.condicion.split('/'))]) {
    const v = t.trim();
    if (v && !m.has(v.toLowerCase())) m.set(v.toLowerCase(), v);
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}

/** Mediana de la cantidad mensual en los 12 meses cerrados previos a `curmes`, contando solo los meses con compra (quien compra a ratos no baja a 0). */
export function p50Mensual(serie: Serie, curmes: string): number {
  const cur = mesKey(curmes);
  if (!cur) return 0;
  const v = serie.filter((p) => { const k = mesKey(p.mes); return k >= cur - 12 && k <= cur - 1 && p.cant > 0; }).map((p) => p.cant).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

const centrosVisibles = (sel: readonly string[] | undefined): string[] => (sel?.length ? CENTERS.filter((c) => sel.includes(c)) : [...CENTERS]);

// ---- Hoja 1 · Pedidos ---------------------------------------------------------------------------------------------------------------
/** TODOS los renglones de Seg pedidos del ejecutivo (los mismos que se ven en pantalla, surtidos incluidos; «Estatus» los distingue), SIN
 * sugerencias, con el inventario del material en el centro del pedido (por almacén), lo que va en tránsito a ese centro y el inventario
 * general de cada centro informado. Los renglones con pendiente van primero. */
export function hojaPedidos(pedidos: readonly Sugerencia[], rss: RSSIndex | null = null, etiqueta: (c: string) => string = (c) => c, centros: readonly string[] = CENTERS): HojaReporte {
  const orden = [...pedidos].sort((a, b) => Number(b.cantidadPendiente > 0) - Number(a.cantidadPendiente > 0));
  const rows = orden.map((p) => {
    const mat = rss?.mats.get(p.materialSolicitado) ?? rss?.mats.get(clave(p.materialSolicitado));
    const co = mat?.centros.get(p.centroPedido);
    const alm = (a: string) => (mat ? co?.invAlm[a] ?? 0 : '');
    return {
      'Pedido': p.pedido, 'OC': p.oc, 'Fecha': p.fecha, 'Razón social': p.razonSocial, 'Destinatario': p.destinatario, 'Solicitante': p.solicitante,
      'Centro': etiqueta(p.centroPedido), 'Almacén': p.almacen, 'Material': p.materialSolicitado, 'Descripción': p.descripcionSolicitada,
      'Cantidad': p.cantidadPedido, 'Pendiente': p.cantidadPendiente, 'Estatus': p.cantidadPendiente > 0 ? 'Pendiente' : 'Surtido',
      'Precio': p.precio, '$ Pendiente': redondeo(p.cantidadPendiente * p.precio),
      'Bloqueo': p.bloqueado,
      'Inv. centro pedido (1030+1031+1060)': mat ? invGen(co) : p.invByCenter[p.centroPedido] ?? 0,
      'Inv. 1030': alm('1030'), 'Inv. 1031': alm('1031'), 'Inv. 1032': alm('1032'), 'Inv. 1060': alm('1060'),
      'En tránsito al centro': mat ? co?.transito ?? 0 : p.cantTransito,
      'Va material en curso': (mat ? co?.transito ?? 0 : p.cantTransito) > 0 ? 'Sí' : 'No',
      ...Object.fromEntries(centros.map((c) => [`Inv ${etiqueta(c)}`, mat ? invGen(mat.centros.get(c)) : p.invByCenter[c] ?? 0])),
    };
  });
  return { name: 'Pedidos', rows };
}

// ---- Hoja 2 · Consumo clientes --------------------------------------------------------------------------------------------------------
export function hojaConsumo(consumo: readonly ConsumoRow[]): HojaReporte {
  const rows = [...consumo]
    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial) || b.consumoPromedioMensual - a.consumoPromedioMensual)
    .map((r) => ({
      'Solicitante': r.solicitante, 'Razón social': r.razonSocial, 'Destinatario': r.destinatario, 'Centro': r.centro,
      'Material': r.material, 'Descripción': r.textoMaterial, 'UM': r.um,
      'Consumo actual': entero(r.consumoActual), 'Prom. mensual': entero(r.consumoPromedioMensual), 'Tendencia': r.tendencia,
      'Último mes fact.': r.ultimoMesFacturacion, 'Cant. última': entero(r.cantidadUltima), 'Importe última': r.importeUltima, 'Precio prom.': r.precioProm,
    }));
  return { name: 'Consumo clientes', rows };
}

// ---- Hoja 3 · Inventario disponible ---------------------------------------------------------------------------------------------------
export function hojaInventario(rss: RSSIndex | null, materiales: ReadonlySet<string> | null, consumoPorMat: ReadonlyMap<string, number>, etiqueta: (c: string) => string = (c) => c, centros: readonly string[] = CENTERS): HojaReporte {
  const rows: Fila[] = [];
  if (rss) {
    for (const m of rss.mats.values()) {
      if (materiales && !materiales.has(clave(m.material))) continue;
      const porCentro = Object.fromEntries(centros.map((c) => [etiqueta(c), invGen(m.centros.get(c))]));
      let transito = 0;
      for (const c of centros) transito += m.centros.get(c)?.transito ?? 0;
      const total = Object.values(porCentro).reduce((s, q) => s + q, 0);
      if (!(total > 0) && !(m.sumaPend > 0)) continue;
      rows.push({
        'Material': m.material, 'Descripción': m.desc, ...porCentro, 'Total libre': total, 'Tránsito': transito,
        'Pendiente': m.sumaPend, 'Consumo prom. mensual (clientes)': entero(consumoPorMat.get(clave(m.material)) ?? 0),
      });
    }
  }
  rows.sort((a, b) => String(a['Material']).localeCompare(String(b['Material'])));
  return { name: 'Inventario disponible', rows };
}

// ---- Hoja 4 · Materiales con condición -------------------------------------------------------------------------------------------------
export interface OpcionesCondiciones {
  etiqueta?: (c: string) => string;
  centros?: readonly string[];
  /** Solo las condiciones elegidas (vacío = todas). */
  condiciones?: readonly string[];
  caducidadMaxMeses?: CaducidadMaxMeses;
  hoy?: Date;
  /** Inventario por centro de un material: lo usan las filas de Sustituto para mostrar el del material sustituto. */
  invPorCentro?: (material: string) => Record<string, number>;
}

/** Una fila por material × lote/centro × condición. La cantidad cae en la columna de su centro. Un Sustituto es una fila con el material
 * sustituto, su descripción y su inventario en cada centro. */
export function hojaCondiciones(invCondicion: readonly InvConsolidadoRow[], condicionesDe: (m: string) => FilaCondicionMaterial[], o: OpcionesCondiciones = {}): HojaReporte {
  const etiqueta = o.etiqueta ?? ((c: string) => c);
  const centros = o.centros ?? CENTERS;
  const textoDe = new Map<string, string>();
  for (const r of invCondicion) if (!textoDe.has(r.material)) textoDe.set(r.material, r.textoBreve);
  const rows: Fila[] = [];
  for (const [material, descripcion] of textoDe) {
    for (const f of condicionesDe(material)) {
      const condicion = condicionElegida(f.condicion, o.condiciones);
      if (condicion === null) continue;
      if (!dentroDeCaducidadMax(condicion, f.caducidad, o.caducidadMaxMeses, o.hoy)) continue;
      if (f.centro && !centros.includes(f.centro)) continue;
      const sust = f.relacionado;
      const inv = sust ? o.invPorCentro?.(sust.material) ?? {} : null;
      const porCentro = Object.fromEntries(centros.map((c) => [etiqueta(c), inv ? inv[c] ?? 0 : f.centro === c ? f.cantidad : 0]));
      rows.push({
        'Material': material, 'Descripción': descripcion, 'Material sustituto': sust?.material ?? '', 'Descripción sustituto': sust?.texto ?? '',
        'Lote': f.lote, 'Caducidad': f.caducidad, 'Condición': condicion, 'Detalle': f.detalle,
        ...porCentro,
        'Total': inv ? Object.values(porCentro).reduce((s, q) => s + Number(q), 0) : f.cantidad,
      });
    }
  }
  rows.sort((a, b) => String(a['Material']).localeCompare(String(b['Material'])) || String(a['Condición']).localeCompare(String(b['Condición'])));
  return { name: 'Materiales con condición', rows };
}

// ---- Hoja 5 · Oportunidades ------------------------------------------------------------------------------------------------------------
export interface CtxOportunidades extends CtxCentros {
  ofertableDe: OfertableDe;
  p50De: (c: ConsumoRow) => number;
  centrosOferta?: readonly string[];
  condiciones?: readonly string[];
  caducidadMaxMeses?: CaducidadMaxMeses;
  hoy?: Date;
}

/** Pedidos abiertos (pendiente > 0, sin bloqueo) y clientes con consumo SIN pedido abierto de ese material × lo ofertable de su material (mismo
 * material, sustituto y condiciones). Una fila por pedido × lote/centro. Cuando hay datos de consumo del cliente para el material se llenan también
 * en las filas de pedido. Referencia = P50 (si no hay, el promedio); para consumo, necesidad = referencia − consumo del mes (mínimo 0); sugerida =
 * mínimo entre la necesidad y lo disponible. Todas las cantidades son enteros. */
export function hojaOportunidades(pedidos: readonly Sugerencia[], consumo: readonly ConsumoRow[], ctx: CtxOportunidades): HojaReporte {
  const rows: Fila[] = [];
  const cache = new Map<string, ReturnType<OfertableDe>>();
  const ofertable = (m: string, centroPedido: string) => {
    let r = cache.get(m);
    if (!r) { r = ctx.ofertableDe(m); cache.set(m, r); }
    // `cond` es la condición a mostrar (solo las partes elegidas); el precio se sigue buscando con la fila original.
    const filas = filasPorCentros(r.filas, centroPedido, ctx.centrosOferta ?? []).flatMap((f) => {
      const cond = f.disponible > 0 ? condicionElegida(f.fuente, ctx.condiciones) : null;
      return cond === null || !dentroDeCaducidadMax(cond, f.fechaCaducidad, ctx.caducidadMaxMeses, ctx.hoy) ? [] : [{ f, cond }];
    });
    return { filas, precioDe: r.precioDe };
  };
  const invCache = new Map<string, Fila>();
  const invCentros = (m: string): Fila => {
    let r = invCache.get(m);
    if (!r) {
      const inv = ctx.invPorCentro(m);
      r = Object.fromEntries(ctx.centros.map((c) => [`Inv ${ctx.etiqueta(c)}`, inv[c] ?? 0]));
      invCache.set(m, r);
    }
    return r;
  };
  const llave = (dest: string, mat: string) => `${clave(dest)}|${clave(mat)}`;
  const pedidosDe = new Map<string, string[]>();
  for (const p of pedidos) {
    if (!(p.cantidadPendiente > 0)) continue;
    const k = llave(p.destinatario, p.materialSolicitado);
    pedidosDe.set(k, [...(pedidosDe.get(k) ?? []), p.pedido]);
  }
  const consumoDe = new Map<string, ConsumoRow>();
  for (const c of consumo) { const k = llave(c.destinatario, c.material); if (!consumoDe.has(k)) consumoDe.set(k, c); }

  const push = (base: Fila, necesidad: number, f: Sugerencia, cond: string, precioAut: number, precioRef: number, origenPrecio: string, matCliente: string) => {
    rows.push({
      ...base,
      'Material ofertable': f.materialSugerido, 'Descripción ofertable': f.descripcionSugerida,
      'Relación': esSustituto(matCliente, f.materialSugerido) ? 'Sustituto' : 'Mismo material', 'Condición': cond,
      'Lote': f.lote, 'Caducidad': f.fechaCaducidad, 'Centro origen': f.centroSugerido, 'Almacén origen': f.almacenSugerido,
      'Disponible': entero(f.disponible), 'Precio autorizado': precioAut, 'Precio pedido / último precio': precioRef, 'Origen del precio': origenPrecio,
      'Cantidad sugerida': Math.min(entero(necesidad), Math.floor(f.disponible)),
      ...invCentros(f.materialSugerido),
    });
  };
  const statsConsumo = (c: ConsumoRow | undefined) => {
    if (!c) return { 'Prom. mensual': '', 'P50 mensual': '', 'Consumo mes actual': '', 'Referencia': '' };
    const p50 = ctx.p50De(c);
    return {
      'Prom. mensual': entero(c.consumoPromedioMensual), 'P50 mensual': entero(p50), 'Consumo mes actual': entero(c.consumoActual),
      'Referencia': entero(p50 > 0 ? p50 : c.consumoPromedioMensual),
    };
  };
  const precioUltimo = (c: ConsumoRow) => c.precioUnitarioUltima || c.precioProm || 0;

  for (const p of pedidos) {
    if (!(p.cantidadPendiente > 0) || p.bloqueado) continue;
    const { filas, precioDe } = ofertable(p.materialBase || p.materialSolicitado, p.centroPedido);
    const c = consumoDe.get(llave(p.destinatario, p.materialSolicitado));
    const base: Fila = {
      'Origen': 'Pedido abierto', 'Cliente': `${p.destinatario} – ${p.razonSocial}`, 'Pedido abierto': p.pedido, 'Material cliente': p.materialSolicitado,
      'Descripción cliente': p.descripcionSolicitada, 'Pendiente pedido': entero(p.cantidadPendiente), ...statsConsumo(c),
      'Necesidad estimada': entero(p.cantidadPendiente), 'Nota': '',
    };
    const precioPedido = p.precio > 0 ? p.precio : c ? precioUltimo(c) : 0;
    const origenPrecio = p.precio > 0 ? 'Pedido' : c && precioUltimo(c) > 0 ? 'Última factura' : '';
    for (const { f, cond } of filas) push(base, p.cantidadPendiente, f, cond, precioDe(f), precioPedido, origenPrecio, p.materialSolicitado);
  }
  for (const [k, c] of consumoDe) {
    if (pedidosDe.has(k)) continue; // ya salió por su(s) pedido(s) abierto(s), con los datos de consumo en esas filas
    const p50 = ctx.p50De(c);
    const ref = p50 > 0 ? p50 : c.consumoPromedioMensual;
    if (!(ref > 0)) continue;
    const necesidad = Math.max(0, entero(ref) - entero(c.consumoActual));
    const { filas, precioDe } = ofertable(c.material, c.centro);
    const base: Fila = {
      'Origen': 'Consumo', 'Cliente': `${c.destinatario} – ${c.razonSocial}`, 'Pedido abierto': '', 'Material cliente': c.material,
      'Descripción cliente': c.textoMaterial, 'Pendiente pedido': '', ...statsConsumo(c), 'Necesidad estimada': necesidad,
      'Nota': necesidad === 0 ? 'Ya cubrió su consumo de referencia este mes' : '',
    };
    const pu = precioUltimo(c);
    for (const { f, cond } of filas) push(base, necesidad, f, cond, precioDe(f), pu, pu > 0 ? 'Última factura' : '', c.material);
  }
  return { name: 'Oportunidades', rows };
}

// ---- Libro completo --------------------------------------------------------------------------------------------------------------------
export function hojasReporteEjecutivo(e: EntradaReporteEjecutivo): HojaReporte[] {
  const etiqueta = e.etiquetaCentro ?? ((c: string) => c);
  const centros = centrosVisibles(e.centrosInforme);
  const consumoPorMat = new Map<string, number>();
  for (const c of e.consumo) consumoPorMat.set(clave(c.material), (consumoPorMat.get(clave(c.material)) ?? 0) + c.consumoPromedioMensual);
  const materiales = e.inventarioCompleto ? null : new Set([...e.pedidos.map((p) => clave(p.materialSolicitado)), ...e.consumo.map((c) => clave(c.material))]);
  const invPorCentro = (material: string): Record<string, number> => {
    const m = e.rssDisp?.mats.get(material) ?? e.rssDisp?.mats.get(clave(material));
    return Object.fromEntries(CENTERS.map((c) => [c, invGen(m?.centros.get(c))]));
  };

  const pedidos = hojaPedidos(e.pedidos, e.rssDisp, etiqueta, centros);
  const consumo = hojaConsumo(e.consumo);
  const inventario = hojaInventario(e.rssDisp, materiales, consumoPorMat, etiqueta, centros);
  const condiciones = hojaCondiciones(e.invCondicion, e.condicionesDe, { etiqueta, centros, ...(e.condiciones ? { condiciones: e.condiciones } : {}), ...(e.caducidadMaxMeses ? { caducidadMaxMeses: e.caducidadMaxMeses } : {}), ...(e.hoy ? { hoy: e.hoy } : {}), invPorCentro });
  const oportunidades = hojaOportunidades(e.pedidos, e.consumo, {
    ofertableDe: e.ofertableDe, p50De: e.p50De ?? (() => 0), etiqueta, centros, invPorCentro,
    ...(e.centrosOferta ? { centrosOferta: e.centrosOferta } : {}), ...(e.condiciones ? { condiciones: e.condiciones } : {}),
    ...(e.caducidadMaxMeses ? { caducidadMaxMeses: e.caducidadMaxMeses } : {}), ...(e.hoy ? { hoy: e.hoy } : {}),
  });

  const pendiente = e.pedidos.reduce((s, p) => s + p.cantidadPendiente * p.precio, 0);
  const clientes = new Set([...e.pedidos.map((p) => clave(p.destinatario)), ...e.consumo.map((c) => clave(c.destinatario))]).size;
  const resumen: HojaReporte = {
    name: 'Resumen',
    rows: [
      { 'Concepto': 'Ejecutivo', 'Valor': e.ejecutivo || 'Sin ejecutivo' },
      { 'Concepto': 'Zona', 'Valor': e.zona },
      { 'Concepto': 'Generado', 'Valor': e.generadoEn ?? new Date().toLocaleString('es-MX') },
      { 'Concepto': 'Centros informados', 'Valor': e.centrosInforme?.length ? e.centrosInforme.join(', ') : 'Todos' },
      { 'Concepto': 'Centros considerados para ofertar (+ el del pedido)', 'Valor': e.centrosOferta?.length ? e.centrosOferta.join(', ') : 'Todos' },
      { 'Concepto': 'Condiciones enviadas', 'Valor': e.condiciones?.length ? e.condiciones.join(', ') : 'Todas' },
      { 'Concepto': 'Caducidad máxima enviada', 'Valor': textoCaducidadMax(e.caducidadMaxMeses) },
      { 'Concepto': 'Clientes (pedidos + consumo)', 'Valor': clientes },
      { 'Concepto': 'Pedidos (distintos)', 'Valor': new Set(e.pedidos.map((p) => p.pedido)).size },
      { 'Concepto': 'Renglones de Seg pedidos (cuadra con la pantalla)', 'Valor': pedidos.rows.length },
      { 'Concepto': 'Renglones con pendiente', 'Valor': e.pedidos.filter((p) => p.cantidadPendiente > 0).length },
      { 'Concepto': '$ pendiente', 'Valor': redondeo(pendiente) },
      { 'Concepto': 'Líneas de consumo', 'Valor': consumo.rows.length },
      { 'Concepto': 'Materiales en inventario', 'Valor': inventario.rows.length },
      { 'Concepto': 'Materiales/lotes con condición', 'Valor': condiciones.rows.length },
      { 'Concepto': 'Oportunidades – pedidos abiertos', 'Valor': oportunidades.rows.filter((r) => r['Origen'] === 'Pedido abierto').length },
      { 'Concepto': 'Oportunidades – clientes con consumo sin pedido', 'Valor': oportunidades.rows.filter((r) => r['Origen'] === 'Consumo').length },
    ],
  };
  return [resumen, pedidos, consumo, inventario, condiciones, oportunidades];
}

export const nombreArchivoReporteEjecutivo = (ejecutivo: string, zona: string, sello: string): string =>
  `Reporte_${[zona, ejecutivo || 'SinEjecutivo'].filter(Boolean).join('_').replace(/[^\p{L}\p{N}]+/gu, '_')}_${sello}.xlsx`;
