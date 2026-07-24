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

/** Recolecta cada par distinto (condicion, precio oferta) para `material` desde InvConsolidado/Inventario por condicion. */
export function preciosPorCondicion(
  material: string,
  invConsolidadoCatalog: InvConsolidadoRow[],
  invCondicion: InvConsolidadoRow[],
): { condicion: string; precio: number; inv: number }[] {
  const precioSource = invConsolidadoCatalog.some((r) => norm(r.material) === norm(material))
    ? invConsolidadoCatalog
    : invCondicion;
  const precioMap = new Map<string, { condicion: string; precio: number; inv: number }>();
  for (const r of precioSource) {
    if (norm(r.material) !== norm(material)) continue;
    const key = `${r.condicion}|${r.precioOferta}`;
    const cur = precioMap.get(key) || { condicion: r.condicion || '(sin condicion)', precio: r.precioOferta, inv: 0 };
    cur.inv += r.invSuma;
    precioMap.set(key, cur);
  }
  return [...precioMap.values()].sort((x, y) => y.precio - x.precio);
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
}

const EMPTY: EnrichIndex = {
  grupoCliente: () => '',
  ejecutivoNombre: () => '',
  matSector: () => '',
  matGrupo: () => '',
  matTexto: () => '',
  matPrecioOferta: () => 0,
  matUm: () => '',
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

  for (const e of catalog.ejecutivos) {
    // legacy joined ejecutivos by Zona; we also index by codOfVtas so both the
    // report's "Gpo.Vdor." (= zona) and "Cod Of Vtas" resolve to a name.
    const zonaKey = normCode(e.zona);
    if (zonaKey && !mapEjec.has(zonaKey) && e.ejecutivo) mapEjec.set(zonaKey, e.ejecutivo);
    const codKey = normCode(e.codOfVtas);
    if (codKey && !mapEjec.has(codKey) && e.ejecutivo) mapEjec.set(codKey, e.ejecutivo);
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
  }

  // Offer price per material: first positive price found in InvConsolidado
  // (same first-wins rule as applyCatalogPriceFallback, so behavior is
  // consistent with existing inventory pricing).
  const mapPrecio = new Map<string, number>();
  for (const r of catalog.invConsolidado) {
    const k = normCode(r.material);
    if (!k || mapPrecio.has(k)) continue;
    if (r.precioOferta > 0) mapPrecio.set(k, r.precioOferta);
  }

  return {
    grupoCliente: (code) => mapGrupo.get(normCode(code)) || '',
    ejecutivoNombre: (zona) => mapEjec.get(normCode(zona)) || '',
    matSector: (mat) => mapSector.get(normCode(mat)) || '',
    matGrupo: (mat) => mapGrupoArt.get(normCode(mat)) || '',
    matTexto: (mat) => mapTexto.get(normCode(mat)) || '',
    matPrecioOferta: (mat) => mapPrecio.get(normCode(mat)) || 0,
    matUm: (mat) => mapUm.get(normCode(mat)) || '',
  };
}
