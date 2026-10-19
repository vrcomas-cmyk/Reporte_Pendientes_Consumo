import { useEffect, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import type { MensajeEjecutivo } from '@/core/mensajeEjecutivo';

/** Mensaje al ejecutivo de un pedido (folio, materiales, lotes y condiciones elegidos en el detalle): editable y listo para copiar y pegar en WhatsApp. */
export function MensajePedido({ mensaje, onCerrar }: { mensaje: MensajeEjecutivo; onCerrar: () => void }) {
  const { copy } = useClipboard();
  const [edit, setEdit] = useState<string | null>(null);
  // Si cambia la selección el texto se regenera (se descartan las ediciones a mano).
  useEffect(() => { setEdit(null); }, [mensaje.texto]);
  const texto = edit ?? mensaje.texto;
  return (
    <div className="border-t border-success/30 bg-success/5 px-3 py-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Mensaje para {mensaje.ejecutivo}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void copy(texto, 'Mensaje copiado')}
            className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/20">
            <Copy className="size-3.5" /> Copiar mensaje
          </button>
          <button type="button" onClick={onCerrar} aria-label="Cerrar el mensaje" className="rounded-md border border-border p-1.5 text-text-muted hover:text-text">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <textarea aria-label="Mensaje para el ejecutivo" value={texto} rows={Math.min(18, texto.split('\n').length + 1)} onChange={(e) => setEdit(e.target.value)}
        className="w-full resize-y rounded-md border border-border bg-bg-elevated p-2 font-mono text-xs outline-none focus:border-accent" />
      <p className="mt-1 text-[11px] text-text-faint">Edita el texto si quieres; al cambiar la selección de lotes se vuelve a generar.</p>
    </div>
  );
}
