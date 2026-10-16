import { describe, it, expect } from 'vitest';
import { estadosConsumo, estadosConsumoAsync } from './consumoEstados';
import { consumoDesdeResumenFac } from './consumoDesdeRF';
import { buildRF, clasificarEstado, serieMatDest, tendenciaTexto } from './resumenFac';
import type { ResumenFacRow } from './types';

const hoy = new Date();
const mesRel = (n: number) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() - n, 1); return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const fila = (i: number): ResumenFacRow => ({
  solicitante: `S${i % 7}`, razonSocial: `R${i % 7}`, destinatario: `D${i % 11}`, material: `M${i % 13}`, textoMaterial: `T${i % 13}`,
  mesAno: mesRel(i % 14), cantidadFacturada: (i % 5) + 1, importeFacturado: ((i % 9) + 1) * 10, gpoCte: '15', gpoVdor: 'V', centro: `10${i % 4}`,
});

describe('estadosConsumo', () => {
  const rows = Array.from({ length: 3000 }, (_, i) => fila(i));
  const rf = buildRF(rows);
  const consumo = consumoDesdeResumenFac(rows, undefined, { agruparPorCentro: false });

  it('una entrada por fila, igual a calcular cada fila con su serie', () => {
    const idx = estadosConsumo(consumo, rf);
    expect(idx.size).toBe(consumo.length);
    for (const r of consumo.slice(0, 50)) {
      const serie = serieMatDest(rf, r.destinatario, r.material);
      const e = idx.get(r)!;
      expect(e.status.key).toBe(clasificarEstado(serie.length ? serie : null, false).key);
      expect(e.tend.txt).toBe(tendenciaTexto(serie).txt);
      expect(e.meses.length).toBeGreaterThan(0);
    }
  });

  it('por tramos da lo mismo que de golpe', async () => {
    const a = estadosConsumo(consumo, rf);
    const b = await estadosConsumoAsync(consumo, rf);
    expect(b?.size).toBe(a.size);
    for (const r of consumo.slice(0, 50)) expect(b?.get(r)).toEqual(a.get(r));
  });
});
