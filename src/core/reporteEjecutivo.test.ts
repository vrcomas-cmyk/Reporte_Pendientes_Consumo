import { describe, expect, it } from 'vitest';
import { condicionElegida, condicionesElegibles, hojaEnvios, hojaCondiciones, hojaInventario, hojaOportunidades, hojaPedidos, nombreArchivoReporteEjecutivo, p50Mensual, pasaCondicion, dentroDeCaducidadMax } from './reporteEjecutivo';
import { CENTERS, type ConsumoRow, type InvConsolidadoRow, type Sugerencia } from './types';

const sug = (o: Partial<Sugerencia>): Sugerencia => ({ pedido: 'P1', materialSolicitado: 'M1', materialBase: 'M1', destinatario: 'D1', centroPedido: '1001', cantidadPendiente: 10, precio: 5, bloqueado: '', invByCenter: {}, ...o }) as Sugerencia;
const cons = (o: Partial<ConsumoRow>): ConsumoRow => ({ destinatario: 'D1', razonSocial: 'Cliente', material: 'M1', textoMaterial: 'Mat', consumoPromedioMensual: 4.4, consumoActual: 0, precioUnitarioUltima: 7, precioProm: 6, centro: '', ...o }) as ConsumoRow;
const lote = (o: Partial<Sugerencia>): Sugerencia => sug({ materialSugerido: 'M1', descripcionSugerida: 'Mat', fuente: 'Corta caducidad', lote: 'L1', disponible: 6, centroSugerido: '1003', ...o });
const ctx = (p50 = 0, extra: object = {}, filas: Sugerencia[] = [lote({})]) => ({
  ofertableDe: () => ({ filas, precioDe: () => 9 }),
  p50De: () => p50, etiqueta: (c: string) => `${c} (N)`, centros: CENTERS, invPorCentro: () => ({ '1003': 3 }), ...extra,
});

describe('reporteEjecutivo', () => {
  it('Pedidos: trae TODOS los renglones de Seg pedidos (surtidos incluidos), con pendiente primero', () => {
    const { rows } = hojaPedidos([sug({ pedido: 'P0', cantidadPendiente: 0 }), sug({})]);
    expect(rows.map((r) => [r['Pedido'], r['Estatus']])).toEqual([['P1', 'Pendiente'], ['P0', 'Surtido']]);
    expect(rows[0]!['$ Pendiente']).toBe(50);
    expect(rows[0]!['Va material en curso']).toBe('No');
  });

  it('Centros a informar: solo aparece la columna del centro elegido', () => {
    const { rows } = hojaPedidos([sug({})], null, (c) => `${c} (N)`, ['1001']);
    expect(Object.keys(rows[0]!).filter((k) => k.startsWith('Inv 1'))).toEqual(['Inv 1001 (N)']);
    const rss = { mats: new Map([['M1', { material: 'M1', desc: 'd', sumaPend: 0, centros: new Map() }]]) } as never;
    const inv = hojaInventario(rss, null, new Map(), (c) => c, ['1001']);
    expect(inv.rows).toHaveLength(0); // sin existencia ni pendiente no sale
  });

  it('Oportunidades: omite bloqueados, trae inventario por centro con nombre y datos enteros', () => {
    const { rows } = hojaOportunidades([sug({}), sug({ pedido: 'P2', bloqueado: 'Crédito' })], [], ctx());
    expect(rows).toHaveLength(1);
    expect(rows[0]!['Cantidad sugerida']).toBe(6);
    expect(rows[0]!['Inv 1003 (N)']).toBe(3);
  });

  it('Pedido abierto: llena Prom/P50/Consumo/Referencia con enteros y muestra el precio del pedido', () => {
    const { rows } = hojaOportunidades([sug({})], [cons({ consumoActual: 2.6 })], ctx(8.4));
    expect(rows).toHaveLength(1); // el cliente-material con pedido no se repite como «Consumo»
    expect(rows[0]).toMatchObject({ 'Prom. mensual': 4, 'P50 mensual': 8, 'Consumo mes actual': 3, 'Referencia': 8, 'Precio pedido / último precio': 5, 'Origen del precio': 'Pedido' });
  });

  it('Varios pedidos del mismo cliente y material: una fila por pedido', () => {
    const { rows } = hojaOportunidades([sug({ pedido: 'P1' }), sug({ pedido: 'P2', cantidadPendiente: 3 })], [], ctx());
    expect(rows.map((r) => [r['Pedido abierto'], r['Cantidad sugerida']])).toEqual([['P1', 6], ['P2', 3]]);
  });

  it('Consumo sin pedido: referencia = P50, resta el consumo del mes y usa el último precio', () => {
    const { rows } = hojaOportunidades([], [cons({ consumoActual: 3 })], ctx(8));
    expect(rows[0]).toMatchObject({ 'Origen': 'Consumo', 'Referencia': 8, 'Necesidad estimada': 5, 'Cantidad sugerida': 5, 'Precio pedido / último precio': 7, 'Origen del precio': 'Última factura' });
  });

  it('Consumo: si ya cubrió la referencia sugiere 0 y lo anota', () => {
    const { rows } = hojaOportunidades([], [cons({ consumoActual: 9 })], ctx(8));
    expect(rows[0]!['Cantidad sugerida']).toBe(0);
    expect(String(rows[0]!['Nota'])).toContain('Ya cubrió');
  });

  it('Centros a considerar para ofertar: lotes de esos centros + el del pedido', () => {
    const filas = [lote({ centroSugerido: '1003', lote: 'A' }), lote({ centroSugerido: '1018', lote: 'B' }), lote({ centroSugerido: '1001', lote: 'C' })];
    const { rows } = hojaOportunidades([sug({ centroPedido: '1001' })], [], ctx(0, { centrosOferta: ['1018'] }, filas));
    expect(rows.map((r) => r['Lote'])).toEqual(['B', 'C']);
  });

  it('Condiciones elegidas: se manda con una sola parte elegida y se muestran solo las elegidas', () => {
    expect(condicionElegida('Revision Liz/LENTO MOV', ['lento mov'])).toBe('LENTO MOV');
    expect(condicionElegida('Revision Liz/LENTO MOV', ['Revision Liz', 'Lento mov'])).toBe('Revision Liz/LENTO MOV');
    expect(condicionElegida('Revision Liz/LENTO MOV', ['PNC'])).toBeNull();
    expect(condicionElegida('x', [])).toBe('x');
    expect(pasaCondicion('Sustituto/Corta caducidad', ['Corta caducidad'])).toBe(true);
    expect(pasaCondicion('Sustituto/Corta caducidad', ['PNC'])).toBe(false);
    const filas = [lote({ fuente: 'PNC', lote: 'P' }), lote({ fuente: 'Liz/Lento mov', lote: 'C' })];
    const r = hojaOportunidades([sug({})], [], ctx(0, { condiciones: ['Lento mov'] }, filas)).rows;
    expect(r.map((x) => [x['Lote'], x['Condición']])).toEqual([['C', 'Lento mov']]);
    expect(condicionesElegibles([{ condicion: 'Liz/Lento mov' } as InvConsolidadoRow])).toEqual(expect.arrayContaining(['Liz', 'Lento mov', 'PNC']));
  });

  it('p50Mensual: mediana de los meses con compra de los 12 cerrados', () => {
    const serie = [3, 1, 2, 10].map((cant, i) => ({ mes: `0${i + 1}/2026`, cant, imp: 0 }));
    expect(p50Mensual(serie, '09/2026')).toBe(2.5);
    expect(p50Mensual([], '09/2026')).toBe(0);
  });

  it('Condiciones: cantidad en la columna de su centro; el sustituto trae su material e inventario por centro', () => {
    const inv = [{ material: 'M1', textoBreve: 'Mat' }] as InvConsolidadoRow[];
    const filas = () => [
      { condicion: 'PNC', centro: '1003', almacen: '1030', lote: 'L9', caducidad: '2027-01-01', cantidad: 7, detalle: 'EMPAQUE DAÑADO' },
      { condicion: 'Sustituto', centro: '', almacen: '', lote: '', caducidad: '', cantidad: 99, detalle: '', relacionado: { material: 'M2', texto: 'Sust' } },
    ];
    const { rows } = hojaCondiciones(inv, filas, { etiqueta: (c) => `${c} (N)`, invPorCentro: () => ({ '1001': 5, '1003': 2 }) });
    expect(rows.find((r) => r['Condición'] === 'PNC')).toMatchObject({ '1003 (N)': 7, '1001 (N)': 0, Total: 7 });
    expect(rows.find((r) => r['Condición'] === 'Sustituto')).toMatchObject({ 'Material sustituto': 'M2', '1001 (N)': 5, '1003 (N)': 2, Total: 7 });
    expect(hojaCondiciones(inv, filas, { condiciones: ['PNC'] }).rows).toHaveLength(1);
    expect(hojaCondiciones(inv, () => [{ condicion: 'Liz/Lento mov', centro: '1001', almacen: '1030', lote: '', caducidad: '', cantidad: 4, detalle: '' }], { condiciones: ['Lento mov'] }).rows[0]!['Condición']).toBe('Lento mov');
    expect(hojaCondiciones(inv, filas, { centros: ['1001'] }).rows.map((r) => r['Condición'])).toEqual(['Sustituto']);
  });

  it('nombre de archivo sin caracteres raros', () => {
    expect(nombreArchivoReporteEjecutivo('Ana López', 'Z/01', '2026')).toBe('Reporte_Z_01_Ana_López_2026.xlsx');
  });

  it('Envíos: una fila por ejecutivo/zona con sus correos, sin correo marcado y correo compartido avisado', () => {
    const { rows } = hojaEnvios([
      { zona: '2', ejecutivo: 'Heber', correos: ['h@x.com'], archivo: 'a.xlsx' },
      { zona: '3', ejecutivo: 'Heber 2', correos: ['H@x.com'], archivo: 'b.xlsx' },
      { zona: '5', ejecutivo: 'Ana', correos: [], archivo: 'c.xlsx' },
    ], '01/01/2026');
    expect(rows.map((r) => r['Estatus'])).toEqual(['Listo para enviar', 'Listo para enviar', 'Sin correo en el catálogo']);
    expect(rows[0]!['Nota']).toContain('3');
    expect(String(rows[0]!['Asunto'])).toContain('Heber');
  });

  it('Caducidad máxima por condición: descarta lotes que vencen después del tope; sin fecha o sin límite se mantienen', () => {
    const hoy = new Date(2026, 9, 28);
    const max = { 'Corta caducidad': 12 };
    expect(dentroDeCaducidadMax('Corta caducidad', '2027-06-01', max, hoy)).toBe(true);
    expect(dentroDeCaducidadMax('Corta caducidad', '2027-10-28', max, hoy)).toBe(false);
    expect(dentroDeCaducidadMax('Corta caducidad', '', max, hoy)).toBe(true);
    expect(dentroDeCaducidadMax('PNC', '2030-01-01', max, hoy)).toBe(true);
    expect(dentroDeCaducidadMax('Corta caducidad/PNC', '2030-01-01', max, hoy)).toBe(true); // PNC sin tope lo admite
    expect(dentroDeCaducidadMax('Corta caducidad', '2030-01-01', undefined, hoy)).toBe(true);
  });

  it('Caducidad máxima: filtra Materiales con condición y Oportunidades', () => {
    const hoy = new Date(2026, 9, 28);
    const cercano = lote({ lote: 'L1', fechaCaducidad: '2027-03-01' });
    const lejano = lote({ lote: 'L2', fechaCaducidad: '2029-03-01' });
    const op = hojaOportunidades([sug({})], [], ctx(0, { caducidadMaxMeses: { 'Corta caducidad': 12 }, hoy }, [cercano, lejano]));
    expect(op.rows.map((r) => r['Lote'])).toEqual(['L1']);
  });
});
