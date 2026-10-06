import { describe, it, expect } from 'vitest';
import { buildRF } from '@/core/resumenFac';
import { analisisVentas } from '@/core/comercial';
import { buildEnrich } from '@/core/enrich';
import type { ResumenFacRow } from '@/core/types';

const rf = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'Uno', destinatario: 'D1', material: 'M1', textoMaterial: 'Mat', mesAno: '08/2026',
  cantidadFacturada: 1, importeFacturado: 100, gpoCte: '', gpoVdor: '', centro: '1001', ...over,
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
