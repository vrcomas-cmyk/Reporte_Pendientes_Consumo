// ---------------------------------------------------------------------------
// ajusteCaducidad.ts · Correcciones manuales de la fecha de caducidad de un lote. Puro: sin React, sin red.
// El sistema a veces trae una caducidad equivocada; el usuario la corrige por MATERIAL + LOTE y la corrección se
// respalda en una hoja de Google Sheets (`Ajustes_Caducidad`) y se vuelve a aplicar cada vez que ese lote aparece.
// ---------------------------------------------------------------------------
import { claveMaterial } from './pedidos';

/** Un ajuste guardado (una fila de la hoja de respaldo). */
export interface AjusteCaducidad {
  material: string;
  lote: string;
  /** `aaaa-mm-dd`: la caducidad correcta. */
  fecha: string;
  /** Lo que decía el sistema cuando se ajustó (`aaaa-mm-dd` o ''). */
  sistema: string;
  usuario: string;
  /** `aaaa-mm-dd hh:mm` en que se guardó. */
  actualizado: string;
  nota: string;
}

/** Clave de un ajuste: material (sin ceros a la izquierda) + lote en mayúsculas. Independiente de centro/almacén. */
export const claveAjuste = (material: string, lote: string): string =>
  `${claveMaterial(material)}|${String(lote ?? '').trim().toUpperCase()}`;

/** `aaaa-mm-dd` válido (fecha real), o null. */
export function fechaIsoValida(v: unknown): string | null {
  const m = String(v ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(y, mo - 1, d);
  if (f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** `aaaa-mm-dd` → Date en hora local (sin que el huso mueva el día). */
export function fechaLocalDeIso(iso: string): Date | null {
  const v = fechaIsoValida(iso);
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export type BuscarAjuste = (material: string, lote: string) => AjusteCaducidad | undefined;

/** Construye el buscador a partir de la lista de ajustes (el último de cada clave gana). */
export function indexarAjustes(lista: readonly AjusteCaducidad[]): BuscarAjuste {
  const mapa = new Map<string, AjusteCaducidad>();
  for (const a of lista) if (fechaIsoValida(a.fecha)) mapa.set(claveAjuste(a.material, a.lote), a);
  return (material, lote) => mapa.get(claveAjuste(material, lote));
}

/** Aplica un ajuste a un objeto con `fechaCaducidad`: devuelve el mismo objeto si no hay ajuste. */
export function aplicarAjusteCaducidad<T extends { material: string; lote: string; fechaCaducidad: string | null }>(
  fila: T,
  buscar: BuscarAjuste | undefined,
): T & { caducidadAjustada?: boolean; caducidadSistema?: string | null } {
  const a = buscar?.(fila.material, fila.lote);
  if (!a) return fila;
  return { ...fila, fechaCaducidad: a.fecha, caducidadAjustada: true, caducidadSistema: fila.fechaCaducidad };
}
