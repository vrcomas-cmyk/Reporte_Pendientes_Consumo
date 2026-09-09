import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/** Inserta '/' mientras se escribe (mm/aaaa), tope 6 dígitos. */
function maskMy(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  return [digits.slice(0, 2), digits.slice(2, 6)].filter(Boolean).join('/');
}

/** true solo con los 6 dígitos completos y mes 1–12. */
function mesValido(my: string): boolean {
  const m = /^(\d{2})\/(\d{4})$/.exec(my);
  if (!m) return false;
  const mm = +m[1];
  return mm >= 1 && mm <= 12;
}

/** Campo mm/aaaa — mismo patrón de máscara/resincronización que `DateField`
 * de `DateRangeFilter`, pero el valor que entra/sale es 'mm/aaaa' (o ''), no
 * ISO: este filtro acota MESES de Resumen de Facturación, no fechas. */
function MonthField({ value, onChange, ariaLabel }: { value: string; onChange: (my: string) => void; ariaLabel: string }) {
  const [text, setText] = useState(value);
  const lastValue = useRef(value);

  // El valor puede cambiar desde afuera (Limpiar filtros, vista guardada)
  // sin pasar por el onChange de este campo — resincroniza el texto mostrado.
  useEffect(() => {
    if (value !== lastValue.current) {
      setText(value);
      lastValue.current = value;
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="mm/aaaa"
      value={text}
      onChange={(e) => {
        const masked = maskMy(e.target.value);
        setText(masked);
        if (!masked) { lastValue.current = ''; onChange(''); return; }
        if (mesValido(masked)) { lastValue.current = masked; onChange(masked); }
      }}
      aria-label={ariaLabel}
      className="h-9 w-20 rounded-md border border-border bg-bg-elevated px-2 text-sm text-text tabular-nums"
    />
  );
}

/** Filtro "de mes/año A a mes/año B" — acota el PERIODO (meses de Resumen de
 * Facturación) que se está viendo, no un atributo de fila. `desde`/`hasta`
 * son 'mm/aaaa' o '' (sin extremo fijado). El estado vive en la página que lo
 * usa (típicamente vía `usePersistedState`) y se compara con `mesKey` de
 * `@/core/resumenFac`. */
export function MonthRangeFilter({ desde, hasta, onChange, label = 'Periodo' }: {
  desde: string;
  hasta: string;
  onChange: (next: { desde: string; hasta: string }) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-xs text-text-faint">{label}</span>}
      <MonthField value={desde} onChange={(v) => onChange({ desde: v, hasta })} ariaLabel={`${label} — desde`} />
      <span className="text-xs text-text-faint">a</span>
      <MonthField value={hasta} onChange={(v) => onChange({ desde, hasta: v })} ariaLabel={`${label} — hasta`} />
      {(desde || hasta) && (
        <button type="button" onClick={() => onChange({ desde: '', hasta: '' })} className="text-text-faint hover:text-text" aria-label="Limpiar periodo">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
