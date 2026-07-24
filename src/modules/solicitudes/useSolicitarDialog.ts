import { useState } from 'react';
import type { SolicitudDraft } from '@/services/solicitudService';

/** One selectable supply source (a fuente in Sugerencias, a lote in
 * Inventario/Resumen Sin Sug.) — picking one swaps the dialog's draft
 * wholesale rather than patching individual fields, since origin fields all
 * change together (centro/almacén/lote/caducidad/cantidad). */
export interface LoteOption {
  key: string;
  label: string;
  draft: SolicitudDraft;
  /** Display-only in the picker — Condición is a material-level attribute
   * (see `EnrichIndex.matCondiciones`), it's never sent to the DRP Sheet
   * (not one of its 16 columns), so it isn't part of `SolicitudDraft`. */
  condicion?: string;
}

/** Shared open/draft state for the "Solicitar" dialog, used identically from
 * SugerenciasPage/InventarioPage/ResumenSinPage/ConsumoPage so each page only
 * needs to build the initial draft (+ optional lote choices) for a row. */
export function useSolicitarDialog() {
  const [state, setState] = useState<{ draft: SolicitudDraft; loteOptions?: LoteOption[] } | null>(null);

  return {
    dialogDraft: state?.draft ?? null,
    dialogLoteOptions: state?.loteOptions,
    abrir: (draft: SolicitudDraft, loteOptions?: LoteOption[]) => setState({ draft, loteOptions }),
    cerrar: () => setState(null),
  };
}
