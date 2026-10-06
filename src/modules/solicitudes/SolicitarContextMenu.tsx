import type { ReactNode } from 'react';
import { CheckCircle2, CheckSquare, ClipboardList, Copy, Eye, Square } from 'lucide-react';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@/components/ui/context-menu';
import { useClipboard } from '@/hooks/useClipboard';
import { CopiarClicItems } from '@/components/navigation/CopiarClicItems';

/** One "Copiar {label}" menu entry — value is copied verbatim, label is what
 * shows in "Copiar {label}" and in the success toast. */
export interface CopyItem {
  label: string;
  value: string;
}

interface SolicitarContextMenuProps {
  /** Wraps a single element (a TableRow/TableCell/StatTile) that forwards
   * its ref and spreads props onto the underlying DOM node, so Radix's
   * `asChild` can attach the right-click trigger directly to it — no extra
   * wrapper element, no visual change until the user actually right-clicks. */
  children: ReactNode;
  onSolicitar: () => void;
  /** Shows a disabled "Ya solicitado" line instead of hiding the option —
   * replaces the always-visible `SolicitadoBadge` used before this menu. */
  solicitado?: boolean;
  /** Optional extra label shown above the action (e.g. the material code),
   * useful when a single trigger covers a whole row with several materials. */
  label?: string;
  /** Opens the same detail view the row's double-click already opens —
   * surfaced here too since right-click is now the primary way users
   * discover row actions, and double-click alone isn't obvious. */
  onVerDetalle?: () => void;
  /** "Copiar {label}" entries for the row's key values (material, pedido,
   * cliente, centro, …) — one click, no need to select text by hand. */
  copyItems?: CopyItem[];
  /** "Seleccionar" / "Quitar de la selección" para tablas con selección múltiple. */
  seleccion?: { seleccionada: boolean; onToggle: () => void };
}

/** Shared right-click menu — replaces the inline Solicitar
 * buttons/columns previously duplicated across Sugerencias/Inventario/Resumen
 * Sin Sug./Consumo, and adds "Ver detalle" + "Copiar {campo}" so right-click
 * carries more than just Solicitar. */
export function SolicitarContextMenu({ children, onSolicitar, solicitado, label, onVerDetalle, copyItems, seleccion }: SolicitarContextMenuProps) {
  const { copy } = useClipboard();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {label && <ContextMenuLabel>{label}</ContextMenuLabel>}
        {label && <ContextMenuSeparator />}
        <ContextMenuItem onSelect={onSolicitar}>
          <ClipboardList className="size-3.5" /> Solicitar
        </ContextMenuItem>
        {onVerDetalle && (
          <ContextMenuItem onSelect={onVerDetalle}>
            <Eye className="size-3.5" /> Ver detalle
          </ContextMenuItem>
        )}
        {seleccion && (
          <ContextMenuItem onSelect={seleccion.onToggle}>
            {seleccion.seleccionada ? <Square className="size-3.5" /> : <CheckSquare className="size-3.5" />}
            {seleccion.seleccionada ? 'Quitar de la selección' : 'Seleccionar'}
          </ContextMenuItem>
        )}
        {solicitado && (
          <ContextMenuItem disabled>
            <CheckCircle2 className="size-3.5 text-success" /> Ya solicitado
          </ContextMenuItem>
        )}
        {copyItems && copyItems.length > 0 && (
          <>
            <ContextMenuSeparator />
            {copyItems.filter((it) => it.value).map((it) => (
              <ContextMenuItem key={it.label} onSelect={() => void copy(it.value, `${it.label} copiado`)}>
                <Copy className="size-3.5" /> Copiar {it.label}
              </ContextMenuItem>
            ))}
          </>
        )}
        <CopiarClicItems ocultar={(copyItems ?? []).map((it) => it.value)} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
