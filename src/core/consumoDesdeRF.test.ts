import { describe, it, expect } from 'vitest';
import { centroDeFacturacion, consumoDesdeResumenFac, promedioConsumo } from './consumoDesdeRF';
import type { ResumenFacRow } from './types';

const rf = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'Uno', destinatario: 'D1', material: 'M1', textoMaterial: 'Mat', mesAno: '08/2026',
  cantidadFacturada: 10, importeFacturado: 100, gpoCte: 'GC', gpoVdor: 'GV', centro: '1001', ...over,
});

describe('ejecutivo por destinatario (el de su última facturación)', () => {
  it('un destinatario que cambió de ejecutivo queda con el último en TODAS sus filas', () => {
    const out = consumoDesdeResumenFac([
      rf({ destinatario: 'DA', material: 'M1', gpoVdor: 'X', mesAno: '03/2025' }),
      rf({ destinatario: 'DA', material: 'M2', gpoVdor: 'X', mesAno: '05/2025' }),
      rf({ destinatario: 'DA', material: 'M1', gpoVdor: 'Y', mesAno: '07/2026' }),
      rf({ destinatario: 'DB', material: 'M1', gpoVdor: 'Z', mesAno: '07/2026' }),
    ]);
    const deA = out.filter((r) => r.destinatario === 'DA');
    expect(deA).toHaveLength(2);
    expect(deA.every((r) => r.gpoVdor === 'Y')).toBe(true);
    expect(out.find((r) => r.destinatario === 'DB')?.gpoVdor).toBe('Z');
  });
  it('si en el último mes lo facturaron dos ejecutivos gana el de mayor importe; los meses en 0 no cuentan', () => {
    const out = consumoDesdeResumenFac([
      rf({ destinatario: 'DA', gpoVdor: 'X', mesAno: '07/2026', importeFacturado: 100 }),
      rf({ destinatario: 'DA', material: 'M2', gpoVdor: 'Y', mesAno: '07/2026', importeFacturado: 900 }),
      rf({ destinatario: 'DA', material: 'M3', gpoVdor: 'W', mesAno: '08/2026', cantidadFacturada: 0, importeFacturado: 0 }),
    ]);
    expect(out.every((r) => r.gpoVdor === 'Y')).toBe(true);
  });
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

describe('consumoDesdeResumenFac sin agrupar por centro (módulo Facturación)', () => {
  const rows = [
    rf({ centro: '1001', mesAno: '06/2026', cantidadFacturada: 10, importeFacturado: 100 }),
    rf({ centro: '1002', mesAno: '07/2026', cantidadFacturada: 20, importeFacturado: 300 }),
    rf({ centro: '1001', mesAno: '08/2026', cantidadFacturada: 30, importeFacturado: 600 }),
    rf({ centro: '1002', mesAno: '08/2026', cantidadFacturada: 5, importeFacturado: 50 }),
    rf({ solicitante: 'S2', centro: '1003', mesAno: '08/2026', cantidadFacturada: 7, importeFacturado: 70 }),
  ];
  const out = consumoDesdeResumenFac(rows, undefined, { agruparPorCentro: false });
  const s1 = out.find((r) => r.solicitante === 'S1')!;

  it('una fila por Solicitante+Destinatario+Material con todos los centros juntos', () => {
    expect(out).toHaveLength(2);
    expect(s1.consumoActual).toBe(35); // 30 + 5 del mes actual (08/2026)
  });
  it('última y penúltima son del conjunto (último mes facturado), no de un centro suelto', () => {
    expect(s1.ultimoMesFacturacion).toBe('08/2026');
    expect(s1.cantidadUltima).toBe(35);
    expect(s1.importeUltima).toBe(650);
    expect(s1.penultimoMes).toBe('07/2026');
    expect(s1.cantidadPenultima).toBe(20);
    expect(s1.importePenultima).toBe(300);
  });
  it('centro: el más frecuente de los últimos 12 meses (empate → el más reciente)', () => {
    expect(s1.centro).toBe('1001'); // 06→1001, 07→1002, 08→1001
    const solo = consumoDesdeResumenFac([rf({ centro: '1001', mesAno: '06/2026' }), rf({ centro: '1002', mesAno: '07/2026' })], undefined, { agruparPorCentro: false });
    expect(solo[0]?.centro).toBe('1002');
  });
  it('por defecto (reporte) sigue una fila por centro', () => {
    expect(consumoDesdeResumenFac(rows)).toHaveLength(3); // centros 1001, 1002 (S1) y 1003 (S2)
  });
});

describe('centroDeFacturacion (regla de 3 facturas seguidas)', () => {
  // Un mes por factura: la secuencia de centros va del mes 01 en adelante (curK = último mes).
  const centroDe = (secuencia: string[]): string => {
    const m = new Map<string, Map<string, number>>();
    secuencia.forEach((c, i) => m.set(String(i + 1).padStart(2, '0') + '/2026', new Map([[c, 100]])));
    return centroDeFacturacion(m, 2026 * 12 + secuencia.length);
  };
  it('una factura suelta en otro centro no cambia el centro', () => {
    expect(centroDe(['1', '1', '1', '1', '1', '1', '1', '1', '1', '2'])).toBe('1');
  });
  it('3 seguidas en otro centro lo convierten en el centro', () => {
    expect(centroDe(['1', '1', '1', '1', '1', '1', '1', '2', '2', '2'])).toBe('2');
  });
  it('una vez cambiado, se queda aunque vuelva una factura al centro anterior y luego otra al nuevo', () => {
    expect(centroDe(['1', '1', '1', '1', '1', '2', '2', '2', '1', '2'])).toBe('2');
  });
  it('1, 2, 2, 1 y luego 3 seguidas en el 2 → centro 2 (cuentan las 3 seguidas)', () => {
    expect(centroDe(['1', '1', '1', '1', '2', '2', '1', '2', '2', '2'])).toBe('2');
  });
  it('si el centro anterior vuelve a juntar 3 seguidas, regresa a él', () => {
    expect(centroDe(['2', '2', '2', '1', '1', '1', '1', '1', '1', '2'])).toBe('1');
  });
  it('solo cuentan los últimos 12 meses; sin meses en la ventana usa el último centro facturado', () => {
    const m = new Map<string, Map<string, number>>([['01/2024', new Map([['7', 50]])], ['02/2024', new Map([['8', 80]])]]);
    expect(centroDeFacturacion(m, 2026 * 12 + 6)).toBe('8');
  });
  it('en un mes con varios centros gana el de mayor importe', () => {
    const m = new Map<string, Map<string, number>>([['09/2026', new Map([['1', 20], ['2', 500]])]]);
    expect(centroDeFacturacion(m, 2026 * 12 + 9)).toBe('2');
  });
});

describe('orden por cliente en Facturación', () => {
  it('sale ordenado por Solicitante → Destinatario → Material (códigos en orden numérico), no por aparición', () => {
    const filas = [
      rf({ solicitante: '10', destinatario: '5', material: 'M2' }),
      rf({ solicitante: '2', destinatario: '9', material: 'M1' }),
      rf({ solicitante: '2', destinatario: '9', material: 'M10' }),
      rf({ solicitante: '2', destinatario: '10', material: 'M1' }),
      rf({ solicitante: '2', destinatario: '9', material: 'M2' }),
    ];
    const out = consumoDesdeResumenFac(filas, undefined, { agruparPorCentro: false });
    expect(out.map((r) => `${r.solicitante}/${r.destinatario}/${r.material}`)).toEqual(['2/9/M1', '2/9/M2', '2/9/M10', '2/10/M1', '10/5/M2']);
  });
});

describe('promedioConsumo con meses saltados', () => {
  const serie = [
    { mes: '01/2026', cant: 10, imp: 0 }, { mes: '02/2026', cant: 20, imp: 0 }, { mes: '03/2026', cant: 30, imp: 0 }, { mes: '04/2026', cant: 0, imp: 0 }, { mes: '05/2026', cant: 50, imp: 0 },
  ];
  it('solo cuentan los meses elegidos y se divide entre cuántos son', () => {
    const meses = new Set([2026 * 12 + 1, 2026 * 12 + 3, 2026 * 12 + 4]); // ene, mar, abr (feb y may saltados)
    expect(promedioConsumo(serie, 'historia', '05/2026', { lo: 2026 * 12 + 1, hi: 2026 * 12 + 4, meses })).toBeCloseTo((10 + 30 + 0) / 3);
    expect(promedioConsumo(serie, 'conCompra', '05/2026', { lo: 2026 * 12 + 1, hi: 2026 * 12 + 4, meses })).toBeCloseTo((10 + 30) / 2);
  });
  it('sin selección de meses se comporta igual que antes', () => {
    expect(promedioConsumo(serie, 'historia', '05/2026', { lo: 2026 * 12 + 1, hi: 2026 * 12 + 3 })).toBeCloseTo(20);
  });
});
