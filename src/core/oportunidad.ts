// ---------------------------------------------------------------------------
// oportunidad.ts · Deriva candidatas de "Oportunidad Comercial" a partir de
// lotes con condición especial que aún no tienen una Oportunidad persistida
// — puro cruce de `a.lotes` (InvDetalleRow) + `a.invCondicion` (condición
// real del material), sin persistir nada. La bandeja las muestra sugeridas;
// el usuario decide crearlas (conocimientoStore.addOportunidad).
// ---------------------------------------------------------------------------
import type { InvDetalleRow, InvConsolidadoRow, CondicionEspecial } from './types';
import type { RFIndex } from './resumenFac';
import { norm } from '@/lib/text';

export interface OportunidadCandidata {
  material: string;
  descripcion: string;
  lote?: string;
  centro?: string;
  condicion: CondicionEspecial;
  cantidadDisponible: number;
  fechaCaducidad: string | null;
  precioOferta: number;
  diasVigencia: number | null;
}

const CONDICION_MAP: { test: RegExp; value: CondicionEspecial }[] = [
  { test: /corta|caducid/i, value: 'corta-caducidad' },
  { test: /lento/i, value: 'lento-movimiento' },
  { test: /calidad/i, value: 'calidad' },
  { test: /da[ñn]ad/i, value: 'danado' },
];

export function normalizeCondicion(raw: string): CondicionEspecial {
  for (const { test, value } of CONDICION_MAP) if (test.test(raw)) return value;
  return 'normal';
}

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

/** Condición real de un material según InvConsolidado/InvCondicion (no hay
 * condición a nivel de lote en ningún reporte — ver `core/enrich.ts`). */
function condicionDeMaterial(material: string, invCondicion: InvConsolidadoRow[]): CondicionEspecial {
  const row = invCondicion.find((r) => norm(r.material) === norm(material) && r.condicion);
  return row ? normalizeCondicion(row.condicion) : 'normal';
}

function precioDeMaterial(material: string, invCondicion: InvConsolidadoRow[]): number {
  const row = invCondicion.find((r) => norm(r.material) === norm(material) && r.precioOferta > 0);
  return row?.precioOferta ?? 0;
}

/** Candidatas: lotes cuya caducidad cae dentro de `shortExpiryDays`, o cuyo
 * material está clasificado con una condición especial en el inventario por
 * condición — excluye las que ya tienen `Oportunidad` con el mismo (material,
 * lote) vía `existingKeys`. */
export function buildOportunidadesCandidatas(
  lotes: InvDetalleRow[],
  invCondicion: InvConsolidadoRow[],
  shortExpiryDays: number,
  existingKeys: Set<string>,
): OportunidadCandidata[] {
  const out: OportunidadCandidata[] = [];
  const seen = new Set<string>();
  for (const l of lotes) {
    if (!l.cantidadDisp || l.cantidadDisp <= 0) continue;
    const dias = diasHasta(l.fechaCaducidad);
    const condMaterial = condicionDeMaterial(l.material, invCondicion);
    const esCortaCaducidad = dias != null && dias <= shortExpiryDays;
    const condicion: CondicionEspecial = esCortaCaducidad ? 'corta-caducidad' : condMaterial;
    if (condicion === 'normal') continue;
    const key = `${norm(l.material)}|${norm(l.lote)}`;
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      material: l.material,
      descripcion: l.textoBreve,
      lote: l.lote,
      centro: l.centro,
      condicion,
      cantidadDisponible: l.cantidadDisp,
      fechaCaducidad: l.fechaCaducidad,
      precioOferta: l.precioOferta || precioDeMaterial(l.material, invCondicion),
      diasVigencia: dias,
    });
  }
  return out.sort((a, b) => (a.diasVigencia ?? Infinity) - (b.diasVigencia ?? Infinity));
}

export interface MaterialRelacionado {
  material: string;
  texto: string;
  /** Cuántos clientes (solicitantes) distintos compraron AMBOS materiales. */
  clientesEnComun: number;
  importe12m: number;
}

/** Materiales relacionados por co-compra (fase 5, idea adicional del plan
 * §12): para cada solicitante que facturó `material`, suma qué OTROS
 * materiales facturó ese mismo solicitante — rankea por cuántos clientes
 * distintos comparten ambos, no solo por importe (evita que un solo cliente
 * gigante domine el ranking). Pura, sobre el índice `RFIndex` ya construido —
 * no dispara ninguna consulta nueva. */
export function materialesRelacionados(rf: RFIndex | null, material: string, limit = 8): MaterialRelacionado[] {
  if (!rf) return [];
  const m = norm(material);
  const solicitantesConMaterial: string[] = [];
  rf.solicMats.forEach((mats, solic) => { if (mats.has(m)) solicitantesConMaterial.push(solic); });
  if (!solicitantesConMaterial.length) return [];

  const acc = new Map<string, { importe: number; clientes: Set<string> }>();
  for (const solic of solicitantesConMaterial) {
    const mats = rf.solicMats.get(solic);
    if (!mats) continue;
    mats.forEach((serie, mat2) => {
      if (mat2 === m) return;
      const importe = serie.reduce((s, p) => s + p.imp, 0);
      if (importe <= 0) return;
      const cur = acc.get(mat2) ?? { importe: 0, clientes: new Set<string>() };
      cur.importe += importe;
      cur.clientes.add(solic);
      acc.set(mat2, cur);
    });
  }

  return [...acc.entries()]
    .map(([mat2, v]) => ({ material: mat2, texto: rf.matTexto.get(mat2) || '', clientesEnComun: v.clientes.size, importe12m: v.importe }))
    .sort((a, b) => b.clientesEnComun - a.clientesEnComun || b.importe12m - a.importe12m)
    .slice(0, limit);
}
