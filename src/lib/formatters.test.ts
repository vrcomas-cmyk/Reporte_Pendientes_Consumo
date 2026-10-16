import { describe, it, expect } from 'vitest';
import { formatCompact, formatDelta, formatPercent } from './utils';

describe('formatPercent', () => {
  it('es-MX con un decimal por defecto', () => {
    expect(formatPercent(12.34)).toBe('12.3%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(5, 0)).toBe('5%');
  });
});

describe('formatCompact', () => {
  it('abrevia miles, millones y miles de millones; lo chico va completo', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(12345)).toBe('12.3 k');
    expect(formatCompact(2_500_000)).toBe('2.5 M');
    expect(formatCompact(3_200_000_000)).toBe('3.2 mil M');
    expect(formatCompact(-2_500_000)).toBe('-2.5 M');
  });
});

describe('formatDelta', () => {
  it('flecha y tono según el signo; cero y NaN son neutros', () => {
    expect(formatDelta(8.25)).toEqual({ texto: '▲ 8.3%', tono: 'success' });
    expect(formatDelta(-3)).toEqual({ texto: '▼ 3.0%', tono: 'danger' });
    expect(formatDelta(0).tono).toBe('neutral');
    expect(formatDelta(0.01).tono).toBe('neutral');
    expect(formatDelta(Number.NaN).tono).toBe('neutral');
  });
});
