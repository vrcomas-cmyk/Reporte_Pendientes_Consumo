// Chart color tokens, derived from the dataviz skill's validated default
// palette (references/palette.md). Categorical order is fixed — never
// cycled arbitrarily — and was chosen to maximize adjacent CVD separation.
export const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
];

export const CATEGORICAL_DARK = [
  '#3987e5',
  '#199e70',
  '#c98500',
  '#008300',
  '#9085e9',
  '#e66767',
  '#d55181',
  '#d95926',
];

// Sequential single-hue ramp (blue), light -> dark, for heatmap magnitude.
export const SEQUENTIAL_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export function categorical(isDark: boolean): string[] {
  return isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
}

export function sequentialStep(value: number, min: number, max: number): string {
  if (max <= min) return SEQUENTIAL_BLUE[0];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = Math.round(t * (SEQUENTIAL_BLUE.length - 1));
  return SEQUENTIAL_BLUE[idx];
}
