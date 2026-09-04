import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** When set, an active chip renders an X and calls this instead of onClick
   * — the "selected filter, click to clear" pattern (vs. a plain multi-select
   * toggle, which just flips `active` via onClick). */
  onClear?: () => void;
}

/** Shared pill/chip for quick filters and multi-select toggles — replaces the
 * hand-rolled `rounded-full border ...` buttons that had drifted into
 * slightly different shapes across Oportunidades' filter rows. */
export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ className, active, onClear, children, onClick, ...props }, ref) => {
    if (active && onClear) {
      return (
        <button
          type="button"
          ref={ref}
          onClick={onClear}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs text-accent transition-colors hover:bg-accent-soft/70',
            className,
          )}
          {...props}
        >
          {children}
          <X className="size-3" />
        </button>
      );
    }
    return (
      <button
        type="button"
        ref={ref}
        onClick={onClick}
        className={cn(
          'rounded-full border px-3 py-1 text-xs transition-colors',
          active ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-muted hover:bg-bg-inset',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
FilterChip.displayName = 'FilterChip';
