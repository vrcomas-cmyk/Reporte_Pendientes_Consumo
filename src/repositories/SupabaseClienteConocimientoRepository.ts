import { supabase } from '@/lib/supabaseClient';
import { db } from './db';
import type { ClienteConocimientoRepository } from './ClienteConocimientoRepository';
import type { ClienteConocimiento, Observacion } from '@/core/types';

async function currentEmail(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? 'desconocido';
}

function rowToCliente(r: Record<string, unknown>): ClienteConocimiento {
  return {
    id: r.local_id as number,
    dest: r.dest as string,
    razonSocial: (r.razon_social as string) ?? '',
    condicionesAceptadas: (r.condiciones_aceptadas as ClienteConocimiento['condicionesAceptadas']) ?? [],
    estadoMaterial: (r.estado_material as ClienteConocimiento['estadoMaterial']) ?? 'indistinto',
    caducidadMinimaDias: (r.caducidad_minima_dias as number) ?? null,
    activa: (r.activa as boolean) ?? true,
    descuentoHabitualPct: (r.descuento_habitual_pct as number) ?? null,
    contactoNombre: (r.contacto_nombre as string) ?? '',
    contactoTelefono: (r.contacto_telefono as string) ?? '',
    contactoCorreo: (r.contacto_correo as string) ?? '',
    canalPreferido: (r.canal_preferido as string) ?? '',
    notasComerciales: (r.notas_comerciales as string) ?? '',
    actualizadoEn: r.actualizado_en as string,
    actualizadoPor: (r.actualizado_por as string) ?? '',
  };
}

/** Igual que SupabaseOportunidadRepository: Supabase es la fuente de verdad
 * (conocimiento del equipo), con lectura degradando a la caché Dexie si la
 * red falla, y espejo local tras cada mutación exitosa. */
export class SupabaseClienteConocimientoRepository implements ClienteConocimientoRepository {
  async listClientes(): Promise<ClienteConocimiento[]> {
    const { data, error } = await supabase.from('degasa_clientes_conocimiento').select('*').order('razon_social');
    if (error) return db.clientesConocimiento.toArray();
    const list = (data ?? []).map(rowToCliente);
    void db.clientesConocimiento.clear().then(() => db.clientesConocimiento.bulkPut(list));
    return list;
  }

  async upsertCliente(c: ClienteConocimiento): Promise<number> {
    const actualizadoPor = c.actualizadoPor || (await currentEmail());
    const actualizadoEn = new Date().toISOString();
    const payload = {
      dest: c.dest, razon_social: c.razonSocial, condiciones_aceptadas: c.condicionesAceptadas,
      estado_material: c.estadoMaterial ?? 'indistinto', caducidad_minima_dias: c.caducidadMinimaDias,
      activa: c.activa !== false, descuento_habitual_pct: c.descuentoHabitualPct,
      contacto_nombre: c.contactoNombre, contacto_telefono: c.contactoTelefono, contacto_correo: c.contactoCorreo,
      canal_preferido: c.canalPreferido, notas_comerciales: c.notasComerciales,
      actualizado_en: actualizadoEn, actualizado_por: actualizadoPor,
    };
    const { data, error } = await supabase
      .from('degasa_clientes_conocimiento')
      .upsert(payload, { onConflict: 'dest' })
      .select('local_id')
      .single();
    if (error) throw error;
    const id = data.local_id as number;
    await db.clientesConocimiento.put({ ...c, id, actualizadoEn, actualizadoPor });
    return id;
  }

  async listObservaciones(): Promise<Observacion[]> {
    const { data, error } = await supabase.from('degasa_observaciones').select('*').order('creado_en', { ascending: false });
    if (error) return db.observaciones.orderBy('creadoEn').reverse().toArray();
    const list: Observacion[] = (data ?? []).map((r) => ({
      id: r.local_id, dest: r.dest, material: r.material ?? undefined, texto: r.texto, creadoEn: r.creado_en, creadoPor: r.creado_por,
    }));
    void db.observaciones.clear().then(() => db.observaciones.bulkPut(list));
    return list;
  }

  async addObservacion(o: Observacion): Promise<number> {
    const creadoPor = o.creadoPor || (await currentEmail());
    const creadoEn = o.creadoEn || new Date().toISOString();
    const payload = { dest: o.dest, material: o.material ?? null, texto: o.texto, creado_en: creadoEn, creado_por: creadoPor };
    const { data, error } = await supabase.from('degasa_observaciones').insert(payload).select('local_id').single();
    if (error) throw error;
    const id = data.local_id as number;
    await db.observaciones.put({ ...o, id, creadoEn, creadoPor });
    return id;
  }

  async removeObservacion(id: number): Promise<void> {
    const { error } = await supabase.from('degasa_observaciones').delete().eq('local_id', id);
    if (error) throw error;
    await db.observaciones.delete(id);
  }
}
