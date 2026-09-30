import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildRF } from './resumenFac';
import { analisisDirectivo, buildPeriodo, narrativaDirectivo, serieAnualComparada, serieMensualFiltrada, clientesDeMes } from './analisisDirectivo';
import type { EnrichIndex } from './enrich';
import type { ResumenFacRow } from './types';

const row = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'Razon S1', destinatario: 'D1',
  material: 'M1', textoMaterial: 'Material 1', mesAno: '01/2026',
  cantidadFacturada: 10, importeFacturado: 100, gpoCte: 'G1', gpoVdor: 'V1', centro: '1004',
  ...over,
});

function mkEnrich(over: Partial<EnrichIndex> = {}): EnrichIndex {
  return {
    grupoCliente: () => '', ejecutivoNombre: () => '', matSector: () => '', matGrupo: () => '',
    matTexto: () => '', matPrecioOferta: () => 0, matUm: () => '', matCondiciones: () => [],
    matCosto: () => 0, gerentes: [], sectoresDeGerente: () => [], sectorDeGerente: () => true,
    ...over,
  };
}

describe('analisisDirectivo', () => {
  it('calcula venta y margen aproximado con costo vigente', () => {
    const rows = [
      row({ material: 'M1', mesAno: '01/2026', cantidadFacturada: 10, importeFacturado: 100 }),
      row({ material: 'M1', mesAno: '02/2026', cantidadFacturada: 20, importeFacturado: 220 }),
    ];
    const rf = buildRF(rows);
    const enrich = mkEnrich({ matCosto: () => 8, matSector: () => 'Suturas' });
    const periodoA = buildPeriodo('01/2026', '01/2026');
    const periodoB = buildPeriodo('02/2026', '02/2026');
    const r = analisisDirectivo(rf, [], enrich, {}, periodoA, periodoB);
    expect(r).not.toBeNull();
    expect(r!.totalA.imp).toBe(100);
    expect(r!.totalA.margen).toBe(100 - 8 * 10); // 20
    expect(r!.totalB.imp).toBe(220);
    expect(r!.totalB.margen).toBe(220 - 8 * 20); // 60
    expect(r!.porSector).toEqual([{ sector: 'Suturas', a: r!.totalA, b: r!.totalB }]);
  });

  it('marca importe sin costo cuando el material no tiene costo en catálogo', () => {
    const rf = buildRF([row({ material: 'M2', mesAno: '01/2026', importeFacturado: 50 })]);
    const enrich = mkEnrich({ matCosto: () => 0 });
    const periodo = buildPeriodo('01/2026', '01/2026');
    const r = analisisDirectivo(rf, [], enrich, {}, periodo, periodo);
    expect(r!.totalA.margen).toBe(0);
    expect(r!.totalA.impSinCosto).toBe(50);
  });

  it('clasifica alta (primera compra en B) vs recuperado (compró antes, no en A)', () => {
    const rows = [
      // Cliente nuevo: solo compra en el periodo B.
      row({ solicitante: 'NUEVO', material: 'M1', mesAno: '03/2026', importeFacturado: 300 }),
      // Cliente recuperado: compró hace tiempo, nada en A, vuelve en B.
      row({ solicitante: 'RECUP', material: 'M1', mesAno: '01/2025', importeFacturado: 10 }),
      row({ solicitante: 'RECUP', material: 'M1', mesAno: '03/2026', importeFacturado: 150 }),
      // Cliente retenido: compra en A y en B — no debe aparecer en ninguna lista.
      row({ solicitante: 'RETEN', material: 'M1', mesAno: '02/2026', importeFacturado: 40 }),
      row({ solicitante: 'RETEN', material: 'M1', mesAno: '03/2026', importeFacturado: 40 }),
    ];
    const rf = buildRF(rows);
    const enrich = mkEnrich();
    const periodoA = buildPeriodo('02/2026', '02/2026');
    const periodoB = buildPeriodo('03/2026', '03/2026');
    const r = analisisDirectivo(rf, [], enrich, {}, periodoA, periodoB)!;
    expect(r.altas.map((c) => c.code)).toEqual(['NUEVO']);
    expect(r.recuperados.map((c) => c.code)).toEqual(['RECUP']);
    expect(r.penetracion.activosB).toBe(3);
    expect(r.penetracion.activosA).toBe(1);
    expect(r.penetracion.universo).toBe(3);
  });

  it('respeta el filtro de gerente (solo sectores a su cargo)', () => {
    const rows = [
      row({ material: 'SUT1', mesAno: '01/2026', importeFacturado: 100 }),
      row({ material: 'DIAG1', mesAno: '01/2026', importeFacturado: 200 }),
    ];
    const rf = buildRF(rows);
    const enrich = mkEnrich({
      matSector: (m) => (m === 'SUT1' ? 'Suturas' : 'Diagnóstico'),
      gerentes: ['Ana'],
      sectorDeGerente: (sector, g) => g === 'Ana' && sector === 'Suturas',
    });
    const periodo = buildPeriodo('01/2026', '01/2026');
    const r = analisisDirectivo(rf, [], enrich, { gerente: 'Ana' }, periodo, periodo)!;
    expect(r.totalA.imp).toBe(100);
    expect(r.porGerente).toEqual([{ gerente: 'Ana', a: r.totalA, b: r.totalB }]);
  });

  it('serieAnualComparada rellena con el promedio real los meses futuros del año en curso', () => {
    const rows = [
      row({ material: 'M1', mesAno: '01/2026', importeFacturado: 100, cantidadFacturada: 10 }),
      row({ material: 'M1', mesAno: '02/2026', importeFacturado: 200, cantidadFacturada: 20 }),
    ];
    const rf = buildRF(rows); // curmes = 02/2026
    const enrich = mkEnrich({ matCosto: () => 5 });
    const r = serieAnualComparada(rf, enrich, {}, 2026);
    expect(r.esAnioEnCurso).toBe(true);
    expect(r.promedioImpReal).toBe(150); // (100+200)/2
    expect(r.meses[0].imp).toBe(100); // Ene real
    expect(r.meses[0].esProyeccion).toBe(false);
    expect(r.meses[1].imp).toBe(200); // Feb real
    expect(r.meses[2].imp).toBe(150); // Mar proyectado = promedio
    expect(r.meses[2].esProyeccion).toBe(true);
    expect(r.meses[11].esProyeccion).toBe(true); // Dic también proyectado
  });

  it('serieAnualComparada no proyecta un año ya cerrado (año anterior al de curmes)', () => {
    const rows = [
      row({ material: 'M1', mesAno: '06/2025', importeFacturado: 100 }),
      row({ material: 'M1', mesAno: '01/2026', importeFacturado: 50 }),
    ];
    const rf = buildRF(rows); // curmes = 01/2026
    const enrich = mkEnrich();
    const r = serieAnualComparada(rf, enrich, {}, 2025);
    expect(r.esAnioEnCurso).toBe(false);
    expect(r.meses.every((m) => !m.esProyeccion)).toBe(true);
    expect(r.meses[5].imp).toBe(100); // Jun real
    expect(r.meses[6].imp).toBe(0); // Jul sin compra, año ya cerrado -> 0, no null
  });

  it('filtra por varios grupos de cliente a la vez (grupoClientes)', () => {
    const rows = [
      row({ solicitante: 'C1', gpoCte: 'G1', material: 'M1', mesAno: '01/2026', importeFacturado: 100 }),
      row({ solicitante: 'C2', gpoCte: 'G2', material: 'M1', mesAno: '01/2026', importeFacturado: 200 }),
      row({ solicitante: 'C3', gpoCte: 'G3', material: 'M1', mesAno: '01/2026', importeFacturado: 300 }),
    ];
    const rf = buildRF(rows);
    const enrich = mkEnrich({ grupoCliente: (g) => String(g) });
    const periodo = buildPeriodo('01/2026', '01/2026');
    const r = analisisDirectivo(rf, [], enrich, { grupoClientes: ['G1', 'G3'] }, periodo, periodo)!;
    expect(r.penetracion.universo).toBe(2);
    expect(r.porGrupoCliente.map((g) => g.grupo).sort()).toEqual(['G1', 'G3']);
  });

  it('porGrupoCliente agrega venta y margen por grupo de cliente', () => {
    const rows = [
      row({ solicitante: 'C1', gpoCte: 'G1', material: 'M1', mesAno: '01/2026', importeFacturado: 100, cantidadFacturada: 10 }),
      row({ solicitante: 'C2', gpoCte: 'G1', material: 'M1', mesAno: '01/2026', importeFacturado: 50, cantidadFacturada: 5 }),
      row({ solicitante: 'C3', gpoCte: 'G2', material: 'M1', mesAno: '01/2026', importeFacturado: 300, cantidadFacturada: 30 }),
    ];
    const rf = buildRF(rows);
    const enrich = mkEnrich({ grupoCliente: (g) => String(g), matCosto: () => 5 });
    const periodo = buildPeriodo('01/2026', '01/2026');
    const r = analisisDirectivo(rf, [], enrich, {}, periodo, periodo)!;
    const g1 = r.porGrupoCliente.find((g) => g.grupo === 'G1')!;
    expect(g1.a.imp).toBe(150);
    expect(g1.a.margen).toBe(150 - 5 * 15); // 75
    const g2 = r.porGrupoCliente.find((g) => g.grupo === 'G2')!;
    expect(g2.a.imp).toBe(300);
  });

  it('narrativaDirectivo menciona el grupo de cliente más dinámico y el que retrocedió', () => {
    const rows = [
      row({ solicitante: 'C1', gpoCte: 'CRECE', material: 'M1', mesAno: '01/2026', importeFacturado: 100 }),
      row({ solicitante: 'C1', gpoCte: 'CRECE', material: 'M1', mesAno: '02/2026', importeFacturado: 300 }),
      row({ solicitante: 'C2', gpoCte: 'CAE', material: 'M1', mesAno: '01/2026', importeFacturado: 300 }),
      row({ solicitante: 'C2', gpoCte: 'CAE', material: 'M1', mesAno: '02/2026', importeFacturado: 50 }),
    ];
    const rf = buildRF(rows);
    const enrich = mkEnrich({ grupoCliente: (g) => String(g) });
    const r = analisisDirectivo(rf, [], enrich, {}, buildPeriodo('01/2026', '01/2026'), buildPeriodo('02/2026', '02/2026'))!;
    const texto = narrativaDirectivo(r);
    expect(texto).toContain('grupo de cliente');
    expect(texto).toContain('CRECE');
    expect(texto).toContain('CAE');
  });

  it('narrativaDirectivo arma una frase con los deltas', () => {
    const rf = buildRF([
      row({ mesAno: '01/2026', importeFacturado: 100 }),
      row({ mesAno: '02/2026', importeFacturado: 150 }),
    ]);
    const enrich = mkEnrich();
    const r = analisisDirectivo(rf, [], enrich, {}, buildPeriodo('01/2026', '01/2026'), buildPeriodo('02/2026', '02/2026'))!;
    const texto = narrativaDirectivo(r);
    expect(texto).toContain('subió');
  });

  describe('deterioro y series con filtros', () => {
    // "Hoy" fijo: 15/09/2026 -> hoyMes() = '09/2026'.
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 15)); });
    afterEach(() => { vi.useRealTimers(); });

    const enrichSector = mkEnrich({ matSector: (m) => (m === 'M2' ? 'S2' : 'S1') });
    const periodo = buildPeriodo('01/2026', '01/2026');

    it('deterioro respeta el filtro de sector y mide solo esos materiales', () => {
      const rows = [
        // A: deja de comprar S1 en 03/2026 pero sigue comprando S2 en 08/2026.
        row({ solicitante: 'A', material: 'M1', mesAno: '01/2026', importeFacturado: 200 }),
        row({ solicitante: 'A', material: 'M1', mesAno: '02/2026', importeFacturado: 200 }),
        row({ solicitante: 'A', material: 'M1', mesAno: '03/2026', importeFacturado: 200 }),
        row({ solicitante: 'A', material: 'M2', mesAno: '08/2026', importeFacturado: 50 }),
      ];
      const rf = buildRF(rows);
      // Sin filtro A compró hace 1 mes (08/2026): NO está en riesgo.
      expect(analisisDirectivo(rf, [], enrichSector, {}, periodo, periodo)!.deterioro).toHaveLength(0);
      // Filtrando S1, su última compra de ese sector fue 03/2026 (6 meses): SÍ está en riesgo.
      const r = analisisDirectivo(rf, [], enrichSector, { sector: 'S1' }, periodo, periodo)!;
      expect(r.deterioro.map((c) => c.code)).toEqual(['A']);
      expect(r.deterioro[0].sinComprar).toBe(6);
      expect(r.deterioro[0].ultimaCompra).toBe('03/2026');
      // Filtrando S2 solo tiene 1 mes de compra: no califica.
      expect(analisisDirectivo(rf, [], enrichSector, { sector: 'S2' }, periodo, periodo)!.deterioro).toHaveLength(0);
    });

    it('deterioro trae total y promedio (12 meses previos a la última compra) ordenado de mayor a menor, sin tope de 12', () => {
      const rows: ResumenFacRow[] = [];
      // 15 clientes, 3 meses de compra cada uno (ene-mar 2026), importe creciente.
      for (let i = 1; i <= 15; i++) {
        for (const mes of ['01/2026', '02/2026', '03/2026']) {
          rows.push(row({ solicitante: `C${i}`, material: 'M1', mesAno: mes, importeFacturado: i * 10 }));
        }
      }
      // Un compra vieja fuera de la ventana de 12m previos a la última compra NO cuenta en el total.
      rows.push(row({ solicitante: 'C1', material: 'M1', mesAno: '01/2024', importeFacturado: 9999 }));
      const rf = buildRF(rows);
      const r = analisisDirectivo(rf, [], mkEnrich(), {}, periodo, periodo)!;
      expect(r.deterioro).toHaveLength(15);
      expect(r.deterioro[0].code).toBe('C15');
      expect(r.deterioro[0].total).toBe(15 * 10 * 3); // 450
      expect(r.deterioro[0].promMensual).toBe(450 / 12);
      const totales = r.deterioro.map((c) => c.total);
      expect(totales).toEqual([...totales].sort((x, y) => y - x));
      const c1 = r.deterioro.find((c) => c.code === 'C1')!;
      expect(c1.total).toBe(10 * 3); // la de 01/2024 (9999) queda fuera de la ventana
    });

    it('deterioro respeta el filtro de grupo de cliente', () => {
      const rows = ['G1', 'G2'].flatMap((g, i) =>
        ['01/2026', '02/2026', '03/2026'].map((mes) => row({ solicitante: `K${i}`, gpoCte: g, material: 'M1', mesAno: mes, importeFacturado: 100 })));
      const rf = buildRF(rows);
      const enrich = mkEnrich({ grupoCliente: (g) => String(g) });
      const r = analisisDirectivo(rf, [], enrich, { grupoClientes: ['G2'] }, periodo, periodo)!;
      expect(r.deterioro.map((c) => c.code)).toEqual(['K1']);
    });

    it('Finanzas, serie anual y serie mensual reaccionan al filtro de grupo de cliente', () => {
      const rows = [
        row({ solicitante: 'C1', gpoCte: 'G1', material: 'M1', mesAno: '01/2026', importeFacturado: 100, cantidadFacturada: 10 }),
        row({ solicitante: 'C2', gpoCte: 'G2', material: 'M1', mesAno: '01/2026', importeFacturado: 700, cantidadFacturada: 70 }),
      ];
      const rf = buildRF(rows);
      const enrich = mkEnrich({ grupoCliente: (g) => String(g) });
      const f = { grupoClientes: ['G1'] };
      expect(analisisDirectivo(rf, [], enrich, f, periodo, periodo)!.totalA.imp).toBe(100);
      expect(analisisDirectivo(rf, [], enrich, {}, periodo, periodo)!.totalA.imp).toBe(800);
      expect(serieAnualComparada(rf, enrich, f, 2026).meses[0].imp).toBe(100);
      const serie = serieMensualFiltrada(rf, enrich, f);
      expect(serie).toEqual([{ mes: '01/2026', cant: 10, imp: 100 }]);
    });

    it('clientesDeMes lista quién compró qué en el mes bajo los filtros, mayor importe primero', () => {
      const rows = [
        row({ solicitante: 'C1', destinatario: 'D1', gpoCte: 'G1', material: 'M1', mesAno: '01/2026', importeFacturado: 100, cantidadFacturada: 1 }),
        row({ solicitante: 'C1', destinatario: 'D1', gpoCte: 'G1', material: 'M1', mesAno: '01/2026', importeFacturado: 50, cantidadFacturada: 1 }),
        row({ solicitante: 'C2', destinatario: 'D2', gpoCte: 'G2', material: 'M1', mesAno: '01/2026', importeFacturado: 900, cantidadFacturada: 9 }),
        row({ solicitante: 'C1', destinatario: 'D1', gpoCte: 'G1', material: 'M1', mesAno: '02/2026', importeFacturado: 5, cantidadFacturada: 1 }),
      ];
      const rf = buildRF(rows);
      const enrich = mkEnrich({ grupoCliente: (g) => String(g) });
      const todos = clientesDeMes(rf, enrich, {}, '01/2026');
      expect(todos.map((x) => x.solic)).toEqual(['C2', 'C1']);
      expect(todos[1].imp).toBe(150); // se agrupa solicitante+destinatario+material
      const soloG1 = clientesDeMes(rf, enrich, { grupoClientes: ['G1'] }, '01/2026');
      expect(soloG1.map((x) => x.solic)).toEqual(['C1']);
    });
  });

  describe('cartera de clientes y puente de venta', () => {
    const A = buildPeriodo('01/2026', '01/2026');
    const B = buildPeriodo('02/2026', '02/2026');
    // Escenario: R crece (100->300), Q cae (400->100), P se pierde (200->0),
    // N es alta (0->50), V es recuperado (0->70, compró en 2025), y W también alta.
    const rows = [
      row({ solicitante: 'R', mesAno: '01/2026', importeFacturado: 100 }), row({ solicitante: 'R', mesAno: '02/2026', importeFacturado: 300 }),
      row({ solicitante: 'Q', mesAno: '01/2026', importeFacturado: 400 }), row({ solicitante: 'Q', mesAno: '02/2026', importeFacturado: 100 }),
      row({ solicitante: 'P', mesAno: '01/2026', importeFacturado: 200 }),
      row({ solicitante: 'N', mesAno: '02/2026', importeFacturado: 50 }),
      row({ solicitante: 'V', mesAno: '06/2025', importeFacturado: 10 }), row({ solicitante: 'V', mesAno: '02/2026', importeFacturado: 70 }),
      row({ solicitante: 'W', mesAno: '02/2026', importeFacturado: 30 }),
    ];
    const rf = buildRF(rows);
    const enrich = mkEnrich();
    const r = analisisDirectivo(rf, [], enrich, {}, A, B)!;

    it('clasifica retenidos, altas, recuperados y bajas', () => {
      expect(r.altas.map((c) => c.code)).toEqual(['N', 'W']); // por impB desc
      expect(r.recuperados.map((c) => c.code)).toEqual(['V']);
      expect(r.bajas.map((c) => c.code)).toEqual(['P']);
      expect(r.bajas[0].impA).toBe(200);
      expect(r.cartera).toMatchObject({ activosA: 3, activosB: 5, retenidos: 2, retenidosCrecen: 1, retenidosCaen: 1, altas: 2, recuperados: 1, bajas: 1 });
      expect(r.cartera.retencionPct).toBeCloseTo((2 / 3) * 100);
      expect(r.cartera.bajaPct).toBeCloseTo((1 / 3) * 100);
    });

    it('el puente cuadra: ventaA + componentes = ventaB', () => {
      const p = r.puente;
      expect(p.ventaA).toBe(700);
      expect(p.altas).toBe(80);
      expect(p.recuperados).toBe(70);
      expect(p.crecimiento).toBe(200);
      expect(p.decrecimiento).toBe(-300);
      expect(p.bajas).toBe(-200);
      expect(p.ventaB).toBe(550);
      expect(p.ventaA + p.altas + p.recuperados + p.crecimiento + p.decrecimiento + p.bajas + p.otros).toBe(p.ventaB);
    });

    it('top clientes: concentración y estado del movimiento', () => {
      expect(r.topClientes.map((c) => c.code)).toEqual(['R', 'Q', 'V', 'N', 'W']);
      expect(r.topClientes[0]).toMatchObject({ estado: 'retenido', impB: 300 });
      expect(r.topClientes.find((c) => c.code === 'N')!.estado).toBe('alta');
      expect(r.topClientes.find((c) => c.code === 'V')!.estado).toBe('recuperado');
      expect(r.concentracionTop10).toBeCloseTo(100); // solo hay 5 clientes activos en B
      expect(r.topClientes[0].share).toBeCloseTo((300 / 550) * 100);
    });

    it('las listas de altas/recuperados/bajas ya no se cortan a 12', () => {
      const many: ResumenFacRow[] = [];
      for (let i = 0; i < 20; i++) many.push(row({ solicitante: `N${i}`, mesAno: '02/2026', importeFacturado: 10 + i }));
      const big = analisisDirectivo(buildRF(many), [], enrich, {}, A, B)!;
      expect(big.altas).toHaveLength(20);
      expect(big.topClientes).toHaveLength(10);
    });

    it('agrupa por ejecutivo con altas y bajas', () => {
      const enr = mkEnrich({ ejecutivoNombre: (v) => (v === 'V1' ? 'Ana' : String(v)) });
      const rows2 = [
        row({ solicitante: 'X', gpoVdor: 'V1', mesAno: '01/2026', importeFacturado: 100 }),
        row({ solicitante: 'Y', gpoVdor: 'V1', mesAno: '02/2026', importeFacturado: 40 }),
      ];
      const e = analisisDirectivo(buildRF(rows2), [], enr, {}, A, B)!.porEjecutivo.find((x) => x.ejecutivo === 'Ana')!;
      expect(e).toMatchObject({ a: 100, b: 40, activosB: 1, altas: 1, bajas: 1 });
    });

    it('la narrativa menciona retención y concentración', () => {
      const texto = narrativaDirectivo(r);
      expect(texto).toContain('Retención de cartera');
      expect(texto).toContain('concentran');
    });
  });
});
