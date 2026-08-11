import { supabase } from '@/lib/supabaseClient';
import { db } from './db';
import type { OportunidadRepository } from './OportunidadRepository';
import type { Oportunidad, Interaccion } from '@/core/types';

async function currentEmail(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? 'desconocido';
}

function rowToOportunidad(r: Record<string, unknown>): Oportunidad {
  return {
    id: r.local_id as number | undefined,
    material: r.material as string,
    descripcion: r.descripcion as string,
    lote: (r.lote as string) ?? undefined,
    centro: (r.centro as string) ?? undefined,
    condicion: r.condicion as Oportunidad['condicion'],
    cantidadDisponible: r.cantidad_disponible as number,
    fechaCaducidad: (r.fecha_caducidad as string) ?? null,
    precioOferta: r.precio_oferta as number,
    estado: r.estado as Oportunidad['estado'],
    responsable: r.responsable as string,
    prioridad: r.prioridad as Oportunidad['prioridad'],
    creadaEn: r.creada_en as string,
    actualizadaEn: r.actualizada_en as string,
    cerradaEn: (r.cerrada_en as string) ?? undefined,
    cantidadColocada: r.cantidad_colocada as number,
    notas: (r.notas as string) ?? '',
  };
}

/** El conocimiento del módulo Oportunidades es DEL EQUIPO (no por
 * dispositivo, a diferencia de SolicitudRepository): Supabase es la fuente
 * de verdad; cada mutación exitosa también se espeja en Dexie para que la
 * bandeja siga mostrando algo si se recarga sin red. Si Supabase falla
 * (offline), se cae a Dexie para lectura — nunca se pierde la bandeja. */
export class SupabaseOportunidadRepository implements OportunidadRepository {
  async listOportunidades(): Promise<Oportunidad[]> {
    const { data, error } = await supabase
      .from('degasa_oportunidades')
      .select('*')
      .order('creada_en', { ascending: false });
    if (error) {
      return db.oportunidades.orderBy('creadaEn').reverse().toArray();
    }
    const list = (data ?? []).map(rowToOportunidad);
    // Espejo en Dexie para lectura offline futura.
    void db.oportunidades.clear().then(() => db.oportunidades.bulkPut(list));
    return list;
  }

  async addOportunidad(o: Oportunidad): Promise<number> {
    const responsable = await currentEmail();
    const now = new Date().toISOString();
    const payload = {
      material: o.material, descripcion: o.descripcion, lote: o.lote ?? null, centro: o.centro ?? null,
      condicion: o.condicion, cantidad_disponible: o.cantidadDisponible, fecha_caducidad: o.fechaCaducidad,
      precio_oferta: o.precioOferta, estado: o.estado, responsable: o.responsable || responsable,
      prioridad: o.prioridad, creada_en: o.creadaEn || now, actualizada_en: now,
      cantidad_colocada: o.cantidadColocada ?? 0, notas: o.notas ?? '',
    };
    const { data, error } = await supabase.from('degasa_oportunidades').insert(payload).select('local_id').single();
    if (error) throw error;
    const id = data.local_id as number;
    await db.oportunidades.put({ ...o, id, responsable: payload.responsable, creadaEn: payload.creada_en, actualizadaEn: payload.actualizada_en });
    return id;
  }

  async updateOportunidad(id: number, patch: Partial<Oportunidad>): Promise<void> {
    const payload: Record<string, unknown> = { actualizada_en: new Date().toISOString() };
    if (patch.estado !== undefined) payload.estado = patch.estado;
    if (patch.cantidadColocada !== undefined) payload.cantidad_colocada = patch.cantidadColocada;
    if (patch.notas !== undefined) payload.notas = patch.notas;
    if (patch.prioridad !== undefined) payload.prioridad = patch.prioridad;
    if (patch.cerradaEn !== undefined) payload.cerrada_en = patch.cerradaEn;
    const { error } = await supabase.from('degasa_oportunidades').update(payload).eq('local_id', id);
    if (error) throw error;
    await db.oportunidades.update(id, patch);
  }

  async listInteracciones(): Promise<Interaccion[]> {
    const { data, error } = await supabase.from('degasa_interacciones').select('*').order('fecha', { ascending: false });
    if (error) return db.interacciones.orderBy('fecha').reverse().toArray();
    const list: Interaccion[] = (data ?? []).map((r) => ({
      id: r.local_id, dest: r.dest, oportunidadId: r.oportunidad_id ?? undefined, material: r.material ?? undefined,
      tipo: r.tipo, resumen: r.resumen, fecha: r.fecha, creadoPor: r.creado_por,
    }));
    void db.interacciones.clear().then(() => db.interacciones.bulkPut(list));
    return list;
  }

  async addInteraccion(i: Interaccion): Promise<number> {
    const creadoPor = i.creadoPor || (await currentEmail());
    const fecha = i.fecha || new Date().toISOString();
    const payload = { dest: i.dest, oportunidad_id: i.oportunidadId ?? null, material: i.material ?? null, tipo: i.tipo, resumen: i.resumen, fecha, creado_por: creadoPor };
    const { data, error } = await supabase.from('degasa_interacciones').insert(payload).select('local_id').single();
    if (error) throw error;
    const id = data.local_id as number;
    await db.interacciones.put({ ...i, id, creadoPor, fecha });
    return id;
  }
}
