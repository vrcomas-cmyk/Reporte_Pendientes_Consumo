import { X } from 'lucide-react';

/** Filtro "de fecha A a fecha B" — dos `<input type="date">` + limpiar,
 * mismo estilo que los demás controles de filtro (ColumnFilterBar, Select).
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
      <input
        type="date"
        value={desde}
        onChange={(e) => onChange({ desde: e.target.value, hasta })}
        aria-label={`${label} — desde`}
        className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm text-text"
      />
      <span className="text-xs text-text-faint">a</span>
      <input
        type="date"
        value={hasta}
        onChange={(e) => onChange({ desde, hasta: e.target.value })}
        aria-label={`${label} — hasta`}
        className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm text-text"
      />
      {(desde || hasta) && (
        <button type="button" onClick={() => onChange({ desde: '', hasta: '' })} className="text-text-faint hover:text-text" aria-label="Limpiar periodo">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
