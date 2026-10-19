import { describe, it, expect } from 'vitest';
import { armarMensajePedido, armarMensajesEjecutivo, SIN_EJECUTIVO, type FilaMensaje, type LoteMensaje } from './mensajeEjecutivo';

const sug = (ejecutivo: string, cliente: string, pedido: string, cantidad = 10): FilaMensaje => ({ tipo: 'sug', ejecutivo, cliente, pedido, cantidad });
const cons = (ejecutivo: string, cliente: string, cantidad = 5): FilaMensaje => ({ tipo: 'cons', ejecutivo, cliente, cantidad });
const lote = (o: Partial<LoteMensaje> = {}): LoteMensaje => ({ material: '100952', descripcion: 'CINTA', lote: 'A1', caducidad: '01/12/2027', disponible: 40, precio: 85, fuente: 'Sustituto', ...o });
const base = { material: '100950', descripcion: 'CINTA UMBILICAL', centro: '1018' };

describe('armarMensajesEjecutivo', () => {
  it('sin filas no hay mensajes', () => {
    expect(armarMensajesEjecutivo({ ...base, filas: [], lotes: [lote()] })).toEqual([]);
  });

  it('un mensaje por ejecutivo, saludando por su primer nombre y solo con sus filas', () => {
    const r = armarMensajesEjecutivo({ ...base, filas: [sug('Ana María Pérez', 'CLIENTE A', '123'), sug('LUIS GÓMEZ', 'CLIENTE B', '456'), cons('Ana María Pérez', 'CLIENTE C')], lotes: [lote()] });
    expect(r.map((m) => m.ejecutivo)).toEqual(['Ana María Pérez', 'LUIS GÓMEZ']);
    const ana = r[0]!;
    expect(ana.texto.startsWith('Que tal Ana, ¿cómo estás?')).toBe(true);
    expect(ana.texto).toContain('Pedido 123 · CLIENTE A · pendiente 10');
    expect(ana.texto).toContain('CLIENTE C · compra en promedio 5 al mes');
    expect(ana.texto).not.toContain('CLIENTE B');
    expect(r[1]!.texto.startsWith('Que tal Luis, ¿cómo estás?')).toBe(true); // MAYÚSCULAS → Título
  });

  it('separa sustitutos, corta caducidad y otras opciones', () => {
    const t = armarMensajesEjecutivo({
      ...base,
      filas: [sug('Ana', 'CLIENTE A', '1')],
      lotes: [lote(), lote({ material: '100950', descripcion: 'CINTA UMBILICAL', lote: 'B2', fuente: 'Corta caducidad' }), lote({ material: '100950', lote: 'C3', fuente: 'PNC' })],
    })[0]!.texto;
    expect(t).toContain('Como sustituto del 100950:');
    expect(t).toContain('Con corta caducidad');
    expect(t).toContain('Otras opciones:');
    expect(t.indexOf('Como sustituto')).toBeLessThan(t.indexOf('Con corta caducidad'));
    expect(t.indexOf('Con corta caducidad')).toBeLessThan(t.indexOf('Otras opciones'));
  });

  it('un lote de otro código con corta caducidad queda en corta caducidad y se marca como sustituto', () => {
    const t = armarMensajesEjecutivo({ ...base, filas: [cons('Ana', 'X')], lotes: [lote({ fuente: 'Sustituto/Corta caducidad' })] })[0]!.texto;
    expect(t).toContain('Con corta caducidad');
    expect(t).toContain('sustituto del 100950');
    expect(t).not.toContain('Como sustituto del');
  });

  it('sin precio, lote, caducidad o cliente NO escribe rellenos: simplemente omite el dato', () => {
    const t = armarMensajesEjecutivo({
      ...base,
      filas: [{ tipo: 'sug', ejecutivo: 'Ana', cliente: '', pedido: '', cantidad: 0 }, sug('Ana', 'CLIENTE A', '123')],
      lotes: [lote({ precio: 0, lote: '', caducidad: '' })],
    })[0]!.texto;
    expect(t).not.toContain('sin precio');
    expect(t).not.toContain('—');
    expect(t).not.toContain('$');
    expect(t).not.toMatch(/lote\s*·/);
    expect(t).toContain('• 100952 CINTA · 40 disponibles');
    expect(t).toContain('Pedido 123 · CLIENTE A · pendiente 10');
    // la fila vacía no deja una viñeta en blanco
    expect(t.split('\n').filter((x) => x.trim() === '•')).toHaveLength(0);
  });

  it('con todos los datos incluye lote, caducidad, disponibles y precio', () => {
    const t = armarMensajesEjecutivo({ ...base, filas: [cons('Ana', 'X')], lotes: [lote()] })[0]!.texto;
    expect(t).toContain('100952 CINTA · lote A1 · caduca 01/12/2027 · 40 disponibles · $85.00');
  });

  it('sin centro (detalle del material completo) no menciona ningún centro', () => {
    const t = armarMensajesEjecutivo({ ...base, centro: '', filas: [cons('Ana', 'X')], lotes: [] })[0]!.texto;
    expect(t).not.toContain('centro');
    expect(armarMensajesEjecutivo({ ...base, filas: [cons('Ana', 'X')], lotes: [] })[0]!.texto).toContain('en el centro 1018');
  });

  it('sin lotes omite la sección de productos; nunca incluye costos', () => {
    const t = armarMensajesEjecutivo({ ...base, filas: [sug('Ana', 'CLIENTE A', '123')], lotes: [] })[0]!.texto;
    expect(t).not.toContain('Lo que tenemos para ofrecerles');
    expect(t.toLowerCase()).not.toContain('costo');
  });

  it('una vacante no recibe nombre: el saludo menciona su zona', () => {
    const t = armarMensajesEjecutivo({ ...base, filas: [sug('002 · VACANTE', 'CLIENTE A', '1')], lotes: [] })[0]!.texto;
    expect(t.startsWith('Hola, ¿cómo estás? Te escribo por la zona 002.')).toBe(true);
    expect(t).not.toContain('Que tal 002');
  });

  it('las filas sin ejecutivo van al final en un mensaje con saludo genérico', () => {
    const r = armarMensajesEjecutivo({ ...base, filas: [sug('', 'CLIENTE A', '1'), sug('Ana', 'CLIENTE B', '2')], lotes: [] });
    expect(r.map((m) => m.ejecutivo)).toEqual(['Ana', SIN_EJECUTIVO]);
    expect(r[1]!.texto.startsWith('Hola, ¿cómo estás?')).toBe(true);
  });
});

describe('«tenemos material de …» con las condiciones seleccionadas', () => {
  const texto = (lotes: LoteMensaje[]) => armarMensajesEjecutivo({ ...base, filas: [sug('Ana', 'CLIENTE A', '1')], lotes })[0]!.texto;
  const frase = (t: string) => t.split('\n')[1]!;

  it('una condición', () => {
    expect(frase(texto([lote({ material: '100950', fuente: 'Corta caducidad' })]))).toBe(
      'Estoy revisando el codigo 100950 CINTA UMBILICAL en el centro 1018 y tenemos material de corta caducidad. Me ayudas a revisar con tus clientes si nos acepta alguno, por fa.',
    );
  });
  it('varias condiciones: sin duplicar y con «y» al final', () => {
    const t = texto([lote(), lote({ lote: 'B', fuente: 'Sustituto/Corta caducidad' }), lote({ material: '100950', fuente: 'PNC' })]);
    expect(frase(t)).toContain('tenemos material de sustituto, corta caducidad y PNC.');
  });
  it('un Status de Revision sale con su nombre', () => {
    expect(frase(texto([lote({ material: '100950', fuente: 'Lento mov' })]))).toContain('tenemos material de lento mov.');
  });
  it('solo existencia general (sin condición): no inventa una', () => {
    expect(frase(texto([lote({ material: '100950', fuente: 'General' })]))).toContain('y tenemos material disponible.');
  });
  it('mantiene la redacción de los apartados y del cierre', () => {
    const t = texto([lote(), lote({ material: '100950', fuente: 'Corta caducidad' })]);
    expect(t).toContain('Con corta caducidad y podiamos darle precio especial y/o carta canje:');
    expect(t.endsWith('Me dices si necesitas más detalle de alguno? por favor.')).toBe(true);
  });
});

describe('armarMensajePedido', () => {
  const item = (material: string, lotes: LoteMensaje[], pendiente = 12) => ({ material, descripcion: 'DESC ' + material, pendiente, lotes });
  const entrada = { ejecutivo: 'Ana María Pérez', pedido: '4500123', oc: 'OC-77', cliente: 'CLIENTE SA', centro: '1018' };

  it('sin lotes elegidos no hay mensaje', () => {
    expect(armarMensajePedido({ ...entrada, items: [item('100950', [])] })).toBeNull();
    expect(armarMensajePedido({ ...entrada, items: [] })).toBeNull();
  });

  it('lleva el folio, la OC, el cliente, el centro y la redacción acordada', () => {
    const m = armarMensajePedido({ ...entrada, items: [item('100950', [lote({ fuente: 'Sustituto' })])] })!;
    const [saludo, frase] = m.texto.split('\n');
    expect(saludo).toBe('Que tal Ana, ¿cómo estás?');
    expect(frase).toBe('Estoy revisando el pedido 4500123 (OC OC-77) de CLIENTE SA en el centro 1018 y tenemos material de sustituto. Me ayudas a revisar con tu cliente si nos acepta alguno, por fa.');
    expect(m.texto.endsWith('Me dices si necesitas más detalle de alguno? por favor.')).toBe(true);
  });

  it('un bloque por material del pedido, con su pendiente y sus lotes por condición; ignora renglones sin lotes', () => {
    const m = armarMensajePedido({
      ...entrada,
      items: [
        item('100950', [lote(), lote({ material: '100950', lote: 'B2', fuente: 'Corta caducidad' })], 40),
        item('555', []),
        item('777', [lote({ material: '777', descripcion: 'OTRO', lote: 'Z9', fuente: 'PNC' })], 0),
      ],
    })!.texto;
    expect(m).toContain('100950 DESC 100950 · pendiente 40');
    expect(m).toContain('Como sustituto del 100950:');
    expect(m).toContain('Con corta caducidad y podiamos darle precio especial y/o carta canje:');
    expect(m).toContain('777 DESC 777\n'); // sin pendiente: no lo menciona
    expect(m).not.toContain('555');
    expect(m).toContain('Opciones:');
    expect(m).toContain('tenemos material de sustituto, corta caducidad y PNC.');
  });

  it('sin ejecutivo, OC, centro o precio: simplemente no los escribe', () => {
    const m = armarMensajePedido({ ejecutivo: '', pedido: '1', cliente: '', items: [item('100950', [lote({ precio: 0, lote: '', caducidad: '' })], 0)] })!;
    expect(m.ejecutivo).toBe(SIN_EJECUTIVO);
    expect(m.texto.startsWith('Hola, ¿cómo estás?')).toBe(true);
    expect(m.texto).toContain('Estoy revisando el pedido 1 y tenemos');
    expect(m.texto).not.toContain('OC');
    expect(m.texto).not.toContain('sin precio');
    expect(m.texto).not.toContain('—');
  });
});
