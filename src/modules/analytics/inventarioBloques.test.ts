import { describe, it, expect } from 'vitest';
import { inventarioBloques } from './inventarioBloques';
import type { Analytics } from './AnalyticsContext';

const co = (invAlm: Record<string, number>, transito = 0) => ({ invAlm, transito, pend: 0 });
const analytics = (centros: Record<string, ReturnType<typeof co>>) => ({
  rss: { mats: new Map([['100', { centros: new Map(Object.entries(centros)) }]]) },
  invCondicion: [], invConsolidadoCatalog: [], lotes: [],
}) as unknown as Analytics;

describe('inventarioBloques', () => {
  it('separa principales del centro, otros centros y 1031 alm 1030/1032', () => {
    const a = analytics({
      '1031': co({ '1030': 10, '1031': 5, '1032': 3, '1060': 2 }),
      '1004': co({ '1030': 4, '1031': 1, '1060': 1 }, 7),
    });
    const b = inventarioBloques(a, '100', '1004');
    expect(b.principales.map((x) => x.cantidad)).toEqual([4, 1, 0, 1]);
    expect(b.centro1031.map((x) => x.cantidad)).toEqual([10, 3]);
    // el centro revisado no aparece en "otros"; el 1031 sí
    expect(b.otrosCentros.find((x) => x.clave === '1004')).toBeUndefined();
    expect(b.otrosCentros.find((x) => x.clave === '1031')).toBeDefined();
  });
  it('por defecto el centro es 1031 y respeta el filtro de centros', () => {
    const a = analytics({ '1031': co({ '1030': 10 }) });
    const b = inventarioBloques(a, '100', undefined, ['1004']);
    expect(b.centro).toBe('1031');
    expect(b.otrosCentros.map((x) => x.clave)).toEqual(['1004']);
  });
});
