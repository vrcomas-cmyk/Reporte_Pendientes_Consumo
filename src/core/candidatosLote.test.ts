import { describe, it, expect } from 'vitest';
import type { ConsumoRow } from './types';
import type { BOItem } from './buildBO';
import { reglaOferta, candidatosConSustitutos, candidatosDeMaterial, cantidadSugerida, loteAplicaACandidato, materialesDeCliente, type CtxCandidatos } from './candidatosLote';

const cons = (o: Partial<ConsumoRow>): ConsumoRow => ({
  centro: '1001', grpCliente: '', gpoVdor: 'V1', solicitante: '', destinatario: 'D1', razonSocial: 'Cliente 1', material: 'M1', textoMaterial: '',
  consumoActual: 0, consumoPromedioMensual: 0, um: '', tendencia: '', ultimoMesFacturacion: '01/2026', cantidadUltima: 10, importeUltima: 100,
  precioMin: 9, precioMax: 12, precioProm: 10, precioUnitarioUltima: 11, raw: {}, ...o,
});
const boItem = (destinatario: string, material: string, pend: number, centro = '1001'): BOItem =>
  ({ bo: { destinatario, materialBase: material, cantidadPendiente: pend, centroPedido: centro, pedido: 'P1', razonSocial: 'Cli BO' } } as unknown as BOItem);
const ctx = (consumo: ConsumoRow[], bo: BOItem[] = []): CtxCandidatos => ({ consumo, bo, rf: null, ejecutivoDe: (f) => (f ? `Ejec ${f.gpoVdor}` : '') });

describe('candidatosDeMaterial', () => {
  it('agrupa por destinatario y toma la compra más reciente como última/penúltima', () => {
    const rows = [
      cons({ centro: '1001', ultimoMesFacturacion: '02/2026', cantidadUltima: 5, penultimoMes: '01/2026', cantidadPenultima: 8, precioUnitarioUltima: 12 }),
      cons({ centro: '1003', ultimoMesFacturacion: '12/2025', cantidadUltima: 99 }),
    ];
    const [c] = candidatosDeMaterial('M1', ctx(rows));
    expect(c.centros.sort()).toEqual(['1001', '1003']);
    expect(c.ultimoMes).toBe('02/2026');
    expect(c.cantPenultima).toBe(8);
    expect(c.precioUltimo).toBe(12);
    expect(c.ejecutivo).toBe('Ejec V1');
  });

  it('sin serie de facturación el P50 de precio cae al precio promedio', () => {
    const [c] = candidatosDeMaterial('M1', ctx([cons({ precioProm: 10.5 })]));
    expect(c.precioP50).toBe(10.5);
    expect(c.precioMin).toBe(9);
    expect(c.precioMax).toBe(12);
  });

  it('pone primero a quienes tienen pendiente e incluye clientes que solo tienen pedido', () => {
    const rows = [cons({ destinatario: 'D1', ultimoMesFacturacion: '03/2026' }), cons({ destinatario: 'D2', razonSocial: 'Cliente 2', ultimoMesFacturacion: '01/2026' })];
    const bo = [boItem('D2', 'M1', 7), boItem('D3', 'M1', 4, '1017'), boItem('D1', 'OTRO', 9)];
    const lista = candidatosDeMaterial('M1', ctx(rows, bo));
    expect(lista.map((c) => c.destinatario)).toEqual(['D2', 'D3', 'D1']);
    expect(lista[1].centros).toEqual(['1017']);
    expect(lista[0].pendiente).toBe(7);
  });

  it('ignora otros materiales', () => {
    expect(candidatosDeMaterial('M1', ctx([cons({ material: 'M2' })]))).toEqual([]);
  });
});

describe('cantidadSugerida', () => {
  it('usa el pendiente, luego la mediana y se topa al disponible', () => {
    expect(cantidadSugerida({ pendiente: 50, p50Cant: 10, cantUltima: 5 }, 30)).toBe(30);
    expect(cantidadSugerida({ pendiente: 0, p50Cant: 10.4, cantUltima: 5 }, 30)).toBe(10);
    expect(cantidadSugerida({ pendiente: 0, p50Cant: 0, cantUltima: 5 }, 30)).toBe(5);
  });
});

describe('loteAplicaACandidato', () => {
  const pasa = (elegidos: string[]) => (lote: string, cli: string) => !elegidos.length || lote === cli || elegidos.includes(lote);
  it('sin centros elegidos todo aplica', () => expect(loteAplicaACandidato('1001', ['1017'], pasa([]))).toBe(true));
  it('un lote de otro centro no aplica si no está elegido ni es el del cliente', () => {
    expect(loteAplicaACandidato('1001', ['1017'], pasa(['1018']))).toBe(false);
    expect(loteAplicaACandidato('1001', ['1001'], pasa(['1018']))).toBe(true);
    expect(loteAplicaACandidato('1018', ['1017'], pasa(['1018']))).toBe(true);
  });
  it('cliente sin centros conocidos siempre aplica', () => expect(loteAplicaACandidato('1001', [], pasa(['1018']))).toBe(true));
});

describe('materialesDeCliente', () => {
  it('une materiales de consumo y de pedidos pendientes', () => {
    const r = materialesDeCliente('D1', [cons({ material: 'M1' }), cons({ material: 'M2', destinatario: 'D9' })], [boItem('D1', 'M3', 2), boItem('D1', 'M4', 0)]);
    expect(r.sort()).toEqual(['M1', 'M3']);
  });
});

describe('candidatosConSustitutos', () => {
  const sust = [{ material: 'S1', texto: 'Sustituto uno' }];
  it('incluye a quien solo compra el sustituto, identificado con via', () => {
    const rows = [cons({ material: 'S1', destinatario: 'D5', razonSocial: 'Cliente 5' })];
    const [c] = candidatosConSustitutos('M1', sust, ctx(rows));
    expect(c.destinatario).toBe('D5');
    expect(c.via).toEqual({ material: 'S1', texto: 'Sustituto uno' });
  });
  it('no duplica a quien ya compra el código propio', () => {
    const rows = [cons({ destinatario: 'D1' }), cons({ material: 'S1', destinatario: 'D1' })];
    const lista = candidatosConSustitutos('M1', sust, ctx(rows));
    expect(lista).toHaveLength(1);
    expect(lista[0].via).toBeUndefined();
  });
  it('con pendiente, los directos van antes que los de sustituto', () => {
    const rows = [cons({ material: 'S1', destinatario: 'D5', ultimoMesFacturacion: '06/2026' }), cons({ destinatario: 'D1' })];
    const bo = [boItem('D5', 'S1', 3), boItem('D1', 'M1', 3)];
    expect(candidatosConSustitutos('M1', sust, ctx(rows, bo)).map((c) => c.destinatario)).toEqual(['D1', 'D5']);
  });
  it('sin sustitutos equivale a candidatosDeMaterial', () => {
    const rows = [cons({})];
    expect(candidatosConSustitutos('M1', [], ctx(rows))).toEqual(candidatosDeMaterial('M1', ctx(rows)));
  });
});

describe('reglaOferta', () => {
  const modos = { '1004': 'local' } as const;
  it('lote local: solo a clientes de su centro', () => {
    expect(reglaOferta('1004', ['1004', '1017'], modos, false)).toBe('mismo');
    expect(reglaOferta('1004', ['1017'], modos, false)).toBe('no');
  });
  it('lote local a otro centro solo como excepción', () => {
    expect(reglaOferta('1004', ['1017'], modos, true)).toBe('excepcion');
  });
  it('lote compartido (1018) va a cualquier centro', () => {
    expect(reglaOferta('1018', ['1017'], modos, false)).toBe('compartido');
  });
  it('cliente sin centros conocidos no se descarta', () => {
    expect(reglaOferta('1004', [], modos, false)).toBe('compartido');
  });
  it('un centro marcado local en pantalla se restringe', () => {
    expect(reglaOferta('1018', ['1017'], { '1018': 'local' }, false)).toBe('no');
  });
});
