import { describe, it, expect } from 'vitest';
import { listarGruposCliente, nombresExcluidos, gruposPorDefecto, esSeleccionPorDefecto, etiquetaGrupos, parseGruposExcluidos, GRUPOS_EXCLUIDOS_DEFAULT } from './gruposCliente';

const OPC = ['CONCENTRADORAS', 'DISTRIBUIDORES', 'GOBIERNO', 'GOBIERNO A', 'GOBIERNO DESCENTRALIZADO', '(sin grupo)'];

describe('gruposPorDefecto', () => {
  it('el default excluye solo el código 18 (GOBIERNO)', () => {
    expect(GRUPOS_EXCLUIDOS_DEFAULT).toEqual(['18']);
  });

  it('excluye SOLO "GOBIERNO": no "GOBIERNO A", ni "GOBIERNO DESCENTRALIZADO", ni CONCENTRADORAS', () => {
    expect(gruposPorDefecto(OPC, ['GOBIERNO'])).toEqual(['CONCENTRADORAS', 'DISTRIBUIDORES', 'GOBIERNO A', 'GOBIERNO DESCENTRALIZADO', '(sin grupo)']);
  });

  it('compara sin distinguir mayúsculas, acentos ni espacios repetidos', () => {
    expect(gruposPorDefecto(['Gobierno', 'Otro'], ['  GOBIERNO '])).toEqual(['Otro']);
  });

  it('se pueden excluir varios (p. ej. también CONCENTRADORAS, definido en Administración)', () => {
    expect(gruposPorDefecto(OPC, ['GOBIERNO', 'CONCENTRADORAS'])).toEqual(['DISTRIBUIDORES', 'GOBIERNO A', 'GOBIERNO DESCENTRALIZADO', '(sin grupo)']);
  });

  it('sin ningún excluido en las opciones → [] (sin filtro)', () => {
    expect(gruposPorDefecto(['A', 'B'], ['GOBIERNO'])).toEqual([]);
    expect(gruposPorDefecto(OPC, [])).toEqual([]);
  });
});

describe('nombresExcluidos', () => {
  it('resuelve códigos a nombres del catálogo; sin catálogo usa el código', () => {
    const cat: Record<string, string> = { '18': 'GOBIERNO', '11': 'CONCENTRADORAS' };
    expect(nombresExcluidos(['18', '11'], (c) => cat[c] ?? '')).toEqual(['GOBIERNO', 'CONCENTRADORAS']);
    expect(nombresExcluidos(['18'], () => '')).toEqual(['18']);
  });
});

describe('etiqueta y selección por defecto', () => {
  it('etiqueta con los nombres excluidos', () => {
    const def = gruposPorDefecto(OPC, ['GOBIERNO']);
    expect(esSeleccionPorDefecto(def, OPC, ['GOBIERNO'])).toBe(true);
    expect(etiquetaGrupos(def, OPC, ['GOBIERNO'])).toBe('todos menos GOBIERNO');
    expect(etiquetaGrupos([], OPC, ['GOBIERNO'])).toBe('todos');
    expect(etiquetaGrupos(['A', 'B', 'C'], OPC, ['GOBIERNO'])).toBe('A, B +1');
  });
});

describe('parseGruposExcluidos', () => {
  it('lee un arreglo JSON de códigos, sin vacíos ni repetidos', () => {
    expect(parseGruposExcluidos('["18"," 11 ","18",""]')).toEqual(['18', '11']);
    expect(parseGruposExcluidos('[]')).toEqual([]); // decisión explícita: no excluir nada
  });
  it('sin valor o inválido → null (se usa el default)', () => {
    expect(parseGruposExcluidos(undefined)).toBeNull();
    expect(parseGruposExcluidos('')).toBeNull();
    expect(parseGruposExcluidos('no json')).toBeNull();
    expect(parseGruposExcluidos('{"a":1}')).toBeNull();
  });
});

describe('listarGruposCliente (Administración → Filtros)', () => {
  it('incluye los códigos que solo aparecen en otras fuentes (sin nombre) junto a los del catálogo', () => {
    const r = listarGruposCliente([['15', 'DISTRIBUIDOR'], ['18', 'GOBIERNO']], ['15', '28', '29', '30', '31', '32'], []);
    expect(r).toEqual([['15', 'DISTRIBUIDOR'], ['18', 'GOBIERNO'], ['28', ''], ['29', ''], ['30', ''], ['31', ''], ['32', '']]);
  });
  it('un código con nombre en el catálogo conserva ese nombre aunque otra fuente lo repita', () => {
    expect(listarGruposCliente([['15', 'DISTRIBUIDOR']], ['15'], [])).toEqual([['15', 'DISTRIBUIDOR']]);
  });
  it('si el catálogo lo trae primero sin nombre y luego con nombre, gana el nombre', () => {
    expect(listarGruposCliente([['7', ''], ['7', 'FARMACIAS']], [], [])).toEqual([['7', 'FARMACIAS']]);
  });
  it('conserva los excluidos que ninguna fuente trae, ignora vacíos y ordena numéricamente (2 antes que 10)', () => {
    expect(listarGruposCliente([['10', 'A'], ['2', 'B'], ['', 'X']], [' ', '5'], ['99'])).toEqual([['2', 'B'], ['5', ''], ['10', 'A'], ['99', '']]);
  });
});
