import { describe, it, expect } from 'vitest';
import type { ItemOfertaLote } from '@/store/ofertaLotesStore';
import { agruparOferta, filasOferta, textoCliente, textoEjecutivo } from './ofertaLotesResumen';

const item = (o: Partial<ItemOfertaLote>): ItemOfertaLote => ({
  clave: 'k', material: 'M1', desc: 'Gasa', lote: 'L1', centro: '1001', almacen: '1030', caducidad: '2026-12-31', disponible: 100, cantidad: 40,
  destinatario: 'D1', cliente: 'Cliente 1', ejecutivo: 'Ana', precioUltimo: 11, precioP50: 10, precioOferta: 9.5, ...o,
});

describe('agruparOferta', () => {
  it('agrupa por ejecutivo y cliente y ordena lotes por caducidad', () => {
    const g = agruparOferta([item({ clave: 'a', lote: 'L2', caducidad: '2027-01-01' }), item({ clave: 'b', lote: 'L1' }), item({ clave: 'c', ejecutivo: '', destinatario: 'D2', cliente: 'Cliente 2' })]);
    expect(g.map((e) => e.ejecutivo)).toEqual(['Ana', 'Sin ejecutivo']);
    expect(g[0].clientes[0].items.map((i) => i.lote)).toEqual(['L1', 'L2']);
  });
});

describe('textos y filas', () => {
  it('el texto del cliente incluye lote, centro, cantidad y caducidad', () => {
    const t = textoCliente(agruparOferta([item({})])[0].clientes[0]);
    expect(t).toContain('Lote L1');
    expect(t).toContain('Centro 1001');
    expect(t).toContain('40 pzas');
    expect(t).toContain('31/12/2026');
  });
  it('marca los lotes ofrecidos como sustituto', () => {
    const g = agruparOferta([item({ viaSustituto: 'S1' })]);
    expect(textoCliente(g[0].clientes[0])).toContain('sustituto de lo que compras: S1');
    expect(filasOferta([item({ viaSustituto: 'S1' })])[0]['Sustituye a']).toBe('S1');
  });
  it('el texto del ejecutivo lista a sus clientes', () => {
    expect(textoEjecutivo(agruparOferta([item({})])[0])).toContain('Cliente 1');
  });
  it('una fila por lote × cliente con importe', () => {
    const [f] = filasOferta([item({})]);
    expect(f.Importe).toBe(380);
    expect(f.Ejecutivo).toBe('Ana');
  });
});
