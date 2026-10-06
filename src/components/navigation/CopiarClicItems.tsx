import { Copy } from 'lucide-react';
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { useClipboard } from '@/hooks/useClipboard';
import { getClickCopy, recortar } from '@/lib/clickCopy';

/** "Copiar" de lo que está bajo el cursor, para los menús de fila (Radix). Lee el
 * último clic derecho que capturó `GlobalCopyMenu` — se evalúa al abrirse el menú,
 * justo después del clic. `ocultar` evita repetir valores que la fila ya ofrece. */
export function CopiarClicItems({ ocultar = [] }: { ocultar?: string[] }) {
  const { copy } = useClipboard();
  const info = getClickCopy();
  const items: { label: string; valor: string }[] = [];
  if (info.seleccion) items.push({ label: 'Copiar selección', valor: info.seleccion });
  if (info.palabra && !ocultar.includes(info.palabra)) items.push({ label: `Copiar «${recortar(info.palabra)}»`, valor: info.palabra });
  if (info.bloque && info.bloque !== info.palabra && info.bloque !== info.seleccion && !ocultar.includes(info.bloque)) {
    items.push({ label: `Copiar «${recortar(info.bloque)}»`, valor: info.bloque });
  }
  if (!items.length) return null;
  return (
    <>
      <ContextMenuSeparator />
      {items.map((it) => (
        <ContextMenuItem key={it.label} onSelect={() => void copy(it.valor, 'Copiado')}>
          <Copy className="size-3.5" /> {it.label}
        </ContextMenuItem>
      ))}
    </>
  );
}
