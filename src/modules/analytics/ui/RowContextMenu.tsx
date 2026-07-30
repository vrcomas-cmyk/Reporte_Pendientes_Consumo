import type { ReactNode } from 'react';
import { Copy, Eye } from 'lucide-react';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@/components/ui/context-menu';
import { useClipboard } from '@/hooks/useClipboard';
import type { CopyItem } from '@/modules/solicitudes/SolicitarContextMenu';

/** Lightweight right-click menu for read-only report rows that have no
 * "Solicitar" flow (Resultados, Comodato, rankings…): "Ver detalle" +
 * "Copiar {campo}" only. Use `SolicitarContextMenu` instead wherever a row
 * can actually be solicited. */
export function RowContextMenu({ children, label, onVerDetalle, copyItems }: {
  children: ReactNode;
  label?: string;
  onVerDetalle?: () => void;
  copyItems: CopyItem[];
}) {
  const { copy } = useClipboard();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {label && <ContextMenuLabel>{label}</ContextMenuLabel>}
        {label && <ContextMenuSeparator />}
        {onVerDetalle && (
          <ContextMenuItem onSelect={onVerDetalle}>
            <Eye className="size-3.5" /> Ver detalle
          </ContextMenuItem>
        )}
        {onVerDetalle && copyItems.some((it) => it.value) && <ContextMenuSeparator />}
        {copyItems.filter((it) => it.value).map((it) => (
          <ContextMenuItem key={it.label} onSelect={() => void copy(it.value, `${it.label} copiado`)}>
            <Copy className="size-3.5" /> Copiar {it.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
