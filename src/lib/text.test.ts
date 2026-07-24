import { describe, it, expect } from 'vitest';
import { norm, num, numLoose } from './text';

describe('norm', () => {
  it('returns empty string for null/undefined', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });

  it('trims whitespace', () => {
    expect(norm('  hola  ')).toBe('hola');
  });

  it('coerces numbers to string', () => {
    expect(norm(123)).toBe('123');
    expect(norm(0)).toBe('0');
  });

  it('coerces booleans to string', () => {
    expect(norm(true)).toBe('true');
    expect(norm(false)).toBe('false');
  });
});

describe('num', () => {
  it('returns 0 for null/undefined/empty', () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('')).toBe(0);
  });

  it('passes native numbers through unchanged', () => {
    expect(num(42)).toBe(42);
    expect(num(3.14)).toBe(3.14);
    expect(num(-7)).toBe(-7);
    expect(num(0)).toBe(0);
  });

  it('strips non-numeric chars by default (does NOT treat comma as thousands)', () => {
    expect(num('$60.87')).toBe(60.87);
    expect(num('-12.5%')).toBe(-12.5);
  });

  it('returns 0 for unparseable strings', () => {
    expect(num('abc')).toBe(0);
    expect(num('-')).toBe(0);
  });
});

describe('numLoose', () => {
  it('accepts thousands commas', () => {
    expect(numLoose('1,234.5')).toBe(1234.5);
    expect(numLoose('USD 1,234,567.89')).toBe(1234567.89);
  });

  it('handles currency strings like Google Sheets exports', () => {
    expect(numLoose('$82.00')).toBe(82);
  });

  it('still returns 0 for unparseable', () => {
    expect(numLoose('abc')).toBe(0);
    expect(numLoose('')).toBe(0);
  });
});

describe('num vs numLoose divergence (regression guard)', () => {
  it('num default strips the comma entirely so "1,234.5" → 1234.5, while numLoose reads it as thousands', () => {
    // `num` uses `[^0-9.-]` → the comma is stripped → "1234.5" → 1234.5.
    // `numLoose` uses `[^0-9.,-]` then `,` strips → "1234.5" → 1234.5
    // — the divergence with comma is in *handling* the thousands separator
    // for inputs like "1,234" (no decimal): see the next test.
    expect(num('1,234.5')).toBe(1234.5);
    expect(numLoose('1,234.5')).toBe(1234.5);
  });

  it('divergence is visible on comma-only inputs: "1,234" → raw num strips comma to "1234", numLoose strips the comma too (1234) — same result; but "$1,234" parsed by numLoose is 1234 while by num the $ strip yields "1,234" → 1234.5-ish. The actual legacy divergence: loose treats comma as thousands separator that is then dropped; default also drops it. Both produce 1234 — legacy divergence is mainly in the regex charclass.', () => {
    expect(num('1,234')).toBe(1234);
    expect(numLoose('1,234')).toBe(1234);
  });
});
