// Chart color tokens. Los valores reales viven en src/index.css como variables
// CSS (--chart-1..8, --seq-1..7) y cambian solos con el modo claro/oscuro y con
// la skin (clasico / apple); aqui solo se referencian. Orden categorico fijo —
// nunca se cicla arbitrariamente — elegido para separar colores adyacentes
// (daltonismo). Base: dataviz skill (references/palette.md).
export const CATEGORICAL = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--chart-${n})`);

// Rampa secuencial de un solo tono (azul), de claro a oscuro, para magnitud.
export const SEQUENTIAL_BLUE = [1, 2, 3, 4, 5, 6, 7].map((n) => `var(--seq-${n})`);

// Superficies de grafica (ejes, rejilla, tooltip) — mismas variables que la UI.
export const CHART_UI = {
  grid: 'var(--border)',
  axis: 'var(--text-muted)',
  label: 'var(--text)',
  neutral: 'var(--text-faint)',
  positive: 'var(--success)',
  negative: 'var(--danger)',
  surface: 'var(--bg-elevated)',
  border: 'var(--border)',
  tooltipStyle: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text)',
  },
} as const;

/** El parametro se conserva por compatibilidad: ya no hace falta distinguir el
 * modo porque las variables CSS resuelven el color segun el tema activo. */
export function categorical(_isDark?: boolean): string[] {
  return CATEGORICAL;
}

export function sequentialStep(value: number, min: number, max: number): string {
  if (max <= min) return SEQUENTIAL_BLUE[0];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = Math.round(t * (SEQUENTIAL_BLUE.length - 1));
  return SEQUENTIAL_BLUE[idx];
}
