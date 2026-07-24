import type { ReactNode } from 'react';

/** Clickable chip for cross-navigation / quick filters (legacy .lnk).
 *  Single click triggers the action (was historically double-click as
 *  accidental-click protection, but that blocked keyboard / SR users).
 */
export function Chip({ children, onClick, title }: { children: ReactNode; onClick?: () => void; title?: string }) {
  if (!onClick) return <span>{children}</span>;
  return (
    <button
      type="button"
      role="link"
      title={title ?? 'Clic para abrir'}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className="cursor-pointer select-none rounded text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
    >
      {children}
    </button>
  );
}
