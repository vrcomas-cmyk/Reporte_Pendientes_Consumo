import { describe, it, expect } from 'vitest';
import { parseCodesPaste, matchesCodes, matchesAnyCode } from './PasteCodesFilter';

describe('parseCodesPaste', () => {
  it('separa por salto de línea (columna pegada de Excel/SAP)', () => {
    expect(parseCodesPaste('1001\n1002\n1003')).toEqual(['1001', '1002', '1003']);
  });

  it('separa por tab (fila pegada) y por coma', () => {
    expect(parseCodesPaste('1001\t1002\t1003')).toEqual(['1001', '1002', '1003']);
    expect(parseCodesPaste('1001, 1002,1003')).toEqual(['1001', '1002', '1003']);
  });

  it('ignora líneas vacías y espacios sobrantes', () => {
    expect(parseCodesPaste('1001\n\n  1002  \n\n1003\n')).toEqual(['1001', '1002', '1003']);
  });

  it('deduplica códigos repetidos', () => {
    expect(parseCodesPaste('1001\n1002\n1001')).toEqual(['1001', '1002']);
  });

  it('no corta un código con un solo espacio interno, solo con 2+ espacios seguidos', () => {
    expect(parseCodesPaste('MAT 01')).toEqual(['MAT 01']);
    expect(parseCodesPaste('1001  1002')).toEqual(['1001', '1002']);
  });

  it('texto vacío da lista vacía', () => {
    expect(parseCodesPaste('')).toEqual([]);
    expect(parseCodesPaste('   \n  \n')).toEqual([]);
  });
});

describe('matchesCodes', () => {
  it('sin códigos pegados, no filtra nada (todo pasa)', () => {
    expect(matchesCodes([], 'M1')).toBe(true);
  });

  it('con códigos, solo pasan los que coinciden (case-insensitive, trim)', () => {
    const codes = ['m1', ' M2 '];
    expect(matchesCodes(codes, 'M1')).toBe(true);
    expect(matchesCodes(codes, 'M2')).toBe(true);
    expect(matchesCodes(codes, 'M3')).toBe(false);
  });
});

describe('matchesAnyCode', () => {
  it('pasa si CUALQUIERA de los valores de la fila coincide con la lista pegada', () => {
    const codes = ['P100'];
    expect(matchesAnyCode(codes, ['M1', 'P100'])).toBe(true);
    expect(matchesAnyCode(codes, ['M1', 'P200'])).toBe(false);
  });

  it('sin códigos pegados, no filtra nada', () => {
    expect(matchesAnyCode([], ['M1', undefined])).toBe(true);
  });

  it('ignora valores undefined de la fila sin romper', () => {
    expect(matchesAnyCode(['M1'], [undefined, 'M1'])).toBe(true);
  });
});
