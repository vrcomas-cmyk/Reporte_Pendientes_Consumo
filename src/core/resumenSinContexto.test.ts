import { describe, it, expect } from 'vitest';
import { computeContexto } from './resumenSinContexto';
import type { RSSCentro, RSSMaterial, RSSAlmacen } from './resumenSin';

const alm = (over: Partial<RSSAlmacen>): RSSAlmacen => ({
  alm: '1030', inv: 0, pend: 0, transito: 0, impPend: 0, prom: 0, ultMes: '', cantUlt: 0, penMes: '', cantPen: 0, meses: 0, status: '', fuente: '', ...over,
});
const centro = (c: string, a: RSSAlmacen, over: Partial<RSSCentro> = {}): RSSCentro => ({
  centro: c, invAlm: { '1030': a.inv, '1031': 0, '1032': 0, '1060': 0 }, pend: a.pend, transito: a.transito, impPend: a.impPend,
  pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map([['1030', a]]), ...over,
});
const mat = (m: string, centros: RSSCentro[]): RSSMaterial => ({
  material: m, desc: m + ' desc', centros: new Map(centros.map((c) => [c.centro, c])), fuentes: new Set(), disp1030: 0, disp1032: 0, sumaInv: 0, sumaPend: 0,
});

describe('computeContexto', () => {
  const quiebreUrg = centro('1001', alm({ inv: 1, prom: 10, meses: 0.1, pend: 5, impPend: 500 }));
  const quiebreMit = centro('1003', alm({ inv: 1, prom: 10, meses: 0.1, transito: 4, impPend: 100 }));
  const exceso = centro('1004', alm({ inv: 500, prom: 10, meses: 50, impPend: 0 }));
  const hub = centro('1031', alm({ inv: 99, prom: 1, meses: 1 }));
  const list = [mat('A', [quiebreUrg, quiebreMit, exceso, hub]), mat('B', [centro('1001', alm({ inv: 20, prom: 10, meses: 2 }))])];
  const r = computeContexto(list, (m) => (m === 'A' ? 'Gasas' : 'Suturas'));

  it('separa quiebre urgente de mitigado y no clasifica el 1031', () => {
    expect(r.quiebreUrgente).toBe(1);
    expect(r.quiebreMitigado).toBe(1);
    expect(r.pares).toBe(4); // 1001,1003,1004 de A + 1001 de B (sin 1031)
    expect(r.impPendQuiebreUrgente).toBe(500);
  });
  it('cuenta por estado', () => {
    const n = (e: string) => r.estados.find((x) => x.estado === e)!.count;
    expect([n('quiebre'), n('exceso'), n('sano')]).toEqual([2, 1, 1]);
  });
  it('balance por centro incluye 1031 en inventario', () => {
    expect(r.porCentro.find((c) => c.centro === '1031')!.inv).toBe(99);
    expect(r.porCentro.find((c) => c.centro === '1001')!.quiebre).toBe(1);
  });
  it('rankings críticos', () => {
    expect(r.topQuiebre).toEqual([{ code: 'A', desc: 'A desc', val: 500, valSub: 1 }]);
    expect(r.sectoresQuiebre).toEqual([{ code: 'Gasas', desc: 'Gasas', val: 1 }]);
  });
});
