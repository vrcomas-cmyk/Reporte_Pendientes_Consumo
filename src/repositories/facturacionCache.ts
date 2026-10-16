import type { AlmacenesAsignados } from '@/core/facturacionLibros';
import type { RFIndex } from '@/core/resumenFac';
import type { ConsumoRow, FacMensualCamRow, ResumenFacRow } from '@/core/types';
import { db, type FacturacionLibroRow, type FacturacionMetaRow } from './db';

/** Caché local (IndexedDB) de la facturación por libro trimestral: cada libro ya agregado, con la
 * `ultimaModificacion` con la que se descargó. Un libro solo se vuelve a bajar si cambió en Drive. */

export async function getLibrosFacturacion(): Promise<FacturacionLibroRow[]> {
  return db.facturacionLibros.toArray();
}

export async function putLibroFacturacion(row: FacturacionLibroRow): Promise<void> {
  await db.transaction('rw', db.facturacionLibros, db.facturacionMeta, async () => {
    await db.facturacionLibros.put(row);
    await db.facturacionMeta.put({ id: row.id, nombre: row.nombre, orden: row.orden, ultimaModificacion: row.ultimaModificacion, filas: row.rows.length, conPrecios: (row.rows[0]?.length ?? 0) > 12, conFechas: (row.rows[0]?.length ?? 0) > 14 });
  });
}

export async function deleteLibrosFacturacion(ids: string[]): Promise<void> {
  await db.transaction('rw', db.facturacionLibros, db.facturacionMeta, async () => {
    await db.facturacionLibros.bulkDelete(ids);
    await db.facturacionMeta.bulkDelete(ids);
  });
}

/** Un libro guardado (con sus filas), o undefined si no está. */
export async function getLibroFacturacion(id: string): Promise<FacturacionLibroRow | undefined> {
  return db.facturacionLibros.get(id);
}

/** Metadatos de los libros guardados SIN leer sus filas. Si la caché es anterior a la tabla de metadatos (o algún libro quedó sin
 * ella) se completa leyendo ese libro una sola vez. */
export async function getMetaLibrosFacturacion(): Promise<FacturacionMetaRow[]> {
  const [ids, metas] = await Promise.all([getIdsLibrosFacturacion(), db.facturacionMeta.toArray()]);
  const porId = new Map(metas.map((m) => [m.id, m]));
  const huerfanas = metas.filter((m) => !ids.includes(m.id)).map((m) => m.id);
  if (huerfanas.length > 0) await db.facturacionMeta.bulkDelete(huerfanas);
  const out: FacturacionMetaRow[] = [];
  for (const id of ids) {
    let m = porId.get(id);
    if (!m) {
      const fila = await db.facturacionLibros.get(id);
      if (!fila) continue;
      m = { id: fila.id, nombre: fila.nombre, orden: fila.orden, ultimaModificacion: fila.ultimaModificacion, filas: fila.rows.length, conPrecios: (fila.rows[0]?.length ?? 0) > 12, conFechas: (fila.rows[0]?.length ?? 0) > 14 };
      await db.facturacionMeta.put(m);
    }
    out.push(m);
  }
  return out;
}

/** Ids de los libros guardados (sin leer sus filas). */
export async function getIdsLibrosFacturacion(): Promise<string[]> {
  return (await db.facturacionLibros.toCollection().primaryKeys()) as string[];
}

/** Lee los libros guardados DE A UNO (cada lectura es asíncrona): no se deserializa todo de golpe en el hilo principal y la pantalla
 * sigue respondiendo entre libro y libro. */
export async function getLibrosFacturacionDeAUno(): Promise<FacturacionLibroRow[]> {
  const out: FacturacionLibroRow[] = [];
  for (const id of await getIdsLibrosFacturacion()) {
    const fila = await db.facturacionLibros.get(id);
    if (fila) out.push(fila);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Derivados: lo YA CALCULADO de la facturación (índices rf, consumo, filas). Recalcularlo cuesta ~10 s por sesión; leerlo, ~2 s.
// Se invalida solo: la `firma` incluye los libros y su fecha de Drive, y `FAC_DERIVADOS_ESQUEMA` la versión del formato.
// ---------------------------------------------------------------------------

/** Subir cuando cambie la forma de `RFIndex`, `ConsumoRow` o `ResumenFacRow`: lo guardado con otro esquema se ignora. */
export const FAC_DERIVADOS_ESQUEMA = 3; // 2: ResumenFacRow trae precioMin / precioMax · 3: y fechaMax
/** Filas por registro: así leer/escribir cede el paso al navegador entre un registro y otro. */
const FILAS_POR_REGISTRO = 40_000;

export interface DerivadosFac {
  firma: string;
  resumenFac: ResumenFacRow[];
  facMensualCam: FacMensualCamRow[];
  almacenesAsignados: AlmacenesAsignados;
  /** Índices de Resumen_Fac; `rows` se guarda vacío (son `resumenFac`) y al leer se vuelve a poner. */
  rf: RFIndex;
  consumo: ConsumoRow[];
}

interface MetaDerivados { firma: string; esquema: number; registros: number; almacenesAsignados: AlmacenesAsignados }

/** Guarda los derivados. `meta` va al FINAL: si se corta a la mitad no queda un conjunto que parezca completo. */
export async function guardarDerivadosFac(d: DerivadosFac): Promise<void> {
  await db.facDerivados.clear();
  await db.facDerivados.put({ id: 'rf', datos: { ...d.rf, rows: [] } });
  await db.facDerivados.put({ id: 'consumo', datos: d.consumo });
  await db.facDerivados.put({ id: 'cam', datos: d.facMensualCam });
  const registros = Math.ceil(d.resumenFac.length / FILAS_POR_REGISTRO);
  for (let i = 0; i < registros; i++) {
    await db.facDerivados.put({ id: `rows:${i}`, datos: d.resumenFac.slice(i * FILAS_POR_REGISTRO, (i + 1) * FILAS_POR_REGISTRO) });
  }
  const meta: MetaDerivados = { firma: d.firma, esquema: FAC_DERIVADOS_ESQUEMA, registros, almacenesAsignados: d.almacenesAsignados };
  await db.facDerivados.put({ id: 'meta', datos: meta });
}

/** Lee los derivados si siguen vigentes (misma `firma` y esquema); `null` si no hay, están viejos o incompletos. */
export async function leerDerivadosFac(firma: string): Promise<DerivadosFac | null> {
  const meta = (await db.facDerivados.get('meta'))?.datos as MetaDerivados | undefined;
  if (!meta || meta.esquema !== FAC_DERIVADOS_ESQUEMA || meta.firma !== firma) return null;
  const rfGuardado = (await db.facDerivados.get('rf'))?.datos as RFIndex | undefined;
  const consumo = (await db.facDerivados.get('consumo'))?.datos as ConsumoRow[] | undefined;
  const facMensualCam = (await db.facDerivados.get('cam'))?.datos as FacMensualCamRow[] | undefined;
  if (!rfGuardado || !consumo || !facMensualCam) return null;
  const resumenFac: ResumenFacRow[] = [];
  for (let i = 0; i < meta.registros; i++) {
    const trozo = (await db.facDerivados.get(`rows:${i}`))?.datos as ResumenFacRow[] | undefined;
    if (!trozo) return null;
    for (const r of trozo) resumenFac.push(r);
  }
  return { firma, resumenFac, facMensualCam, almacenesAsignados: meta.almacenesAsignados, rf: { ...rfGuardado, rows: resumenFac }, consumo };
}

export async function borrarDerivadosFac(): Promise<void> {
  await db.facDerivados.clear();
}
