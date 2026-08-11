// ---------------------------------------------------------------------------
// caducidad.ts · Valor económico en riesgo por vencimiento — cruza
// "Detalle Lotes Corta Caducidad" (+ el detalle de inventario del catálogo)
// con precio y demanda reciente, agregado por mes de vencimiento. Antes solo
// se contaban lotes/cantidad (`HoyPage`/`InventarioPage`); esto le pone
// pesos y separa "se va a vender solo" (con demanda) de "hay que rematarlo
// ya" (sin demanda).
// ---------------------------------------------------------------------------
import type { InvDetalleRow } from './types';
import { norm } from '@/lib/text';

/** Convierte una fecha a un Date en hora LOCAL sin que el huso desplace el mes.
 * `new Date('YYYY-MM-DD')` se interpreta como UTC y, según la zona, cae al día
 * bés siguiente, moviendo lotes del 1º de mes al mes anterior. */
function toLocalStartOfDay(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface RiesgoCaducidadMes {
  /** "mm/aaaa" del mes de vencimiento. */
  mes: string;
  /** Clave ordenable (año*12 + mes). */
  mesKey: number;
  lotes: number;
  cantidadTotal: number;
  importeTotal: number;
  cantidadConDemanda: number;
  importeConDemanda: number;
}

export interface RiesgoCaducidadOptions {
  /** Precio unitario a usar para un material — normalmente `enrich.matPrecioOferta`. */
  precioDe: (material: string) => number;
  /** Si el material tiene consumo/facturación reciente — normalmente un Set ya armado por el caller. */
  tieneDemanda: (material: string) => boolean;
  /** Solo lotes que vencen dentro de estos meses desde hoy (agrupa lo ya vencido en el mes 0). Default 12. */
  horizonMeses?: number;
}

const DEFAULT_HORIZON_MESES = 12;

/**
 * Agrupa lotes por mes de vencimiento (incluye ya vencidos, en el mes de
 * hoy) y suma `cantidadDisp * precio`, separando el total del que además
 * tiene demanda reciente. Pura — no I/O — para poder correr en un
 * `useMemo` o en un test.
 */
export function buildRiesgoCaducidad(lotes: InvDetalleRow[], opts: RiesgoCaducidadOptions): RiesgoCaducidadMes[] {
  const { precioDe, tieneDemanda, horizonMeses = DEFAULT_HORIZON_MESES } = opts;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hoyKey = hoy.getFullYear() * 12 + hoy.getMonth();
  const horizonteKey = hoyKey + horizonMeses;

  const byMes = new Map<number, RiesgoCaducidadMes>();

  for (const l of lotes) {
    if (!l.fechaCaducidad || l.cantidadDisp <= 0) continue;
    const d = toLocalStartOfDay(l.fechaCaducidad);
    if (!d) continue;
    // Lotes ya vencidos cuentan en el "mes de hoy" (siguen siendo capital
    // parado que hay que resolver, no algo que ignorar por estar en el pasado).
    const mesKey = Math.max(hoyKey, d.getFullYear() * 12 + d.getMonth());
    if (mesKey > horizonteKey) continue;

    const precio = l.precioOferta && l.precioOferta > 0 ? l.precioOferta : precioDe(l.material);
    const importe = l.cantidadDisp * precio;
    const conDemanda = tieneDemanda(norm(l.material));

    let entry = byMes.get(mesKey);
    if (!entry) {
      const yy = Math.floor(mesKey / 12);
      const mm = (mesKey % 12) + 1;
      entry = {
        mes: `${String(mm).padStart(2, '0')}/${yy}`,
        mesKey,
        lotes: 0,
        cantidadTotal: 0,
        importeTotal: 0,
        cantidadConDemanda: 0,
        importeConDemanda: 0,
      };
      byMes.set(mesKey, entry);
    }
    entry.lotes += 1;
    entry.cantidadTotal += l.cantidadDisp;
    entry.importeTotal += importe;
    if (conDemanda) {
      entry.cantidadConDemanda += l.cantidadDisp;
      entry.importeConDemanda += importe;
    }
  }

  return [...byMes.values()].sort((a, b) => a.mesKey - b.mesKey);
}
