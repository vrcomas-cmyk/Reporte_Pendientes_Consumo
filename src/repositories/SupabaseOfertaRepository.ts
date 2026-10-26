import { supabase } from '@/lib/supabaseClient';
import { db } from './db';
import type { OfertaRepository } from './OfertaRepository';
import type { Oferta } from '@/core/types';

async function currentEmail(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? 'desconocido';
}

/** Columnas del módulo «Ofertas y traslados» (solo las presentes: sirve para insert y update parcial). */
function columnasModulo(o: Partial<Oferta>): Record<string, unknown> {
  const m: [keyof Oferta, string][] = [
    ['estatus', 'estatus'], ['pedido', 'pedido'], ['solicitante', 'solicitante'], ['centroPedido', 'centro_pedido'], ['almacenPedido', 'almacen_pedido'],
    ['materialSolicitado', 'material_solicitado'], ['centroOrigen', 'centro_origen'], ['almacenOrigen', 'almacen_origen'], ['condicionTexto', 'condicion_texto'],
    ['ejecutivo', 'ejecutivo'], ['zona', 'zona'], ['loteAceptado', 'lote_aceptado'], ['historial', 'historial'],
  ];
  const out: Record<string, unknown> = {};
  for (const [k, col] of m) if (o[k] !== undefined) out[col] = o[k];
  return out;
}

function rowToOferta(r: Record<string, unknown>): Oferta {
  return {
    id: r.local_id as number,
    oportunidadId: (r.oportunidad_id as number) ?? undefined,
    dest: r.dest as string,
    razonSocial: (r.razon_social as string) ?? '',
    material: r.material as string,
    lote: (r.lote as string) ?? undefined,
    condicion: r.condicion as Oferta['condicion'],
    fechaCaducidad: (r.fecha_caducidad as string) ?? null,
    cantidadOfertada: r.cantidad_ofertada as number,
    cantidadAceptada: (r.cantidad_aceptada as number) ?? undefined,
    precioOfertado: r.precio_ofertado as number,
    precioLista: (r.precio_lista as number) ?? undefined,
    fechaOferta: r.fecha_oferta as string,
    fechaRespuesta: (r.fecha_respuesta as string) ?? undefined,
    resultado: r.resultado as Oferta['resultado'],
    motivoRechazo: (r.motivo_rechazo as Oferta['motivoRechazo']) ?? undefined,
    comentario: (r.comentario as string) ?? '',
    creadoPor: (r.creado_por as string) ?? '',
    ...(r.estatus ? { estatus: r.estatus as Oferta['estatus'] } : {}),
    ...(r.pedido ? { pedido: r.pedido as string } : {}),
    ...(r.solicitante ? { solicitante: r.solicitante as string } : {}),
    ...(r.centro_pedido ? { centroPedido: r.centro_pedido as string } : {}),
    ...(r.almacen_pedido ? { almacenPedido: r.almacen_pedido as string } : {}),
    ...(r.material_solicitado ? { materialSolicitado: r.material_solicitado as string } : {}),
    ...(r.centro_origen ? { centroOrigen: r.centro_origen as string } : {}),
    ...(r.almacen_origen ? { almacenOrigen: r.almacen_origen as string } : {}),
    ...(r.condicion_texto ? { condicionTexto: r.condicion_texto as string } : {}),
    ...(r.ejecutivo ? { ejecutivo: r.ejecutivo as string } : {}),
    ...(r.zona ? { zona: r.zona as string } : {}),
    ...(r.lote_aceptado ? { loteAceptado: r.lote_aceptado as string } : {}),
    ...(Array.isArray(r.historial) ? { historial: r.historial as Oferta['historial'] } : {}),
    ...(r.updated_at ? { updatedAt: r.updated_at as string } : {}),
  };
}

/** Igual criterio que el resto del módulo: Supabase es la fuente de verdad
 * (conocimiento del equipo), Dexie cachea para lectura offline. */
export class SupabaseOfertaRepository implements OfertaRepository {
  async listOfertas(): Promise<Oferta[]> {
    const { data, error } = await supabase.from('degasa_ofertas').select('*').order('fecha_oferta', { ascending: false });
    if (error) return db.ofertas.orderBy('fechaOferta').reverse().toArray();
    const list = (data ?? []).map(rowToOferta);
    void db.ofertas.clear().then(() => db.ofertas.bulkPut(list));
    return list;
  }

  async addOferta(o: Oferta): Promise<number> {
    const creadoPor = o.creadoPor || (await currentEmail());
    const fechaOferta = o.fechaOferta || new Date().toISOString();
    const payload = {
      oportunidad_id: o.oportunidadId ?? null, dest: o.dest, razon_social: o.razonSocial, material: o.material,
      lote: o.lote ?? null, condicion: o.condicion, fecha_caducidad: o.fechaCaducidad,
      cantidad_ofertada: o.cantidadOfertada, cantidad_aceptada: o.cantidadAceptada ?? null,
      precio_ofertado: o.precioOfertado, precio_lista: o.precioLista ?? null,
      fecha_oferta: fechaOferta, fecha_respuesta: o.fechaRespuesta ?? null,
      resultado: o.resultado, motivo_rechazo: o.motivoRechazo ?? null, comentario: o.comentario ?? '', creado_por: creadoPor,
      ...columnasModulo(o),
    };
    const { data, error } = await supabase.from('degasa_ofertas').insert(payload).select('local_id').single();
    if (error) throw error;
    const id = data.local_id as number;
    await db.ofertas.put({ ...o, id, creadoPor, fechaOferta });
    return id;
  }

  async updateOferta(id: number, patch: Partial<Oferta>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.resultado !== undefined) payload.resultado = patch.resultado;
    if (patch.cantidadAceptada !== undefined) payload.cantidad_aceptada = patch.cantidadAceptada;
    if (patch.motivoRechazo !== undefined) payload.motivo_rechazo = patch.motivoRechazo;
    if (patch.fechaRespuesta !== undefined) payload.fecha_respuesta = patch.fechaRespuesta;
    if (patch.comentario !== undefined) payload.comentario = patch.comentario;
    Object.assign(payload, columnasModulo(patch));
    if (Object.keys(payload).length) payload.updated_at = new Date().toISOString();
    const { error } = await supabase.from('degasa_ofertas').update(payload).eq('local_id', id);
    if (error) throw error;
    await db.ofertas.update(id, patch);
  }
}
