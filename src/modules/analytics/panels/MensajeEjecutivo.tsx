import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { formatFechaCaducidad } from '@/lib/utils';
import { armarMensajesEjecutivo, type FilaMensaje, type LoteMensaje } from '@/core/mensajeEjecutivo';
import type { BOItem } from '@/core/buildBO';
import type { ConsumoRow, Sugerencia } from '@/core/types';
import { consumoEnrich } from '../helpers';
import type { Analytics } from '../AnalyticsContext';
import { claveConsumo } from './_shared';

/** Lo que muestra la tabla "Lotes, condiciones y materiales ofertables": todo lo visible, lo marcado y cómo se calcula su precio. */
export interface LotesOfertados {
  visibles: Sugerencia[];
  seleccion: Sugerencia[];
  precioDe: (f: Sugerencia) => number;
}

/** Mensaje para el/los ejecutivo(s) de las filas elegidas de Sugerencias / Consumo, proponiendo los lotes ofertables (los marcados o, si no hay
 * ninguno marcado, todos los visibles). Un bloque por ejecutivo, editable, con botón para copiarlo (se pega en WhatsApp). */
export function MensajeEjecutivo({ a, material, centro, descripcion, sug, cons, selSug, selCons, lotes, onLimpiar }: {
  a: Analytics; material: string; centro: string; descripcion: string; sug: BOItem[]; cons: ConsumoRow[];
  selSug: ReadonlySet<string>; selCons: ReadonlySet<string>; lotes: LotesOfertados; onLimpiar: () => void;
}) {
  const { copy } = useClipboard();
  const [edit, setEdit] = useState<Record<string, string>>({});

  const mensajes = useMemo(() => {
    const ce = consumoEnrich(a.enrich);
    const filas: FilaMensaje[] = [
      ...sug.filter((it) => selSug.has(it.k)).map((it): FilaMensaje => ({
        tipo: 'sug', ejecutivo: a.enrich.ejecutivoNombre(it.bo.gpoVdor) || '', cliente: it.bo.razonSocial, pedido: it.bo.pedido, cantidad: it.bo.cantidadPendiente,
      })),
      ...cons.filter((r) => selCons.has(claveConsumo(r))).map((r): FilaMensaje => ({
        tipo: 'cons', ejecutivo: ce.ejec(r) || '', cliente: r.razonSocial, cantidad: r.consumoPromedioMensual,
      })),
    ];
    const elegidos = lotes.seleccion.length ? lotes.seleccion : lotes.visibles;
    const lotesMsg = elegidos.map((f): LoteMensaje => ({
      material: f.materialSugerido, descripcion: f.descripcionSugerida, lote: f.lote, caducidad: f.fechaCaducidad ? formatFechaCaducidad(f.fechaCaducidad) : '',
      disponible: f.disponible, precio: lotes.precioDe(f), fuente: f.fuente,
    }));
    return armarMensajesEjecutivo({ material, descripcion, centro, filas, lotes: lotesMsg });
  }, [a.enrich, sug, cons, selSug, selCons, lotes, material, descripcion, centro]);

  // Si cambia la selección o los lotes, los textos se regeneran (se descartan las ediciones a mano).
  const firma = mensajes.map((m) => m.texto).join('\u0001');
  useEffect(() => { setEdit({}); }, [firma]);

  const total = selSug.size + selCons.size;
  if (!total) return null;
  return (
    <div className="mt-3 rounded-lg border border-success/40 bg-success/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Mensaje para el ejecutivo · {total} fila(s) elegida(s)</h4>
        <button type="button" onClick={onLimpiar} className="text-xs text-text-faint hover:text-danger">Limpiar selección</button>
      </div>
      <p className="mb-2 text-[11px] text-text-faint">
        Incluye {lotes.seleccion.length ? `los ${lotes.seleccion.length} lote(s) marcados` : `todos los lotes visibles (${lotes.visibles.length})`} de «Lotes, condiciones y materiales ofertables».
        Edita el texto si quieres y cópialo para pegarlo en WhatsApp.
      </p>
      <div className="space-y-3">
        {mensajes.map((m) => {
          const texto = edit[m.ejecutivo] ?? m.texto;
          return (
            <div key={m.ejecutivo}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{m.ejecutivo} <span className="font-normal text-text-faint">· {m.filas.length} fila(s)</span></span>
                <button type="button" onClick={() => void copy(texto, `Mensaje para ${m.ejecutivo} copiado`)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20">
                  <Copy className="size-3.5" /> Copiar mensaje
                </button>
              </div>
              <textarea aria-label={`Mensaje para ${m.ejecutivo}`} value={texto} rows={Math.min(14, texto.split('\n').length + 1)}
                onChange={(e) => setEdit((s) => ({ ...s, [m.ejecutivo]: e.target.value }))}
                className="w-full resize-y rounded-md border border-border bg-bg-elevated p-2 font-mono text-xs outline-none focus:border-accent" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
