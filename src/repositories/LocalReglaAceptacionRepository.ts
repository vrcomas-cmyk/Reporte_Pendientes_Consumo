import { db } from './db';
import type { ReglaAceptacionRepository } from './ReglaAceptacionRepository';
import type { ReglaAceptacion } from '@/core/types';

export class LocalReglaAceptacionRepository implements ReglaAceptacionRepository {
  async listReglas(): Promise<ReglaAceptacion[]> {
    return db.reglasAceptacion.toArray();
  }

  async upsertRegla(r: ReglaAceptacion): Promise<number> {
    const existing = await db.reglasAceptacion
      .where('dest').equals(r.dest)
      .filter((x) => (x.material ?? null) === (r.material ?? null))
      .first();
    return (await db.reglasAceptacion.put({ ...r, id: existing?.id })) as number;
  }

  async upsertReglasBulk(dests: string[], r: Omit<ReglaAceptacion, 'id' | 'dest'>): Promise<void> {
    for (const dest of dests) await this.upsertRegla({ ...r, dest });
  }

  async removeRegla(id: number): Promise<void> {
    await db.reglasAceptacion.delete(id);
  }
}
