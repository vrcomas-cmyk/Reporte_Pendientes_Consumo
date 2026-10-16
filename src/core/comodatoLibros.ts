// ---------------------------------------------------------------------------
// comodatoLibros.ts · Adaptadores (puros) del módulo "Comodato (libros)": convierten lo que ya tiene la app —el libro de Google Sheets de
// YBFD/ZBRE y la facturación de los libros de Drive— en las tablas que espera `SQL_Comodato_Libros.sql`.
// ---------------------------------------------------------------------------
import { normCode } from './enrich';
import type { ResumenFacRow } from './types';

/** Bolsas (consumibles) de `cfg_relacion_comodatos`: la facturación que cuenta para el comodato. */
export const CONSUMIBLES_COMODATO: readonly string[] = ['1330130', '1330310', '1330150', '1330350', '1330170', '1330380'];

/** Misma limpieza que hace el SQL con "Solicitante": sin espacios ni ".0" final. */
export const claveCliente = (v: unknown): string => String(v ?? '').trim().replace(/\.0$/, '');

export interface HojaTabular { columnas: readonly string[]; rows: readonly (readonly string[])[] }

/** Filas del libro como objetos con los encabezados tal cual (el SQL espera los nombres del export de SAP) y `''` → `null`
 * (el SQL filtra con `IS NOT NULL`). */
export function hojaAFilas(hoja: HojaTabular): Record<string, unknown>[] {
  return hoja.rows.map((r) => {
    const o: Record<string, unknown> = {};
    hoja.columnas.forEach((c, i) => { const v = r[i]; o[c] = v === undefined || v === '' ? null : v; });
    return o;
  });
}

/** Clientes (Solicitante) que aparecen en el libro de comodato. */
export function clientesDelLibro(hoja: HojaTabular): Set<string> {
  const i = hoja.columnas.findIndex((c) => c.trim().toLowerCase() === 'solicitante');
  const out = new Set<string>();
  if (i < 0) return out;
  for (const r of hoja.rows) { const c = claveCliente(r[i]); if (c) out.add(c); }
  return out;
}

/** Una fila de la tabla `facturacion` que lee `stg_facturacion`. */
export interface FilaFacturacionComodato {
  Solicitante: string;
  'Razón Social': string;
  Material: string;
  'Texto Material': string;
  Fecha: string;
  'Gpo. Vdor.': string;
  'Grp. Cliente': string;
  Factura: string;
  Cantidad: number;
  Importe: number;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "mm/aaaa" → "aaaa-mm-01". */
function primerDiaDelMes(mes: string): string {
  const [mm, aaaa] = mes.split('/');
  return mm && aaaa ? `${aaaa.trim()}-${mm.trim().padStart(2, '0')}-01` : '';
}

/** Facturación de los libros (ya agregada por mes) → filas de `facturacion`.
 *  · `Fecha` = el día de la línea más reciente del grupo mensual (`fechaMax`); sin ella, el día 1 del mes.
 *  · `Factura` = `mes|solicitante|material`: los libros no traen número de factura, así que `num_facturas` cuenta PEDIDOS-MES.
 *  Entran las filas de las bolsas del comodato (de cualquier cliente: así se detecta "factura sin comodato") y TODAS las de los clientes
 *  que están en el libro de comodato (para su zona y su grupo). */
export function resumenFacAFilasFacturacion(rows: readonly ResumenFacRow[], clientes: ReadonlySet<string>): FilaFacturacionComodato[] {
  const consumibles = new Set(CONSUMIBLES_COMODATO);
  const out: FilaFacturacionComodato[] = [];
  for (const r of rows) {
    const cliente = claveCliente(r.solicitante);
    const material = normCode(r.material);
    if (!cliente || !material) continue;
    if (!consumibles.has(material) && !clientes.has(cliente)) continue;
    const fecha = r.fechaMax && FECHA_ISO.test(r.fechaMax) ? r.fechaMax : primerDiaDelMes(r.mesAno);
    if (!fecha) continue;
    out.push({
      Solicitante: cliente,
      'Razón Social': r.razonSocial,
      Material: material,
      'Texto Material': r.textoMaterial,
      Fecha: fecha,
      'Gpo. Vdor.': r.gpoVdor,
      'Grp. Cliente': r.gpoCte,
      Factura: `${r.mesAno}|${cliente}|${material}`,
      Cantidad: r.cantidadFacturada,
      Importe: r.importeFacturado,
    });
  }
  return out;
}
