import { describe, it, expect } from 'vitest';
import { buildAbc, summarizeAbc, ABC_THRESHOLDS } from './abc';
import { buildRF } from './resumenFac';
import type { ResumenFacRow } from './types';

/** mm/aaaa n meses antes del mes actual (n=1 == el mes de referencia que usa
 * toda la app, `mesAnterior(hoyMes())` en resumenFac.ts). */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function mkRow(over: Partial<ResumenFacRow>): ResumenFacRow {
  return {
    solicitante: 'S1',
    razonSocial: 'Cliente Uno',
    destinatario: 'S1',
    material: 'M1',
    textoMaterial: 'Material Uno',
    mesAno: monthsAgo(1),
    cantidadFacturada: 1,
    importeFacturado: 100,
    gpoCte: '',
    gpoVdor: '',
    centro: '1001',
    ...over,
  };
}

describe('buildAbc', () => {
  it('clasifica A/B/C por importe de los últimos 12 meses, con el ítem que cruza el corte incluido en la clase que completa', () => {
    // 3 materiales, importe en el mes de referencia (dentro de la ventana de 12m):
    // M-A: 8000 (83.3% del total) -> por sí solo ya cruza el 80%, debe ser A
    // M-B: 1500 (15.6%) -> cumulativo llega a 98.9%, cruza 95% -> B
    // M-C: 100 (1.0%)   -> cumulativo 100% -> C
    const rows: ResumenFacRow[] = [
      mkRow({ solicitante: 'C1', razonSocial: 'Cliente Grande', material: 'M-A', textoMaterial: 'Material A', importeFacturado: 8000, cantidadFacturada: 80 }),
      mkRow({ solicitante: 'C2', razonSocial: 'Cliente Mediano', material: 'M-B', textoMaterial: 'Material B', importeFacturado: 1500, cantidadFacturada: 15 }),
      mkRow({ solicitante: 'C3', razonSocial: 'Cliente Chico', material: 'M-C', textoMaterial: 'Material C', importeFacturado: 100, cantidadFacturada: 1 }),
    ];
    const rf = buildRF(rows);
    const abc = buildAbc(rf);

    expect(abc.totalImporteMateriales).toBe(9600);
    expect(abc.materiales.map((e) => [e.key, e.clase])).toEqual([
      ['M-A', 'A'],
      ['M-B', 'B'],
      ['M-C', 'C'],
    ]);
    expect(abc.classByMaterial.get('M-A')).toBe('A');
    expect(abc.materiales[0].share).toBeCloseTo(8000 / 9600, 6);
    expect(abc.materiales[0].cumShare).toBeCloseTo(8000 / 9600, 6);
    expect(abc.materiales[1].cumShare).toBeCloseTo(9500 / 9600, 6);

    // Clientes (eje solicitante, no destinatario): mismo patrón, un cliente
    // por material en este fixture.
    expect(abc.clientes.map((e) => [e.key, e.clase])).toEqual([
      ['C1', 'A'],
      ['C2', 'B'],
      ['C3', 'C'],
    ]);
  });

  it('suma varios meses dentro de la ventana de 12 y excluye meses fuera de ella', () => {
    const rows: ResumenFacRow[] = [
      mkRow({ material: 'M1', mesAno: monthsAgo(1), importeFacturado: 500 }),
      mkRow({ material: 'M1', mesAno: monthsAgo(6), importeFacturado: 500 }),
      // Fuera de la ventana de 12 meses (13 meses atrás) — no debe sumar.
      mkRow({ material: 'M1', mesAno: monthsAgo(13), importeFacturado: 9999 }),
    ];
    const rf = buildRF(rows);
    const abc = buildAbc(rf);
    expect(abc.materiales).toHaveLength(1);
    expect(abc.materiales[0].importe12m).toBe(1000);
  });

  it('ignora materiales/clientes con importe 12m en cero o negativo', () => {
    const rows: ResumenFacRow[] = [
      mkRow({ material: 'M1', importeFacturado: 100 }),
      mkRow({ material: 'M2', importeFacturado: 0 }),
    ];
    const rf = buildRF(rows);
    const abc = buildAbc(rf);
    expect(abc.materiales.map((e) => e.key)).toEqual(['M1']);
  });

  it('devuelve vacío sin RFIndex (sin Resumen_Fac cargado)', () => {
    const abc = buildAbc(null);
    expect(abc).toEqual({
      materiales: [],
      clientes: [],
      totalImporteMateriales: 0,
      totalImporteClientes: 0,
      classByMaterial: new Map(),
      classByCliente: new Map(),
    });
  });

  it('los umbrales A/B siguen siendo 80%/95%', () => {
    expect(ABC_THRESHOLDS).toEqual({ a: 0.8, b: 0.95 });
  });
});

describe('summarizeAbc', () => {
  it('agrega conteo, importe y % del total por clase', () => {
    const rows: ResumenFacRow[] = [
      mkRow({ material: 'M-A', importeFacturado: 8000 }),
      mkRow({ material: 'M-B', importeFacturado: 1500 }),
      mkRow({ material: 'M-C', importeFacturado: 100 }),
    ];
    const abc = buildAbc(buildRF(rows));
    const summary = summarizeAbc(abc.materiales);
    expect(summary).toEqual([
      { clase: 'A', count: 1, importe: 8000, shareOfTotal: 8000 / 9600 },
      { clase: 'B', count: 1, importe: 1500, shareOfTotal: 1500 / 9600 },
      { clase: 'C', count: 1, importe: 100, shareOfTotal: 100 / 9600 },
    ]);
  });
});
