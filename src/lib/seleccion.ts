// ---------------------------------------------------------------------------
// seleccion.ts · Selección de filas estilo Excel (clic / Ctrl / Shift) y
// serialización a TSV para pegar en Excel. Puro: sin React ni DOM.
// ---------------------------------------------------------------------------

export interface SeleccionEstado {
  selected: Set<string>;
  /** Fila de partida para la selección por rango con Shift. */
  ancla: string | null;
}

/** Siguiente estado tras un clic en `key`. `ordenadas` = claves en el orden visible.
 *  - clic: solo esa fila. - Ctrl/Cmd+clic: alterna esa fila.
 *  - Shift+clic: rango ancla→fila (con Ctrl, se suma a lo ya seleccionado). */
export function calcularSeleccion(
  prev: SeleccionEstado,
  key: string,
  mod: { ctrl: boolean; shift: boolean },
  ordenadas: string[],
): SeleccionEstado {
  const i = ordenadas.indexOf(key);
  const a = prev.ancla ? ordenadas.indexOf(prev.ancla) : -1;
  if (mod.shift && a >= 0 && i >= 0) {
    const [lo, hi] = a < i ? [a, i] : [i, a];
    const base = mod.ctrl ? new Set(prev.selected) : new Set<string>();
    for (const k of ordenadas.slice(lo, hi + 1)) base.add(k);
    return { selected: base, ancla: prev.ancla };
  }
  if (mod.ctrl) {
    const next = new Set(prev.selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    return { selected: next, ancla: key };
  }
  return { selected: new Set([key]), ancla: key };
}

/** Texto separado por tabuladores (encabezados + filas) — se pega tal cual en Excel. */
export function aTsv(filas: Record<string, unknown>[]): string {
  if (!filas.length) return '';
  const cols = Object.keys(filas[0]);
  const celda = (v: unknown) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return [cols.join('\t'), ...filas.map((f) => cols.map((c) => celda(f[c])).join('\t'))].join('\n');
}
