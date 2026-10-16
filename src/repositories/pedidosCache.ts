import { db, type FuentePedidosRow, type PedidosCacheRow } from './db';

/** Caché local (IndexedDB) del módulo "Seg. de pedidos": las hojas crudas descargadas de Google Sheets
 * (`pedidosCache`, `id = "<libro>:<hoja>"`) y la última descarga de cada libro (`pedidosFuentes`).
 * Sirve para pintar al instante al abrir la app, sin volver a descargar. */

export const idHoja = (libro: string, hoja: string): string => `${libro}:${hoja}`;

export async function getAllCachedPedidos(): Promise<PedidosCacheRow[]> {
  return db.pedidosCache.toArray();
}

/** Reemplaza TODAS las hojas de un libro por las nuevas (borra las anteriores, aunque ya no existan). */
export async function reemplazarHojasDeLibro(libro: string, filas: PedidosCacheRow[]): Promise<void> {
  await db.transaction('rw', db.pedidosCache, async () => {
    const previas = (await db.pedidosCache.toArray()).filter((r) => r.libro === libro).map((r) => r.id);
    await db.pedidosCache.bulkDelete(previas);
    await db.pedidosCache.bulkPut(filas);
  });
}

export async function clearCachedPedidos(): Promise<void> {
  await db.pedidosCache.clear();
}

export async function getFuentesPedidos(): Promise<FuentePedidosRow[]> {
  return db.pedidosFuentes.toArray();
}

export async function putFuentePedidos(row: FuentePedidosRow): Promise<void> {
  await db.pedidosFuentes.put(row);
}
