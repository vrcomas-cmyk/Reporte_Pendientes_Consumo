// ---------------------------------------------------------------------------
// oportunidad.ts · Deriva candidatas de "Oportunidad Comercial" a partir de
// lotes con condición especial que aún no tienen una Oportunidad persistida
// — puro cruce de `a.lotes` (InvDetalleRow) + `a.invCondicion` (condición
// real del material), sin persistir nada. La bandeja las muestra sugeridas;
// el usuario decide crearlas (conocimientoStore.addOportunidad).
// ---------------------------------------------------------------------------
import type { InvDetalleRow, InvConsolidadoRow, CondicionEspecial } from './types';
import type { RFIndex } from './resumenFac';
import type { BOItem } from './buildBO';
import { norm } from '@/lib/text';

/** `norm()` solo recorta espacios — para texto libre de negocio (Cosmopark,
 * PNC…) hace falta ignorar también mayúsculas/minúsculas. */
const normKey = (s: string): string => norm(s).toLowerCase();

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
export function condicionDeMaterial(material: string, invCondicion: InvConsolidadoRow[]): CondicionEspecial {
  const row = invCondicion.find((r) => norm(r.material) === norm(material) && r.condicion);
  return row ? normalizeCondicion(row.condicion) : 'normal';
}

/** Condición efectiva de un material para ofertar/matching (módulo
 * Oportunidades): combina las dos fuentes reales del negocio, en este orden:
 *   1. "Fuente" de Pedidos (Sugerencias) — el texto de cada fuente alterna de
 *      abasto de este material (`BOItem.fuentes[].fuente`, p. ej. "Corta
 *      caducidad") ya dice por qué se está sugiriendo surtir así; es la señal
 *      más específica y vigente.
 *   2. Columna "Condición" de Inv Condición (`condicionDeMaterial`), si
 *      Pedidos no trae ninguna fuente clasificada.
 * 'normal' si ninguna de las dos aporta nada. */
export function condicionEfectivaMaterial(material: string, sug: BOItem[], invCondicion: InvConsolidadoRow[]): CondicionEspecial {
  for (const it of sug) {
    for (const f of it.fuentes) {
      const c = normalizeCondicion(f.fuente);
      if (c !== 'normal') return c;
    }
  }
  return condicionDeMaterial(material, invCondicion);
}

/** Texto REAL de la condición de un material (Inv Condición), tal como
 * viene en el reporte — sin pasar por el normalizador de 4 categorías. Un
 * cliente puede aceptar un valor de negocio concreto ("Cosmopark", "PNC")
 * que nunca va a encajar en corta-caducidad/lento-movimiento/calidad/dañado. */
export function condicionTextoDeMaterial(material: string, invCondicion: InvConsolidadoRow[]): string | null {
  const row = invCondicion.find((r) => norm(r.material) === norm(material) && r.condicion?.trim());
  return row?.condicion?.trim() || null;
}

/** Igual que `condicionEfectivaMaterial` pero devuelve el texto real (mismo
 * orden de prioridad: Fuente de Pedidos primero, Inv Condición como respaldo). */
export function condicionTextoEfectivo(material: string, sug: BOItem[], invCondicion: InvConsolidadoRow[]): string | null {
  for (const it of sug) {
    for (const f of it.fuentes) {
      const t = f.fuente?.trim();
      if (t) return t;
    }
  }
  return condicionTextoDeMaterial(material, invCondicion);
}

/** Todos los valores REALES de condición que aparecen en el negocio — Fuente
 * de Pedidos (Todas las sugerencias) + columna Condición de Inv Condición —
 * para poblar el selector de "qué acepta" del cliente sin inventar catálogo:
 * si el negocio ya usa "Cosmopark" o "PNC", sale aquí tal cual. */
export function condicionesDisponibles(bo: BOItem[], invCondicion: InvConsolidadoRow[]): string[] {
  const vistos = new Map<string, string>();
  for (const it of bo) {
    for (const f of it.fuentes) {
      const t = f.fuente?.trim();
      if (t && !vistos.has(normKey(t))) vistos.set(normKey(t), t);
    }
  }
  for (const r of invCondicion) {
    const t = r.condicion?.trim();
    if (t && !vistos.has(normKey(t))) vistos.set(normKey(t), t);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

export interface CondicionMaterial {
  categoria: CondicionEspecial;
  /** Texto real — puede no encajar en ninguna de las 4 categorías fijas. */
  texto: string | null;
}

/** Condición efectiva de CADA material que aparece en Pedidos o Inv
 * Condición, precomputada una sola vez (Fuentes primero, Inv Condición como
 * respaldo — mismo criterio que `condicionEfectivaMaterial`). A diferencia
 * de antes, SÍ conserva el material aunque su texto no normalice a ninguna
 * de las 4 categorías conocidas (`categoria: 'normal'`): el texto real
 * (`texto`) es lo que importa para que un cliente pueda aceptar un valor de
 * negocio concreto tipo "Cosmopark"/"PNC" que el regex no reconoce. Evita
 * repetir el escaneo de `bo`/`invCondicion` por cada lote al construir el
 * universo para las alertas de colocación (`lotesParaAlertas`). */
export function condicionPorMaterialIndex(bo: BOItem[], invCondicion: InvConsolidadoRow[]): Map<string, CondicionMaterial> {
  const m = new Map<string, CondicionMaterial>();
  for (const it of bo) {
    for (const f of it.fuentes) {
      const texto = f.fuente?.trim();
      if (!texto) continue;
      const k = norm(it.bo.materialBase);
      if (!m.has(k)) m.set(k, { categoria: normalizeCondicion(texto), texto });
    }
  }
  for (const r of invCondicion) {
    const texto = r.condicion?.trim();
    if (!texto) continue;
    const k = norm(r.material);
    if (!m.has(k)) m.set(k, { categoria: normalizeCondicion(texto), texto });
  }
  return m;
}

export interface LoteParaAlerta {
  material: string;
  descripcion: string;
  lote?: string;
  centro?: string;
  almacen?: string;
  condicion: CondicionEspecial;
  condicionTexto: string | null;
  fechaCaducidad?: string | null;
  diasCaducidad: number | null;
  cantidadDisponible: number;
  precioOferta?: number;
}

/** Universo de lotes para cruzar contra las reglas de aceptación de todos
 * los clientes (`matchingOfertas.alertasColocacion`) — a diferencia de
 * `buildOportunidadesCandidatas`, NO excluye los de condición 'normal': un
 * cliente puede aceptar "cualquier material, con tal de que la caducidad sea
 * buena" (regla global sin condiciones), y eso también debe poder disparar
 * una alerta. */
export function lotesParaAlertas(lotes: InvDetalleRow[], condicionPorMaterial: Map<string, CondicionMaterial>): LoteParaAlerta[] {
  return lotes
    .filter((l) => l.cantidadDisp > 0)
    .map((l) => {
      const c = condicionPorMaterial.get(norm(l.material));
      return {
        material: l.material,
        descripcion: l.textoBreve,
        lote: l.lote,
        centro: l.centro,
        almacen: l.almacen,
        condicion: c?.categoria ?? 'normal',
        condicionTexto: c?.texto ?? null,
        fechaCaducidad: l.fechaCaducidad,
        diasCaducidad: diasHasta(l.fechaCaducidad),
        cantidadDisponible: l.cantidadDisp,
        precioOferta: l.precioOferta || undefined,
      };
    });
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

export interface MaterialSinCobertura {
  material: string;
  descripcion: string;
  lotesCount: number;
  cantidadDisponible: number;
  diasVigencia: number | null;
}

/** Candidatas agrupadas por material y filtradas a las que NO tienen ya
 * ningún cliente configurado que las acepte (`materialesCubiertos`, claves
 * `norm()` — ver `matchingOfertas.agruparAlertasPorMaterial`) — el hueco real
 * de cobertura ("nadie configurado puede recibir esto"), distinto de
 * "Materiales por colocar" (que ya tiene al menos un cliente candidato). Una
 * fila por material, no por lote — antes "Candidatas sugeridas" mostraba
 * cientos de lotes sin decir cuáles de verdad no tienen a quién ofertarse. */
export function candidatasSinCobertura(candidatas: OportunidadCandidata[], materialesCubiertos: Set<string>): MaterialSinCobertura[] {
  const m = new Map<string, MaterialSinCobertura>();
  for (const c of candidatas) {
    const k = norm(c.material);
    if (materialesCubiertos.has(k)) continue;
    const prev = m.get(k);
    if (!prev) {
      m.set(k, { material: c.material, descripcion: c.descripcion, lotesCount: 1, cantidadDisponible: c.cantidadDisponible, diasVigencia: c.diasVigencia });
    } else {
      prev.lotesCount += 1;
      prev.cantidadDisponible += c.cantidadDisponible;
      if (c.diasVigencia != null && (prev.diasVigencia == null || c.diasVigencia < prev.diasVigencia)) prev.diasVigencia = c.diasVigencia;
    }
  }
  return [...m.values()].sort((a, b) => (a.diasVigencia ?? Infinity) - (b.diasVigencia ?? Infinity));
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
