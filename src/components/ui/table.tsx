import * as React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** className applied to the scrolling wrapper div (not the <table> itself). Use this
   * to set a max-height for a scrollable table instead of nesting another overflow-auto
   * div around <Table> — a second scroll container breaks the sticky <thead>. */
  wrapperClassName?: string;
}

/** With row virtualization, `<tbody>` only ever holds the currently visible
 * slice of rows, so plain auto table-layout keeps recomputing column widths
 * from whatever happens to be mounted — columns visibly shift left/right on
 * every scroll tick. We track the widest width ever seen per column and pin
 * it as a `<colgroup>` floor (min, not fixed), so columns only ever grow,
 * never shrink back and forth, while still auto-sizing normally otherwise. */
const Table = React.forwardRef<HTMLTableElement, TableProps>(({ className, wrapperClassName, children, ...props }, ref) => {
  const localRef = React.useRef<HTMLTableElement>(null);
  const widthsRef = React.useRef<number[]>([]);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  React.useImperativeHandle(ref, () => localRef.current as HTMLTableElement, []);

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
        const w = Math.ceil(cell.getBoundingClientRect().width);
        if (w > (widthsRef.current[i] || 0)) { widthsRef.current[i] = w; changed = true; }
      });
    });
    if (changed) bump();
  });

  const widths = widthsRef.current;
  return (
    <div className={cn('relative w-full overflow-auto', wrapperClassName)}>
      <table ref={localRef} className={cn('w-full caption-bottom text-sm', className)} {...props}>
        {widths.length > 0 && (
          <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        )}
        {children}
      </table>
    </div>
  );
});

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

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <th ref={ref} className={cn('h-9 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-text-faint whitespace-nowrap', className)} {...props} />
));
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
    const active = activeKey === sortKey;
    const Icon = active && dir === 'asc' ? ChevronUp : active && dir === 'desc' ? ChevronDown : ChevronsUpDown;
    return (
      <th
        ref={ref}
        role="columnheader"
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onClick={() => onSort(sortKey)}
        className={cn(
          'h-9 select-none px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-text-faint whitespace-nowrap cursor-pointer hover:text-text-muted',
          className,
        )}
        {...props}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <Icon className={cn('size-3', active ? 'opacity-100 text-accent' : 'opacity-40')} />
        </span>
      </th>
    );
  },
);
SortableTableHead.displayName = 'SortableTableHead';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, SortableTableHead };
