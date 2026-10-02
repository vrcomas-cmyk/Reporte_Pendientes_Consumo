import { useMemo, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Selector múltiple genérico: uno, varios, "casi todos" o todos los
 * valores de una lista — con búsqueda y "Todos"/"Ninguno". Vacío (`[]`)
 * significa "sin filtro" (todos), igual que los `<select>` de una sola
 * opción usan `''` para "todos" en el resto de la app. */
/** Con listas enormes (miles de materiales) solo se dibujan las primeras N
 * coincidencias — el resto se alcanza refinando la búsqueda. */
const MAX_RENDER = 300;

export function MultiSelect({ label, options, selected, onChange, allLabel = 'todos', emptyOption = true, optionLabel, summary }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Texto de "sin filtro" cuando `selected` está vacío, p.ej. "Grupo cliente (todos)". */
  allLabel?: string;
  emptyOption?: boolean;
  /** Texto mostrado (y buscable) de cada opción; el valor sigue siendo el de `options`.
   * P.ej. "código · descripción" para materiales. */
  optionLabel?: (value: string) => string;
  /** Texto del resumen en el botón cuando hay selección (reemplaza "Label (N)"),
   * p.ej. "todos menos Gobierno". */
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const textoDe = (v: string) => (optionLabel ? optionLabel(v) : v);
  const visibles = useMemo(
    () => {
      const t = q.trim().toLowerCase();
      return t ? options.filter((o) => textoDe(o).toLowerCase().includes(t)) : options;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, q, optionLabel],
  );
  const dibujadas = visibles.length > MAX_RENDER ? visibles.slice(0, MAX_RENDER) : visibles;
  const selSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (v: string) => onChange(selSet.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const triggerLabel = selected.length === 0
    ? `${label} (${allLabel})`
    : summary
      ? `${label}: ${summary}`
      : selected.length === 1
      ? `${label}: ${textoDe(selected[0])}`
      : `${label} (${selected.length})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={selected.length ? selected.join(', ') : `Sin filtro de ${label.toLowerCase()} — se incluyen todos`}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            selected.length > 0 && 'border-accent/50 bg-accent-soft/40 text-accent',
          )}
        >
          <span className="max-w-48 truncate">{triggerLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-text-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <input
          autoFocus
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar ${label.toLowerCase()}…`}
          className="mb-2 h-8 w-full rounded-md border border-border bg-bg px-2 text-xs outline-none focus:border-accent"
        />
        <div className="mb-1.5 flex items-center gap-2 border-b border-border pb-1.5 text-[11px]">
          {emptyOption && (
            <button type="button" onClick={() => onChange([])} className="text-accent hover:underline">Ninguno (todos)</button>
          )}
          <button type="button" onClick={() => onChange(visibles)} className="text-accent hover:underline">Seleccionar visibles</button>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {visibles.length === 0 && <p className="px-1 py-2 text-xs text-text-muted">Sin resultados.</p>}
          {dibujadas.map((v) => {
            const on = selSet.has(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggle(v)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-bg-inset"
              >
                <span className={cn('flex size-3.5 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-accent-fg' : 'border-border')}>
                  {on && <Check className="size-2.5" />}
                </span>
                <span className="min-w-0 truncate" title={textoDe(v)}>{textoDe(v)}</span>
              </button>
            );
          })}
          {visibles.length > dibujadas.length && (
            <p className="px-1 py-2 text-[11px] text-text-faint">Mostrando {dibujadas.length} de {visibles.length} — escribe para refinar. “Seleccionar visibles” toma las {visibles.length}.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
