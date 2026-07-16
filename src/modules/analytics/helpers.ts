import type { ConsumoRow } from '@/core/types';
import type { EnrichIndex } from '@/core/enrich';
import type { RFIndex } from '@/core/resumenFac';
import {
  serieMatDest, serieDeConsumo, clasificarEstado, tendenciaTexto, aMesAnio, mesKey,
  type Serie, type Estado, type Tendencia,
} from '@/core/resumenFac';
import type { BOItem } from '@/core/buildBO';

export const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();

/** Order-independent, multi-token, substring-both-ways match: every whitespace-separated
 * token in `query` must appear as a substring somewhere in `haystack` (case/accent-insensitive).
 * e.g. matchesQuery("GASA 20", "SOBRE C/20 GASA") === true. Mirrors legacy js/utils.js norm()+match. */
const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const searchNorm = (v: unknown): string => stripAccents(norm(v).toLowerCase());
export function matchesQuery(query: string, haystack: string): boolean {
  const q = searchNorm(query);
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const hay = searchNorm(haystack);
  return tokens.every((t) => hay.includes(t));
}

/** Same matching as matchesQuery, but takes an already-searchNorm'd haystack
 * (precomputed once per row, memoized on data identity) instead of
 * re-normalizing it on every call — avoids redoing that work for every row on
 * every keystroke when filtering tens of thousands of rows. */
export function matchesQueryNormalized(query: string, normalizedHaystack: string): boolean {
  const q = searchNorm(query);
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => normalizedHaystack.includes(t));
}
export const num = (v: unknown): number => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};
export const pickField = (r: Record<string, unknown>, names: string[]): string => {
  for (const n of names) {
    const v = norm(r[n]);
    if (v) return v;
  }
  return '';
};

// RC column keys (from raw), matching legacy store.RC.
export const RC = {
  penFecha: 'Penultima_fecha', cantPen: 'Cantidad_penultima', impPen: 'Importe_penultima',
  ultFacDest: 'Ultima_facturacion_destinatario',
  precioUltUni: 'Precio_unitario_ultima', precioPenUni: 'Precio_unitario_penultima',
};

// serieDeConsumo needs the RC-shaped accessor object.
const RC_SERIE = {
  penFecha: 'Penultima_fecha', cantPen: 'Cantidad_penultima', impPen: 'Importe_penultima',
  ultMes: 'Ultimo mes facturacion', cantUlt: 'Cantidad ultima', impUlt: 'Importe ultima',
};

export function consumoEnrich(enrich: EnrichIndex) {
  const gpoVdor = (r: ConsumoRow) => r.gpoVdor || pickField(r.raw, ['Gpo. Vdor.', 'Gpo.Vdor.', 'Grupo de vendedor']);
  const gpoCte = (r: ConsumoRow) => r.grpCliente || pickField(r.raw, ['Grp. Cliente', 'Gpo. Cte.', 'Gpo Cte']);
  return {
    ejec: (r: ConsumoRow) => enrich.ejecutivoNombre(gpoVdor(r)),
    grupoCli: (r: ConsumoRow) => enrich.grupoCliente(gpoCte(r)) || gpoCte(r),
    sector: (r: ConsumoRow) => enrich.matSector(r.material),
    grupoArt: (r: ConsumoRow) => enrich.matGrupo(r.material),
    precioOferta: (r: ConsumoRow) => enrich.matPrecioOferta(r.material),
    ultFacDest: (r: ConsumoRow) => pickField(r.raw, [RC.ultFacDest]),
  };
}

export function consumoSerie(rf: RFIndex | null, r: ConsumoRow): Serie {
  const s = serieMatDest(rf, r.destinatario, r.material);
  return s.length ? s : serieDeConsumo(r.raw, RC_SERIE);
}
export function consumoStatus(rf: RFIndex | null, r: ConsumoRow): Estado {
  const s = consumoSerie(rf, r);
  return clasificarEstado(s.length ? s : null, false);
}
export function consumoTend(rf: RFIndex | null, r: ConsumoRow): Tendencia {
  return tendenciaTexto(consumoSerie(rf, r));
}

export const mKeyOf = (v: unknown): number => {
  const m = aMesAnio(v);
  if (!m) return 0;
  const [mm, yy] = m.split('/').map(Number);
  return yy * 12 + mm;
};

// Sugerencias (BO) and Consumo rows filtered by material [+ centro].
export function sugFor(bo: BOItem[], material: string, centro?: string | null): BOItem[] {
  const m = norm(material);
  const c = centro ? norm(centro) : null;
  return bo.filter((it) => norm(it.bo.materialBase) === m && (!c || norm(it.bo.centroPedido) === c));
}
export function consFor(rows: ConsumoRow[], material: string, centro?: string | null): ConsumoRow[] {
  const m = norm(material);
  const c = centro ? norm(centro) : null;
  return rows.filter((r) => norm(r.material) === m && (!c || norm(r.centro) === c));
}

export function serieDeConsumoFallback(rf: RFIndex | null, r: ConsumoRow): Serie {
  return consumoSerie(rf, r);
}
export { mesKey };
