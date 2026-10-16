import { describe, it, expect } from 'vitest';
import { correrPorTramos, correrSincrono } from './tramos';
import { buildRF, buildRFAsync } from '@/core/resumenFac';
import { consumoDesdeResumenFac, consumoDesdeResumenFacAsync } from '@/core/consumoDesdeRF';
import type { ResumenFacRow } from '@/core/types';

function* suma(n: number): Generator<number, number> {
  let s = 0;
  for (let i = 1; i <= n; i++) { s += i; if (i % 10 === 0) yield i / n; }
  return s;
}

describe('correrPorTramos', () => {
  it('da el mismo resultado que correrlo de golpe', async () => {
    expect(correrSincrono(suma(1000))).toBe(500500);
    expect(await correrPorTramos(suma(1000), { ms: 0 })).toBe(500500);
  });
  it('cede el paso una vez por tramo: con ms=0 cada paso del generador termina en una cesión', async () => {
    const cesiones: number[] = [];
    const r = await correrPorTramos(suma(100), { ms: 0, onProgreso: (f) => cesiones.push(f) });
    expect(r).toBe(5050);
    expect(cesiones).toHaveLength(10); // suma() cede cada 10 elementos
  });
  it('si se cancela devuelve null y deja de trabajar', async () => {
    let pasos = 0;
    function* largo(): Generator<number, number> { for (;;) { pasos++; yield 0; } }
    const r = await correrPorTramos(largo(), { ms: 0, cancelado: () => pasos >= 5 });
    expect(r).toBeNull();
    expect(pasos).toBeLessThan(10);
  });
  it('informa el avance', async () => {
    const avances: number[] = [];
    await correrPorTramos(suma(100), { ms: 0, onProgreso: (f) => avances.push(f) });
    expect(avances.length).toBeGreaterThan(0);
    expect(Math.max(...avances)).toBeLessThanOrEqual(1);
  });
});

const fila = (i: number): ResumenFacRow => ({
  solicitante: `S${i % 7}`, razonSocial: `R${i % 7}`, destinatario: `D${i % 11}`, material: `M${i % 13}`, textoMaterial: `Texto ${i % 13}`,
  mesAno: `${String((i % 12) + 1).padStart(2, '0')}/2026`, cantidadFacturada: (i % 5) + 1, importeFacturado: ((i % 9) + 1) * 10, gpoCte: `${15 + (i % 3)}`, gpoVdor: 'V', centro: `10${i % 4}`,
});

describe('índices de facturación por tramos = de golpe', () => {
  const rows = Array.from({ length: 6000 }, (_, i) => fila(i));
  it('buildRFAsync devuelve los mismos índices que buildRF', async () => {
    const a = buildRF(rows);
    const b = await buildRFAsync(rows, {});
    expect(b).not.toBeNull();
    expect(b?.curmes).toBe(a.curmes);
    expect([...(b?.matDest.entries() ?? [])]).toEqual([...a.matDest.entries()]);
    expect(b?.total).toEqual(a.total);
  });
  it('consumoDesdeResumenFacAsync devuelve el mismo consumo que consumoDesdeResumenFac', async () => {
    const a = consumoDesdeResumenFac(rows, undefined, { agruparPorCentro: false });
    const b = await consumoDesdeResumenFacAsync(rows, undefined, { agruparPorCentro: false });
    expect(b).toEqual(a);
  });
});
