import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Navegación entre centros del detalle de un material: ◀/▶ y teclas ← / → recorren `centros` (los materiales se recorren con ↑ / ↓,
 * ver `MaterialNavControl`). Con el foco en un campo de texto no se captura la tecla. */
export function CentroNavControl({ centros, centro, irA, etiqueta = (c) => c }: {
  centros: string[];
  centro: string;
  irA: (centro: string) => void;
  etiqueta?: (centro: string) => string;
}) {
  const idx = centros.findIndex((c) => c === centro);
  const anterior = idx > 0 ? centros[idx - 1] : undefined;
  const siguiente = idx >= 0 && idx < centros.length - 1 ? centros[idx + 1] : undefined;

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

  if (centros.length < 2) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-text-muted" role="group" aria-label="Centro">
      <span>Centro</span>
      <button type="button" aria-label="Centro anterior (←)" title="Centro anterior (←)" disabled={!anterior} onClick={() => anterior && irA(anterior)} className="rounded-md border border-border p-1 disabled:opacity-30"><ChevronLeft className="size-3.5" /></button>
      <span className="min-w-16 text-center font-medium tabular-nums text-text" title="Posición entre los centros del material">{idx >= 0 ? `${etiqueta(centro)} · ${idx + 1}/${centros.length}` : '—'}</span>
      <button type="button" aria-label="Centro siguiente (→)" title="Centro siguiente (→)" disabled={!siguiente} onClick={() => siguiente && irA(siguiente)} className="rounded-md border border-border p-1 disabled:opacity-30"><ChevronRight className="size-3.5" /></button>
    </div>
  );
}
