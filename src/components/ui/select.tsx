import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Styled wrapper around a native `<select>` — deliberately NOT a Radix
 * Select. A plain OS-chrome dropdown sitting next to Input/Button (which all
 * carry the same rounded-md/border-border/focus-ring treatment) was the
 * single most visible "off-the-shelf" tell in the app; this keeps the native
 * element (free keyboard/a11y behavior, no portal/positioning to maintain)
 * but gives it the same visual weight via `appearance-none` + a custom
 * chevron, instead of pulling in a full custom listbox for something this
 * low-stakes. */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative inline-block">
      <select
        ref={ref}
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-border bg-bg-elevated py-1 pl-3 pr-8 text-sm text-text outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-faint" aria-hidden />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
