// ---------------------------------------------------------------------------
// facturacionLibros.ts · Facturación desde los LIBROS TRIMESTRALES de Drive ("1Q 2024", "2Q 2024"…) en lugar
// de las pestañas "Resumen_Fac" y "Fac_Mensual_CAM" del Sheet del reporte. Puro: sin red ni disco.
//
// Ambas pestañas son la SUMA por mes de las facturas de los libros (verificado contra el reporte: mismas
// cantidades e importes en 01/2024, 03/2024 y 09/2026). El Apps Script entrega filas ya agregadas por
// bloque (`fac_chunk`); aquí se unen y se arman las dos pestañas con los MISMOS encabezados que el reporte,
// así `buildAnalysisResult`, los mappers y todas las pantallas siguen igual.
// ---------------------------------------------------------------------------

import { correrSincrono } from '@/lib/tramos';
import { mapFacMensualCam, mapResumenFac } from './mappers';
import type { FacMensualCamRow, ResumenFacRow } from './types';

/** Fila agregada que entrega `fac_chunk`: [mes MM/AAAA, solicitante, razón social, destinatario, material,
 * texto, centro, almacén, gpoCte, gpoVdor, cantidad, importe]. */
export type FilaFac = [string, string, string, string, string, string, string, string, string, string, number, number, number?, number?, string?];
// Las tres últimas (opcionales): menor y mayor precio unitario de las LÍNEAS que se sumaron en la fila (0 = sin dato) y el día (aaaa-mm-dd) de la línea más
// reciente ('' = sin dato). Solo las trae el Apps Script nuevo.

export const COLUMNAS_FAC = ['Mes', 'Solicitante', 'Razon Social', 'Destinatario', 'Material', 'Texto Material', 'Centro', 'Almacen', 'Gpo. Cte.', 'Gpo. Vdor.', 'Cantidad', 'Importe'];
/** Columnas del Apps Script nuevo: las mismas más el precio mínimo y máximo de las líneas. */
export const COLUMNAS_FAC_PRECIOS = [...COLUMNAS_FAC, 'Precio Min', 'Precio Max'];
/** Columnas del Apps Script más nuevo: las anteriores más el día de la línea más reciente. */
export const COLUMNAS_FAC_FECHAS = [...COLUMNAS_FAC_PRECIOS, 'Fecha Max'];

/** Misma forma que `TabRows` del worker de análisis (encabezados + filas planas). */
export interface TabFac {
  headers: string[];
  rows: (string | number)[][];
  rowCount: number;
}

/** Renglones de los libros que venían SIN almacén y se les asignó uno por grupo de cliente (ver `almacenPorGrupoCliente`). */
export interface AlmacenesAsignados {
  renglones: number;
  /** Suma del importe absoluto de esos renglones. */
  importe: number;
}

export interface TabsFacturacion {
  resumenFac: TabFac;
  facMensualCam: TabFac;
  almacenesAsignados: AlmacenesAsignados;
}

/** Grupos de cliente ("Gpo. Cte." del catálogo) que fijan el almacén de una factura sin almacén. */
export const GPO_CTE_HOSPITALES = '19';
/** Gobierno "a secas" (el 34, Gobierno descentralizado, NO va al 1060: sale ~89 % del 1030). */
export const GPO_CTE_GOBIERNO = '18';

/** Almacén de una factura que viene sin almacén, según el grupo de cliente: Hospitales → 1031, Gobierno → 1060 y el resto → 1030.
 *  (Con datos reales esa regla coincide con el almacén informado en el 97.5 % de las facturas.) */
export function almacenPorGrupoCliente(gpoCte: string): string {
  const g = String(gpoCte ?? '').trim();
  if (g === GPO_CTE_GOBIERNO) return '1060';
  if (g === GPO_CTE_HOSPITALES) return '1031';
  return '1030';
}

const HEADERS_RESUMEN_FAC = ['Centro', 'Solicitante', 'Razón Social', 'Destinatario', 'Material', 'Texto de material', 'Mes y año', 'Cantidad facturada', 'Importe facturado', 'Gpo. Cte.', 'Gpo. Vdor.', 'Precio mín', 'Precio máx', 'Fecha máx'];
const HEADERS_FAC_MENSUAL_CAM = ['Centro', 'Almacén', 'Material', 'Texto de material', 'Periodo', 'Mes y año', 'Cantidad facturada', 'Importe facturado'];

/** Quita el ruido de punto flotante al sumar (4 decimales, como el resto de la app). */
const redondear = (n: number): number => Math.round(n * 10_000) / 10_000;

const esFilaFac = (f: unknown): f is FilaFac => Array.isArray(f) && f.length >= 12;

/** Valida y normaliza las filas de un bloque del Apps Script (cantidades como número, textos recortados). */
export function filasDeBloque(columnas: string[], rows: unknown[][]): FilaFac[] {
  const conFechas = columnas.length === COLUMNAS_FAC_FECHAS.length && COLUMNAS_FAC_FECHAS.every((c, i) => c === columnas[i]);
  const conPrecios = conFechas || (columnas.length === COLUMNAS_FAC_PRECIOS.length && COLUMNAS_FAC_PRECIOS.every((c, i) => c === columnas[i]));
  if (!conPrecios && (columnas.length !== COLUMNAS_FAC.length || columnas.some((c, i) => c !== COLUMNAS_FAC[i]))) {
    throw new Error(`Columnas inesperadas en la facturación (${columnas.join(', ')}) — ¿el Apps Script tiene desplegada la última versión? (ver docs/apps-script-pedidos.md)`);
  }
  return rows.filter(esFilaFac).map((f) => [
    String(f[0] ?? ''), String(f[1] ?? ''), String(f[2] ?? ''), String(f[3] ?? ''), String(f[4] ?? ''), String(f[5] ?? ''),
    String(f[6] ?? ''), String(f[7] ?? ''), String(f[8] ?? ''), String(f[9] ?? ''), Number(f[10]) || 0, Number(f[11]) || 0,
    ...(conPrecios ? [Number(f[12]) || 0, Number(f[13]) || 0] : []),
    ...(conFechas ? [String(f[14] ?? '')] : []),
  ] as FilaFac);
}

/** Une filas con la misma clave (mes + solicitante + razón + destinatario + material + texto + centro + almacén +
 * grupos) sumando cantidad e importe — para unir los bloques de un mismo libro. */
export function agregarFilas(filas: FilaFac[]): FilaFac[] {
  const mapa = new Map<string, FilaFac>();
  let conPrecios = false;
  let conFechas = false;
  for (const f of filas) {
    if (f.length > 12) conPrecios = true;
    if (f.length > 14) conFechas = true;
    const clave = f.slice(0, 10).join('¦');
    const previa = mapa.get(clave);
    if (previa) {
      previa[10] += f[10];
      previa[11] += f[11];
      previa[12] = menorPositivo(previa[12], f[12]);
      previa[13] = Math.max(previa[13] ?? 0, f[13] ?? 0);
      if ((f[14] ?? '') > (previa[14] ?? '')) previa[14] = f[14]; // aaaa-mm-dd compara bien como texto
    } else {
      mapa.set(clave, [...f] as FilaFac);
    }
  }
  return [...mapa.values()].map((f) => (conPrecios
    ? [...f.slice(0, 10), redondear(f[10]), redondear(f[11]), redondear(f[12] ?? 0), redondear(f[13] ?? 0), ...(conFechas ? [f[14] ?? ''] : [])]
    : [...f.slice(0, 10), redondear(f[10]), redondear(f[11])]) as unknown as FilaFac);
}

/** El menor de dos precios ignorando los 0 / ausentes (0 = sin dato). */
const menorPositivo = (a?: number, b?: number): number => (a && a > 0 ? (b && b > 0 ? Math.min(a, b) : a) : b && b > 0 ? b : 0);

const periodoDe = (mes: string): string => {
  const [mm, aaaa] = mes.split('/');
  return mm && aaaa ? `${aaaa}-${mm.padStart(2, '0')}-01T00:00:00.000Z` : '';
};

/** Arma `Resumen_Fac` (por mes + solicitante + destinatario + material + centro + grupos) y `Fac_Mensual_CAM`
 * (por mes + centro + almacén + material) a partir de los libros ya agregados. Las combinaciones que quedan en
 * cero neto (cantidad e importe) se omiten, como hace el reporte. */
export function* construirTabsFacturacionGen(libros: FilaFac[][]): Generator<number, TabsFacturacion> {
  let paso = 0;
  const total = libros.reduce((s, l) => s + l.length, 0) || 1;
  const rf = new Map<string, { f: FilaFac; cant: number; imp: number; pmin: number; pmax: number; fmax: string }>();
  const cam = new Map<string, { f: FilaFac; cant: number; imp: number }>();
  const asignados: AlmacenesAsignados = { renglones: 0, importe: 0 };

  for (const libro of libros) {
    for (const f of libro) {
      if ((++paso & 8191) === 0) yield paso / total;
      const [mes, solic, razon, dest, material, texto, centro, almacen, gpoCte, gpoVdor, cant, imp] = f;
      const kRf = [mes, solic, dest, material, centro, gpoCte, gpoVdor].join('¦');
      const a = rf.get(kRf);
      const pmin = f[12] ?? 0;
      const pmax = f[13] ?? 0;
      const fmax = f[14] ?? '';
      if (a) { a.cant += cant; a.imp += imp; a.pmin = menorPositivo(a.pmin, pmin); a.pmax = Math.max(a.pmax, pmax); if (fmax > a.fmax) a.fmax = fmax; if (!a.f[2] && razon) a.f[2] = razon; if (!a.f[5] && texto) a.f[5] = texto; }
      else rf.set(kRf, { f: [...f] as FilaFac, cant, imp, pmin, pmax, fmax });

      // Almacén en blanco → el que corresponde al grupo de cliente (las facturas con almacén, p. ej. 1032, se respetan).
      let alm = almacen.trim();
      if (!alm) {
        alm = almacenPorGrupoCliente(gpoCte);
        asignados.renglones++;
        asignados.importe += Math.abs(imp);
      }
      const kCam = [mes, centro, alm, material].join('¦');
      const b = cam.get(kCam);
      if (b) { b.cant += cant; b.imp += imp; if (!b.f[5] && texto) b.f[5] = texto; }
      else { const copia = [...f] as FilaFac; copia[7] = alm; cam.set(kCam, { f: copia, cant, imp }); }
    }
  }

  const noCero = ({ cant, imp }: { cant: number; imp: number }) => Math.round(cant * 100) !== 0 || Math.round(imp * 100) !== 0;
  const resumenRows = [...rf.values()].filter(noCero).map(({ f, cant, imp, pmin, pmax, fmax }) => [f[6], f[1], f[2], f[3], f[4], f[5], f[0], redondear(cant), redondear(imp), f[8], f[9], redondear(pmin), redondear(pmax), fmax]);
  const camRows = [...cam.values()].filter(noCero).map(({ f, cant, imp }) => [f[6], f[7], f[4], f[5], periodoDe(f[0]), f[0], redondear(cant), redondear(imp)]);

  return {
    resumenFac: { headers: HEADERS_RESUMEN_FAC, rows: resumenRows, rowCount: resumenRows.length },
    facMensualCam: { headers: HEADERS_FAC_MENSUAL_CAM, rows: camRows, rowCount: camRows.length },
    almacenesAsignados: { renglones: asignados.renglones, importe: Math.round(asignados.importe) },
  };
}

/** Resumen_Fac y Fac_Mensual_CAM a partir de los libros, de golpe (mismo resultado que `construirTabsFacturacionGen` por tramos). */
export function construirTabsFacturacion(libros: FilaFac[][]): TabsFacturacion {
  return correrSincrono(construirTabsFacturacionGen(libros));
}

/** Todo lo que el módulo Facturación guarda de los libros: Resumen_Fac, Fac_Mensual_CAM y cuántos almacenes en blanco se asignaron. */
export interface DatosFacturacion {
  resumenFac: ResumenFacRow[];
  /** Fac_Mensual_CAM armada con los libros (por mes + centro + almacén + material). */
  facMensualCam: FacMensualCamRow[];
  almacenesAsignados: AlmacenesAsignados;
}
/** Convierte las pestañas de los libros en `ResumenFacRow` y `FacMensualCamRow`, POR TRAMOS: arma cada fila con un
 * objeto literal (mucho más rápido que `Object.fromEntries`) y cede el paso al navegador cada ~4,000 filas. */
export function* datosFacturacionGen(tabs: TabsFacturacion): Generator<number, DatosFacturacion> {
  const rf = tabs.resumenFac.rows;
  const cam = tabs.facMensualCam.rows;
  const total = rf.length + cam.length || 1;
  const resumenFac: ResumenFacRow[] = [];
  let n = 0;
  for (const r of rf) {
    resumenFac.push(mapResumenFac({ 'Centro': r[0], 'Solicitante': r[1], 'Razón Social': r[2], 'Destinatario': r[3], 'Material': r[4], 'Texto de material': r[5], 'Mes y año': r[6], 'Cantidad facturada': r[7], 'Importe facturado': r[8], 'Gpo. Cte.': r[9], 'Gpo. Vdor.': r[10], 'Precio mín': r[11], 'Precio máx': r[12], 'Fecha máx': r[13] }));
    if ((++n & 4095) === 0) yield n / total;
  }
  const facMensualCam: FacMensualCamRow[] = [];
  for (const r of cam) {
    facMensualCam.push(mapFacMensualCam({ 'Centro': r[0], 'Almacén': r[1], 'Material': r[2], 'Texto de material': r[3], 'Periodo': r[4], 'Mes y año': r[5], 'Cantidad facturada': r[6], 'Importe facturado': r[7] }));
    if ((++n & 4095) === 0) yield n / total;
  }
  return { resumenFac, facMensualCam, almacenesAsignados: tabs.almacenesAsignados };
}

/** Identifica el ESTADO de la facturación cargada (qué libros, de qué fecha de Drive y de cuántas filas) más la versión del formato de lo
 * guardado. Si coincide, lo calculado en otra sesión (índices, consumo) sigue siendo válido y no hay que recalcularlo. */
export function firmaLibros(libros: readonly { nombre: string; modificado: string; filas: number; conPrecios?: boolean; conFechas?: boolean }[], esquema: number): string {
  return `${esquema}|${libros.map((l) => `${l.nombre}:${l.modificado}:${l.filas}${l.conPrecios ? ':p' : ''}${l.conFechas ? ':f' : ''}`).sort().join('|')}`;
}
