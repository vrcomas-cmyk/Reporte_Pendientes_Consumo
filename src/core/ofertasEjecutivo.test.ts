import { describe, it, expect } from 'vitest';
import { aceptacionesPrevias, agruparPorEjecutivo, almacenDestinoPedido, cambioDeEstatus, lineasOfertaPorPedido, llaveDeLinea, llaveOferta, ofertaDeLinea, pedidosPorMoverA1032, textoAceptacionPrevia } from './ofertasEjecutivo';
import type { Oferta, Sugerencia } from './types';

const sug = (p: Partial<Sugerencia>): Sugerencia => ({
  gpoCte: '', fecha: '01/10/2026', oc: 'OC1', pedido: '1', gpoVdor: '101', solicitante: 'S1', destinatario: 'D1', razonSocial: 'Cliente A', centroPedido: '1001', almacen: '',
  materialSolicitado: 'N', materialBase: 'N', descripcionSolicitada: 'Material N', cantidadPedido: 10, cantidadPendiente: 10, cantidadOfertar: 0, precio: 0, consumoPromedio: 0,
  fuente: '', materialSugerido: 'N', descripcionSugerida: 'Material N', centroSugerido: '', almacenSugerido: '', disponible: 0, lote: '', fechaCaducidad: '', mesesVigenciaLote: 0,
  centroInv: '', mesesInventario: 0, promedioConsumo12M: 0, cantTransito: 0, bloqueado: '', invByCenter: {}, raw: {}, ...p,
}) as Sugerencia;

const lote = (l: string, centro: string, disp: number, fuente = 'Corta caducidad', mat = 'N'): Sugerencia =>
  sug({ materialSugerido: mat, fuente, centroSugerido: centro, almacenSugerido: '1032', disponible: disp, lote: l, fechaCaducidad: '2027-01-31' });

const opts = { centros: [], ejecutivoDe: (g: string) => (g === '101' ? 'Ana' : 'Beto'), zonaDe: (g: string) => `Z${g}` };

describe('lineasOfertaPorPedido', () => {
  const filas = [lote('L1', '1017', 50), lote('L2', '1018', 30), sug({ materialSugerido: 'S', fuente: 'Sustituto', almacenSugerido: '1030+1031+1060', disponible: 20, invByCenter: { '1017': 20 } })];
  const filasDe = () => ({ filas, precioDe: (f: Sugerencia) => (f.lote === 'L1' ? 9.5 : 0) });

  it('una línea por lote, conservando pedido, cliente, material solicitado y ofertado', () => {
    const ls = lineasOfertaPorPedido([sug({})], filasDe, opts);
    expect(ls).toHaveLength(3);
    const l1 = ls.find((l) => l.lote === 'L1')!;
    expect(l1).toMatchObject({ pedido: '1', destinatario: 'D1', razonSocial: 'Cliente A', materialSolicitado: 'N', materialOfertado: 'N', relacion: 'Mismo material', condicion: 'Corta caducidad', centroOrigen: '1017', disponible: 50, precio: 9.5, ejecutivo: 'Ana', zona: 'Z101' });
    expect(ls.find((l) => l.lote === '')!.relacion).toBe('Sustituto');
  });
  it('sin precio autorizado la línea queda en 0 (se muestra «-»)', () => {
    expect(lineasOfertaPorPedido([sug({})], filasDe, opts).find((l) => l.lote === 'L2')!.precio).toBe(0);
  });
  it('respeta los centros elegidos (el del pedido siempre pasa) y recorta la existencia general', () => {
    const ls = lineasOfertaPorPedido([sug({})], filasDe, { ...opts, centros: ['1017'] });
    expect(ls.map((l) => l.lote).sort()).toEqual(['', 'L1']);
    expect(ls.find((l) => l.lote === '')!.disponible).toBe(20);
    const sinSust = lineasOfertaPorPedido([sug({})], filasDe, { ...opts, centros: ['1022'] });
    expect(sinSust).toHaveLength(0);
  });
  it('omite pedidos sin pendiente y bloqueados (salvo que se pida)', () => {
    expect(lineasOfertaPorPedido([sug({ cantidadPendiente: 0 })], filasDe, opts)).toHaveLength(0);
    expect(lineasOfertaPorPedido([sug({ bloqueado: 'Crédito' })], filasDe, opts)).toHaveLength(0);
    expect(lineasOfertaPorPedido([sug({ bloqueado: 'Crédito' })], filasDe, { ...opts, incluirBloqueados: true })).toHaveLength(3);
  });
  it('agrupa por ejecutivo y zona', () => {
    const ls = lineasOfertaPorPedido([sug({ pedido: '1' }), sug({ pedido: '2', gpoVdor: '102', destinatario: 'D2' })], filasDe, opts);
    const g = agruparPorEjecutivo(ls);
    expect(g.map((x) => `${x.ejecutivo}/${x.zona}`).sort()).toEqual(['Ana/Z101', 'Beto/Z102']);
    expect(g[0]!.pedidos).toBe(1);
  });
});

describe('almacenDestinoPedido', () => {
  it('sin almacén inicia en 1030; corta caducidad → 1032; otras condiciones usan el del pedido', () => {
    expect(almacenDestinoPedido('', 'PNC')).toBe('1030');
    expect(almacenDestinoPedido('', 'Corta caducidad')).toBe('1032');
    expect(almacenDestinoPedido('1030', 'PNC/Corta caducidad')).toBe('1032');
    expect(almacenDestinoPedido('1060', 'Sustituto')).toBe('1060');
  });
});

describe('aceptaciones previas', () => {
  const of = (p: Partial<Oferta>): Oferta => ({ id: 1, dest: 'D1', razonSocial: 'A', material: 'N', condicion: 'normal', fechaCaducidad: null, cantidadOfertada: 10, precioOfertado: 5, fechaOferta: '2026-09-01T10:00:00Z', resultado: 'pendiente', comentario: '', creadoPor: 'x', ...p });
  it('detecta lo aceptado antes por el mismo destinatario y material, con el lote aceptado', () => {
    const r = aceptacionesPrevias([of({ estatus: 'aceptado', lote: 'L1', loteAceptado: 'L9', pedido: '77' }), of({ id: 2, estatus: 'rechazado' }), of({ id: 3, dest: 'D2', estatus: 'aceptado' }), of({ id: 4, material: 'Z', estatus: 'aceptado' })], 'D1', 'N');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ lote: 'L9', pedido: '77', parcial: false });
    expect(textoAceptacionPrevia(r[0]!)).toContain('lote L9');
  });
  it('lee ofertas anteriores al módulo por su resultado y marca las parciales; sin lote lo dice', () => {
    const r = aceptacionesPrevias([of({ resultado: 'parcial', cantidadAceptada: 4 })], 'D1', 'N');
    expect(r[0]).toMatchObject({ parcial: true, cantidad: 4, lote: '' });
    expect(textoAceptacionPrevia(r[0]!)).toContain('lote no registrado');
  });
  it('avisa los pedidos de corta caducidad aceptados que siguen sin almacén 1032', () => {
    const aceptada = of({ estatus: 'aceptado', pedido: '77', condicionTexto: 'Corta caducidad' });
    expect(pedidosPorMoverA1032([aceptada], [{ pedido: '77', almacen: '1030' }])).toHaveLength(1);
    expect(pedidosPorMoverA1032([aceptada], [{ pedido: '77', almacen: '1032' }])).toHaveLength(0);
    expect(pedidosPorMoverA1032([of({ estatus: 'aceptado', pedido: '77', condicionTexto: 'PNC' })], [{ pedido: '77', almacen: '1030' }])).toHaveLength(0);
  });
});

describe('registro y estatus de ofertas', () => {
  const linea = lineasOfertaPorPedido([sug({})], () => ({ filas: [lote('L1', '1017', 50)], precioDe: () => 9.5 }), opts)[0]!;
  it('la oferta conserva pedido, cliente, material solicitado y ofertado, lote, condición, ejecutivo y zona, con estatus Ofertado', () => {
    const o = ofertaDeLinea(linea, 'ana@x.com', '2026-10-20T10:00:00Z');
    expect(o).toMatchObject({ estatus: 'ofertado', resultado: 'pendiente', pedido: '1', dest: 'D1', materialSolicitado: 'N', material: 'N', lote: 'L1', condicion: 'corta-caducidad', condicionTexto: 'Corta caducidad', ejecutivo: 'Ana', zona: 'Z101', centroOrigen: '1017', precioOfertado: 9.5 });
    expect(o.historial).toHaveLength(1);
  });
  it('la llave de la línea coincide con la de la oferta registrada (no se duplica)', () => {
    const o = ofertaDeLinea(linea, 'x', 'y');
    expect(llaveOferta({ pedido: o.pedido!, dest: o.dest, material: o.material, centroOrigen: o.centroOrigen!, lote: o.lote!, condicionTexto: o.condicionTexto! })).toBe(llaveDeLinea(linea));
  });
  it('aceptar guarda cantidad y lote aceptados, sincroniza resultado y agrega historial; rechazar no toca el lote', () => {
    const o = ofertaDeLinea(linea, 'x', '2026-10-20T10:00:00Z');
    const acepta = cambioDeEstatus(o, 'aceptado-parcial', 'jefe', '2026-10-21T10:00:00Z', { cantidad: 20, lote: 'L9' });
    expect(acepta).toMatchObject({ estatus: 'aceptado-parcial', resultado: 'parcial', cantidadAceptada: 20, loteAceptado: 'L9', fechaRespuesta: '2026-10-21T10:00:00Z' });
    expect(acepta.historial).toHaveLength(2);
    const rechaza = cambioDeEstatus({ ...o, ...acepta }, 'rechazado', 'jefe', '2026-10-22T10:00:00Z');
    expect(rechaza).toMatchObject({ estatus: 'rechazado', resultado: 'rechazada' });
    expect(rechaza.historial).toHaveLength(3);
  });
});
