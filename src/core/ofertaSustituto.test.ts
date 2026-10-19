import { describe, it, expect } from 'vitest';
import { compararCosto, disponibleEnCentros, esSustituto, textoCambioCodigo } from './ofertaSustituto';

describe('esSustituto', () => {
  it('otro código = sustituto; el mismo código (otra condición) no lo es', () => {
    expect(esSustituto('100950', '100952')).toBe(true);
    expect(esSustituto('100950', '100950')).toBe(false);
    expect(esSustituto(' 100950 ', '100950')).toBe(false);
  });
  it('sin código no hay sustituto', () => {
    expect(esSustituto('', '100952')).toBe(false);
    expect(esSustituto('100950', '')).toBe(false);
  });
});

describe('textoCambioCodigo', () => {
  it('dice qué código cambiar por cuál', () => {
    expect(textoCambioCodigo('100950', '100952')).toBe('Cambiar el código 100950 (que viene en el pedido) que estamos visualizando por el código 100952 (sustituto)');
  });
});

describe('compararCosto', () => {
  it('sustituto más caro / más barato / igual', () => {
    const c = compararCosto(100, 110);
    expect(c.veredicto).toBe('mas-caro');
    expect(c.diferencia).toBeCloseTo(10, 6);
    expect(c.pct).toBeCloseTo(0.1, 6);
    expect(compararCosto(100, 90).veredicto).toBe('mas-barato');
    expect(compararCosto(100, 100).veredicto).toBe('igual');
  });
  it('si falta el costo de alguno no compara', () => {
    expect(compararCosto(0, 90).veredicto).toBe('sin-costo');
    expect(compararCosto(100, 0).pct).toBeNull();
  });
});

describe('disponibleEnCentros', () => {
  const inv = { '1001': 10, '1018': 5, '1031': 40 };
  it('suma solo los centros que pasan el filtro', () => {
    expect(disponibleEnCentros(inv, (c) => c === '1018' || c === '1001')).toBe(15);
    expect(disponibleEnCentros(inv, () => false)).toBe(0);
  });
  it('ignora valores no numéricos', () => {
    expect(disponibleEnCentros({ a: 3, b: Number.NaN }, () => true)).toBe(3);
  });
});
