import { describe, it, expect } from 'vitest';
import { paresSoloFacturacion, serieFacturada } from './helpers';
import { buildRF } from '@/core/resumenFac';
import { analisisVentas } from '@/core/comercial';
import { buildEnrich } from '@/core/enrich';
import type { ConsumoRow, ResumenFacRow } from '@/core/types';

const rf = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'Uno', destinatario: 'D1', material: 'M1', textoMaterial: 'Mat', mesAno: '08/2026',
  cantidadFacturada: 1, importeFacturado: 100, gpoCte: '', gpoVdor: '', centro: '1001', ...over,
});
const cons = (destinatario: string, material: string): ConsumoRow => ({
  centro: '1001', grpCliente: '', gpoVdor: '', solicitante: 'S1', destinatario, razonSocial: 'Uno', material, textoMaterial: '',
  consumoActual: 0, consumoPromedioMensual: 0, um: '', tendencia: '', ultimoMesFacturacion: '', cantidadUltima: 0,
  importeUltima: 0, precioMin: 0, precioMax: 0, precioProm: 0, precioUnitarioUltima: 0, raw: {},
});

describe('paresSoloFacturacion', () => {
  const index = buildRF([
    rf({}), rf({ importeFacturado: 50 }), // mismo par D1||M1 (2 renglones idénticos en mes)
    rf({ destinatario: 'D2', material: 'M2', importeFacturado: 300 }),
    rf({ destinatario: 'D3', material: 'M3', importeFacturado: 700, mesAno: '07/2026' }),
  ]);
  it('crea una fila por par de Resumen_Fac ausente en Reporte de Consumo', () => {
    const out = paresSoloFacturacion(index, [cons('D1', 'M1')]);
    expect(out.map((r) => r.destinatario + '||' + r.material).sort()).toEqual(['D2||M2', 'D3||M3']);
  });
  it('real + sintéticas suman exactamente el total de Resumen_Fac', () => {
    const real = [cons('D1', 'M1')];
    const todo = [...real, ...paresSoloFacturacion(index, real)];
    const total = todo.reduce((t, r) => t + serieFacturada(index, r).reduce((a, p) => a + p.imp, 0), 0);
    expect(total).toBe(100 + 50 + 300 + 700);
  });
  it('sin rf devuelve vacío', () => expect(paresSoloFacturacion(null, [])).toEqual([]));
});

describe('analisisVentas respeta filtros de cliente en los totales', () => {
  it('filtrar por ejecutivo cambia serieTotal', () => {
    const idx = buildRF([
      rf({ gpoVdor: 'V1', importeFacturado: 100 }),
      rf({ solicitante: 'S2', destinatario: 'D2', gpoVdor: 'V2', importeFacturado: 900 }),
    ]);
    const enrich = buildEnrich(null);
    const sum = (r: ReturnType<typeof analisisVentas>) => r!.serieTotal.reduce((t, p) => t + p.imp, 0);
    expect(sum(analisisVentas(idx, [], enrich))).toBe(1000);
    // Ejecutivo sin coincidencia → ningún cliente pasa
    expect(sum(analisisVentas(idx, [], enrich, { ejecutivo: 'NADIE' }))).toBe(0);
  });
});
