import { describe, it, expect } from 'vitest';
import { buildAnalysisResult } from './buildAnalysisResult';
import type { AppSettings } from './types';

const settings: Pick<AppSettings, 'shortExpiryDays' | 'lowStockThreshold'> = {
  shortExpiryDays: 90,
  lowStockThreshold: 5,
};

// Minimal rows whose headers alone are enough for roleOf() to classify them
// (see roleDetection.ts) — mappers default every other field to '' / 0.
const sugerenciaRow = { 'Material base': 'MAT1', Fuente: '', Pedido: 'PED1', 'Material solicitado': 'MAT1', 'Cantidad pendiente': '10' };
// Consumo se deriva de Resumen_Fac (ya no existe "Reporte de Consumo").
const consumoRow1 = { Solicitante: 'S1', Destinatario: 'D1', Material: 'C1', 'Mes y año': '01/2026', 'Cantidad facturada': '5', 'Importe facturado': '100' };
const consumoRow2 = { Solicitante: 'S1', Destinatario: 'D1', Material: 'C2', 'Mes y año': '02/2026', 'Cantidad facturada': '9', 'Importe facturado': '200' };

describe('buildAnalysisResult', () => {
  it('builds a full result from sheets with no previous/selectedRoles (today\'s xlsx-upload behavior)', () => {
    const result = buildAnalysisResult({
      sheets: { Sugerencias: [sugerenciaRow], Consumo: [consumoRow1] },
      sheetsDetected: [],
      catalog: null,
      settings,
      fileName: 'reporte.xlsx',
      startedAt: Date.now(),
    });
    expect(result.sugerencias).toHaveLength(1);
    expect(result.consumo).toHaveLength(1);
    expect(result.consumo[0].material).toBe('C1');
    expect(result.resumenSinSugerencias).toEqual([]);
  });

  it('without `previous`, a role absent from `selectedRoles` is simply empty (unchanged worker behavior)', () => {
    const result = buildAnalysisResult({
      sheets: { Consumo: [consumoRow2] },
      sheetsDetected: [],
      catalog: null,
      settings,
      fileName: 'reporte.xlsx',
      startedAt: Date.now(),
      selectedRoles: ['resumenFac'],
    });
    expect(result.sugerencias).toEqual([]);
    expect(result.consumo).toHaveLength(1);
  });

  it('with `previous`, a role absent from `selectedRoles` keeps its previous data instead of being cleared', () => {
    const previous = buildAnalysisResult({
      sheets: { Sugerencias: [sugerenciaRow], Consumo: [consumoRow1] },
      sheetsDetected: [],
      catalog: null,
      settings,
      fileName: 'r1.xlsx',
      startedAt: Date.now(),
    });

    // Round 2: only "Consumo" tab re-synced (e.g. a Google Sheets sync where
    // the user only marked that one tab). Sugerencias is untouched.
    const result = buildAnalysisResult({
      sheets: { Consumo: [consumoRow2] },
      sheetsDetected: [],
      catalog: null,
      settings,
      fileName: 'r2 (sync)',
      startedAt: Date.now(),
      previous,
      selectedRoles: ['resumenFac'],
    });

    expect(result.sugerencias).toBe(previous.sugerencias);
    expect(result.resumenSinSugerencias).toEqual(previous.resumenSinSugerencias);
    expect(result.inventarioCondicion).toEqual(previous.inventarioCondicion);
    expect(result.lotesCortaCaducidad).toEqual(previous.lotesCortaCaducidad);
    // The synced role gets the fresh data, not the old one.
    expect(result.consumo).toHaveLength(1);
    expect(result.consumo[0].material).toBe('C2');
  });

  it('recomputes KPIs/rowCount from the merged set, not just from what was freshly synced', () => {
    const previous = buildAnalysisResult({
      sheets: { Sugerencias: [sugerenciaRow] },
      sheetsDetected: [],
      catalog: null,
      settings,
      fileName: 'r1.xlsx',
      startedAt: Date.now(),
    });
    expect(previous.rowCount).toBe(1);

    // Syncing only Consumo this round still carries the previous Sugerencia
    // into rowCount (rowCount tracks sugerencias.length).
    const result = buildAnalysisResult({
      sheets: { Consumo: [consumoRow1] },
      sheetsDetected: [],
      catalog: null,
      settings,
      fileName: 'r2 (sync)',
      startedAt: Date.now(),
      previous,
      selectedRoles: ['resumenFac'],
    });
    expect(result.rowCount).toBe(1);
  });

  it('con `previous` y sin re-sincronizar Resumen_Fac, reutiliza el consumo ya derivado', () => {
    const previous = buildAnalysisResult({
      sheets: { Fac: [consumoRow1] },
      sheetsDetected: [],
      catalog: null,
      settings,
      fileName: 'r1.xlsx',
      startedAt: Date.now(),
    });
    const result = buildAnalysisResult({
      sheets: { Sugerencias: [sugerenciaRow] },
      sheetsDetected: [],
      catalog: null,
      settings,
      fileName: 'r2 (sync)',
      startedAt: Date.now(),
      previous,
      selectedRoles: ['sugerencias'],
    });
    expect(result.consumo).toBe(previous.consumo);
  });
});
