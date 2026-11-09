import { describe, it, expect } from 'vitest';
import { valoresConSustitutos, type ConsumoMaterial, type FuentesValores } from './valoresLote';

const pend: Record<string, Record<string, number>> = { M1: { '1001': 5, '1017': 3 }, S1: { '1001': 20, '1003': 10 } };
const cons: Record<string, ConsumoMaterial> = {
  M1: { total: 0, porCentro: new Map(), prom: 12, promPorCentro: new Map([['1001', 7]]), ultMes: '03/2026', ultPorCentro: new Map([['1001', '03/2026']]) },
  S1: {
    total: 70, porCentro: new Map([['1001', 50], ['1003', 20]]),
    prom: 40, promPorCentro: new Map([['1001', 30], ['1003', 10]]),
    ultMes: '10/2026', ultPorCentro: new Map([['1001', '09/2026'], ['1003', '10/2026']]),
  },
};
const f: FuentesValores = {
  pendDe: (k, c) => (c ? pend[k]?.[c] ?? 0 : Object.values(pend[k] ?? {}).reduce((a, b) => a + b, 0)),
  consumoDe: (k) => cons[k],
};

describe('valoresConSustitutos', () => {
  it('el propio y el sustituto van separados', () => {
    const r = valoresConSustitutos('M1', '1001', [{ material: 'S1', texto: 'Sust' }], f);
    expect(r.propio).toMatchObject({ pendGeneral: 8, pendCentro: 5, consumo: 0, consumoCentro: 0 });
    expect(r.sust).toMatchObject({ pendGeneral: 30, pendCentro: 20, consumo: 70, consumoCentro: 50 });
    expect(r.sust.detalle).toHaveLength(1);
  });
  it('promedio y última facturación: generales y del centro, de cada código', () => {
    const r = valoresConSustitutos('M1', '1001', [{ material: 'S1', texto: '' }], f);
    expect(r.propio).toMatchObject({ promGeneral: 12, promCentro: 7, ultGeneral: '03/2026', ultCentro: '03/2026' });
    expect(r.sust).toMatchObject({ promGeneral: 40, promCentro: 30, ultGeneral: '10/2026', ultCentro: '09/2026' });
    expect(r.sust.detalle[0]).toMatchObject({ material: 'S1', promCentro: 30, ultCentro: '09/2026' });
  });
  it('centro distinto: el sustituto se mide en ESE centro', () => {
    const r = valoresConSustitutos('M1', '1003', [{ material: 'S1', texto: '' }], f);
    expect(r.sust.pendCentro).toBe(10);
    expect(r.sust.consumoCentro).toBe(20);
    expect(r.sust.ultCentro).toBe('10/2026');
    expect(r.propio.promCentro).toBe(0);
    expect(r.propio.ultCentro).toBe('');
  });
  it('sin sustitutos todo es cero y no hay detalle', () => {
    const r = valoresConSustitutos('M1', '1001', [], f);
    expect(r.sust).toEqual({ pendGeneral: 0, pendCentro: 0, consumo: 0, consumoCentro: 0, promGeneral: 0, promCentro: 0, ultGeneral: '', ultCentro: '', detalle: [] });
  });
  it('ignora un "sustituto" igual al propio código', () => {
    expect(valoresConSustitutos('M1', '1001', [{ material: ' M1 ', texto: '' }], f).sust.detalle).toEqual([]);
  });
  it('suma varios sustitutos y toma la facturación más reciente', () => {
    const extra: Record<string, ConsumoMaterial> = { ...cons, X: { total: 1, porCentro: new Map(), prom: 5, promPorCentro: new Map(), ultMes: '11/2026', ultPorCentro: new Map() } };
    const r = valoresConSustitutos('M1', '1001', [{ material: 'S1', texto: '' }, { material: 'X', texto: '' }], { ...f, consumoDe: (k) => extra[k] });
    expect(r.sust.promGeneral).toBe(45);
    expect(r.sust.ultGeneral).toBe('11/2026');
  });
});
