import { describe, it, expect } from 'vitest';
import { buildRF } from './resumenFac';
import { analisisDirectivo, buildPeriodo, narrativaDirectivo, serieAnualComparada } from './analisisDirectivo';
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
});
