import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/** 'yyyy-mm-dd' (valor interno, formato de un `<input type="date">`) -> 'dd/mm/aaaa'
 * para mostrar. '' si no hay valor. */
function isoToDmy(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

/** 'dd/mm/aaaa' (o los mismos 8 dígitos sin separadores) -> 'yyyy-mm-dd', o
 * `null` si está incompleto o es una fecha que no existe (ej. 31/02). */
function dmyToIso(dmy: string): string | null {
  const digits = dmy.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const d = +digits.slice(0, 2), m = +digits.slice(2, 4), y = +digits.slice(4, 8);
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime()) || dt.getUTCDate() !== d || dt.getUTCMonth() + 1 !== m) return null;
  return iso;
}

/** Inserta '/' mientras se escribe (dd/mm/aaaa), tope 8 dígitos. */
function maskDmy(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

/** Campo de fecha con formato dd/mm/aaaa fijo, independiente del idioma/
 * configuración regional del navegador (un `<input type="date">` nativo
 * muestra dd/mm/aaaa o mm/dd/aaaa según el SO — no se puede forzar el
 * formato de forma confiable entre navegadores). El valor que entra/sale por
 * `value`/`onChange` sigue siendo `yyyy-mm-dd`, igual que antes, para no
 * tocar `enRango`/`isoToMesKey` ni el estado persistido de cada página. */
function DateField({ value, onChange, ariaLabel }: { value: string; onChange: (iso: string) => void; ariaLabel: string }) {
  const [text, setText] = useState(() => isoToDmy(value));
  const lastIso = useRef(value);

  // El valor puede cambiar desde afuera (Limpiar filtros, vista guardada, URL)
  // sin pasar por el onChange de este campo — resincroniza el texto mostrado.
  useEffect(() => {
    if (value !== lastIso.current) {
      setText(isoToDmy(value));
      lastIso.current = value;
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      value={text}
      onChange={(e) => {
        const masked = maskDmy(e.target.value);
        setText(masked);
        if (!masked) { lastIso.current = ''; onChange(''); return; }
        const iso = dmyToIso(masked);
        if (iso) { lastIso.current = iso; onChange(iso); }
      }}
      aria-label={ariaLabel}
      className="h-9 w-[104px] rounded-md border border-border bg-bg-elevated px-2 text-sm text-text tabular-nums"
    />
  );
}

/** Filtro "de fecha A a fecha B" — dos campos dd/mm/aaaa + limpiar, mismo
 * estilo que los demás controles de filtro (ColumnFilterBar, Select).
 * El estado (`desde`/`hasta`, formato `yyyy-mm-dd`) vive en la página que lo
 * usa (típicamente vía `usePersistedState`) y se cruza contra las filas con
 * `enRango` de `@/lib/fechas`. */
export function DateRangeFilter({ desde, hasta, onChange, label = 'Periodo' }: {
  desde: string;
  hasta: string;
  onChange: (next: { desde: string; hasta: string }) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-xs text-text-faint">{label}</span>}
      <DateField value={desde} onChange={(v) => onChange({ desde: v, hasta })} ariaLabel={`${label} — desde`} />
      <span className="text-xs text-text-faint">a</span>
      <DateField value={hasta} onChange={(v) => onChange({ desde, hasta: v })} ariaLabel={`${label} — hasta`} />
      {(desde || hasta) && (
        <button type="button" onClick={() => onChange({ desde: '', hasta: '' })} className="text-text-faint hover:text-text" aria-label="Limpiar periodo">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
