import { describe, it, expect } from 'vitest';
import { buildPrecioDispersion } from './precios';
import type { ConsumoRow } from './types';

function mkRow(over: Partial<ConsumoRow>): ConsumoRow {
  return {
    centro: '1001',
    grpCliente: '',
    gpoVdor: '',
    solicitante: 'S1',
    destinatario: 'S1',
    razonSocial: 'Cliente',
    material: 'M1',
    textoMaterial: 'Material Uno',
    consumoActual: 0,
    consumoPromedioMensual: 0,
    um: 'CA',
    tendencia: '',
    ultimoMesFacturacion: '',
    cantidadUltima: 0,
    importeUltima: 0,
    precioMin: 0,
    precioMax: 0,
    precioProm: 0,
    precioUnitarioUltima: 0,
    raw: {},
    ...over,
  };
}

describe('buildPrecioDispersion', () => {
  it('calcula spread entre el cliente que paga menos y el que paga más para el mismo material', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'M1', destinatario: 'D1', razonSocial: 'Cliente Barato', precioUnitarioUltima: 100 }),
      mkRow({ material: 'M1', destinatario: 'D2', razonSocial: 'Cliente Caro', precioUnitarioUltima: 250 }),
      mkRow({ material: 'M1', destinatario: 'D3', razonSocial: 'Cliente Medio', precioUnitarioUltima: 150 }),
    ];
    const out = buildPrecioDispersion(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      material: 'M1',
      nClientes: 3,
      precioMin: 100,
      precioMax: 250,
      spread: 1.5, // (250-100)/100
    });
    expect(out[0].clienteMin.razonSocial).toBe('Cliente Barato');
    expect(out[0].clienteMax.razonSocial).toBe('Cliente Caro');
    expect(out[0].precioPromedio).toBeCloseTo((100 + 250 + 150) / 3, 6);
  });

  it('excluye materiales con un solo cliente (nada con qué comparar)', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'M1', destinatario: 'D1', precioUnitarioUltima: 100 }),
      mkRow({ material: 'M1', destinatario: 'D1', centro: '1003', precioUnitarioUltima: 100 }), // mismo cliente, otro centro
    ];
    expect(buildPrecioDispersion(rows)).toHaveLength(0);
  });

  it('excluye filas sin precio (0 o negativo)', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'M1', destinatario: 'D1', precioUnitarioUltima: 0 }),
      mkRow({ material: 'M1', destinatario: 'D2', precioUnitarioUltima: 100 }),
    ];
    expect(buildPrecioDispersion(rows)).toHaveLength(0);
  });

  it('se queda con el precio más alto reportado cuando un cliente aparece en varios centros', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'M1', destinatario: 'D1', precioUnitarioUltima: 90, centro: '1001' }),
      mkRow({ material: 'M1', destinatario: 'D1', precioUnitarioUltima: 110, centro: '1003' }),
      mkRow({ material: 'M1', destinatario: 'D2', precioUnitarioUltima: 200 }),
    ];
    const out = buildPrecioDispersion(rows);
    expect(out[0].clienteMin.precioUnitario).toBe(110);
  });

  it('excluye pares sin dispersión real (todos pagan lo mismo)', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'M1', destinatario: 'D1', precioUnitarioUltima: 100 }),
      mkRow({ material: 'M1', destinatario: 'D2', precioUnitarioUltima: 100 }),
    ];
    expect(buildPrecioDispersion(rows)).toHaveLength(0);
  });

  it('ordena de mayor a menor spread', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'M-BAJO', destinatario: 'D1', precioUnitarioUltima: 100 }),
      mkRow({ material: 'M-BAJO', destinatario: 'D2', precioUnitarioUltima: 110 }), // 10%
      mkRow({ material: 'M-ALTO', destinatario: 'D3', precioUnitarioUltima: 50 }),
      mkRow({ material: 'M-ALTO', destinatario: 'D4', precioUnitarioUltima: 200 }), // 300%
    ];
    const out = buildPrecioDispersion(rows);
    expect(out.map((e) => e.material)).toEqual(['M-ALTO', 'M-BAJO']);
  });

  it('excluye materiales sin descripción real (códigos administrativos, no productos)', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'PENALTY', textoMaterial: '', destinatario: 'D1', precioUnitarioUltima: 3 }),
      mkRow({ material: 'PENALTY', textoMaterial: '', destinatario: 'D2', precioUnitarioUltima: 177000 }),
      mkRow({ material: 'M1', textoMaterial: 'Producto real', destinatario: 'D1', precioUnitarioUltima: 100 }),
      mkRow({ material: 'M1', textoMaterial: 'Producto real', destinatario: 'D2', precioUnitarioUltima: 200 }),
    ];
    const out = buildPrecioDispersion(rows);
    expect(out.map((e) => e.material)).toEqual(['M1']);
  });

  it('excluye spreads implausibles (> MAX_PLAUSIBLE_SPREAD) como error de captura, no fuga de margen', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'M-ERROR', textoMaterial: 'Material con error de captura', destinatario: 'D1', precioUnitarioUltima: 10 }),
      mkRow({ material: 'M-ERROR', textoMaterial: 'Material con error de captura', destinatario: 'D2', precioUnitarioUltima: 100000 }), // 10,000x
      mkRow({ material: 'M-OK', textoMaterial: 'Material normal', destinatario: 'D1', precioUnitarioUltima: 100 }),
      mkRow({ material: 'M-OK', textoMaterial: 'Material normal', destinatario: 'D2', precioUnitarioUltima: 400 }), // 3x, plausible
    ];
    const out = buildPrecioDispersion(rows);
    expect(out.map((e) => e.material)).toEqual(['M-OK']);
  });

  it('usa el solicitante como fallback cuando falta destinatario', () => {
    const rows: ConsumoRow[] = [
      mkRow({ material: 'M1', solicitante: 'SOL1', destinatario: '', precioUnitarioUltima: 100 }),
      mkRow({ material: 'M1', solicitante: 'SOL2', destinatario: '', precioUnitarioUltima: 200 }),
    ];
    const out = buildPrecioDispersion(rows);
    expect(out).toHaveLength(1);
    expect(out[0].nClientes).toBe(2);
  });
});
