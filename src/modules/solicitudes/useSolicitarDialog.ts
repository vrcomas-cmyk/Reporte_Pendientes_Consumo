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
