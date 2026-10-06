import { describe, it, expect } from 'vitest';
import { puntosSolicitarInventario, invAlmacen1031 } from '../inventario1031';
import type { Analytics } from '../AnalyticsContext';

const mk = (over: Record<string, unknown>) => ({
  rss: null, invCondicion: [], invConsolidadoCatalog: [], lotes: [],
  enrich: { matSector: () => '' }, ...over,
}) as unknown as Analytics;

const rssCon = (invAlm: Record<string, number>) => ({
  mats: new Map([['M1', { centros: new Map([['1031', { invAlm }], ['1001', { invAlm: { '1030': 999, '1032': 999 } }]]) }]]),
});

describe('puntosSolicitarInventario', () => {
  it('usa Resumen Sin del Centro 1031 (no el máximo entre centros)', () => {
    const a = mk({ rss: rssCon({ '1030': 10, '1032': 4 }) });
    const p = puntosSolicitarInventario(a, 'M1');
    expect(p.map((x) => [x.centro, x.almacen, x.cantidad])).toEqual([['1031', '1030', 10], ['1031', '1032', 4]]);
  });
  it('sin Resumen Sin cae a "Disponible 1031-1030/1032"', () => {
    const a = mk({ invCondicion: [{ material: 'M1', disponible31_30: 7, disponible31_32: 2 }] });
    expect(invAlmacen1031(a, 'M1', '1030')).toBe(7);
    expect(invAlmacen1031(a, 'M1', '1032')).toBe(2);
  });
  it('sin ninguno suma los lotes del centro 1031 y ese almacén', () => {
    const a = mk({ lotes: [
      { material: 'M1', centro: '1031', almacen: '1030', cantidadDisp: 3 },
      { material: 'M1', centro: '1031', almacen: '1030', cantidadDisp: 2 },
      { material: 'M1', centro: '1001', almacen: '1030', cantidadDisp: 50 },
    ] });
    expect(invAlmacen1031(a, 'M1', '1030')).toBe(5);
  });
  it('Suturas agrega el punto del centro 1018', () => {
    const a = mk({ enrich: { matSector: () => 'Suturas' } });
    expect(puntosSolicitarInventario(a, 'M1', 8).at(-1)).toMatchObject({ centro: '1018', cantidad: 8 });
  });
});
