import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * Shared row-virtualization helper for large tables.
 * Wraps @tanstack/react-virtual so tables only render the rows currently
 * visible in the scroll viewport, avoiding the need to cap dataset size.
 *
 * Usage:
 *   const { scrollRef, items, paddingTop, paddingBottom } = useRowVirtualizer(rows.length);
 *   <div ref={scrollRef} className="h-full overflow-auto">
 *     <table>
 *       <tbody>
 *         {paddingTop > 0 && <tr><td style={{ height: paddingTop }} colSpan={colCount} /></tr>}
 *         {items.map((vi) => renderRow(rows[vi.index]))}
 *         {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} colSpan={colCount} /></tr>}
 *       </tbody>
 *     </table>
 *   </div>
 */
export function useRowVirtualizer(count: number, estimateSize = 36, overscan = 12) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length ? items[0].start : 0;
  const paddingBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;

  return { scrollRef, virtualizer, items, paddingTop, paddingBottom };
}
