import { db } from './db';
import type { OfertaRepository } from './OfertaRepository';
import type { Oferta } from '@/core/types';

export class LocalOfertaRepository implements OfertaRepository {
  async listOfertas(): Promise<Oferta[]> {
    return db.ofertas.orderBy('fechaOferta').reverse().toArray();
  }
  async addOferta(o: Oferta): Promise<number> {
    return (await db.ofertas.put(o)) as number;
  }
  async updateOferta(id: number, patch: Partial<Oferta>): Promise<void> {
    await db.ofertas.update(id, patch);
  }
}
