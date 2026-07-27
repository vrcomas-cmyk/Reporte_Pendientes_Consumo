import { describe, it, expect } from 'vitest';
import { formatFechaCaducidad } from './utils';

describe('formatFechaCaducidad', () => {
  it('formats a clean ISO date as dd/mmm/aaaa', () => {
    expect(formatFechaCaducidad('2031-03-12')).toBe('12/mar/2031');
  });

  // Regression: records saved (catalog or analysis, in IndexedDB) before
  // `excelDateToIso` learned to detect epoch-ms values used to keep the raw
  // number forever, even after the mapper was fixed, because this formatter
  // never re-normalized already-stored values — it just printed whatever
  // wasn't already ISO-shaped verbatim.
  it('self-heals a stale epoch-ms value instead of printing it raw', () => {
    expect(formatFechaCaducidad('1931040000000')).toBe('12/mar/2031');
    expect(formatFechaCaducidad('1815350400000')).not.toBe('1815350400000');
  });

  it('returns em dash for empty/nullish input', () => {
    expect(formatFechaCaducidad(null)).toBe('—');
    expect(formatFechaCaducidad(undefined)).toBe('—');
    expect(formatFechaCaducidad('')).toBe('—');
  });

  it('falls back to the raw string when it truly cannot be parsed as a date', () => {
    expect(formatFechaCaducidad('no es una fecha')).toBe('no es una fecha');
  });
});
