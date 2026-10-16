import { useState } from 'react';
import { ChevronDown, ChevronUp, UserRound } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/layout/report';
import type { EjecutivoZona } from '@/core/enrich';
import { cn } from '@/lib/utils';

export type ModoEjecutivo = 'varios' | 'uno';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Filtro de ejecutivos/zonas de Seg. de pedidos. La lista va EN EL ORDEN DEL CATÁLOGO (no se ordena) para recorrerla zona por zona.
 *  Dos modos: "Varios" (marcar los que quieras) y "Uno por uno" (al elegir uno se deselecciona el anterior; con ▲ ▼ avanzas al anterior / siguiente). */
export function EjecutivoZonaFilter({ opciones, seleccion, onChange, modo, onModo }: {
  opciones: readonly EjecutivoZona[];
  seleccion: readonly string[];
  onChange: (zonas: string[]) => void;
  modo: ModoEjecutivo;
  onModo: (m: ModoEjecutivo) => void;
}) {
  const [q, setQ] = useState('');
  if (!opciones.length) return null;
  const visibles = q.trim() ? opciones.filter((o) => sinAcentos(`${o.etiqueta} ${o.nombre} ${o.zona3}`).includes(sinAcentos(q.trim()))) : opciones;
  const marcada = (z: string) => seleccion.includes(z);
  const elegir = (z: string) => {
    if (modo === 'uno') onChange(seleccion.length === 1 && seleccion[0] === z ? [] : [z]);
    else onChange(marcada(z) ? seleccion.filter((x) => x !== z) : [...seleccion, z]);
  };
  const cambiarModo = (m: ModoEjecutivo) => {
    onModo(m);
    if (m === 'uno' && seleccion.length > 1) onChange([seleccion[0]!]);
  };
  const mover = (d: 1 | -1) => {
    const i = seleccion.length ? opciones.findIndex((o) => o.zona === seleccion[0]) : -1;
    const n = i < 0 ? (d === 1 ? 0 : opciones.length - 1) : (i + d + opciones.length) % opciones.length;
    onChange([opciones[n]!.zona]);
  };
  const una = seleccion.length === 1 ? opciones.find((o) => o.zona === seleccion[0]) : undefined;
  const texto = !seleccion.length ? 'Ejecutivo / zona (todos)' : una ? una.etiqueta : `${seleccion.length} ejecutivos / zonas`;

  return (
    <div className="inline-flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Filtrar por ejecutivo / zona"
            className={cn('inline-flex h-9 max-w-64 items-center gap-1.5 rounded-md border px-2 text-sm', seleccion.length ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-bg-elevated text-text-muted hover:bg-bg-inset')}
          >
            <UserRound className="size-3.5 shrink-0" />
            <span className="truncate">{texto}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <SegmentedControl
              value={modo}
              onChange={cambiarModo}
              ariaLabel="Modo de selección"
              options={[{ value: 'varios', label: 'Varios' }, { value: 'uno', label: 'Uno por uno' }]}
            />
            {seleccion.length > 0 && <button type="button" onClick={() => onChange([])} className="text-xs text-accent hover:underline">Limpiar</button>}
          </div>
          <input
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Buscar ejecutivo o zona…"
            autoComplete="off"
            className="mb-1.5 h-8 w-full rounded-md border border-border bg-bg-elevated px-2 text-xs"
          />
          <div className="max-h-72 overflow-auto border-t border-border pt-1" role={modo === 'uno' ? 'radiogroup' : 'group'} aria-label="Ejecutivos / zonas">
            {visibles.length === 0 && <div className="px-1.5 py-2 text-xs text-text-faint">Sin coincidencias</div>}
            {visibles.map((o) => (
              <label key={o.zona} className={cn('flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-bg-inset', marcada(o.zona) && 'bg-accent-soft')}>
                <input
                  type={modo === 'uno' ? 'radio' : 'checkbox'}
                  name="ejec-zona"
                  checked={marcada(o.zona)}
                  onChange={() => undefined}
                  onClick={() => elegir(o.zona)}
                />
                <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
                {!o.vacante && <span className="shrink-0 text-[11px] tabular-nums text-text-faint">{o.zona3}</span>}
              </label>
            ))}
          </div>
          <p className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-text-faint">En el orden del catálogo (no se ordena), zona por zona.</p>
        </PopoverContent>
      </Popover>
      {modo === 'uno' && (
        <span className="inline-flex">
          <button type="button" onClick={() => mover(-1)} title="Ejecutivo / zona anterior" aria-label="Ejecutivo anterior" className="inline-flex h-9 w-7 items-center justify-center rounded-l-md border border-border bg-bg-elevated text-text-muted hover:bg-bg-inset"><ChevronUp className="size-4" /></button>
          <button type="button" onClick={() => mover(1)} title="Ejecutivo / zona siguiente" aria-label="Ejecutivo siguiente" className="inline-flex h-9 w-7 items-center justify-center rounded-r-md border border-l-0 border-border bg-bg-elevated text-text-muted hover:bg-bg-inset"><ChevronDown className="size-4" /></button>
        </span>
      )}
    </div>
  );
}
