import { describe, it, expect } from 'vitest';
import { consumoDesdeResumenFac, promedioConsumo } from './consumoDesdeRF';
import type { ResumenFacRow } from './types';

const rf = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'Uno', destinatario: 'D1', material: 'M1', textoMaterial: 'Mat', mesAno: '08/2026',
  cantidadFacturada: 10, importeFacturado: 100, gpoCte: 'GC', gpoVdor: 'GV', centro: '1001', ...over,
});

describe('consumoDesdeResumenFac', () => {
  const rows = [
    rf({ mesAno: '06/2026', cantidadFacturada: 10, importeFacturado: 100 }),
    rf({ mesAno: '07/2026', cantidadFacturada: 20, importeFacturado: 300 }),
    rf({ mesAno: '08/2026', cantidadFacturada: 30, importeFacturado: 600 }),
    rf({ centro: '1002', mesAno: '08/2026', cantidadFacturada: 5, importeFacturado: 50 }),
    rf({ destinatario: 'D2', material: 'M2', mesAno: '07/2026' }),
    rf({ mesAno: 'basura' }),
  ];
  const out = consumoDesdeResumenFac(rows, (m) => (m === 'M1' ? 'PZA' : ''));
  const find = (c: string, d: string, m: string) => out.find((r) => r.centro === c && r.destinatario === d && r.material === m)!;

  it('una fila por Centro+Destinatario+Material e ignora meses inválidos', () => {
    expect(out).toHaveLength(3);
  });
  it('consumo actual, última y penúltima', () => {
    const r = find('1001', 'D1', 'M1');
    expect(r.consumoActual).toBe(30);
    expect(r.ultimoMesFacturacion).toBe('08/2026');
    expect(r.cantidadUltima).toBe(30);
    expect(r.importeUltima).toBe(600);
    expect(r.penultimoMes).toBe('07/2026');
    expect(r.cantidadPenultima).toBe(20);
    expect(r.um).toBe('PZA');
  });
  it('precios de los últimos 12 meses', () => {
    const r = find('1001', 'D1', 'M1');
    expect(r.precioMin).toBe(10);
    expect(r.precioMax).toBe(20);
    expect(r.precioProm).toBeCloseTo(1000 / 60);
    expect(r.precioUnitarioUltima).toBe(20);
  });
  it('promedio por defecto = historia (1ª compra → mes actual)', () => {
    expect(find('1001', 'D1', 'M1').consumoPromedioMensual).toBe(20);
  });
  it('sin filas devuelve vacío', () => expect(consumoDesdeResumenFac([])).toEqual([]));
});

describe('promedioConsumo', () => {
  const serie = [
    { mes: '01/2026', cant: 12, imp: 0 },
    { mes: '03/2026', cant: 6, imp: 0 },
    { mes: '08/2026', cant: 30, imp: 0 },
  ];
  it('historia: Σ ÷ meses desde la 1ª compra', () => expect(promedioConsumo(serie, 'historia', '08/2026')).toBe(48 / 8));
  it('historia respeta el rango del periodo', () =>
    expect(promedioConsumo(serie, 'historia', '08/2026', { lo: 2026 * 12 + 3, hi: 2026 * 12 + 8 })).toBe(36 / 6));
  it('12m: meses cerrados previos al actual ÷ 12 (excluye el mes actual)', () =>
    expect(promedioConsumo(serie, '12m', '08/2026')).toBe(18 / 12));
  it('conCompra: solo meses con cantidad', () => expect(promedioConsumo(serie, 'conCompra', '08/2026')).toBe(48 / 3));
  it('serie vacía = 0', () => expect(promedioConsumo([], 'historia', '08/2026')).toBe(0));
});
