import { db } from './db';
import type { ClienteConocimientoRepository } from './ClienteConocimientoRepository';
import type { ClienteConocimiento, Observacion } from '@/core/types';

export class LocalClienteConocimientoRepository implements ClienteConocimientoRepository {
  async listClientes(): Promise<ClienteConocimiento[]> {
    const rows = await db.clientesConocimiento.toArray();
    // Normaliza registros anteriores a la fusión ficha=regla global.
    return rows.map((c) => ({ ...c, estadoMaterial: c.estadoMaterial ?? 'indistinto', activa: c.activa !== false }));
  }
  async upsertCliente(c: ClienteConocimiento): Promise<number> {
    const existing = await db.clientesConocimiento.where('dest').equals(c.dest).first();
    return (await db.clientesConocimiento.put({ ...c, id: existing?.id })) as number;
  }
  async listObservaciones(): Promise<Observacion[]> {
    return db.observaciones.orderBy('creadoEn').reverse().toArray();
  }
  async addObservacion(o: Observacion): Promise<number> {
    return (await db.observaciones.put(o)) as number;
  }
  async removeObservacion(id: number): Promise<void> {
    await db.observaciones.delete(id);
  }
}
