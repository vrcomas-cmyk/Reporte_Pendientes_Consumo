import { describe, it, expect } from 'vitest';
import { buildRF, clientesPorMesMaterial } from './resumenFac';
import type { ResumenFacRow } from './types';

const row = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'Uno', destinatario: 'D1', material: 'M1', textoMaterial: 'Mat', mesAno: '08/2026',
  cantidadFacturada: 1, importeFacturado: 100, gpoCte: 'GC1', gpoVdor: 'GV1', centro: '1001', ...over,
});

describe('clientesPorMesMaterial', () => {
  const rf = buildRF([
    row({}),
    row({ centro: '1003', importeFacturado: 50 }),
    row({ destinatario: 'D2', razonSocial: 'Dos', gpoVdor: 'GV2', gpoCte: 'GC2', importeFacturado: 300 }),
    row({ mesAno: '07/2026', importeFacturado: 999 }),
  ]);
  it('sin filtro suma todos los centros y trae ejecutivo/grupo', () => {
    const r = clientesPorMesMaterial(rf, 'M1', '08/2026');
    expect(r.map((c) => [c.dest, c.imp])).toEqual([['D2', 300], ['D1', 150]]);
    expect(r.find((c) => c.dest === 'D1')).toMatchObject({ gpoVdor: 'GV1', gpoCte: 'GC1' });
  });
  it('filtra por centro', () => {
    const r = clientesPorMesMaterial(rf, 'M1', '08/2026', { centro: '1003' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ dest: 'D1', imp: 50 });
  });
  it('filtra por destinatario', () => {
    const r = clientesPorMesMaterial(rf, 'M1', '08/2026', { dest: 'D2' });
    expect(r.map((c) => c.dest)).toEqual(['D2']);
  });
});
