import { useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { mesLabel } from '@/core/resumenFac';

const clave = (m: string): number => { const [mm, aa] = m.split('/'); return (+aa || 0) * 12 + (+mm || 0); };

/** Navegación entre los meses de la gráfica de facturación: ◀/▶ y teclas ← / → recorren `meses` (cronológico) y el selector salta a un mes/año.
 * Con el foco en un campo de texto o selector no se captura la tecla. */
export function MesNavControl({ meses, mes, irA }: { meses: string[]; mes: string; irA: (mes: string) => void }) {
  const orden = useMemo(() => [...new Set(meses)].sort((x, y) => clave(x) - clave(y)), [meses]);
  const porAnio = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const x of orden) { const a = x.split('/')[1] ?? ''; m.set(a, [...(m.get(a) ?? []), x]); }
    return [...m];
  }, [orden]);
  const idx = orden.indexOf(mes);
  const anterior = idx > 0 ? orden[idx - 1] : undefined;
  const siguiente = idx >= 0 && idx < orden.length - 1 ? orden[idx + 1] : undefined;

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

  if (orden.length < 2) return null;
  return (
    <div className="mb-3 flex items-center gap-1 text-xs text-text-muted" role="group" aria-label="Mes">
      <span>Mes</span>
      <button type="button" aria-label="Mes anterior (←)" title="Mes anterior (←)" disabled={!anterior} onClick={() => anterior && irA(anterior)} className="rounded-md border border-border p-1 disabled:opacity-30"><ChevronLeft className="size-3.5" /></button>
      <select
        aria-label="Ir a un mes/año"
        value={mes}
        onChange={(e) => { irA(e.target.value); e.target.blur(); }}
        className="rounded-md border border-border bg-bg-elevated px-1.5 py-1 font-medium text-text"
      >
        {porAnio.map(([anio, ms]) => (
          <optgroup key={anio} label={anio}>
            {ms.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </optgroup>
        ))}
      </select>
      <button type="button" aria-label="Mes siguiente (→)" title="Mes siguiente (→)" disabled={!siguiente} onClick={() => siguiente && irA(siguiente)} className="rounded-md border border-border p-1 disabled:opacity-30"><ChevronRight className="size-3.5" /></button>
      <span className="tabular-nums text-text-faint">{idx >= 0 ? `${idx + 1}/${orden.length}` : ''}</span>
    </div>
  );
}
