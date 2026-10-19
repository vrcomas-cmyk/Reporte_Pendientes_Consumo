// ---------------------------------------------------------------------------
// facPorNivel.ts · Facturación promedio mensual (y dispersión de precios) agrupada por Gerente, Sector, Grupo de artículo o Material, con
// desglose jerárquico (gerente → sector → grupo → material). Es el mismo patrón de «Pendiente por …» de Seg. de pedidos. Puro: sin React.
// ---------------------------------------------------------------------------

export type NivelFac = 'gerente' | 'sector' | 'grupoart' | 'material';
/** Jerarquía de desglose: cada nivel se abre hacia los que le siguen. */
export const ORDEN_NIVELES_FAC: readonly NivelFac[] = ['gerente', 'sector', 'grupoart', 'material'];
export const ETIQUETA_NIVEL_FAC: Record<NivelFac, string> = { gerente: 'gerente', sector: 'sector', grupoart: 'grupo de artículo', material: 'material' };

/** Dispersión de precio de UN material entre clientes distintos (precio unitario vigente). */
export interface DispersionMaterial {
  /** (precio máx − mín) / mín. */
  spread: number;
  precioMin: number;
  precioMax: number;
  clienteMin: string;
  clienteMax: string;
  nClientes: number;
}

/** Un material con lo facturado en la ventana (totales, no por mes) y, si la tiene, su dispersión. */
export interface RenglonFac {
  material: string;
  descripcion: string;
  gerente: string;
  sector: string;
  grupo: string;
  /** Importe facturado en toda la ventana. */
  imp: number;
  /** Piezas facturadas en toda la ventana. */
  cant: number;
  dispersion: DispersionMaterial | null;
}

export type OrdenFac = 'facturacion' | 'dispersion';

export interface NodoFac {
  id: string;
  nivel: NivelFac;
  clave: string;
  desc: string;
  /** Promedio mensual: importe de la ventana ÷ meses. */
  imp: number;
  cant: number;
  materiales: number;
  /** Cuántos de sus materiales tienen dispersión, y la mayor. */
  conDispersion: number;
  maxSpread: number | null;
  /** Solo en nodos de material. */
  dispersion: DispersionMaterial | null;
  hijos: NodoFac[];
}

export const claveFacDe = (r: RenglonFac, n: NivelFac): string =>
  n === 'gerente' ? r.gerente || 'Sin gerente' : n === 'sector' ? r.sector || 'Sin sector' : n === 'grupoart' ? r.grupo || 'Sin grupo' : r.material;

/** Agrupa por el primer nivel de `niveles` y, recursivamente, por los siguientes. `nMeses` convierte la ventana en promedio mensual.
 * En orden «dispersión» solo quedan los nodos que tienen algún material con dispersión, de mayor a menor spread. */
export function agruparFac(renglones: readonly RenglonFac[], niveles: readonly NivelFac[], nMeses: number, orden: OrdenFac, prefijo = ''): NodoFac[] {
  const [nivel, ...resto] = niveles;
  if (!nivel) return [];
  const meses = nMeses > 0 ? nMeses : 1;
  const m = new Map<string, { rs: RenglonFac[]; imp: number; cant: number; mats: Set<string>; desc: string; disp: DispersionMaterial | null }>();
  for (const r of renglones) {
    const k = claveFacDe(r, nivel);
    const cur = m.get(k) ?? { rs: [], imp: 0, cant: 0, mats: new Set<string>(), desc: nivel === 'material' ? r.descripcion : '', disp: null };
    cur.rs.push(r); cur.imp += r.imp; cur.cant += r.cant; cur.mats.add(r.material);
    if (nivel === 'material') cur.disp = r.dispersion;
    m.set(k, cur);
  }
  const nodos = [...m.entries()].map(([clave, x]): NodoFac => {
    const id = `${prefijo}/${clave}`;
    const conDisp = new Set(x.rs.filter((r) => r.dispersion).map((r) => r.material));
    const spreads = x.rs.map((r) => r.dispersion?.spread).filter((v): v is number => v != null);
    return {
      id, nivel, clave, desc: x.desc, imp: x.imp / meses, cant: x.cant / meses, materiales: x.mats.size,
      conDispersion: conDisp.size, maxSpread: spreads.length ? Math.max(...spreads) : null, dispersion: x.disp,
      hijos: resto.length ? agruparFac(x.rs, resto, nMeses, orden, id) : [],
    };
  });
  const lista = orden === 'dispersion' ? nodos.filter((n) => n.conDispersion > 0) : nodos;
  return lista.sort((a, b) => (orden === 'dispersion' ? (b.maxSpread ?? -1) - (a.maxSpread ?? -1) || b.imp - a.imp : b.imp - a.imp));
}
