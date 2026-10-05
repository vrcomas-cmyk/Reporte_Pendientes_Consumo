import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { matchesQuery } from '../helpers';

const MAX_SUGERENCIAS = 40;

export interface OpcionMaterial { material: string; desc: string }

/** Navegación entre materiales del detalle de celda abierto desde Inventario
 * o Inv Condición:
 * flechas ◀/▶ (y teclas ← / →) recorren `lista` — los materiales en el orden y
 * filtro de la tabla al abrir el detalle — y el buscador salta a CUALQUIER
 * material de `opciones` por código o descripción, con sugerencias según
 * el texto. Teclado en el buscador (↓/↑/Enter/Escape) como `PedidoNavControl`. */
export function MaterialNavControl({ opciones, material, lista, irA }: {
  /** Materiales a los que se puede saltar con el buscador. */
  opciones: OpcionMaterial[];
  material: string;
  lista: string[] | undefined;
  irA: (material: string) => void;
}) {
  const idx = lista ? lista.indexOf(material) : -1;
  const anterior = idx > 0 ? lista![idx - 1] : undefined;
  const siguiente = idx >= 0 && lista && idx < lista.length - 1 ? lista[idx + 1] : undefined;

  // ← / → recorren la lista, salvo que el foco esté en un campo de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && anterior) { e.preventDefault(); irA(anterior); }
      else if (e.key === 'ArrowRight' && siguiente) { e.preventDefault(); irA(siguiente); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anterior, siguiente, irA]);

  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [hi, setHi] = useState(0);

  const sugerencias = useMemo(() => {
    if (!q.trim()) return [];
    return opciones.filter((o) => matchesQuery(q, `${o.material} ${o.desc}`)).slice(0, MAX_SUGERENCIAS);
  }, [q, opciones]);

  const elegir = (m: string) => { irA(m); setQ(''); setAbierto(false); };

  return (
    <div className="flex items-center gap-1">
      <button type="button" title="Material anterior (←)" disabled={!anterior} onClick={() => anterior && irA(anterior)} className="rounded-md border border-border p-1 disabled:opacity-30">
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="min-w-12 text-center text-[11px] tabular-nums text-text-faint" title="Posición en la lista de la tabla">
        {idx >= 0 && lista ? `${idx + 1} / ${lista.length}` : '—'}
      </span>
      <button type="button" title="Material siguiente (→)" disabled={!siguiente} onClick={() => siguiente && irA(siguiente)} className="rounded-md border border-border p-1 disabled:opacity-30">
        <ChevronRight className="size-3.5" />
      </button>
      <div className="relative ml-1">
        <Search className="pointer-events-none absolute left-2 top-1.5 size-3.5 text-text-faint" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setHi(0); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); setQ(''); setAbierto(false); return; }
            if (!sugerencias.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, sugerencias.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); elegir(sugerencias[hi].material); }
          }}
          placeholder="Ir a material (código o descripción)…"
          autoComplete="off"
          className="h-7 w-72 rounded-md border border-border bg-bg-elevated pl-7 pr-2 text-xs outline-none focus:border-accent"
        />
        {abierto && q.trim() && (
          <div className="absolute left-0 z-30 mt-1 max-h-72 w-96 overflow-y-auto rounded-md border border-border bg-bg-elevated shadow-lg">
            {sugerencias.length === 0 && <p className="px-2 py-2 text-xs text-text-faint">Sin resultados.</p>}
            {sugerencias.map((o, i) => (
              <button
                key={o.material}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(o.material)}
                className={`block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-bg-inset ${i === hi ? 'bg-bg-inset' : ''} ${o.material === material ? 'text-accent' : ''}`}
              >
                <span className="font-mono">{o.material}</span> <span className="text-text-muted">{o.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
