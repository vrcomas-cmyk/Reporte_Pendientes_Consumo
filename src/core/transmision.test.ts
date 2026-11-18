import { describe, expect, it } from 'vitest';
import { historialDeRespuesta, indiceDeRespuesta, materialesEnTransmision, normalizarClaveTx, textoTransmision, transmisionDePedido, type IndiceTx } from './transmision';

const indice: IndiceTx = {
  '80012345': [{ d: '8100001', n: '12', f: '05/11/2026', p: 'Nov 2026' }, { d: '8100002', n: '9', f: '20/10/2026', p: 'Oct 2026' }],
  '7000': [{ d: '8100003', n: '3', f: '01/11/2026', p: 'Nov 2026' }],
};

describe('normalizarClaveTx', () => {
  it('quita espacios, ceros a la izquierda y mayúsculas: 0080012345 = 80012345', () => {
    expect(normalizarClaveTx(' 0080012345 ')).toBe('80012345');
    expect(normalizarClaveTx('AB-01')).toBe('ab-01');
    expect(normalizarClaveTx(null)).toBe('');
    expect(normalizarClaveTx(80012345)).toBe('80012345');
  });
});

describe('transmisionDePedido', () => {
  it('encuentra el pedido aunque venga con ceros y ordena por fecha (la más reciente primero)', () => {
    const r = transmisionDePedido(indice, '0080012345');
    expect(r.map((e) => e.d)).toEqual(['8100001', '8100002']);
  });
  it('pedido que no está, vacío o sin índice → []', () => {
    expect(transmisionDePedido(indice, '999')).toEqual([]);
    expect(transmisionDePedido(indice, '')).toEqual([]);
    expect(transmisionDePedido(null, '7000')).toEqual([]);
  });
});

describe('textoTransmision', () => {
  it('una entrega, varias, y ninguna', () => {
    expect(textoTransmision(transmisionDePedido(indice, '7000'))).toBe('Entrega 8100003 · 01/11/2026');
    expect(textoTransmision(transmisionDePedido(indice, '80012345'))).toBe('2 entregas · última 05/11/2026');
    expect(textoTransmision([])).toBe('');
  });
});

describe('materialesEnTransmision', () => {
  const historial = {
    '8100001': [{ m: '0511010', l: 'L1' }, { m: '511010', l: 'L2' }, { m: '300', l: '' }],
    '8100002': [{ m: '511010', l: 'L1' }],
  };
  it('atribuye materiales a las entregas del pedido (con material normalizado) y junta sus lotes', () => {
    const r = materialesEnTransmision(indice, historial, '80012345');
    expect(r.get('511010')).toEqual({ entregas: ['8100001', '8100002'], lotes: ['L1', 'L2'] });
    expect(r.get('300')).toEqual({ entregas: ['8100001'], lotes: [] });
  });
  it('sin histórico no afirma nada de los materiales', () => {
    expect(materialesEnTransmision(indice, null, '80012345').size).toBe(0);
  });
  it('un pedido que no está en transmisión no devuelve materiales', () => {
    expect(materialesEnTransmision(indice, historial, '999').size).toBe(0);
  });
});

describe('validación de lo que llega del servidor', () => {
  it('indiceDeRespuesta normaliza claves y descarta lo que no tiene forma de índice', () => {
    const r = indiceDeRespuesta({ '0080012345': [{ d: '81', n: 1, f: '01/01/2026', p: 'Ene' }, { n: 'sin delivery' }, 'basura'], malo: 'x', '77': [] });
    expect(Object.keys(r)).toEqual(['80012345']);
    expect(r['80012345']).toEqual([{ d: '81', n: '1', f: '01/01/2026', p: 'Ene' }]);
    expect(indiceDeRespuesta(null)).toEqual({});
  });
  it('historialDeRespuesta normaliza el delivery y descarta renglones sin material', () => {
    const r = historialDeRespuesta({ '08100001': [{ m: '511010', l: 'L1' }, { m: '', l: 'x' }] });
    expect(r).toEqual({ '8100001': [{ m: '511010', l: 'L1' }] });
  });
});
