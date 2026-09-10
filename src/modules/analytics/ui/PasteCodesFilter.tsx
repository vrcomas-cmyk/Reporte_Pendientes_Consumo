import { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip';
import { FilterChip } from '@/components/ui/filter-chip';

/** Parte un texto pegado (columna de Excel, selección de SAP) en códigos
 * limpios: separa por salto de línea, tab, coma, punto y coma, o 2+ espacios
 * seguidos (para no romper un código que en sí tenga un espacio simple), y
 * descarta vacíos duplicados. */
export function parseCodesPaste(text: string): string[] {
  return [...new Set(
    text
      .split(/[\n\r\t,;]+|\s{2,}/)
      .map((s) => s.trim())
      .filter(Boolean),
  )];
}

/** Set de comparación case-insensitive para `matchesCodes`. */
function upperSet(codes: string[]): Set<string> {
  return new Set(codes.map((c) => c.trim().toUpperCase()));
}

/** true si `value` coincide con alguno de los códigos pegados (o si no hay
 * ninguno pegado — sin códigos, no filtra nada). Case-insensitive, trim. */
export function matchesCodes(codes: string[], value: string): boolean {
  if (!codes.length) return true;
  return upperSet(codes).has((value ?? '').trim().toUpperCase());
}

/** Igual que `matchesCodes`, pero para una fila que puede tener varios
 * códigos relevantes (p. ej. Pedidos: coincide si el Material O el Pedido
 * están en la lista pegada). */
export function matchesAnyCode(codes: string[], values: (string | undefined)[]): boolean {
  if (!codes.length) return true;
  const set = upperSet(codes);
  return values.some((v) => v && set.has(v.trim().toUpperCase()));
}

/**
 * Filtro "pegar varios códigos" estilo SAP (el multi-select de SAP donde se
 * pega una columna copiada de Excel y filtra solo esos valores) — un botón
 * que abre un textarea, cuenta cuántos códigos detectó en vivo, y aplica al
 * confirmar. Es ADITIVO a los filtros existentes de cada página: no
 * reemplaza nada, solo agrega "y además, solo estos códigos".
 *
 * `value`/`onChange` son responsabilidad de la página (normalmente
 * `usePersistedState<string[]>`) — este componente solo parsea el pegado y
 * v pulcramente la interacción; el cruce contra las filas usa `matchesCodes`/
 * `matchesAnyCode` de este mismo archivo.
 */
export function PasteCodesFilter({ value, onChange, label = 'código' }: {
  value: string[];
  onChange: (codes: string[]) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => value.join('\n'));
  // Al reabrir, resincroniza el textarea con lo realmente aplicado (por si se
  // limpió desde el chip afuera mientras el popover estaba cerrado).
  useEffect(() => {
    if (open) setText(value.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const parsed = useMemo(() => parseCodesPaste(text), [text]);

  const aplicar = () => {
    onChange(parsed);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipHint text={`Pega una lista de ${label}s — una por línea, o copiada de Excel/SAP — para filtrar solo esos`}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-sm text-text-muted hover:bg-bg-inset"
          >
            <ClipboardPaste className="size-3.5" />
            Pegar {label}s{value.length > 0 ? ` (${value.length})` : ''}
          </button>
        </PopoverTrigger>
      </TooltipHint>
      <PopoverContent className="w-80 p-3">
        <p className="mb-1.5 text-xs text-text-muted">
          Pega varios {label}s — uno por línea, o copiados directo de una columna de Excel/SAP (separados por salto de línea, tab o coma).
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) aplicar();
          }}
          rows={6}
          placeholder={`${label} 1\n${label} 2\n${label} 3…`}
          className="w-full resize-none rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-text-faint">
            {parsed.length} {label}{parsed.length === 1 ? '' : 's'} detectado{parsed.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => { setText(''); onChange([]); }} className="rounded px-2 py-1 text-xs text-text-faint hover:bg-bg-inset">
              Limpiar
            </button>
            <button type="button" onClick={aplicar} className="rounded bg-accent px-2 py-1 text-xs font-medium text-accent-fg hover:opacity-90">
              Aplicar
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Chip "N códigos pegados ✕" — misma confirmación visual que el resto de
 * filtros activos de la página (ver Incremento de costos), para que quede
 * claro que la lista pegada sí se aplicó. */
export function PasteCodesChip({ value, onChange, label = 'código' }: {
  value: string[];
  onChange: (codes: string[]) => void;
  label?: string;
}) {
  if (!value.length) return null;
  return (
    <FilterChip active onClear={() => onChange([])}>
      {value.length} {label}{value.length === 1 ? '' : 's'} pegado{value.length === 1 ? '' : 's'}
    </FilterChip>
  );
}
