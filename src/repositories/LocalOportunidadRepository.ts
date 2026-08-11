import { db } from './db';
import type { OportunidadRepository } from './OportunidadRepository';
import type { Oportunidad, Interaccion } from '@/core/types';

/** Backend 100% local (Dexie) — usado como caché/fallback offline por
 * SupabaseOportunidadRepository, y directamente si no hay sesión Supabase. */
export class LocalOportunidadRepository implements OportunidadRepository {
  async listOportunidades(): Promise<Oportunidad[]> {
    return db.oportunidades.orderBy('creadaEn').reverse().toArray();
  }
  async addOportunidad(o: Oportunidad): Promise<number> {
    return (await db.oportunidades.put(o)) as number;
  }
  async updateOportunidad(id: number, patch: Partial<Oportunidad>): Promise<void> {
    await db.oportunidades.update(id, patch);
  }
  async listInteracciones(): Promise<Interaccion[]> {
    return db.interacciones.orderBy('fecha').reverse().toArray();
  }
  async addInteraccion(i: Interaccion): Promise<number> {
    return (await db.interacciones.put(i)) as number;
  }
}
