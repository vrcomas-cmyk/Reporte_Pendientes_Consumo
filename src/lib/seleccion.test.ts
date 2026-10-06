import { describe, it, expect } from 'vitest';
import { calcularSeleccion, aTsv, type SeleccionEstado } from './seleccion';

const orden = ['a', 'b', 'c', 'd', 'e'];
const vacio: SeleccionEstado = { selected: new Set(), ancla: null };
const sin = { ctrl: false, shift: false };

describe('calcularSeleccion', () => {
  it('clic selecciona solo esa fila y fija el ancla', () => {
    const r = calcularSeleccion({ selected: new Set(['a', 'b']), ancla: 'a' }, 'c', sin, orden);
    expect([...r.selected]).toEqual(['c']);
    expect(r.ancla).toBe('c');
  });
  it('Ctrl+clic alterna', () => {
    const r1 = calcularSeleccion({ selected: new Set(['a']), ancla: 'a' }, 'c', { ctrl: true, shift: false }, orden);
    expect([...r1.selected].sort()).toEqual(['a', 'c']);
    const r2 = calcularSeleccion(r1, 'a', { ctrl: true, shift: false }, orden);
    expect([...r2.selected]).toEqual(['c']);
  });
  it('Shift+clic selecciona el rango desde el ancla (en cualquier sentido)', () => {
    const r1 = calcularSeleccion({ selected: new Set(['b']), ancla: 'b' }, 'd', { ctrl: false, shift: true }, orden);
    expect([...r1.selected]).toEqual(['b', 'c', 'd']);
    const r2 = calcularSeleccion({ selected: new Set(['d']), ancla: 'd' }, 'b', { ctrl: false, shift: true }, orden);
    expect([...r2.selected].sort()).toEqual(['b', 'c', 'd']);
    expect(r2.ancla).toBe('d');
  });
  it('Ctrl+Shift suma el rango a lo ya seleccionado', () => {
    const r = calcularSeleccion({ selected: new Set(['a', 'c']), ancla: 'c' }, 'e', { ctrl: true, shift: true }, orden);
    expect([...r.selected].sort()).toEqual(['a', 'c', 'd', 'e']);
  });
  it('Shift sin ancla se comporta como clic simple', () => {
    const r = calcularSeleccion(vacio, 'c', { ctrl: false, shift: true }, orden);
    expect([...r.selected]).toEqual(['c']);
  });
});

describe('aTsv', () => {
  it('encabezados + filas con tabuladores, sin saltos internos', () => {
    expect(aTsv([{ Pedido: '1', Cliente: 'A\tB' }, { Pedido: '2', Cliente: 'C\nD' }])).toBe('Pedido\tCliente\n1\tA B\n2\tC D');
  });
  it('vacío = cadena vacía', () => expect(aTsv([])).toBe(''));
});
