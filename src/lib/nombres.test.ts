import { describe, it, expect } from 'vitest';
import { parseNombres, etiquetaCentro, etiquetaAlmacen } from './nombres';

describe('parseNombres', () => {
  it('parsea un objeto válido y descarta vacíos', () => {
    expect(parseNombres('{"1001":"Tijuana","1003":"  ","1004":5}')).toEqual({ '1001': 'Tijuana' });
  });
  it('cae a {} con JSON inválido, arreglos o null', () => {
    expect(parseNombres('no json')).toEqual({});
    expect(parseNombres('[1]')).toEqual({});
    expect(parseNombres(null)).toEqual({});
  });
});

describe('etiquetas', () => {
  const n = { '1001': 'Tijuana', '1030': 'Multicanal' };
  it('centro: solo con nombre cuando mostrar está activo', () => {
    expect(etiquetaCentro('1001', n, true)).toBe('1001 (Tijuana)');
    expect(etiquetaCentro('1001', n, false)).toBe('1001');
    expect(etiquetaCentro('1003', n, true)).toBe('1003');
  });
  it('almacén: siempre con nombre si existe', () => {
    expect(etiquetaAlmacen('1030', n)).toBe('1030 (Multicanal)');
    expect(etiquetaAlmacen('1060', n)).toBe('1060');
  });
});
