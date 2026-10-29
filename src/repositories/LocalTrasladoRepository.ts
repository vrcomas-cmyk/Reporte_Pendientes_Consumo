import { db } from './db';
import type { TrasladoRepository } from './TrasladoRepository';
import type { Traslado } from '@/core/types';

export class LocalTrasladoRepository implements TrasladoRepository {
  async listTraslados(): Promise<Traslado[]> {
    return db.traslados.orderBy('id').reverse().toArray();
  }
  async addTraslado(t: Traslado): Promise<number> {
    return (await db.traslados.put(t)) as number;
  }
  async updateTraslado(id: number, patch: Partial<Traslado>): Promise<void> {
    await db.traslados.update(id, patch);
  }
}
