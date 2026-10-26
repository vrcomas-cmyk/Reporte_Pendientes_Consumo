// ---------------------------------------------------------------------------
// enrich.ts · One-time indexed joins between the sync catalog and the daily
// report. Ported from legacy js/enrich.js. All joins are pre-computed into Maps
// so lookups are O(1) even across ~300k report rows (no per-row rescanning).
//   - Grupo cliente:  Gpo. Cte. (code)      -> "Grupo Cliente" (text)
//   - Ejecutivo:      Gpo.Vdor. / Cod Of Vtas -> Ejecutivo (name)
//   - Sector/Grupo art.: Material (code)    -> Descr. Sector / Descr. Grupo Art.
// ---------------------------------------------------------------------------
import type { CatalogSnapshot, InvConsolidadoRow } from './types';
import { norm } from '@/lib/text';
import { SIN_PRECIOS_AUTORIZADOS, type PreciosAutorizados } from './precioAutorizado';

/** Etiqueta visible de una combinación del módulo Precios ('CC + Lento mov + PNC' → 'Corta caducidad + Lento mov + PNC'). */
export const etiquetaCombinacion = (comb: string): string => comb.split(' + ').map((b) => (b === 'CC' ? 'Corta caducidad' : b)).join(' + ');

/** Recolecta cada par distinto (condicion, precio oferta) para `material` desde InvConsolidado/Inventario por condicion.
 * Si el módulo Precios tiene un precio AUTORIZADO para esa condición (con las MISMAS condiciones de Precios: ver `core/precioAutorizado.ts`) sustituye
 * al de la hoja; los autorizados cuya combinación no trae ninguna fila de la hoja se agregan al final (sin inventario). */
export function preciosPorCondicion(
  material: string,
  invConsolidadoCatalog: InvConsolidadoRow[],
  invCondicion: InvConsolidadoRow[],
  autorizados: PreciosAutorizados = SIN_PRECIOS_AUTORIZADOS,
  /** Con `true` el precio de cada fila es SOLO el autorizado en Precios para esa condición exacta (0 si no hay): el precio viejo de la hoja es de nivel
   * material y revolvería las condiciones. */
  soloAutorizados = false,
): { condicion: string; precio: number; inv: number }[] {
  const precioSource = invConsolidadoCatalog.some((r) => norm(r.material) === norm(material))
    ? invConsolidadoCatalog
    : invCondicion;
  const precioMap = new Map<string, { condicion: string; precio: number; inv: number }>();
  const combosUsadas = new Set<string>();
  for (const r of precioSource) {
    if (norm(r.material) !== norm(material)) continue;
    const aut = autorizados.precio(material, r.condicion);
    const comb = autorizados.combinacion(material, r.condicion);
    if (aut != null && comb) combosUsadas.add(comb);
    const precio = soloAutorizados ? aut ?? 0 : aut ?? r.precioOferta;
    const key = `${r.condicion}|${precio}`;
    const cur = precioMap.get(key) || { condicion: r.condicion || '(sin condicion)', precio, inv: 0 };
    cur.inv += r.invSuma;
    precioMap.set(key, cur);
  }
  const out = [...precioMap.values()];
  for (const a of autorizados.deMaterial(material)) {
    if (!combosUsadas.has(a.combinacion)) out.push({ condicion: etiquetaCombinacion(a.combinacion), precio: a.precio, inv: 0 });
  }
  return out.sort((x, y) => y.precio - x.precio);
}

/** Normalizes codes: strips a trailing ".0" and leading zeros so that
 *  "000"->"0", "001"->"1", "017"->"17", "20.0"->"20", "602.0"->"602".
 *  Non-numeric codes are returned trimmed and untouched. */
export function normCode(v: unknown): string {
  let s = v == null ? '' : String(v).trim();
  if (s === '') return '';
  s = s.replace(/^(-?\d+)\.0+$/, '$1');
  if (/^-?\d+$/.test(s)) {
    const neg = s[0] === '-';
    const d = (neg ? s.slice(1) : s).replace(/^0+(?=\d)/, '');
    return (neg ? '-' : '') + d;
  }
  return s;
}

export interface EnrichIndex {
  grupoCliente: (code: unknown) => string;
  ejecutivoNombre: (zona: unknown) => string;
  matSector: (mat: unknown) => string;
  matGrupo: (mat: unknown) => string;
  matTexto: (mat: unknown) => string;
  /** Catalog offer price for a material (0 when unknown). First positive price
   * per material from InvConsolidado — the same rule applyCatalogPriceFallback
   * uses, exposed here for O(1) reuse anywhere a material is shown. */
  matPrecioOferta: (mat: unknown) => number;
  /** Unit of measure from the "Materiales" catalog. Sugerencia/InvDetalleRow/
   * ResumenSinSugerenciaRow don't carry their own `um`, so DRP requests built
   * from those rows look it up here. */
  matUm: (mat: unknown) => string;
  /** Costo del catálogo (pestaña Materiales). Sensible: la UI lo gatea con el detalle `costo`. */
  matCosto: (mat: unknown) => number;
  /** Distinct "Condición" values (Normal, Corta caducidad, ...) known for a
   * material, from the catalog's InvConsolidado. Condición lives only at the
   * material level (never per-lote) in any report, so this is the best
   * available answer to "qué condición tiene este material" when building a
   * Solicitar request from a lote/centro that has no condición of its own. */
  matCondiciones: (mat: unknown) => string[];
  /** Ejecutivos/zonas del catálogo EN EL ORDEN DEL CATÁLOGO (sin ordenar: se recorren zona por zona), una entrada por zona. */
  ejecutivosZona: EjecutivoZona[];
  /** Zona (código normalizado) a la que pertenece el "Gpo. Vdor." de un renglón (acepta zona o código de oficina de ventas); '' si no se conoce. */
  zonaDeEjecutivo: (gpoVdor: unknown) => string;
  /** Gerentes de marca conocidos (pestaña "GERENCIA DE MARCA"), ordenados. */
  gerentes: string[];
  /** Sectores a cargo de un gerente (nombres tal como vienen en la pestaña). */
  sectoresDeGerente: (gerente: string) => string[];
  /** ¿`sector` pertenece a `gerente`? Sin gerente (vacío) siempre `true`.
   * Compara sin acentos/mayúsculas. */
  sectorDeGerente: (sector: unknown, gerente: string) => boolean;
}

/** Una zona del catálogo de ejecutivos, lista para un filtro. */
export interface EjecutivoZona {
  /** Código de zona normalizado (`normCode`: "000" → "0", "002" → "2"). */
  zona: string;
  nombre: string;
  /** Texto del filtro: si el nombre dice "Vacante" se muestra la zona a 3 dígitos ("000", "002", "101") junto al nombre; si no, el nombre. */
  etiqueta: string;
  /** Zona a 3 dígitos ("0" → "000", "2" → "002", "101" → "101"). */
  zona3: string;
  vacante: boolean;
}

/** Zona a 3 dígitos cuando es numérica ("0" → "000", "2" → "002", "101" → "101"); si no, tal cual. */
export function zonaTresDigitos(zona: unknown): string {
  const s = (zona == null ? '' : String(zona)).trim().replace(/\.0+$/, '');
  return /^\d+$/.test(s) ? s.padStart(3, '0') : s;
}

/** Etiqueta del filtro de ejecutivos: las VACANTES (el nombre contiene "Vacante") salen con su zona a 3 dígitos. */
export function etiquetaEjecutivoZona(nombre: string, zona: unknown): { etiqueta: string; zona3: string; vacante: boolean } {
  const zona3 = zonaTresDigitos(zona);
  const vacante = /vacante/i.test(nombre);
  return { etiqueta: vacante ? `${zona3} · ${nombre.trim()}` : nombre.trim() || zona3, zona3, vacante };
}

const normSector = (v: unknown): string =>
  (v == null ? '' : String(v)).trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const EMPTY: EnrichIndex = {
  grupoCliente: () => '',
  ejecutivoNombre: () => '',
  matSector: () => '',
  matGrupo: () => '',
  matTexto: () => '',
  matPrecioOferta: () => 0,
  matUm: () => '',
  matCosto: () => 0,
  matCondiciones: () => [],
  ejecutivosZona: [],
  zonaDeEjecutivo: () => '',
  gerentes: [],
  sectoresDeGerente: () => [],
  sectorDeGerente: (_s, g) => !g,
};

/** Builds all lookup Maps once from the cached catalog snapshot. */
export function buildEnrich(catalog: CatalogSnapshot | null): EnrichIndex {
  if (!catalog) return EMPTY;

  const mapGrupo = new Map<string, string>();
  const mapEjec = new Map<string, string>();
  const mapSector = new Map<string, string>();
  const mapGrupoArt = new Map<string, string>();
  const mapTexto = new Map<string, string>();
  const mapUm = new Map<string, string>();
  const mapCosto = new Map<string, number>();

  for (const e of catalog.ejecutivos) {
    // legacy joined ejecutivos by Zona; we also index by codOfVtas so both the
    // report's "Gpo.Vdor." (= zona) and "Cod Of Vtas" resolve to a name.
    // Las VACANTES (el nombre dice "Vacante") se muestran SIEMPRE con su zona a 3 dígitos ("002 · VACANTE"), en todos los lugares donde sale el ejecutivo.
    const nombreEjec = etiquetaEjecutivoZona(e.ejecutivo ?? '', e.zona || e.codOfVtas);
    const visible = nombreEjec.vacante ? nombreEjec.etiqueta : e.ejecutivo;
    const zonaKey = normCode(e.zona);
    if (zonaKey && !mapEjec.has(zonaKey) && e.ejecutivo) mapEjec.set(zonaKey, visible);
    const codKey = normCode(e.codOfVtas);
    if (codKey && !mapEjec.has(codKey) && e.ejecutivo) mapEjec.set(codKey, visible);
    const gKey = normCode(e.gpoCte);
    if (gKey && !mapGrupo.has(gKey) && e.grupoCliente) mapGrupo.set(gKey, e.grupoCliente);
  }

  for (const m of catalog.materiales) {
    const k = normCode(m.material);
    if (!k) continue;
    if (!mapSector.has(k)) mapSector.set(k, m.descrSector || m.sector || '');
    if (!mapGrupoArt.has(k)) mapGrupoArt.set(k, m.descrGrupoArt || m.grupoArticulos || '');
    if (!mapTexto.has(k)) mapTexto.set(k, m.textoBreve || '');
    if (!mapUm.has(k)) mapUm.set(k, m.um || '');
    if (!mapCosto.has(k) && m.costo > 0) mapCosto.set(k, m.costo);
  }

  // Offer price per material: first positive price found in InvConsolidado
  // (same first-wins rule as applyCatalogPriceFallback, so behavior is
  // consistent with existing inventory pricing).
  const mapPrecio = new Map<string, number>();
  const mapCondiciones = new Map<string, string[]>();
  for (const r of catalog.invConsolidado) {
    const k = normCode(r.material);
    if (!k) continue;
    if (!mapPrecio.has(k) && r.precioOferta > 0) mapPrecio.set(k, r.precioOferta);
    if (r.condicion) {
      const list = mapCondiciones.get(k) ?? [];
      if (!list.includes(r.condicion)) list.push(r.condicion);
      mapCondiciones.set(k, list);
    }
  }

  // Una entrada por zona, en el orden del catálogo (el filtro NO la reordena); cualquier clave de un ejecutivo (zona u oficina de ventas) lleva a su zona.
  const ejecutivosZona: EjecutivoZona[] = [];
  const zonaDeClave = new Map<string, string>();
  for (const e of catalog.ejecutivos) {
    const zk = normCode(e.zona) || normCode(e.codOfVtas);
    if (!zk) continue;
    if (!zonaDeClave.has(zk)) {
      zonaDeClave.set(zk, zk);
      ejecutivosZona.push({ zona: zk, nombre: e.ejecutivo ?? '', ...etiquetaEjecutivoZona(e.ejecutivo ?? '', e.zona || e.codOfVtas) });
    }
    const ck = normCode(e.codOfVtas);
    if (ck && !zonaDeClave.has(ck)) zonaDeClave.set(ck, zk);
  }

  const gerSectores = new Map<string, Map<string, string>>();
  for (const g of catalog.gerenciaMarca ?? []) {
    const k = normSector(g.sector);
    if (!g.gerente || !k) continue;
    const m = gerSectores.get(g.gerente) ?? new Map<string, string>();
    if (!m.has(k)) m.set(k, g.sector);
    gerSectores.set(g.gerente, m);
  }

  return {
    grupoCliente: (code) => mapGrupo.get(normCode(code)) || '',
    ejecutivoNombre: (zona) => mapEjec.get(normCode(zona)) || '',
    matSector: (mat) => mapSector.get(normCode(mat)) || '',
    matGrupo: (mat) => mapGrupoArt.get(normCode(mat)) || '',
    matTexto: (mat) => mapTexto.get(normCode(mat)) || '',
    matPrecioOferta: (mat) => mapPrecio.get(normCode(mat)) || 0,
    matUm: (mat) => mapUm.get(normCode(mat)) || '',
    matCosto: (mat) => mapCosto.get(normCode(mat)) || 0,
    matCondiciones: (mat) => mapCondiciones.get(normCode(mat)) ?? [],
    ejecutivosZona,
    zonaDeEjecutivo: (v) => zonaDeClave.get(normCode(v)) ?? '',
    gerentes: [...gerSectores.keys()].sort((a, b) => a.localeCompare(b, 'es')),
    sectoresDeGerente: (g) => [...(gerSectores.get(g)?.values() ?? [])].sort((a, b) => a.localeCompare(b, 'es')),
    sectorDeGerente: (sector, g) => !g || (gerSectores.get(g)?.has(normSector(sector)) ?? false),
  };
}
