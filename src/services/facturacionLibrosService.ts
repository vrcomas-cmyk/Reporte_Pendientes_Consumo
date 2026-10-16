// ---------------------------------------------------------------------------
// facturacionLibrosService.ts · Facturación desde los LIBROS TRIMESTRALES de Drive ("1Q 2024", "2Q 2024"…)
// en lugar de las pestañas "Resumen_Fac" y "Fac_Mensual_CAM" del Sheet del reporte (ver
// core/facturacionLibros.ts). Usa el mismo Apps Script de "Seg. de pedidos" (acciones `fac_manifest` y
// `fac_chunk`, docs/apps-script-pedidos.md): si no hay URL configurada, el sync del reporte sigue leyendo las
// pestañas de siempre.
//
// Cada libro se baja por bloques de 5,000 filas (el script ya las agrega), se une en el cliente y se guarda en
// IndexedDB (`facturacionLibros`): un libro solo se vuelve a descargar si su `ultimaModificacion` en Drive
// cambió — los trimestres viejos no cambian, así que el sync diario solo trae el trimestre en curso.
// ---------------------------------------------------------------------------
import { agregarFilas, construirTabsFacturacionGen, datosFacturacionGen, filasDeBloque, firmaLibros, type FilaFac, type TabFac, type TabsFacturacion } from '@/core/facturacionLibros';
import { mapFacMensualCam, mapResumenFac } from '@/core/mappers';
import type { FacMensualCamRow, ResumenFacRow } from '@/core/types';
import type { DatosFacturacion } from '@/core/facturacionLibros';
import { useFacturacionStore, type InfoLibroFac } from '@/store/facturacionStore';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { logInfo, logWarn } from '@/lib/logError';
import { FAC_DERIVADOS_ESQUEMA, deleteLibrosFacturacion, getLibroFacturacion, getLibrosFacturacionDeAUno, getMetaLibrosFacturacion, guardarDerivadosFac, leerDerivadosFac, putLibroFacturacion } from '@/repositories/facturacionCache';
import type { RFIndex } from '@/core/resumenFac';
import type { ConsumoRow } from '@/core/types';
import type { FacturacionMetaRow } from '@/repositories/db';
import { correrPorTramos } from '@/lib/tramos';
import { explicarFalla, pedidosConfigurado, requireUrl, withRetries } from '@/services/pedidosService';
import { limitadorAppsScript } from '@/lib/limitador';

// La primera vez el script abre cada libro para contar filas y detectar el formato de fecha (luego queda guardado).
const MANIFEST_TIMEOUT_MS = 180_000;
const CHUNK_TIMEOUT_MS = 150_000;

interface LibroManifiesto {
  id: string;
  nombre: string;
  periodo: string;
  orden: number;
  ultimaModificacion: string;
  totalRows: number;
  chunkSize?: number;
  /** El Apps Script ya entrega el precio mínimo / máximo de las líneas de cada fila. */
  conPrecios?: boolean;
  /** El Apps Script ya entrega el día de la línea más reciente de cada fila. */
  conFechas?: boolean;
}

/** True si la facturación se lee de los libros (hay URL del Apps Script configurada); si no, se usan las pestañas del reporte. */
export async function facturacionLibrosActiva(): Promise<boolean> {
  return pedidosConfigurado();
}

function errorDeScript(data: unknown): string | null {
  if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === false) {
    return String((data as { error?: unknown }).error ?? 'Error desconocido del Apps Script.');
  }
  return null;
}

async function fetchManifiesto(): Promise<LibroManifiesto[]> {
  const url = `${await requireUrl()}?action=fac_manifest`;
  return withRetries('facturación: libros', async () => {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-store' }, MANIFEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status} al consultar los libros de facturación.`);
      const data: unknown = await res.json();
      const err = errorDeScript(data);
      if (err) throw new Error(err);
      const libros = (data as { libros?: unknown } | null)?.libros;
      if (!Array.isArray(libros)) {
        throw new Error('Formato de respuesta inesperado en los libros de facturación — ¿el Apps Script tiene desplegada la última versión? (ver docs/apps-script-pedidos.md)');
      }
      return libros as LibroManifiesto[];
    } catch (e) {
      throw explicarFalla(e);
    }
  });
}

async function fetchBloque(libro: LibroManifiesto, offset: number, limit: number): Promise<FilaFac[]> {
  // `v` (ms de la última modificación) le permite al script saltarse consultas a Drive en cada bloque.
  const params = new URLSearchParams({ action: 'fac_chunk', fileId: libro.id, offset: String(offset), limit: String(limit), v: String(new Date(libro.ultimaModificacion).getTime() || 0) });
  const url = `${await requireUrl()}?${params.toString()}`;
  return withRetries(`facturación ${libro.periodo} offset=${offset}`, () => limitadorAppsScript(async () => {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-store' }, CHUNK_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status} al leer el libro ${libro.nombre}.`);
      const data: unknown = await res.json();
      const err = errorDeScript(data);
      if (err) throw new Error(err);
      const { columnas, rows } = (data ?? {}) as { columnas?: unknown; rows?: unknown };
      if (!Array.isArray(columnas) || !Array.isArray(rows)) {
        throw new Error(`Formato de respuesta inesperado en ${libro.nombre} — ¿el Apps Script tiene desplegada la última versión? (ver docs/apps-script-pedidos.md)`);
      }
      return filasDeBloque(columnas.map(String), rows as unknown[][]);
    } catch (e) {
      throw explicarFalla(e);
    }
  }));
}

interface EstadoLibro {
  libro: LibroManifiesto;
  limit: number;
  bloques: FilaFac[][];
  error: Error | null;
}

let infoUltima: InfoLibroFac[] = [];
let enCurso: Promise<TabsFacturacion> | null = null;
let ultimo: { at: number; tabs: TabsFacturacion } | null = null;
/** Dos pestañas (Resumen_Fac y Fac_Mensual_CAM) piden lo mismo en el mismo sync: se reutiliza el resultado reciente. */
const VIGENCIA_MS = 2 * 60_000;

/** Baja (o toma de la caché) los libros trimestrales y arma las dos pestañas de facturación.
 * `onProgress(mensaje, fracción 0-1)` reporta el avance de la descarga. */
export function cargarFacturacionLibros(onProgress?: (mensaje: string, fraccion: number) => void): Promise<TabsFacturacion> {
  if (ultimo && Date.now() - ultimo.at < VIGENCIA_MS) return Promise.resolve(ultimo.tabs);
  if (!enCurso) {
    enCurso = descargar(onProgress)
      .then((tabs) => {
        if (!tabs) throw new Error('Los libros de facturación no devolvieron datos.');
        ultimo = { at: Date.now(), tabs };
        return tabs;
      })
      .finally(() => {
        enCurso = null;
      });
  }
  return enCurso;
}

interface OpcionesDescarga {
  /** Si ningún libro cambió respecto de lo que ya está cargado en el store, devuelve null (no se arma nada ni se recalcula nada). */
  soloSiCambio?: boolean;
  /** Vuelve a bajar TODOS los libros. La caché anterior se conserva hasta que cada libro nuevo baja completo (no se borra antes). */
  forzar?: boolean;
}

async function descargar(onProgress?: (mensaje: string, fraccion: number) => void, { soloSiCambio = false, forzar = false }: OpcionesDescarga = {}): Promise<TabsFacturacion | null> {
  const manifiesto = (await fetchManifiesto()).sort((a, b) => a.orden - b.orden);
  if (manifiesto.length === 0) throw new Error('No hay libros de facturación en la carpeta de Drive.');

  // Solo metadatos (id, fecha de modificación, nº de filas): no se deserializan las ~500 mil filas para saber qué cambió.
  const metas = await getMetaLibrosFacturacion();
  const vigentes = new Set(manifiesto.map((l) => l.id));
  const obsoletos = metas.filter((g) => !vigentes.has(g.id)).map((g) => g.id);
  if (obsoletos.length > 0) await deleteLibrosFacturacion(obsoletos).catch(() => {});

  const porId = new Map<string, FacturacionMetaRow>(metas.filter((g) => vigentes.has(g.id)).map((g) => [g.id, g]));
  const descargados = new Map<string, FilaFac[]>();
  const pendientes: EstadoLibro[] = manifiesto
    // También se rebaja un libro que se guardó sin precios si el script ya los entrega (si no, el mínimo / máximo seguiría siendo aproximado).
    .filter((l) => forzar || porId.get(l.id)?.ultimaModificacion !== l.ultimaModificacion || (!!l.conPrecios && !porId.get(l.id)?.conPrecios) || (!!l.conFechas && !porId.get(l.id)?.conFechas))
    // Los libros más grandes primero: los bloques se encolan en este orden y así no queda uno largo al final.
    .sort((a, b) => b.totalRows - a.totalRows)
    .map((libro) => ({ libro, limit: libro.chunkSize || 5_000, bloques: [], error: null }));

  const offsetsDe = (estado: EstadoLibro): number[] => {
    const total = Math.max(estado.libro.totalRows, 1);
    const offsets: number[] = [];
    for (let o = 0; o < total; o += estado.limit) offsets.push(o);
    return offsets;
  };
  const totalBloques = pendientes.reduce((s, e) => s + offsetsDe(e).length, 0);
  let hechas = 0;
  const fallidos: string[] = [];

  // Todos los libros pendientes (y todos sus bloques) se piden a la vez: el limitador global marca el ritmo y reparte los
  // lugares con las demás descargas. Cada libro se une y se guarda en cuanto baja su último bloque, sin esperar a los demás.
  await Promise.all(pendientes.map(async (estado) => {
    const { libro } = estado;
    const offsets = offsetsDe(estado);
    estado.bloques = new Array<FilaFac[]>(offsets.length);
    await Promise.all(offsets.map(async (offset, indice) => {
      if (estado.error) return;
      try {
        estado.bloques[indice] = await fetchBloque(libro, offset, estado.limit);
      } catch (e) {
        estado.error = e instanceof Error ? e : new Error(String(e));
      }
      hechas++;
      onProgress?.(`Facturación ${libro.periodo}: bloque ${hechas} de ${totalBloques}`, totalBloques ? hechas / totalBloques : 1);
    }));

    const previo = porId.get(libro.id);
    if (estado.error) {
      // Convención del repo: sin descarga completa se conserva lo anterior; sin nada anterior, el total sería incompleto.
      // Con "forzar" el usuario pidió datos nuevos: un libro que falla se avisa en vez de sustituirlo en silencio por la copia vieja.
      if (!previo || forzar) throw new Error(`No se pudo leer el libro ${libro.nombre} y no hay copia anterior: ${estado.error.message}`);
      fallidos.push(`${libro.nombre}: ${estado.error.message}`);
      return;
    }
    const rows = agregarFilas(estado.bloques.flat());
    const fila = { id: libro.id, nombre: libro.nombre, orden: libro.orden, ultimaModificacion: libro.ultimaModificacion, rows };
    descargados.set(libro.id, rows);
    porId.set(libro.id, { id: libro.id, nombre: libro.nombre, orden: libro.orden, ultimaModificacion: libro.ultimaModificacion, filas: rows.length, conPrecios: (rows[0]?.length ?? 0) > 12, conFechas: (rows[0]?.length ?? 0) > 14 });
    // La caché es secundaria: si falla (cuota), el libro igual se usa en esta sesión.
    await putLibroFacturacion(fila).catch((e) => logWarn('facturacion-cache-put', e instanceof Error ? e.message : String(e)));
  }));
  if (fallidos.length > 0) void logWarn('facturacion-libros-parcial', `Se usó la copia anterior de: ${fallidos.join(' | ')}`);
  if (pendientes.length > 0) void logInfo('facturacion-libros', `${pendientes.length} libro(s) descargados de ${manifiesto.length}`);

  infoUltima = manifiesto.map((l) => ({ nombre: l.nombre, filas: porId.get(l.id)?.filas ?? 0, modificado: l.ultimaModificacion, conPrecios: !!porId.get(l.id)?.conPrecios, conFechas: !!porId.get(l.id)?.conFechas }));
  if (soloSiCambio) {
    // ¿Lo que hay cargado en el store ya es esto mismo? (el sync del reporte también guarda libros en la caché sin pasar por el store)
    const enStore = new Map(useFacturacionStore.getState().libros.map((x) => [x.nombre, x.modificado]));
    const igual = manifiesto.every((l) => enStore.get(l.nombre) === l.ultimaModificacion || (fallidos.length > 0 && fallidos.some((f) => f.startsWith(l.nombre + ':'))));
    if (igual && pendientes.length === fallidos.length) return null;
  }

  onProgress?.('Uniendo libros de facturación…', 1);
  // Los libros que no se bajaron ahora se leen de la caché de uno en uno (la pantalla sigue respondiendo entre libro y libro).
  const libros: FilaFac[][] = [];
  for (const l of manifiesto) libros.push(descargados.get(l.id) ?? (await getLibroFacturacion(l.id))?.rows ?? []);
  // Se une por tramos cortos: con todo el historial son cientos de miles de filas y de golpe trabaría la pantalla.
  const tabs = await correrPorTramos(construirTabsFacturacionGen(libros), { onProgreso: (f) => onProgress?.('Uniendo libros de facturación…', f) });
  if (!tabs) throw new Error('Se canceló la unión de los libros de facturación.');
  return tabs;
}

// ---------------------------------------------------------------------------
// Módulo "Facturación": su propia carga desde la carpeta de Drive, independiente del reporte diario.
// ---------------------------------------------------------------------------

/** Filas de una pestaña de los libros → `ResumenFacRow` (mismo mapper que usa el reporte). */
export function filasResumenFacDeTab(tab: TabFac): ResumenFacRow[] {
  return tab.rows.map((r) => mapResumenFac(Object.fromEntries(tab.headers.map((h, i) => [h, r[i]]))));
}

/** Filas de Fac_Mensual_CAM de los libros → `FacMensualCamRow` (mismo mapper que usa el reporte). */
export function filasFacMensualDeTab(tab: TabFac): FacMensualCamRow[] {
  return tab.rows.map((r) => mapFacMensualCam(Object.fromEntries(tab.headers.map((h, i) => [h, r[i]]))));
}

/** Igual que `datosFacturacionGen`, pero cediendo el paso (la pantalla sigue respondiendo). */
export async function datosFacturacionDeTabs(tabs: TabsFacturacion): Promise<DatosFacturacion> {
  const datos = await correrPorTramos(datosFacturacionGen(tabs));
  if (!datos) throw new Error('Se canceló el armado de los datos de facturación.');
  return datos;
}

/** Restaura de la caché local (IndexedDB), sin red, lo último descargado de los libros. */
export async function restaurarFacturacion(): Promise<void> {
  const store = useFacturacionStore.getState();
  try {
    // Camino rápido: si lo YA CALCULADO (índices, consumo, filas) sigue vigente —mismos libros, misma fecha de Drive—, se lee tal cual y
    // no se recalcula nada (leerlo ~2 s; recalcularlo ~10 s). Cualquier cambio de un libro invalida la firma.
    const metas = (await getMetaLibrosFacturacion()).sort((a, b) => a.orden - b.orden);
    const infos: InfoLibroFac[] = metas.map((m) => ({ nombre: m.nombre, filas: m.filas, modificado: m.ultimaModificacion, conPrecios: !!m.conPrecios, conFechas: !!m.conFechas }));
    if (metas.length > 0) {
      const der = await leerDerivadosFac(firmaLibros(infos, FAC_DERIVADOS_ESQUEMA)).catch(() => null);
      if (der) {
        if (useFacturacionStore.getState().resumenFac?.length) { useFacturacionStore.setState({ hidratado: true }); return; }
        store.restaurar({ resumenFac: der.resumenFac, facMensualCam: der.facMensualCam, almacenesAsignados: der.almacenesAsignados }, infos, { filas: der.resumenFac, rf: der.rf, consumo: der.consumo });
        return;
      }
    }
    const guardados = (await getLibrosFacturacionDeAUno()).sort((a, b) => a.orden - b.orden);
    if (guardados.length === 0) {
      store.restaurar(null, []);
      return;
    }
    const tabs = await correrPorTramos(construirTabsFacturacionGen(guardados.map((g) => g.rows)));
    if (!tabs) return;
    const datos = await datosFacturacionDeTabs(tabs);
    // Si mientras tanto un sync ya dejó datos más nuevos en el store, la caché (más vieja) no los pisa.
    if (useFacturacionStore.getState().resumenFac?.length) {
      useFacturacionStore.setState({ hidratado: true });
      return;
    }
    store.restaurar(datos, guardados.map((g) => ({ nombre: g.nombre, filas: g.rows.length, modificado: g.ultimaModificacion })));
  } catch (e) {
    void logWarn('facturacion-restore', e instanceof Error ? e.message : String(e));
    store.restaurar(null, []);
  }
}

/** Guarda en la caché local lo que se acaba de calcular (índices rf y consumo) para que la próxima sesión lo lea en vez de recalcularlo.
 * Solo si `filas` sigue siendo lo cargado en el store (si llegó un sync nuevo mientras se calculaba, ya no corresponde). */
export async function persistirDerivadosFacturacion(filas: ResumenFacRow[], rf: RFIndex, consumo: ConsumoRow[]): Promise<void> {
  const st = useFacturacionStore.getState();
  if (!filas.length || st.resumenFac !== filas || st.libros.length === 0) return;
  try {
    await guardarDerivadosFac({
      firma: firmaLibros(st.libros, FAC_DERIVADOS_ESQUEMA),
      resumenFac: filas,
      facMensualCam: st.facMensualCam ?? [],
      almacenesAsignados: st.almacenesAsignados,
      rf,
      consumo,
    });
  } catch (e) {
    void logWarn('facturacion-derivados-put', e instanceof Error ? e.message : String(e));
  }
}

export interface ResultadoSyncFacturacion {
  /** Libros que existen en la carpeta. */
  libros: number;
}

/** Sincroniza la facturación desde la carpeta de Drive. Primera vez (sin caché) baja TODOS los libros; después solo
 * los que cambiaron (`ultimaModificacion`). `forzar` vuelve a bajar todo (la caché anterior se reemplaza libro por libro, no se borra antes). */
export async function syncFacturacion({ forzar = false }: { forzar?: boolean } = {}): Promise<ResultadoSyncFacturacion> {
  const store = useFacturacionStore.getState();
  if (store.syncing) return { libros: store.libros.length };
  store.start();
  try {
    if (forzar) ultimo = null;
    const alProgreso = (mensaje: string, fraccion: number) => useFacturacionStore.getState().setProgress(mensaje, Math.round(5 + 90 * fraccion));
    // Con datos ya cargados, solo se rearma todo si algún libro cambió en Drive; si no, el store queda con la misma referencia
    // (nada se vuelve a calcular). "Forzar" baja todo de nuevo SIN borrar la caché antes: si falla, la anterior sigue ahí.
    const hayDatos = (store.resumenFac?.length ?? 0) > 0;
    const tabs = forzar || hayDatos ? await descargar(alProgreso, { soloSiCambio: hayDatos && !forzar, forzar }) : await cargarFacturacionLibros(alProgreso);
    if (!tabs) {
      useFacturacionStore.getState().revisado(infoUltima);
      return { libros: infoUltima.length };
    }
    useFacturacionStore.getState().completar(await datosFacturacionDeTabs(tabs), infoUltima);
    return { libros: infoUltima.length };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    useFacturacionStore.getState().fallar(mensaje);
    throw e;
  }
}
