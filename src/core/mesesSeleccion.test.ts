import { describe, it, expect } from 'vitest';
import { etiquetaMes, normalizarMeses, parsearMes, parsearMeses, resumirMeses } from './mesesSeleccion';
import { mesKey } from './resumenFac';

describe('etiquetaMes', () => {
  it("'10/2026' → 'oct/2026'", () => {
    expect(etiquetaMes('10/2026')).toBe('oct/2026');
    expect(etiquetaMes('01/2024')).toBe('ene/2024');
    expect(etiquetaMes('')).toBe('');
    expect(etiquetaMes('basura')).toBe('basura');
  });
});

describe('parsearMes', () => {
  it('acepta mm/aaaa, m/aaaa y mmm/aaaa', () => {
    const k = 2026 * 12 + 3;
    expect(parsearMes('03/2026')).toBe(k);
    expect(parsearMes('3/2026')).toBe(k);
    expect(parsearMes('mar/2026')).toBe(k);
    expect(parsearMes('MAR/2026')).toBe(k);
    expect(parsearMes('13/2026')).toBeNull();
    expect(parsearMes('xx/2026')).toBeNull();
    expect(parsearMes('03/26')).toBeNull();
  });
});

describe('parsearMeses', () => {
  it('un mes', () => {
    expect(parsearMeses('07/2026')).toEqual({ meses: ['07/2026'], errores: [] });
  });
  it('un rango (con guion, "a" o nombres de mes)', () => {
    const esperado = ['01/2026', '02/2026', '03/2026'];
    expect(parsearMeses('01/2026-03/2026').meses).toEqual(esperado);
    expect(parsearMeses('ene/2026 a mar/2026').meses).toEqual(esperado);
    expect(parsearMeses('ene/2026 – mar/2026').meses).toEqual(esperado);
    expect(parsearMeses('03/2026-01/2026').meses).toEqual(esperado); // al revés también
  });
  it('periodos saltados: rangos y meses sueltos, cruzando años y sin repetidos', () => {
    const r = parsearMeses('nov/2025-ene/2026, 07/2026; 01/2026');
    expect(r.errores).toEqual([]);
    expect(r.meses).toEqual(['11/2025', '12/2025', '01/2026', '07/2026']);
  });
  it('avisa lo que no puede leer sin tirar lo demás', () => {
    const r = parsearMeses('01/2026, foo, 13/2026-14/2026');
    expect(r.meses).toEqual(['01/2026']);
    expect(r.errores).toEqual(['foo', '13/2026-14/2026']);
  });
  it('texto vacío = sin selección', () => {
    expect(parsearMeses('  ')).toEqual({ meses: [], errores: [] });
  });
});

describe('resumirMeses', () => {
  it('junta las rachas consecutivas y deja los saltos separados', () => {
    expect(resumirMeses(['01/2026', '02/2026', '03/2026', '07/2026'])).toBe('ene/2026–mar/2026, jul/2026');
    expect(resumirMeses(['12/2025', '01/2026'])).toBe('dic/2025, ene/2026');
    expect(resumirMeses(['05/2026'])).toBe('may/2026');
    expect(resumirMeses([])).toBe('');
  });
  it('ida y vuelta con parsearMeses', () => {
    const meses = ['10/2025', '11/2025', '12/2025', '01/2026', '05/2026', '07/2026', '08/2026'];
    expect(parsearMeses(resumirMeses(meses)).meses).toEqual(meses);
  });
});

describe('normalizarMeses', () => {
  it('ordena cronológicamente y quita repetidos', () => {
    expect(normalizarMeses(['03/2026', '01/2026', '03/2026', '12/2025'])).toEqual(['12/2025', '01/2026', '03/2026']);
    expect(normalizarMeses(['01/2026']).map(mesKey)).toEqual([2026 * 12 + 1]);
  });
});
