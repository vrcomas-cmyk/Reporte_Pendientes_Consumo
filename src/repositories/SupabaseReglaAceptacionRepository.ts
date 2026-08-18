import { supabase } from '@/lib/supabaseClient';
import { db } from './db';
import type { ReglaAceptacionRepository } from './ReglaAceptacionRepository';
import type { ReglaAceptacion } from '@/core/types';

async function currentEmail(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? 'desconocido';
}

function rowToRegla(r: Record<string, unknown>): ReglaAceptacion {
  return {
    id: r.local_id as number,
    dest: r.dest as string,
    material: (r.material as string) || null,
    condiciones: (r.condiciones as ReglaAceptacion['condiciones']) ?? [],
    estadoMaterial: (r.estado_material as ReglaAceptacion['estadoMaterial']) ?? 'indistinto',
    caducidadMinimaMeses: (r.caducidad_minima_meses as number) ?? null,
    activa: (r.activa as boolean) ?? true,
    notas: (r.notas as string) ?? '',
    actualizadoEn: r.actualizado_en as string,
    actualizadoPor: (r.actualizado_por as string) ?? '',
  };
}

function reglaPayload(r: ReglaAceptacion | Omit<ReglaAceptacion, 'id' | 'dest'>, dest: string, actualizadoEn: string, actualizadoPor: string) {
  return {
    dest, material: r.material ?? '', condiciones: r.condiciones, estado_material: r.estadoMaterial,
    caducidad_minima_meses: r.caducidadMinimaMeses, activa: r.activa, notas: r.notas ?? '',
    actualizado_en: actualizadoEn, actualizado_por: actualizadoPor,
  };
}

/** Igual criterio que el resto del módulo: Supabase es la fuente de verdad
 * (conocimiento del equipo), Dexie cachea para lectura offline. */
export class SupabaseReglaAceptacionRepository implements ReglaAceptacionRepository {
  async listReglas(): Promise<ReglaAceptacion[]> {
    const { data, error } = await supabase.from('degasa_reglas_aceptacion').select('*').order('dest');
    if (error) return db.reglasAceptacion.toArray();
    const list = (data ?? []).map(rowToRegla);
    void db.reglasAceptacion.clear().then(() => db.reglasAceptacion.bulkPut(list));
    return list;
  }

  async upsertRegla(r: ReglaAceptacion): Promise<number> {
    const actualizadoPor = r.actualizadoPor || (await currentEmail());
    const actualizadoEn = new Date().toISOString();
    const payload = reglaPayload(r, r.dest, actualizadoEn, actualizadoPor);
    const { data, error } = await supabase
      .from('degasa_reglas_aceptacion')
      .upsert(payload, { onConflict: 'dest,material' })
      .select('local_id')
      .single();
    if (error) throw error;
    const id = data.local_id as number;
    await db.reglasAceptacion.put({ ...r, id, actualizadoEn, actualizadoPor });
    return id;
  }

  async upsertReglasBulk(dests: string[], r: Omit<ReglaAceptacion, 'id' | 'dest'>): Promise<void> {
    const actualizadoPor = r.actualizadoPor || (await currentEmail());
    const actualizadoEn = new Date().toISOString();
    const payload = dests.map((dest) => reglaPayload(r, dest, actualizadoEn, actualizadoPor));
    const { data, error } = await supabase
      .from('degasa_reglas_aceptacion')
      .upsert(payload, { onConflict: 'dest,material' })
      .select('local_id, dest');
    if (error) throw error;
    const rows: ReglaAceptacion[] = (data ?? []).map((row) => ({ ...r, id: row.local_id as number, dest: row.dest as string, actualizadoEn, actualizadoPor }));
    await db.reglasAceptacion.bulkPut(rows);
  }

  async removeRegla(id: number): Promise<void> {
    const { error } = await supabase.from('degasa_reglas_aceptacion').delete().eq('local_id', id);
    if (error) throw error;
    await db.reglasAceptacion.delete(id);
  }
}
