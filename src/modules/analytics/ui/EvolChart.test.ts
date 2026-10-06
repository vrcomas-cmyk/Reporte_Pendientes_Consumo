import { describe, it, expect } from 'vitest';
import { armarFilas } from './EvolChart';
import { mesKey } from '@/core/resumenFac';

const serie = [
  { mes: '01/2026', cant: 10, imp: 100 },
  { mes: '02/2026', cant: 20, imp: 300 },
  { mes: '03/2026', cant: 0, imp: 0 },
];

describe('armarFilas', () => {
  it('lleva cantidad junto al importe', () => {
    const { filas, conCantidad } = armarFilas(serie, false, new Date(2026, 2, 31), [mesKey('01/2026'), mesKey('03/2026')]);
    expect(conCantidad).toBe(true);
    expect(filas.map((f) => [f.imp, f.cant])).toEqual([[100, 10], [300, 20], [0, 0]]);
  });
  it('sin cantidades no marca conCantidad', () => {
    const { conCantidad } = armarFilas([{ mes: '01/2026', cant: 0, imp: 5 }], false, new Date(), [mesKey('01/2026'), mesKey('01/2026')]);
    expect(conCantidad).toBe(false);
  });
  it('el rango acota los meses mostrados', () => {
    const { filas } = armarFilas(serie, false, new Date(), [mesKey('02/2026'), mesKey('02/2026')]);
    expect(filas.map((f) => f.mes)).toEqual(['02/2026']);
  });
});
