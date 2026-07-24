import { CheckCircle2 } from 'lucide-react';

/** Small "ya solicitada" indicator shown next to a row's Solicitar action.
 * Callers compute `solicitado` from useSolicitudStore — a plain
 * `sourceKeys.has(key)` for pages where a row maps to exactly one sourceKey
 * (Inventario/Resumen Sin Sug./Consumo), or a prefix match for Sugerencias
 * (where the lote — and so the exact sourceKey — is only chosen inside the
 * dialog). */
export function SolicitadoBadge({ solicitado }: { solicitado: boolean }) {
  if (!solicitado) return null;
  return (
    <span
      title="Ya se solicitó este lote/material"
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
    >
      <CheckCircle2 className="size-3" />Solicitado
    </span>
  );
}
