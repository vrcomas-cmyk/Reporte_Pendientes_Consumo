import { describe, it, expect } from 'vitest';
import { extraerToken, textoDeBloque } from './clickCopy';

describe('extraerToken', () => {
  const t = 'Material 1001234 — GASA 10x10, estéril';
  it('devuelve el código bajo el cursor', () => expect(extraerToken(t, 12)).toBe('1001234'));
  it('también al final de la palabra', () => expect(extraerToken(t, 16)).toBe('1001234'));
  it('quita signos en los extremos', () => expect(extraerToken('(ABC-12).', 3)).toBe('ABC-12'));
  it('conserva guiones y diagonales internas', () => expect(extraerToken('1001/1030-A', 4)).toBe('1001/1030-A'));
  it('sobre un espacio o signo suelto no hay palabra', () => expect(extraerToken('a  b', 2)).toBe(''));
  it('acepta acentos', () => expect(extraerToken('estéril ok', 3)).toBe('estéril'));
});

describe('textoDeBloque', () => {
  it('sube del código a la celda con su descripción', () => {
    document.body.innerHTML = '<table><tbody><tr><td id="c"><button id="b">1001234</button><div>GASA ESTERIL</div></td><td>otra</td></tr></tbody></table>';
    expect(textoDeBloque(document.getElementById('b'), '1001234')).toBe('1001234 GASA ESTERIL');
  });
  it('si el elemento ya tiene texto distinto de la palabra, lo devuelve', () => {
    document.body.innerHTML = '<p id="p">Material 1001234 — GASA</p>';
    expect(textoDeBloque(document.getElementById('p'), '1001234')).toBe('Material 1001234 — GASA');
  });
  it('no pasa de la fila de la tabla', () => {
    document.body.innerHTML = '<table><tbody><tr><td id="x">solo</td><td>otra celda</td></tr></tbody></table>';
    expect(textoDeBloque(document.getElementById('x'), 'solo')).toBe('');
  });
  it('un contenedor enorme no se copia', () => {
    document.body.innerHTML = `<div id="g"><span id="s">hola</span>${'x'.repeat(300)}</div>`;
    expect(textoDeBloque(document.getElementById('s'), 'hola')).toBe('');
  });
});
