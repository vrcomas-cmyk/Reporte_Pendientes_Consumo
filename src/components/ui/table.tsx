import * as React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** className applied to the scrolling wrapper div (not the <table> itself). Use this
   * to set a max-height for a scrollable table instead of nesting another overflow-auto
   * div around <Table> — a second scroll container breaks the sticky <thead>. */
  wrapperClassName?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(({ className, wrapperClassName, ...props }, ref) => (
  <div className={cn('relative w-full overflow-auto', wrapperClassName)}>
    <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
));
Table.displayName = 'Table';

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
