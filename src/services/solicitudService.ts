import { solicitudRepository } from '@/repositories';
import { enviarSolicitudDRP } from './drpService';
import type { EnrichIndex } from '@/core/enrich';
import type {
  SolicitudDRP,
  SolicitudOrigen,
  Sugerencia,
  InvDetalleRow,
  ConsumoRow,
} from '@/core/types';
import { norm } from '@/lib/text';
import { logInfo } from '@/lib/logError';

/** What a "Solicitar" dialog prefills and lets the user edit before
 * `crear()` persists + sends it. Missing origin/destination fields are left
 * blank ('') for the dialog to collect. */
export type SolicitudDraft = Omit<SolicitudDRP, 'id' | 'sync' | 'sentAt' | 'error'>;

// ---------------------------------------------------------------------------
// Draft builders — one per report page, pure functions using only what each
// row/model already carries (see docs/plan mapping). `boKey` is BOItem.k
// (already = pedido|materialBase|centroPedido|almacen|destinatario) so the
// dedupe key stays stable regardless of which fuente/lote gets picked.
// ---------------------------------------------------------------------------

/** Sugerencias (BO): `bo` is the demand row, `fuente` the supply source the
 * user picked (one of BOItem.fuentes) — or null when the BO has no fuentes
 * and origin must be filled in manually. */
export function buildFromSugerencia(
  bo: Sugerencia,
  boKey: string,
  fuente: Sugerencia | null,
  enrich: EnrichIndex,
): SolicitudDraft {
  const codigo = norm(fuente?.materialSugerido) || norm(bo.materialBase);
  return {
    fechaSolicitud: new Date().toISOString(),
    centroOrigen: norm(fuente?.centroSugerido) || norm(bo.centroInv),
    almacenOrigen: norm(fuente?.almacenSugerido),
    centroDestino: norm(bo.centroPedido),
    almacenDestino: norm(bo.almacen),
    codigo,
    descripcion: norm(fuente?.descripcionSugerida) || enrich.matTexto(codigo) || norm(bo.descripcionSolicitada),
    cantidad: fuente ? Number(fuente.cantidadOfertar) || 0 : Number(bo.cantidadPendiente) || 0,
    um: enrich.matUm(codigo),
    lote: norm(fuente?.lote),
    fechaCaducidad: norm(fuente?.fechaCaducidad),
    comentarios: '',
    pedidos: norm(bo.pedido),
    origen: 'sugerencias',
    sourceKey: `sug|${boKey}|${norm(fuente?.lote)}`,
  };
}

/** Inventario: the lote itself is the origin; destino/pedidos are unknown
 * here and must be filled in the dialog. */
export function buildFromInvDetalle(lote: InvDetalleRow, enrich: EnrichIndex): SolicitudDraft {
  return {
    fechaSolicitud: new Date().toISOString(),
    centroOrigen: norm(lote.centro),
    almacenOrigen: norm(lote.almacen),
    centroDestino: '',
    almacenDestino: '',
    codigo: norm(lote.material),
    descripcion: norm(lote.textoBreve),
    cantidad: Number(lote.cantidadDisp) || 0,
    um: enrich.matUm(lote.material),
    lote: norm(lote.lote),
    fechaCaducidad: norm(lote.fechaCaducidad),
    comentarios: '',
    pedidos: '',
    origen: 'inventario',
    sourceKey: `inv|${norm(lote.material)}|${norm(lote.centro)}|${norm(lote.almacen)}|${norm(lote.lote)}`,
  };
}

/** Resumen Sin Sugerencias destino, described with primitives rather than
 * the raw `ResumenSinSugerenciaRow` type: the page only has access to the
 * Material×Centro pivot (`RSSMaterial`/`RSSCentro` from resumenSin.ts), which
 * aggregates rows and doesn't reliably preserve a single almacén/pedido per
 * cell — those are left blank ('') when the pivot doesn't have them.
 * Origin comes from a lote the user picks from `a.lotes` (matched via
 * loteKey(material, centro)), or is left blank to fill manually. */
export function buildFromResumenSin(
  destino: { material: string; descripcion: string; centro: string; almacen?: string; pedidos?: string; cantidadPendiente: number },
  loteElegido: InvDetalleRow | null,
  enrich: EnrichIndex,
): SolicitudDraft {
  return {
    fechaSolicitud: new Date().toISOString(),
    centroOrigen: norm(loteElegido?.centro),
    almacenOrigen: norm(loteElegido?.almacen),
    centroDestino: norm(destino.centro),
    almacenDestino: norm(destino.almacen),
    codigo: norm(destino.material),
    descripcion: norm(destino.descripcion),
    cantidad: loteElegido ? Number(loteElegido.cantidadDisp) || 0 : Number(destino.cantidadPendiente) || 0,
    um: enrich.matUm(destino.material),
    lote: norm(loteElegido?.lote),
    fechaCaducidad: norm(loteElegido?.fechaCaducidad),
    comentarios: '',
    pedidos: norm(destino.pedidos),
    origen: 'resumenSin',
    sourceKey: `rss|${norm(destino.material)}|${norm(destino.centro)}|${norm(destino.almacen)}|${norm(destino.pedidos)}`,
  };
}

/** Consumo: only the destino material/centro/um are known; origin, lote and
 * pedidos are left blank for the dialog. */
export function buildFromConsumo(row: ConsumoRow): SolicitudDraft {
  return {
    fechaSolicitud: new Date().toISOString(),
    centroOrigen: '',
    almacenOrigen: '',
    centroDestino: norm(row.centro),
    almacenDestino: '',
    codigo: norm(row.material),
    descripcion: norm(row.textoMaterial),
    cantidad: 0,
    um: norm(row.um),
    lote: '',
    fechaCaducidad: '',
    comentarios: '',
    pedidos: '',
    origen: 'consumo',
    sourceKey: `con|${norm(row.material)}|${norm(row.centro)}`,
  };
}

// ---------------------------------------------------------------------------
// Persist + send
// ---------------------------------------------------------------------------

/** TEMP: the Apps Script `doPost` webhook isn't deployed yet — auto-send is
 * paused so requests just save locally and get pasted into the Sheet
 * manually (Solicitudes DRP → Exportar a Excel). Set to true (or delete this
 * flag) once VITE_DRP_WEBHOOK_URL is configured and working — see
 * docs/apps-script-drp.md. */
const DRP_AUTO_SEND = false;

/** Persists a draft locally (sync:'pendiente'). While DRP_AUTO_SEND is off,
 * that's the whole flow — the user pastes it into the Sheet manually.
 * Once re-enabled, this also sends it to the DRP Sheet and updates the local
 * record to 'enviada'/'error', returning the final record either way so the
 * caller can show the result and let the user retry via `reenviar`. */
export async function crear(draft: SolicitudDraft): Promise<SolicitudDRP> {
  const id = await solicitudRepository.add({ ...draft, sync: 'pendiente' });
  const solicitud: SolicitudDRP = { ...draft, id, sync: 'pendiente' };
  if (!DRP_AUTO_SEND) return solicitud;
  try {
    await enviarSolicitudDRP(solicitud);
    const patch: Partial<SolicitudDRP> = { sync: 'enviada', sentAt: new Date().toISOString(), error: undefined };
    await solicitudRepository.update(id, patch);
    void logInfo('drp-solicitud', `Enviada: ${draft.codigo} lote ${draft.lote || '—'} (${draft.origen})`);
    return { ...solicitud, ...patch };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await solicitudRepository.update(id, { sync: 'error', error: message });
    void logInfo('drp-solicitud-error', `${draft.codigo} lote ${draft.lote || '—'} (${draft.origen}): ${message}`);
    return { ...solicitud, sync: 'error', error: message };
  }
}

/** Retries sending a previously failed (or pending) request without creating
 * a duplicate local record. */
export async function reenviar(solicitud: SolicitudDRP): Promise<SolicitudDRP> {
  if (solicitud.id == null) throw new Error('La solicitud no tiene id — no se puede reenviar.');
  try {
    await enviarSolicitudDRP(solicitud);
    const patch: Partial<SolicitudDRP> = { sync: 'enviada', sentAt: new Date().toISOString(), error: undefined };
    await solicitudRepository.update(solicitud.id, patch);
    return { ...solicitud, ...patch };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await solicitudRepository.update(solicitud.id, { sync: 'error', error: message });
    return { ...solicitud, sync: 'error', error: message };
  }
}

export async function eliminar(id: number): Promise<void> {
  await solicitudRepository.remove(id);
}

export async function listar(): Promise<SolicitudDRP[]> {
  return solicitudRepository.list();
}

export type { SolicitudOrigen };
