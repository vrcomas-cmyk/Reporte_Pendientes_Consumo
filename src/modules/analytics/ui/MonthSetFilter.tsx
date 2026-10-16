import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ABREVIATURAS_MES, mesDeKey, normalizarMeses, parsearMeses, resumirMeses } from '@/core/mesesSeleccion';
import { mesKey } from '@/core/resumenFac';
import { cn } from '@/lib/utils';

/** Filtro de periodo por MESES, estilo SAP: se puede escribir (un mes, un rango o periodos saltados, p. ej.
 *  "ene/2026-mar/2026, 07/2026" o "01/2026 a 03/2026") o abrir el calendario con el botón y marcar meses:
 *  clic = marcar/quitar un mes, Mayús+clic = rango desde el último clic, y se puede cambiar de año sin perder lo marcado. */
export function MonthSetFilter({ meses, onChange, label = 'Periodo' }: {
  /** Meses elegidos, 'mm/aaaa'. Vacío = sin filtro. */
  meses: string[];
  onChange: (next: string[]) => void;
  label?: string;
}) {
  const resumen = resumirMeses(meses);
  const [texto, setTexto] = useState(resumen);
  const [errores, setErrores] = useState<string[]>([]);
  const ultimoResumen = useRef(resumen);
  const [abierto, setAbierto] = useState(false);
  const [anio, setAnio] = useState(() => (meses.length ? Math.floor((mesKey(meses[meses.length - 1] ?? '') - 1) / 12) : new Date().getFullYear()));
  const ancla = useRef<number | null>(null);

  // El valor puede cambiar desde afuera (Limpiar filtros, calendario): resincroniza el texto mostrado.
  useEffect(() => {
    if (resumen !== ultimoResumen.current) {
      ultimoResumen.current = resumen;
      setTexto(resumen);
      setErrores([]);
    }
  }, [resumen]);

  const aplicarTexto = () => {
    const { meses: leidos, errores: malos } = parsearMeses(texto);
    setErrores(malos);
    if (malos.length) return; // se deja el texto para que se corrija
    ultimoResumen.current = resumirMeses(leidos);
    setTexto(ultimoResumen.current);
    onChange(leidos);
  };

  const sel = new Set(meses.map(mesKey));
  const aplicarKeys = (keys: Set<number>) => onChange(normalizarMeses([...keys].map(mesDeKey)));

  const clicMes = (mm: number, mayus: boolean) => {
    const k = anio * 12 + mm;
    const next = new Set(sel);
    if (mayus && ancla.current != null) {
      const [lo, hi] = [Math.min(ancla.current, k), Math.max(ancla.current, k)];
      for (let x = lo; x <= hi; x++) next.add(x);
    } else if (next.has(k)) next.delete(k);
    else next.add(k);
    ancla.current = k;
    aplicarKeys(next);
  };
  const delAnio = (marcar: boolean) => {
    const next = new Set(sel);
    for (let mm = 1; mm <= 12; mm++) { if (marcar) next.add(anio * 12 + mm); else next.delete(anio * 12 + mm); }
    aplicarKeys(next);
  };
  const enAnio = [...sel].filter((k) => Math.floor((k - 1) / 12) === anio).length;

  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-xs text-text-faint">{label}</span>}
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={aplicarTexto}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarTexto(); } }}
        placeholder="mm/aaaa, rangos o varios"
        aria-label={`${label} — escribe meses o rangos (ej. ene/2026-mar/2026, 07/2026)`}
        title={errores.length ? `No se pudo leer: ${errores.join(', ')}` : 'Escribe un mes (07/2026), un rango (01/2026-03/2026) o varios separados por coma (ene/2026-mar/2026, 07/2026)'}
        className={cn('h-9 w-56 rounded-md border bg-bg-elevated px-2 text-sm text-text tabular-nums', errores.length ? 'border-danger' : 'border-border')}
      />
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${label} — elegir meses en el calendario`}
            title="Elegir meses en el calendario"
            className={cn('inline-flex size-9 items-center justify-center rounded-md border border-border bg-bg-elevated text-text-muted hover:text-text', meses.length > 0 && 'text-accent')}
          >
            <CalendarDays className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setAnio((a) => a - 1)} className="rounded p-1 hover:bg-bg-inset" aria-label="Año anterior"><ChevronLeft className="size-4" /></button>
            <span className="text-sm font-semibold tabular-nums">{anio}</span>
            <button type="button" onClick={() => setAnio((a) => a + 1)} className="rounded p-1 hover:bg-bg-inset" aria-label="Año siguiente"><ChevronRight className="size-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {ABREVIATURAS_MES.map((nombre, i) => {
              const marcado = sel.has(anio * 12 + i + 1);
              return (
                <button
                  key={nombre}
                  type="button"
                  aria-pressed={marcado}
                  onClick={(e) => clicMes(i + 1, e.shiftKey)}
                  className={cn('h-8 rounded-md border text-sm capitalize', marcado ? 'border-accent bg-accent text-white' : 'border-border hover:bg-bg-inset')}
                >
                  {nombre}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <button type="button" onClick={() => delAnio(enAnio < 12)} className="text-accent hover:underline">{enAnio < 12 ? `Todo ${anio}` : `Quitar ${anio}`}</button>
            <button type="button" onClick={() => onChange([])} className="text-text-faint hover:text-text">Limpiar</button>
          </div>
          <p className="mt-2 text-[11px] text-text-faint">Clic marca o quita un mes · Mayús+clic marca un rango · cambia de año sin perder lo marcado.</p>
          {meses.length > 0 && <p className="mt-1 text-[11px] text-text-muted">{meses.length} mes(es): {resumen}</p>}
        </PopoverContent>
      </Popover>
      {meses.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="text-text-faint hover:text-text" aria-label="Limpiar periodo">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
