// ---------------------------------------------------------------------------
// ajustesCaducidadService.ts · Lee y guarda los ajustes manuales de caducidad en la hoja «Ajustes_Caducidad» de Google Sheets,
// a través de la función `envios` (acciones cad_*). Hay una copia en localStorage para que el ajuste siga aplicándose sin conexión.
// ---------------------------------------------------------------------------
import { llamarEnvios } from '@/services/enviosService';
import { fechaIsoValida, type AjusteCaducidad } from '@/core/ajusteCaducidad';

const CACHE_KEY = 'ajustes_caducidad_v1';

interface RespuestaListar { exito: boolean; ajustes?: unknown }

/** Normaliza lo que devuelve el Apps Script (fechas de Sheets pueden llegar con hora). */
function normalizar(raw: unknown): AjusteCaducidad[] {
  if (!Array.isArray(raw)) return [];
  const out: AjusteCaducidad[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const fecha = fechaIsoValida(o.fecha);
    const material = String(o.material ?? '').trim();
    const lote = String(o.lote ?? '').trim();
    if (!fecha || !material || !lote) continue;
    out.push({
      material, lote, fecha,
      sistema: fechaIsoValida(o.sistema) ?? '',
      usuario: String(o.usuario ?? '').trim(),
      actualizado: String(o.actualizado ?? '').trim(),
      nota: String(o.nota ?? '').trim(),
    });
  }
  return out;
}

export function leerCacheAjustes(): AjusteCaducidad[] {
  try { return normalizar(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')); } catch { return []; }
}
export function guardarCacheAjustes(lista: readonly AjusteCaducidad[]): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(lista)); } catch { /* sin almacenamiento: solo se pierde la copia local */ }
}

/** Todos los ajustes de la hoja de respaldo. */
export async function listarAjustesCaducidad(): Promise<AjusteCaducidad[]> {
  const r = await llamarEnvios<RespuestaListar>('cad_listar');
  return normalizar(r.ajustes);
}

/** Guarda (o reemplaza) el ajuste de un material + lote en la hoja. El usuario y la hora los pone el servidor. */
export async function guardarAjusteCaducidad(a: { material: string; lote: string; fecha: string; sistema: string; nota: string }): Promise<AjusteCaducidad> {
  const r = await llamarEnvios<{ exito: boolean; ajuste?: unknown }>('cad_guardar', a);
  return normalizar([r.ajuste])[0] ?? { ...a, usuario: '', actualizado: '' };
}

/** Quita el ajuste de la hoja (el lote vuelve a la caducidad del sistema). */
export async function borrarAjusteCaducidad(material: string, lote: string): Promise<void> {
  await llamarEnvios('cad_borrar', { material, lote });
}
