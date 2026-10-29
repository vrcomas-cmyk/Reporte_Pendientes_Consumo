// ---------------------------------------------------------------------------
// ofertasEjecutivo.ts · Ofertas por ejecutivo: de cada pedido pendiente, qué material ofertable (por lote) lo puede cubrir.
// Puro: recibe las filas ofertables ya calculadas (`filasOfertablesDe`) y no toca red ni disco.
// ---------------------------------------------------------------------------
import { norm } from '@/lib/text';
import { esSustituto, disponibleEnCentros } from './ofertaSustituto';
import { condicionesDeTexto } from './precioAutorizado';
import { ALMACEN_CORTA_CADUCIDAD } from './inventoryRules';
import { estatusDeOferta, resultadoDeEstatus, type EstatusOferta, type HistorialOferta, type Oferta, type Sugerencia } from './types';

/** Almacén en el que inicia un pedido cuando la hoja no trae uno. */
export const ALMACEN_PEDIDO_INICIAL = '1030';

/** Una línea de la oferta: pedido + cliente + material solicitado + UN lote (o existencia general) ofertable. */
export interface LineaOferta {
  ejecutivo: string;
  zona: string;
  pedido: string;
  oc: string;
  fechaPedido: string;
  solicitante: string;
  destinatario: string;
  razonSocial: string;
  centroPedido: string;
  almacenPedido: string;
  materialSolicitado: string;
  descripcionSolicitada: string;
  pendiente: number;
  materialOfertado: string;
  descripcionOfertada: string;
  relacion: 'Mismo material' | 'Sustituto';
  /** Condición tal como sale de los libros («Corta caducidad», «PNC», «Sustituto/Corta caducidad»…). */
  condicion: string;
  centroOrigen: string;
  almacenOrigen: string;
  lote: string;
  caducidad: string;
  disponible: number;
  /** Precio AUTORIZADO de esa condición; 0 = sin precio autorizado. */
  precio: number;
  /** Almacén al que debe ir el pedido si el cliente acepta (corta caducidad → 1032). */
  almacenDestino: string;
}

/** Almacén destino del pedido al aceptar: sin almacén → 1030; corta caducidad → 1032; otras condiciones → el almacén del pedido. */
export function almacenDestinoPedido(almacenPedido: string, condicion: string): string {
  if (condicionesDeTexto(condicion).cc) return ALMACEN_CORTA_CADUCIDAD;
  const a = almacenPedido.trim();
  return a || ALMACEN_PEDIDO_INICIAL;
}

/** Filas que pasan el filtro «Considerar centros»: los lotes por su centro; la existencia general (sin centro) solo cuenta lo de los centros elegidos. */
export function filasPorCentros(filas: Sugerencia[], centroPedido: string, elegidos: readonly string[]): Sugerencia[] {
  if (!elegidos.length) return filas;
  const pasa = (c: string) => !c || c === centroPedido || elegidos.includes(c);
  return filas.flatMap((f) => {
    if (f.centroSugerido) return pasa(f.centroSugerido) ? [f] : [];
    const disp = disponibleEnCentros(f.invByCenter, pasa);
    return disp > 0 ? [{ ...f, disponible: disp }] : [];
  });
}

export interface OpcionesLineas {
  /** Centros elegidos en «Considerar centros» (vacío = todos). */
  centros: readonly string[];
  ejecutivoDe: (gpoVdor: string) => string;
  zonaDe: (gpoVdor: string) => string;
  /** Con `true` también se ofrece a pedidos bloqueados (por defecto no). */
  incluirBloqueados?: boolean;
}

/** Líneas de oferta de TODOS los pedidos: una por cada lote/existencia ofertable de cada pedido. `filasDe` da lo ofertable del material del pedido
 * (con su precio autorizado). Respeta pedidos sin pendiente, bloqueados y duplicados. */
export function lineasOfertaPorPedido(
  pedidos: readonly Sugerencia[],
  filasDe: (bo: Sugerencia) => { filas: Sugerencia[]; precioDe: (f: Sugerencia) => number },
  opts: OpcionesLineas,
): LineaOferta[] {
  const out: LineaOferta[] = [];
  const cache = new Map<string, { filas: Sugerencia[]; precioDe: (f: Sugerencia) => number }>();
  for (const bo of pedidos) {
    if (!(bo.cantidadPendiente > 0)) continue;
    if (bo.bloqueado && !opts.incluirBloqueados) continue;
    const mat = bo.materialBase || bo.materialSolicitado;
    let r = cache.get(mat);
    if (!r) { r = filasDe(bo); cache.set(mat, r); }
    const vistas = new Set<string>();
    for (const f of filasPorCentros(r.filas, bo.centroPedido, opts.centros)) {
      if (!(f.disponible > 0)) continue;
      const clave = `${f.lote}|${f.materialSugerido}|${f.centroSugerido}|${f.almacenSugerido}|${f.fechaCaducidad}|${f.fuente}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      out.push({
        ejecutivo: opts.ejecutivoDe(bo.gpoVdor),
        zona: opts.zonaDe(bo.gpoVdor),
        pedido: bo.pedido,
        oc: bo.oc,
        fechaPedido: bo.fecha,
        solicitante: bo.solicitante,
        destinatario: bo.destinatario,
        razonSocial: bo.razonSocial,
        centroPedido: bo.centroPedido,
        almacenPedido: bo.almacen,
        materialSolicitado: bo.materialSolicitado,
        descripcionSolicitada: bo.descripcionSolicitada,
        pendiente: bo.cantidadPendiente,
        materialOfertado: f.materialSugerido,
        descripcionOfertada: f.descripcionSugerida,
        relacion: esSustituto(mat, f.materialSugerido) ? 'Sustituto' : 'Mismo material',
        condicion: f.fuente,
        centroOrigen: f.centroSugerido,
        almacenOrigen: f.almacenSugerido,
        lote: f.lote,
        caducidad: f.fechaCaducidad,
        disponible: f.disponible,
        precio: r.precioDe(f),
        almacenDestino: almacenDestinoPedido(bo.almacen, f.fuente),
      });
    }
  }
  return out;
}

export interface GrupoEjecutivo { ejecutivo: string; zona: string; lineas: LineaOferta[]; pedidos: number; clientes: number }

/** Agrupa por ejecutivo + zona (un archivo por grupo), con más pedidos primero. */
export function agruparPorEjecutivo(lineas: readonly LineaOferta[]): GrupoEjecutivo[] {
  const m = new Map<string, LineaOferta[]>();
  for (const l of lineas) {
    const k = `${l.ejecutivo}\u0001${l.zona}`;
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  return [...m.values()]
    .map((ls) => ({
      ejecutivo: ls[0]!.ejecutivo || 'Sin ejecutivo',
      zona: ls[0]!.zona,
      lineas: ls,
      pedidos: new Set(ls.map((l) => l.pedido)).size,
      clientes: new Set(ls.map((l) => norm(l.destinatario))).size,
    }))
    .sort((a, b) => b.pedidos - a.pedidos || a.ejecutivo.localeCompare(b.ejecutivo));
}

// ---------------------------------------------------------------------------
// Aceptaciones previas (alerta al volver a analizar los pedidos)
// ---------------------------------------------------------------------------

export interface AceptacionPrevia { ofertaId?: number; fecha: string; pedido: string; lote: string; cantidad: number; parcial: boolean }

/** Ofertas que ese destinatario ya aceptó (total o parcial) de ese material, con el lote aceptado si se conoce (si no, el ofertado). */
export function aceptacionesPrevias(ofertas: readonly Oferta[], destinatario: string, material: string): AceptacionPrevia[] {
  const d = norm(destinatario);
  const m = norm(material);
  return ofertas
    .filter((o) => norm(o.dest) === d && norm(o.material) === m)
    .filter((o) => { const e = estatusDeOferta(o); return e === 'aceptado' || e === 'aceptado-parcial'; })
    .map((o) => ({
      ...(o.id != null ? { ofertaId: o.id } : {}),
      fecha: o.fechaRespuesta || o.fechaOferta,
      pedido: o.pedido ?? '',
      lote: o.loteAceptado || o.lote || '',
      cantidad: o.cantidadAceptada ?? o.cantidadOfertada,
      parcial: estatusDeOferta(o) === 'aceptado-parcial',
    }))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

/** Texto corto de la alerta («Ya aceptó este material el 12/10/2026 · lote A123 · pedido 4500»). */
export function textoAceptacionPrevia(a: AceptacionPrevia): string {
  const f = a.fecha ? new Date(a.fecha) : null;
  const fecha = f && !Number.isNaN(f.getTime()) ? f.toLocaleDateString('es-MX') : '';
  return ['Ya aceptó este material' + (a.parcial ? ' (parcial)' : ''), fecha, a.lote ? `lote ${a.lote}` : 'lote no registrado', a.pedido ? `pedido ${a.pedido}` : ''].filter(Boolean).join(' · ');
}

/** Ofertas de corta caducidad aceptadas cuyo pedido sigue sin el almacén 1032 (hay que cambiarlo en la siguiente actualización de Seg. de pedidos). */
export function pedidosPorMoverA1032(ofertas: readonly Oferta[], pedidos: readonly Pick<Sugerencia, 'pedido' | 'almacen'>[]): Oferta[] {
  const almacenDe = new Map<string, string>();
  for (const p of pedidos) almacenDe.set(norm(p.pedido), p.almacen.trim());
  return ofertas.filter((o) => {
    const e = estatusDeOferta(o);
    if ((e !== 'aceptado' && e !== 'aceptado-parcial') || !o.pedido) return false;
    if (!condicionesDeTexto(o.condicionTexto ?? '').cc) return false;
    const actual = almacenDe.get(norm(o.pedido));
    return actual !== undefined && actual !== ALMACEN_CORTA_CADUCIDAD;
  });
}

// ---------------------------------------------------------------------------
// Registro de ofertas (la línea del Excel → una Oferta con estatus «Ofertado») y cambios de estatus con historial
// ---------------------------------------------------------------------------

/** Llave de una oferta: mismo pedido, cliente, material ofertado, centro y lote (o condición si es existencia general). */
export const llaveOferta = (p: { pedido?: string; dest: string; material: string; centroOrigen?: string; lote?: string; condicionTexto?: string }): string =>
  [p.pedido ?? '', p.dest, p.material, p.centroOrigen ?? '', p.lote || p.condicionTexto || ''].map((x) => norm(x)).join('|');

export const llaveDeLinea = (l: LineaOferta): string =>
  llaveOferta({ pedido: l.pedido, dest: l.destinatario, material: l.materialOfertado, centroOrigen: l.centroOrigen, lote: l.lote, condicionTexto: l.condicion });

/** Oferta nueva («Ofertado») a partir de una línea del generador; guarda la relación completa con el pedido. */
export function ofertaDeLinea(l: LineaOferta, creadoPor: string, ahora: string): Oferta {
  const cc = condicionesDeTexto(l.condicion).cc;
  return {
    dest: l.destinatario,
    razonSocial: l.razonSocial,
    material: l.materialOfertado,
    ...(l.lote ? { lote: l.lote } : {}),
    condicion: cc ? 'corta-caducidad' : 'normal',
    fechaCaducidad: l.caducidad || null,
    cantidadOfertada: l.disponible,
    precioOfertado: l.precio,
    fechaOferta: ahora,
    resultado: 'pendiente',
    comentario: '',
    creadoPor,
    estatus: 'ofertado',
    pedido: l.pedido,
    solicitante: l.solicitante,
    centroPedido: l.centroPedido,
    almacenPedido: l.almacenPedido,
    materialSolicitado: l.materialSolicitado,
    centroOrigen: l.centroOrigen,
    almacenOrigen: l.almacenOrigen,
    condicionTexto: l.condicion,
    ejecutivo: l.ejecutivo,
    zona: l.zona,
    historial: [{ estatus: 'ofertado', at: ahora, por: creadoPor }],
    updatedAt: ahora,
  };
}

/** Lo que cambia en una oferta al darle un estatus: el estatus, `resultado` sincronizado, el lote/cantidad aceptados y una fila nueva de historial. */
export function cambioDeEstatus(o: Oferta, estatus: EstatusOferta, por: string, ahora: string, datos: { cantidad?: number; lote?: string; comentario?: string } = {}): Partial<Oferta> {
  const hist: HistorialOferta = {
    estatus, at: ahora, por,
    ...(datos.cantidad != null ? { cantidad: datos.cantidad } : {}),
    ...(datos.lote ? { lote: datos.lote } : {}),
    ...(datos.comentario ? { comentario: datos.comentario } : {}),
  };
  const acepta = estatus === 'aceptado' || estatus === 'aceptado-parcial';
  return {
    estatus,
    resultado: resultadoDeEstatus(estatus),
    fechaRespuesta: estatus === 'ofertado' ? undefined : ahora,
    ...(acepta ? { cantidadAceptada: datos.cantidad ?? o.cantidadAceptada ?? o.cantidadOfertada, loteAceptado: datos.lote || o.loteAceptado || o.lote || '' } : {}),
    ...(datos.comentario ? { comentario: datos.comentario } : {}),
    historial: [...(o.historial ?? []), hist],
    updatedAt: ahora,
  };
}
