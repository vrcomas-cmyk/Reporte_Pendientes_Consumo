import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTilesOcultosStore } from '@/store/tilesOcultosStore';

/** Botón (solo si hay tarjetas ocultas) para volver a mostrarlas. Flotante en las páginas; `inline` dentro de los
 * paneles de detalle. La lista se despliega en el mismo lugar (sin Popover/portal): el Sheet modal deja
 * `pointer-events: none` fuera de su contenido y un popover en `body` no recibía los clics. */
export function TilesOcultosControl({ inline = false }: { inline?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const ocultos = useTilesOcultosStore((s) => s.ocultos);
  const mostrar = useTilesOcultosStore((s) => s.mostrar);
  const mostrarTodos = useTilesOcultosStore((s) => s.mostrarTodos);
  if (!ocultos.length) return null;
  return (
    <div className={inline ? 'mb-3' : 'fixed bottom-3 left-3 z-[60]'}>
      {abierto && (
        <div className={`w-64 rounded-md border border-border bg-bg-elevated p-2 shadow-lg ${inline ? 'mb-2' : 'absolute bottom-full mb-2'}`}>
          <ul className="max-h-64 overflow-y-auto">
            {ocultos.map((k) => (
              <li key={k}>
                <button type="button" onClick={() => mostrar(k)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-bg-subtle">
                  <Eye className="size-3.5 shrink-0" /> <span className="truncate">{k}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { mostrarTodos(); setAbierto(false); }} className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs hover:bg-bg-subtle">Mostrar todas</button>
        </div>
      )}
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-xs text-text-muted shadow-lg hover:text-text">
        <EyeOff className="size-3.5" /> {ocultos.length} tarjeta(s) oculta(s)
      </button>
    </div>
  );
}
