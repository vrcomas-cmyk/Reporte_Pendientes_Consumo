import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

// ---------------------------------------------------------------------------
// CheatsheetDialog · modal togglable via `?` (or via the command palette).
// Lists every keyboard shortcut in the app. Pure presentational.
// ---------------------------------------------------------------------------

const SHORTCUTS: { group: string; items: { keys: string; desc: string }[] }[] = [
  {
    group: 'Navegación',
    items: [
      { keys: 'Cmd/Ctrl + K', desc: 'Abrir paleta de comandos' },
      { keys: 'g  d', desc: 'Ir al Panel general' },
      { keys: 'g  c', desc: 'Ir a Carga' },
      { keys: 'g  r', desc: 'Ir a Generar reporte' },
      { keys: 'g  s', desc: 'Ir a Sugerencias' },
      { keys: 'g  o', desc: 'Ir a Consumo' },
      { keys: 'g  i', desc: 'Ir a Inventario' },
      { keys: 'g  a', desc: 'Ir a Análisis' },
      { keys: 'g  q', desc: 'Ir a Solicitudes' },
      { keys: 'g  l', desc: 'Ir a Registros' },
      { keys: 'g  h', desc: 'Ir a Historial' },
    ],
  },
  {
    group: 'Acciones',
    items: [
      { keys: '/', desc: 'Enfocar la búsqueda de la página actual' },
      { keys: 't', desc: 'Cambiar tema claro/oscuro' },
      { keys: 'b', desc: 'Colapsa/expandir barra lateral' },
      { keys: '?', desc: 'Mostrar esta cheatsheet' },
      { keys: 'Esc', desc: 'Cerrar panel / diálogo / cheatsheet' },
    ],
  },
  {
    group: 'Tablas',
    items: [
      { keys: 'Clic en fila', desc: 'Copiar valor de la celda (ver tooltip)' },
      { keys: 'Enter', desc: 'Abrir el detalle de una fila (cuando está enfocada)' },
      { keys: 'Doble clic en fila', desc: 'Drill-down completo (legacy)' },
    ],
  },
];

export interface CheatsheetDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CheatsheetDialog({ open, onOpenChange }: CheatsheetDialogProps) {
  // Close on Escape works via Radix by default — no extra handler needed.
  // Make sure focus is restored to where the user was when closed.
  useEffect(() => { /* placeholder for future focus-trap fine-tuning */ }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[95] bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[10vh] z-[96] w-[92vw] max-w-lg -translate-x-1/2 rounded-xl border border-border bg-bg-elevated p-5 shadow-2xl">
          <div className="flex items-center justify-between pb-3">
            <DialogPrimitive.Title className="font-display text-lg font-semibold">Atajos de teclado</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded p-1 text-text-faint hover:text-text">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            {SHORTCUTS.map((sec) => (
              <div key={sec.group}>
                <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">{sec.group}</h3>
                <dl className="space-y-1">
                  {sec.items.map((it) => (
                    <div key={it.desc} className="flex items-center justify-between gap-3">
                      <dt className="text-sm text-text-muted">{it.desc}</dt>
                      <dd>
                        <kbd className="rounded border border-border bg-bg-inset px-1.5 py-0.5 font-mono text-[11px] text-text">{it.keys}</kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
