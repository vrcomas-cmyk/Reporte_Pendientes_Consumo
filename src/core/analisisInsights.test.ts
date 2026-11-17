import { describe, expect, it } from 'vitest';
import { insightsAnalisis } from './analisisInsights';
import type { AnalisisResult } from './comercial';

const base = (): AnalisisResult => ({
  serieTotal: [], crecen: [], caen: [], riesgo: [], matSuben: [], matCaen: [], sectores: [],
  conc: { top5: 0.3, top10: 0.5, total12: 1000, nClientes: 40 },
  ops: { total: 0, bloq: 0, top: [] },
  resumen: { crecen: { n: 0, delta: 0 }, caen: { n: 0, delta: 0 }, riesgo: { n: 0, base: 0 }, matSuben: { n: 0, delta: 0 }, matCaen: { n: 0, delta: 0 } },
  puente: { base: 1000, actual: 1000, volumen: 0, precio: 0, nuevos: 0, perdidos: 0, otros: 0, delta: 0, top: [] },
  baseComparacion: 'previos',
  kpi: { mesPrevImp: 1000, mesPrevAnt: 1000, qImp: 0, qAnt: 0, qMeses: 0, qLabel: 'Q4 2026', ytdImp: 10000, ytdAnt: 9000, ytdMeses: 10, ytdAnio: 2026, activos3m: 30, refLbl: '10/2026', refK: 24309,
    periodo: { n: 3, desdeK: 24307, hastaK: 24309, desdeLbl: '08/2026', hastaLbl: '10/2026', actual: 3000, base: 3000, baseDesdeLbl: '05/2026', baseHastaLbl: '07/2026' } },
});

describe('insightsAnalisis', () => {
  it('sin nada notable no inventa hallazgos', () => {
    expect(insightsAnalisis({ A: base() })).toEqual([]);
  });
  it('una caída fuerte contra el año anterior es lo primero (danger)', () => {
    const A = base();
    A.kpi.mesPrevImp = 800;
    A.resumen.riesgo = { n: 3, base: 50000 };
    const r = insightsAnalisis({ A });
    expect(r[0].tono).toBe('danger');
    expect(r[0].titulo).toContain('cayeron 20%');
    expect(r.some((i) => i.titulo.includes('3 clientes dejaron de comprar'))).toBe(true);
  });
  it('el presupuesto marca danger / warning / success según el cumplimiento', () => {
    const A = base();
    expect(insightsAnalisis({ A, ptoYtd: 20000 })[0]).toMatchObject({ tono: 'danger' }); // 50 %
    expect(insightsAnalisis({ A, ptoYtd: 10500 })[0]).toMatchObject({ tono: 'warning' }); // 95 %
    expect(insightsAnalisis({ A, ptoYtd: 9000 })[0]).toMatchObject({ tono: 'success' }); // 111 %
  });
  it('el puente nombra el factor dominante', () => {
    const A = base();
    A.puente = { base: 1000, actual: 700, volumen: -50, precio: -250, nuevos: 0, perdidos: 0, otros: 0, delta: -300, top: [] };
    const r = insightsAnalisis({ A });
    expect(r.find((i) => i.tono === 'info')?.titulo).toContain('el precio');
  });
  it('concentración, sobre-existencia y tope de 6', () => {
    const A = base();
    A.conc.top5 = 0.7;
    A.kpi.mesPrevImp = 500;
    A.resumen.riesgo = { n: 2, base: 1000 };
    A.resumen.caen = { n: 4, delta: -900 };
    const r = insightsAnalisis({ A, ptoYtd: 30000, matCaenConInventario: 5 });
    expect(r.length).toBeLessThanOrEqual(6);
    expect(r.map((i) => i.tono)).toEqual([...r.map((i) => i.tono)].sort((a, b) => ['danger', 'warning', 'info', 'success'].indexOf(a) - ['danger', 'warning', 'info', 'success'].indexOf(b)));
  });
});
