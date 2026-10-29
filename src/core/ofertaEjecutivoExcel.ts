// ---------------------------------------------------------------------------
// ofertaEjecutivoExcel.ts · Contenido (sin escribir el archivo) del Excel de oferta de UN ejecutivo: encabezado con su nombre y zona, los centros
// considerados y una línea por pedido × lote ofertable. Sin costos (el archivo sale de la empresa hacia el ejecutivo). Puro.
// ---------------------------------------------------------------------------
import type { GrupoEjecutivo, LineaOferta } from './ofertasEjecutivo';

export const COLUMNAS_OFERTA = [
  'Pedido', 'OC', 'Fecha pedido', 'Destinatario', 'Razón social', 'Solicitante', 'Centro pedido', 'Almacén pedido',
  'Material solicitado', 'Descripción solicitada', 'Pendiente', 'Material ofertado', 'Descripción ofertada', 'Relación', 'Condición',
  'Centro origen', 'Almacén origen', 'Lote', 'Caducidad', 'Disponible', 'Precio', 'Almacén destino sugerido', 'Alerta',
] as const;

export const TEXTO_INSTRUCCIONES_OFERTA = [
  'Cómo leer esta oferta',
  'Cada línea es un pedido de un cliente con un material que se le puede ofrecer: si hay varios lotes para el mismo pedido y material, hay una línea por lote.',
  '«Material solicitado» es lo que pide el pedido; «Material ofertado» es lo que se puede ofrecer (el mismo código u otro sustituto).',
  '«Condición» indica de qué tipo es el material (por ejemplo Corta caducidad o PNC). Con corta caducidad, el pedido debe ir al almacén 1032 («Almacén destino sugerido»).',
  '«Centro origen / Almacén origen» es dónde está el material; «Disponible» es lo que hay en ese lote o existencia.',
  'Si el Precio está vacío, ese material todavía no tiene precio autorizado: no se puede ofrecer hasta que se autorice.',
  'La columna «Alerta» avisa si ese cliente ya había aceptado ese material antes (con su lote, si se conoce).',
];

/** Texto de alerta de una línea (aceptación previa), o '' si no hay. */
export type AlertaDeLinea = (l: LineaOferta) => string;

export function filasDeLinea(l: LineaOferta, alerta: AlertaDeLinea = () => ''): (string | number)[] {
  return [
    l.pedido, l.oc, l.fechaPedido, l.destinatario, l.razonSocial, l.solicitante, l.centroPedido, l.almacenPedido,
    l.materialSolicitado, l.descripcionSolicitada, l.pendiente, l.materialOfertado, l.descripcionOfertada, l.relacion, l.condicion,
    l.centroOrigen, l.almacenOrigen, l.lote, l.caducidad, l.disponible, l.precio > 0 ? l.precio : '', l.almacenDestino, alerta(l),
  ];
}

/** Hoja «Oferta»: ejecutivo, zona, centros y fecha arriba; luego el encabezado de columnas y las líneas. */
export function matrizOferta(g: GrupoEjecutivo, opts: { centros: readonly string[]; generadaEn: string; alerta?: AlertaDeLinea }): (string | number)[][] {
  const orden = [...g.lineas].sort((a, b) => a.destinatario.localeCompare(b.destinatario) || a.pedido.localeCompare(b.pedido) || a.materialOfertado.localeCompare(b.materialOfertado) || a.lote.localeCompare(b.lote));
  return [
    ['Oferta para', g.ejecutivo],
    ['Zona', g.zona],
    ['Centros considerados', opts.centros.length ? opts.centros.join(', ') : 'Todos'],
    ['Pedidos', g.pedidos, 'Clientes', g.clientes],
    ['Generada', opts.generadaEn],
    [],
    [...COLUMNAS_OFERTA],
    ...orden.map((l) => filasDeLinea(l, opts.alerta)),
  ];
}

/** Nombre de archivo seguro: Oferta_<zona>_<ejecutivo>_<fecha>.xlsx */
export function nombreArchivoOferta(g: Pick<GrupoEjecutivo, 'ejecutivo' | 'zona'>, stamp: string): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return ['Oferta', limpio(g.zona), limpio(g.ejecutivo), stamp].filter(Boolean).join('_') + '.xlsx';
}
