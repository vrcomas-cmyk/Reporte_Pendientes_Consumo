import { describe, expect, it } from 'vitest';
import { colocarColumna, firmaOrden, moverColumna, ordenarColumnas } from './ordenColumnas';

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

describe('colocarColumna', () => {
  const l = ['a', 'b', 'c', 'd', 'e'];
  it('la última a la posición 1: pasa a ser la primera y las demás se recorren', () => {
    expect(colocarColumna(l, 'e', 1)).toEqual(['e', 'a', 'b', 'c', 'd']);
  });
  it('la primera a una posición posterior: las que estaban después suben un lugar', () => {
    expect(colocarColumna(l, 'a', 3)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });
  it('a la misma posición no cambia nada', () => {
    expect(colocarColumna(l, 'c', 3)).toEqual(l);
  });
  it('una posición fuera de rango se acota (0 o negativa → primera; mayor al total → última)', () => {
    expect(colocarColumna(l, 'c', 0)).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(colocarColumna(l, 'c', -4)).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(colocarColumna(l, 'c', 99)).toEqual(['a', 'b', 'd', 'e', 'c']);
  });
  it('un decimal se trunca; una columna desconocida o una posición no numérica no cambian nada', () => {
    expect(colocarColumna(l, 'd', 1.9)).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(colocarColumna(l, 'z', 1)).toEqual(l);
    expect(colocarColumna(l, 'a', NaN)).toEqual(l);
  });
  it('no modifica la lista original', () => {
    const copia = [...l];
    colocarColumna(l, 'e', 1);
    expect(l).toEqual(copia);
  });
});
