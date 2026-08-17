import * as React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** className applied to the scrolling wrapper div (not the <table> itself). Use this
   * to set a max-height for a scrollable table instead of nesting another overflow-auto
   * div around <Table> — a second scroll container breaks the sticky <thead>. */
  wrapperClassName?: string;
  /** Habilita el ajuste manual de ancho de columnas (manija en el borde de cada
   * <th>) y persiste los anchos elegidos en localStorage bajo esta llave — misma
   * convención que `useColumnVisibility` (única por tabla, ej. 'sugerencias.cols'). */
  resizableKey?: string;
}

function readStoredWidths(key: string): Record<number, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(`table-widths:${key}`) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}
function writeStoredWidths(key: string, widths: Record<number, number>): void {
  try { localStorage.setItem(`table-widths:${key}`, JSON.stringify(widths)); } catch { /* ignore */ }
}

const MIN_COL_WIDTH = 48;

/** With row virtualization, `<tbody>` only ever holds the currently visible
 * slice of rows, so plain auto table-layout keeps recomputing column widths
 * from whatever happens to be mounted — columns visibly shift left/right on
 * every scroll tick. We track the widest width ever seen per column and pin
 * it as a `<colgroup>` floor (min, not fixed), so columns only ever grow,
 * never shrink back and forth, while still auto-sizing normally otherwise.
 *
 * Si `resizableKey` viene, un ancho fijado a mano por el usuario (arrastrando
 * la manija de un <th>) tiene prioridad sobre esa medición automática — deja
 * de crecer/auto-medirse esa columna hasta que se resetee (doble clic). */
const Table = React.forwardRef<HTMLTableElement, TableProps>(({ className, wrapperClassName, resizableKey, children, ...props }, ref) => {
  const localRef = React.useRef<HTMLTableElement>(null);
  const widthsRef = React.useRef<number[]>([]);
  const [manualWidths, setManualWidthsState] = React.useState<Record<number, number>>(() => (resizableKey ? readStoredWidths(resizableKey) : {}));
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  React.useImperativeHandle(ref, () => localRef.current as HTMLTableElement, []);

  const setManualWidths = React.useCallback((next: Record<number, number>) => {
    setManualWidthsState(next);
    if (resizableKey) writeStoredWidths(resizableKey, next);
  }, [resizableKey]);

  React.useLayoutEffect(() => {
    const table = localRef.current;
    if (!table) return;
    const rows = table.querySelectorAll<HTMLTableRowElement>(':scope > thead > tr, :scope > tbody > tr');
    let changed = false;
    rows.forEach((row) => {
      const cells = Array.from(row.children) as HTMLTableCellElement[];
      // Virtualizer padding rows are a single <td colSpan={colCount}> spacer — skip them.
      if (cells.length === 1 && cells[0].colSpan > 1) return;
      cells.forEach((cell, i) => {
        if (manualWidths[i] != null) return; // ancho fijado a mano — no lo recalcules
        const w = Math.ceil(cell.getBoundingClientRect().width);
        if (w > (widthsRef.current[i] || 0)) { widthsRef.current[i] = w; changed = true; }
      });
    });
    if (changed) bump();
  });

  const dragState = React.useRef<{ col: number; startX: number; startW: number } | null>(null);

  const onResizeStart = React.useCallback((col: number, startX: number) => {
    const table = localRef.current;
    if (!table) return;
    const th = table.querySelectorAll<HTMLTableCellElement>(':scope > thead > tr > *')[col];
    const startW = manualWidths[col] ?? (th ? Math.ceil(th.getBoundingClientRect().width) : MIN_COL_WIDTH);
    dragState.current = { col, startX, startW };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const w = Math.max(MIN_COL_WIDTH, dragState.current.startW + (ev.clientX - dragState.current.startX));
      setManualWidths({ ...manualWidths, [dragState.current.col]: w });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [manualWidths, setManualWidths]);

  const onResizeReset = React.useCallback((col: number) => {
    const next = { ...manualWidths };
    delete next[col];
    setManualWidths(next);
  }, [manualWidths, setManualWidths]);

  const onResizeSet = React.useCallback((col: number, w: number) => {
    setManualWidths({ ...manualWidths, [col]: Math.max(MIN_COL_WIDTH, w) });
  }, [manualWidths, setManualWidths]);

  const onResizePeek = React.useCallback(
    (col: number): number => {
      const table = localRef.current;
      if (!table) return MIN_COL_WIDTH;
      const th = table.querySelectorAll<HTMLTableCellElement>(':scope > thead > tr > *')[col];
      return manualWidths[col] ?? (th ? Math.ceil(th.getBoundingClientRect().width) : MIN_COL_WIDTH);
    },
    [manualWidths],
  );

  const widths = widthsRef.current;
  return (
    <TableResizeContext.Provider value={resizableKey ? { onResizeStart, onResizeSet, onResizePeek, onResizeReset } : null}>
      <div className={cn('relative w-full overflow-auto', wrapperClassName)}>
        <table ref={localRef} className={cn('w-full caption-bottom text-sm', className)} {...props}>
          {(widths.length > 0 || Object.keys(manualWidths).length > 0) && (
            <colgroup>
              {Array.from({ length: Math.max(widths.length, ...Object.keys(manualWidths).map((k) => +k + 1), 0) }).map((_, i) => (
                <col key={i} style={{ width: manualWidths[i] ?? widths[i] }} />
              ))}
            </colgroup>
          )}
          {children}
        </table>
      </div>
    </TableResizeContext.Provider>
  );
});

interface TableResizeCtx {
  onResizeStart: (col: number, startX: number) => void;
  onResizeSet: (col: number, w: number) => void;
  onResizePeek: (col: number) => number;
  onResizeReset: (col: number) => void;
}
const TableResizeContext = React.createContext<TableResizeCtx | null>(null);

/** Manija de arrastre para el borde derecho de un <th> — solo se renderiza
 * cuando la tabla contenedora trae `resizableKey`. `stopPropagation` evita
 * que el arrastre dispare el `onSort` de `SortableTableHead`. Accesible por
 * teclado: flechas Izq/Der ajustan ±16px, Borrar/Retroceso restablece. */
function ResizeHandle({ col }: { col: () => number }) {
  const ctx = React.useContext(TableResizeContext);
  if (!ctx) return null;
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const w = Math.max(MIN_COL_WIDTH, (ctx.onResizePeek?.(col()) ?? 0) + (e.key === 'ArrowRight' ? 16 : -16));
      ctx.onResizeSet(col(), w);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      ctx.onResizeReset(col());
    }
  };
  return (
    <button
      type="button"
      tabIndex={0}
      aria-label="Ajustar ancho de columna. Flechas izquierda y derecha cambian el ancho, borrar lo restablece."
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); ctx.onResizeStart(col(), e.clientX); }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); ctx.onResizeReset(col()); }}
      onKeyDown={onKeyDown}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none border-0 bg-transparent p-0 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
    />
  );
}

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('sticky top-0 z-10 bg-bg-elevated [&_tr]:border-b', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn('border-b border-border transition-colors hover:bg-bg-inset/60 data-[state=selected]:bg-accent-soft', className)} {...props} />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, children, ...props }, ref) => {
  const localRef = React.useRef<HTMLTableCellElement>(null);
  React.useImperativeHandle(ref, () => localRef.current as HTMLTableCellElement, []);
  const resize = React.useContext(TableResizeContext);
  return (
    <th ref={localRef} className={cn('relative h-9 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-text-faint whitespace-nowrap', className)} {...props}>
      {children}
      {resize && <ResizeHandle col={() => localRef.current?.cellIndex ?? 0} />}
    </th>
  );
});
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-3 py-2 align-middle whitespace-nowrap', className)} {...props} />
));
TableCell.displayName = 'TableCell';

export type SortDir = 'asc' | 'desc' | null;

interface SortableTableHeadProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'dir'> {
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onSort: (key: string) => void;
}

const SortableTableHead = React.forwardRef<HTMLTableCellElement, SortableTableHeadProps>(
  ({ className, sortKey, activeKey, dir, onSort, children, ...props }, ref) => {
    const localRef = React.useRef<HTMLTableCellElement>(null);
    React.useImperativeHandle(ref, () => localRef.current as HTMLTableCellElement, []);
    const resize = React.useContext(TableResizeContext);
    const active = activeKey === sortKey;
    const Icon = active && dir === 'asc' ? ChevronUp : active && dir === 'desc' ? ChevronDown : ChevronsUpDown;
    const onKeyDown = (e: React.KeyboardEvent<HTMLTableCellElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort(sortKey);
      }
    };
    return (
      <th
        ref={localRef}
        role="columnheader"
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        tabIndex={0}
        onClick={() => onSort(sortKey)}
        onKeyDown={onKeyDown}
        className={cn(
          'relative h-9 select-none px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-text-faint whitespace-nowrap cursor-pointer hover:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent',
          className,
        )}
        {...props}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <Icon className={cn('size-3', active ? 'opacity-100 text-accent' : 'opacity-40')} />
        </span>
        {resize && <ResizeHandle col={() => localRef.current?.cellIndex ?? 0} />}
      </th>
    );
  },
);
SortableTableHead.displayName = 'SortableTableHead';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead };
