// ---------------------------------------------------------------------------
// seguimientoTraslado.ts · Seguimiento de un traslado con Inventario · Disponibilidad (En curso / Recibido).
//
// Lo que el reporte SÍ trae: libre utilización y entrega a cliente por centro/almacén/material (libre real) y «Cant. en Tránsito» por
// centro/material (todos los almacenes). Lo que NO trae: lote, una columna «En curso» propia, historia ni fecha de la foto (se usa la de la
// sincronización). Por eso el seguimiento compara contra una LÍNEA BASE guardada al marcar «Solicitado», sin atribuir lote, y lo ambiguo
// queda «pendiente de revisión» en vez de marcarse recibido.
// Puro: sin red ni disco.
// ---------------------------------------------------------------------------
import type { InventarioPedidos } from './pedidos';
import type { EstatusTraslado, Traslado } from './types';

/** Foto de Disponibilidad en un momento (`leidoEn` ISO = cuándo se descargó). */
export interface SnapDisponibilidad {
  leidoEn: string;
  libre: (material: string, centro: string, almacen: string) => number;
  /** Tránsito hacia el centro (el reporte no lo separa por almacén). */
  transito: (material: string, centro: string) => number;
}

const k = (s: string) => s.trim().replace(/\.0+$/, '');

export function snapshotDeInventario(inv: InventarioPedidos, leidoEn: string): SnapDisponibilidad {
  return {
    leidoEn,
    libre: (m, c, a) => inv.porCentroAlm.get(`${k(m)}|${k(c)}|${k(a)}`) ?? 0,
    transito: (m, c) => inv.transito.get(`${k(m)}|${k(c)}`) ?? 0,
  };
}

/** Línea base que se guarda al marcar «Solicitado»: lo que había en el destino ese día. */
export function baseDeSeguimiento(t: Pick<Traslado, 'material' | 'centroDestino' | 'almacenDestino'>, snap: SnapDisponibilidad): Pick<Traslado, 'baseLibre' | 'baseTransito' | 'baseLeidoEn'> {
  return {
    baseLibre: snap.libre(t.material, t.centroDestino, t.almacenDestino),
    baseTransito: snap.transito(t.material, t.centroDestino),
    baseLeidoEn: snap.leidoEn,
  };
}

export interface CambioSeguimiento {
  estatus: EstatusTraslado;
  enCursoCant?: number;
  enCursoLeidoEn?: string;
  recibidoCant?: number;
  recibidoLeidoEn?: string;
  notaRevision?: string;
}

const SEGUIBLES = new Set<EstatusTraslado>(['solicitado', 'en-curso', 'revision']);

/** Evalúa un traslado contra una actualización POSTERIOR a su línea base. `null` = nada que cambiar (no hay base, no es seguible, la foto no es
 * más nueva que la base, o sigue igual).
 *  · Recibido: la existencia libre del destino subió al menos lo solicitado.
 *  · En curso: el tránsito hacia el centro destino subió contra la base (piezas = diferencia).
 *  · Pendiente de revisión: subió el libre pero menos de lo solicitado, o el tránsito desapareció sin subir el libre. */
export function evaluarTraslado(t: Traslado, snap: SnapDisponibilidad): CambioSeguimiento | null {
  if (!SEGUIBLES.has(t.estatus)) return null;
  if (t.baseLibre == null || t.baseTransito == null || !t.baseLeidoEn) return null;
  if (!(Date.parse(snap.leidoEn) > Date.parse(t.baseLeidoEn))) return null;

  const dLibre = snap.libre(t.material, t.centroDestino, t.almacenDestino) - t.baseLibre;
  const dTransito = snap.transito(t.material, t.centroDestino) - t.baseTransito;
  const cantidad = t.cantidad;

  if (cantidad > 0 && dLibre >= cantidad) {
    return { estatus: 'recibido', recibidoCant: dLibre, recibidoLeidoEn: snap.leidoEn };
  }
  if (dTransito > 0) {
    return { estatus: 'en-curso', enCursoCant: dTransito, enCursoLeidoEn: snap.leidoEn };
  }
  if (dLibre > 0) {
    return {
      estatus: 'revision',
      notaRevision: `La existencia libre en ${t.centroDestino}/${t.almacenDestino} subió ${dLibre} de ${cantidad} solicitadas: puede ser una recepción parcial u otros movimientos. Confírmalo a mano.`,
    };
  }
  if (t.estatus === 'en-curso') {
    return {
      estatus: 'revision',
      notaRevision: 'El material ya no aparece en curso hacia el destino y la existencia libre no subió lo solicitado. Confírmalo a mano.',
    };
  }
  return null;
}

/** Texto corto del estado para tablas y chips («En curso · 120 pzas», «Recibido · 120 pzas»). */
export function textoSeguimiento(t: Traslado): string {
  const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-MX') : '');
  switch (t.estatus) {
    case 'en-curso': return `En curso · ${t.enCursoCant ?? 0} pzas${t.enCursoLeidoEn ? ` (Disponibilidad ${fecha(t.enCursoLeidoEn)})` : ''}`;
    case 'recibido': return `Recibido · ${t.recibidoCant ?? 0} pzas${t.recibidoLeidoEn ? ` (Disponibilidad ${fecha(t.recibidoLeidoEn)})` : ''}`;
    case 'revision': return 'Pendiente de revisión';
    case 'solicitado': return 'Solicitado';
    case 'cancelado': return 'Cancelado';
    default: return 'Preparado';
  }
}

/** Texto del correo de solicitud de traslado (el usuario lo copia y lo envía a mano; copiarlo NO lo marca como solicitado). */
export function textoCorreoTraslado(t: Traslado): { asunto: string; cuerpo: string } {
  const asunto = `Solicitud de traslado · ${t.material} · ${t.cantidad} pzas · ${t.centroDestino}/${t.almacenDestino}${t.pedido ? ` · pedido ${t.pedido}` : ''}`;
  const linea = (etiqueta: string, valor: string | number) => (valor === '' ? '' : `${etiqueta}: ${valor}`);
  const detalle = [
    linea('Material', `${t.material}${t.descripcion ? ` · ${t.descripcion}` : ''}`),
    linea('Cantidad', `${t.cantidad}${t.um ? ` ${t.um}` : ''}`),
    linea('Origen (centro/almacén)', `${t.centroOrigen}/${t.almacenOrigen}`),
    linea('Destino (centro/almacén)', `${t.centroDestino}/${t.almacenDestino}`),
    linea('Condición', t.condicion),
    linea('Lote', t.lote),
    linea('Pedido relacionado', t.pedido),
    linea('Cliente', t.razonSocial ? `${t.destinatario} · ${t.razonSocial}` : t.destinatario),
    linea('Ejecutivo', t.zona ? `${t.ejecutivo} (${t.zona})` : t.ejecutivo),
    linea('Comentarios', t.comentarios),
  ].filter(Boolean);
  const cuerpo = ['Buen día,', '', 'Solicito el siguiente traslado:', ...detalle, '', 'Gracias.'].join('\n');
  return { asunto, cuerpo };
}
