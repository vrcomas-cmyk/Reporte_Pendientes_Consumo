import { describe, it, expect } from 'vitest';
import { buildRF, auditoriaFacturacion, comparativa } from './resumenFac';
import { mapResumenFac } from './mappers';
import { monthlyInvoicing, } from './analysis';
import { analisisVentas } from './comercial';
import { analisisDirectivo, buildPeriodo, serieMensualFiltrada } from './analisisDirectivo';
import { buildEnrich } from './enrich';
import type { ResumenFacRow } from './types';

const row = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'Uno', destinatario: 'D1', material: 'M1', textoMaterial: 'Mat', mesAno: '08/2026',
  cantidadFacturada: 1, importeFacturado: 100, gpoCte: '', gpoVdor: '', centro: '1001', ...over,
});

describe('mapResumenFac normaliza "Mes y año"', () => {
  it.each(['7/2026', '07/2026', '01/07/2026', '2026-07-01T06:00:00.000Z'])('%s -> 07/2026', (v) => {
    expect(mapResumenFac({ 'Mes y año': v }).mesAno).toBe('07/2026');
  });
});

describe('suma directa de Resumen_Fac', () => {
  const rows = [
    row({ importeFacturado: 100 }),
    row({ importeFacturado: 100 }), // renglón idéntico: es otra factura
    row({ material: '', importeFacturado: 50 }),
    row({ solicitante: '', destinatario: '', importeFacturado: 25 }),
    row({ mesAno: '07/2026', importeFacturado: 1000 }),
    row({ mesAno: 'basura', importeFacturado: 9999 }),
  ];
  const total = 100 + 100 + 50 + 25 + 1000;
  const rf = buildRF(rows);
  const enrich = buildEnrich(null);
  const sum = (s: { imp: number }[]) => s.reduce((t, p) => t + p.imp, 0);

  it('rf.total incluye filas sin material/solicitante/destinatario y excluye mes inválido', () => {
    expect(sum(rf.total)).toBe(total);
    expect(rf.sinClave.material).toBe(50);
    expect(rf.sinClave.solicitante).toBe(25);
  });
  it('Panel, Análisis, Gerencia y auditoría dan el mismo total', () => {
    expect(monthlyInvoicing(rows).reduce((t, m) => t + m.importe, 0)).toBe(total);
    expect(sum(analisisVentas(rf, [], enrich)!.serieTotal)).toBe(total);
    expect(sum(serieMensualFiltrada(rf, enrich, {}))).toBe(total);
    const g = analisisDirectivo(rf, [], enrich, {}, buildPeriodo('07/2026', '07/2026'), buildPeriodo('08/2026', '08/2026'))!;
    expect(g.totalA.imp).toBe(1000);
    expect(g.totalB.imp).toBe(275);
    const au = auditoriaFacturacion(rf);
    expect(au.total).toBe(total);
    expect(au.filasInvalidas).toBe(1);
  });
  it('comparativa suma igual con meses mezclados "7/2026" y "07/2026"', () => {
    const r2 = buildRF([row({ mesAno: '7/2026', importeFacturado: 10 }), row({ mesAno: '07/2026', importeFacturado: 5 })]);
    expect(comparativa(r2.total, '07/2026').mesAct.imp).toBe(15);
  });
});
