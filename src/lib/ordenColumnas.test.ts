import { describe, expect, it } from 'vitest';
import { firmaOrden, moverColumna, ordenarColumnas } from './ordenColumnas';

describe('ordenarColumnas', () => {
  const base = ['a', 'b', 'c', 'd'];
  it('sin orden guardado deja el base', () => expect(ordenarColumnas(base, [])).toEqual(base));
  it('respeta el orden guardado', () => expect(ordenarColumnas(base, ['c', 'a', 'b', 'd'])).toEqual(['c', 'a', 'b', 'd']));
  it('una columna nueva (no guardada) va al final; una guardada que ya no existe se ignora', () => {
    expect(ordenarColumnas(['a', 'b', 'nueva'], ['b', 'x', 'a'])).toEqual(['b', 'a', 'nueva']);
  });
});

describe('moverColumna', () => {
  const l = ['a', 'b', 'c', 'd'];
  it('hacia la derecha queda después de la destino', () => expect(moverColumna(l, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']));
  it('hacia la izquierda queda antes de la destino', () => expect(moverColumna(l, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']));
  it('misma columna o desconocida no cambia nada', () => {
    expect(moverColumna(l, 'a', 'a')).toEqual(l);
    expect(moverColumna(l, 'z', 'a')).toEqual(l);
  });
});

describe('firmaOrden', () => {
  it('base sin orden y distinta con orden', () => {
    expect(firmaOrden([])).toBe('base');
    expect(firmaOrden(['a', 'b'])).not.toBe(firmaOrden(['b', 'a']));
  });
});
