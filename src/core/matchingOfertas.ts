// ---------------------------------------------------------------------------
// matchingOfertas.ts · Motor puro de matching material↔destinatario para el
// módulo "Ofertas por Cliente". Sin React, sin I/O — recibe las reglas ya
// cargadas y el contexto real del lote/material, devuelve si aplica y por
// qué (para el badge "Acepta · caducidad ≥ 3m · buen estado").
// ---------------------------------------------------------------------------
import type { ReglaAceptacion, CondicionEspecial } from './types';
import { norm } from '@/lib/text';

/** Contexto real de un lote/material a ofertar — deriva de `lotes`/`invCondicion`. */
export interface ContextoMaterial {
  condicion: CondicionEspecial | null;
  mesesCaducidad: number | null;
  danado: boolean;
}

/** La regla aplicable a un (dest, material): el override de ese material si
 * existe y está activo, si no la regla global (`material === null`) activa
 * del destinatario, si no `null` (el destinatario no tiene nada configurado). */
export function reglaAplicable(reglas: ReglaAceptacion[], dest: string, material: string): ReglaAceptacion | null {
  const d = norm(dest);
  const m = norm(material);
  const propias = reglas.filter((r) => norm(r.dest) === d && r.activa);
  const especifica = propias.find((r) => r.material != null && norm(r.material) === m);
  if (especifica) return especifica;
  return propias.find((r) => r.material == null) ?? null;
}

export interface EvaluacionAceptacion {
  acepta: boolean;
  /** Frases cortas ya listas para el badge, p. ej. "caducidad ≥ 3m", "buen estado". */
  motivos: string[];
}

/** Evalúa una regla contra el contexto real de un lote. Sin regla, no acepta. */
export function evaluarAceptacion(regla: ReglaAceptacion | null, ctx: ContextoMaterial): EvaluacionAceptacion {
  if (!regla) return { acepta: false, motivos: ['Sin regla configurada'] };
  const motivos: string[] = [];
  let acepta = true;

  if (regla.condiciones.length > 0) {
    const ok = ctx.condicion != null && regla.condiciones.includes(ctx.condicion);
    motivos.push(ok ? `condición ${ctx.condicion}` : `no acepta ${ctx.condicion ?? 'esta condición'}`);
    if (!ok) acepta = false;
  }

  if (regla.estadoMaterial !== 'indistinto') {
    const requiereBueno = regla.estadoMaterial === 'buen-estado';
    const ok = requiereBueno ? !ctx.danado : true;
    motivos.push(ok ? (requiereBueno ? 'buen estado' : 'acepta dañado') : 'solo buen estado');
    if (!ok) acepta = false;
  }

  if (regla.caducidadMinimaMeses != null) {
    const ok = ctx.mesesCaducidad != null && ctx.mesesCaducidad >= regla.caducidadMinimaMeses;
    motivos.push(ok ? `caducidad ≥ ${regla.caducidadMinimaMeses}m` : `requiere caducidad ≥ ${regla.caducidadMinimaMeses}m`);
    if (!ok) acepta = false;
  }

  if (!motivos.length) motivos.push('Sin restricciones');
  return { acepta, motivos };
}

export interface MatchDestinatario {
  dest: string;
  razonSocial: string;
  regla: ReglaAceptacion;
  evaluacion: EvaluacionAceptacion;
  /** Consumo histórico del destinatario para ese material (unidades), para priorizar. */
  consumoHistorico: number;
}

/** Todos los destinatarios con regla (global o específica) para `material`,
 * evaluados contra el contexto real del lote, ordenados: primero los que sí
 * aceptan, luego por consumo histórico descendente. */
export function destinatariosParaMaterial(
  reglas: ReglaAceptacion[],
  material: string,
  ctx: ContextoMaterial,
  opts: { razonSocialDe?: (dest: string) => string; consumoDe?: (dest: string) => number } = {},
): MatchDestinatario[] {
  const m = norm(material);
  const porDest = new Map<string, ReglaAceptacion>();
  for (const r of reglas) {
    if (!r.activa) continue;
    if (r.material != null && norm(r.material) !== m) continue;
    const d = norm(r.dest);
    const existing = porDest.get(d);
    // Prioriza la regla específica del material sobre la global del mismo destinatario.
    if (!existing || (existing.material == null && r.material != null)) porDest.set(d, r);
  }
  const out: MatchDestinatario[] = [];
  for (const [d, regla] of porDest) {
    out.push({
      dest: d,
      razonSocial: opts.razonSocialDe?.(d) ?? d,
      regla,
      evaluacion: evaluarAceptacion(regla, ctx),
      consumoHistorico: opts.consumoDe?.(d) ?? 0,
    });
  }
  return out.sort((a, b) => {
    if (a.evaluacion.acepta !== b.evaluacion.acepta) return a.evaluacion.acepta ? -1 : 1;
    return b.consumoHistorico - a.consumoHistorico;
  });
}
