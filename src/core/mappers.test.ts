import { describe, it, expect } from 'vitest';
import { excelDateToIso } from './mappers';

describe('excelDateToIso', () => {
  it('converts a real Excel serial date (1900 system)', () => {
    expect(excelDateToIso(47919)).toBe('2031-03-12');
  });

  it('converts a Date object', () => {
    expect(excelDateToIso(new Date(Date.UTC(2031, 2, 12)))).toBe('2031-03-12');
  });

  it('parses day-first dd/mm/aaaa text', () => {
    expect(excelDateToIso('12/03/2031')).toBe('2031-03-12');
  });

  it('parses an already-ISO string', () => {
    expect(excelDateToIso('2031-03-12')).toBe('2031-03-12');
  });

  // Regression: a source that serializes datetimes to epoch milliseconds
  // (e.g. a pandas column exported the wrong way) hands back a number in the
  // trillions instead of an Excel serial. Naively running the serial-date
  // formula on it produced garbage far beyond any real date, which then
  // rendered raw as "1931040000000" instead of a date.
  it('treats an epoch-millisecond number as already epoch-ms, not an Excel serial', () => {
    expect(excelDateToIso(1931040000000)).toBe('2031-03-12');
  });

  it('treats an epoch-millisecond value arriving as a digit string the same way', () => {
    expect(excelDateToIso('1931040000000')).toBe('2031-03-12');
  });

  it('returns null for empty/nullish input', () => {
    expect(excelDateToIso(null)).toBeNull();
    expect(excelDateToIso(undefined)).toBeNull();
    expect(excelDateToIso('')).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(excelDateToIso('no es una fecha')).toBeNull();
  });
});
