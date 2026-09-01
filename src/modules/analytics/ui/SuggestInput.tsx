import { useMemo, useRef, useState } from 'react';
import { matchesQuery } from '@/modules/analytics/helpers';

/** Input de texto con autosugerencias sobre una lista fija de valores
 * distintos — para filtros de subtabla (centro, lote, material…) donde
 * escribir a mano es lento y propenso a errores de tipeo. Navegación por
 * teclado: ↓/↑ mueve el resaltado, Enter selecciona, Escape cierra. Basado
 * en el dropdown de `modules/oportunidades/components/MaterialSearch.tsx`. */
export function SuggestInput({
  value, onChange, options, placeholder = 'Filtrar…', className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    if (!value) return [];
    return options.filter((o) => matchesQuery(value, o)).slice(0, 12);
  }, [value, options]);

  const select = (v: string) => { onChange(v); setOpen(false); };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || !shown.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); select(shown[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="h-8 w-full rounded-md border border-border bg-bg-elevated px-2 text-xs outline-none focus:border-accent"
      />
      {open && shown.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-bg-elevated shadow-lg">
          {shown.map((o, i) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(o)}
              className={`block w-full truncate px-2 py-1 text-left text-xs hover:bg-bg-inset ${i === hi ? 'bg-bg-inset' : ''}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
