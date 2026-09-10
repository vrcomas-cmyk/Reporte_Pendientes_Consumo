import { describe, it, expect } from 'vitest';
import {
  buildPeriodo, buildIncrementoImpacto, buildEscenarios, defaultEscenarioGrid, puntoEquilibrio,
  type ImpactoSku, type IncrementoContext,
} from './incremento';
import { buildRF } from './resumenFac';
import { buildRSS, type RSSIndex } from './resumenSin';
import { buildEnrich } from './enrich';
import { buildAbc } from './abc';
import { buildBO } from './buildBO';
import { mapResumenSinSugerencia } from './mappers';
import type {
  ResumenFacRow, IncrementoCostoRow, Material, CatalogSnapshot, Sugerencia, Ejecutivo,
} from './types';

function mkRF(over: Partial<ResumenFacRow>): ResumenFacRow {
  return {
    solicitante: 'S1', razonSocial: 'Cliente Uno', destinatario: 'S1',
    material: 'M1', textoMaterial: 'Material Uno', mesAno: '01/2025',
    cantidadFacturada: 0, importeFacturado: 0, gpoCte: '', gpoVdor: '', centro: '1001',
    ...over,
  };
}

function mkIncremento(over: Partial<IncrementoCostoRow>): IncrementoCostoRow {
  return {
    material: 'M1', descripcion: 'Material Uno', sector: 'Sector A', grupoArticulo: 'Grupo A',
    costoAnteriorPieza: 100, costoNuevoPieza: 110, costoAnteriorCaja: 0, costoNuevoCaja: 0,
    ...over,
  };
}

function mkMaterial(over: Partial<Material>): Material {
  return {
    material: 'M1', textoBreve: 'Material Uno', sector: 'Sector A', descrSector: 'Sector A',
    descrGrupoArt: 'Grupo A', grupoArticulos: 'Grupo A', um: 'PZA', tipoMaterial: '',
    costo: 100, cajasPorPallet: 0, piezasUmvPorCaja: 12, piezasPorPallet: 0,
    cajasXCama: 0, camasPorTarima: 0, altura: 0, lista02: 150, lista06: 150, condicion: '',
    ...over,
  };
}

/** Construye un `RSSIndex` (reporte "Inventario" / Resumen Sin Sugerencias) a
 * partir de pares material+suma-de-inventario — `buildRSS` lee de `row.raw`
 * con los headers originales, así que se pasa por `mapResumenSinSugerencia`
 * como lo haría el worker real. */
function mkRss(entries: { material: string; sumaInv: number; centro?: string }[]): RSSIndex {
  const rows = entries.map((e) => mapResumenSinSugerencia({
    Centro: e.centro ?? '1001', Almacen: '1030', Pedidos: '', Material: e.material, Descripcion: 'Desc',
    Cantidad_Pendiente: 0, Importe_Pendiente: 0, Promedio_Consumo_12M: 0, Meses_Inventario: 0,
    'Suma inventario': e.sumaInv, 'Suma pendiente': 0, 'Status Revisión': '', Fuente: '',
  }));
  return buildRSS(rows);
}

function mkSugerencia(over: Partial<Sugerencia>): Sugerencia {
  return {
    gpoCte: '', fecha: '', oc: '', pedido: 'P1', gpoVdor: '', solicitante: 'S1', destinatario: 'S1',
    razonSocial: 'Cliente Uno', centroPedido: '1001', almacen: '', materialSolicitado: 'M1',
    materialBase: 'M1', descripcionSolicitada: '', cantidadPedido: 0, cantidadPendiente: 0,
    cantidadOfertar: 0, precio: 0, consumoPromedio: 0, fuente: '', materialSugerido: '',
    descripcionSugerida: '', centroSugerido: '', almacenSugerido: '', disponible: 0, lote: '',
    fechaCaducidad: '', mesesVigenciaLote: 0, centroInv: '', mesesInventario: 0,
    promedioConsumo12M: 0, cantTransito: 0, bloqueado: '', invByCenter: {}, raw: {},
    ...over,
  };
}

function mkEjecutivo(over: Partial<Ejecutivo>): Ejecutivo {
  return {
    zona: '', ejecutivo: '', canal: '', canalVentas: '', codOfVtas: '', oficinaVentas: '',
    gpoCte: '', grupoCliente: '', region: '', gerenciaVentas: '', gerenteVentas: '', directorVentas: '',
    estadoLocalidad: '', correoElectronico: '', celular: '',
    ...over,
  };
}

const EMPTY_CATALOG: CatalogSnapshot = { id: 'current', fileName: '', loadedAt: '', ejecutivos: [], materiales: [], invConsolidado: [], invDetalle: [] };

function mkCtx(over: Partial<IncrementoContext> = {}, resumenFacRows: ResumenFacRow[] = []): IncrementoContext {
  const rf = resumenFacRows.length ? buildRF(resumenFacRows) : null;
  return {
    rf,
    enrich: buildEnrich(EMPTY_CATALOG),
    abc: buildAbc(rf),
    materiales: [mkMaterial({})],
    rss: null,
    bo: [],
    ...over,
  };
}

/** Fixture de `ImpactoSku` para probar `puntoEquilibrio`/`buildEscenarios`
 * directamente (sin pasar por `buildIncrementoImpacto`) — ambas funciones
 * usan `precioLista06`/`utilidadAct` como base (LISTA 06, no el precio neto
 * histórico), así que hay que mantenerlos consistentes entre sí igual que
 * haría el motor real. */
function mkImpactoSku(over: Partial<ImpactoSku>): ImpactoSku {
  return {
    material: 'M1', descripcion: 'Material Uno', sector: 'Sector A', grupoArticulo: 'Grupo A',
    costoAnteriorPieza: 100, costoNuevoPieza: 110, costoAnteriorCaja: 0, costoNuevoCaja: 0,
    deltaAbs: 10, deltaPct: 0.1,
    cantidadPeriodo: 1000, importePeriodo: 150000, precioNeto: 150,
    cantidadMensualProm: 1000, cantidadAnualizada: 12000,
    precioLista: 150, precioLista06: 150, ventaListaPeriodo: 150000, brechaListaNeto: 0,
    margenActPct: (150 - 100) / 150, margenNuePct: (150 - 110) / 150,
    utilidadAct: 50000, utilidadNue: 40000,
    impactoPeriodo: 10000, impactoAnualizado: 120000,
    precioRequerido: 165, incrementoRequeridoPct: 0.1,
    invPiezas: 0, invImporte: 0, coberturaMeses: 0, colchonInventario: 0,
    pedidoPendientePiezas: 0, pedidoPendienteImporte: 0, riesgoPedidosPendientes: 0,
    clase: undefined, estrategico: false, flags: [],
    ...over,
  };
}

describe('buildPeriodo', () => {
  it('calcula meses inclusive entre desde y hasta', () => {
    expect(buildPeriodo('01/2025', '12/2025').meses).toBe(12);
    expect(buildPeriodo('07/2025', '12/2025').meses).toBe(6);
    expect(buildPeriodo('03/2025', '03/2025').meses).toBe(1);
  });

  it('devuelve meses 0 cuando el rango es inválido (hasta antes que desde)', () => {
    expect(buildPeriodo('12/2025', '01/2025').meses).toBe(0);
  });
});

describe('buildIncrementoImpacto', () => {
  it('devuelve vacío sin filas de incremento', () => {
    const out = buildIncrementoImpacto([], mkCtx(), buildPeriodo('01/2025', '12/2025'));
    expect(out.skus).toHaveLength(0);
    expect(out.resumen.nSkus).toBe(0);
  });

  it('con costo anterior en cero, deltaPct es 0 y se marca el flag costo-anterior-cero', () => {
    const rows = [mkIncremento({ costoAnteriorPieza: 0, costoNuevoPieza: 50 })];
    const rf = [mkRF({ mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 500 })];
    const out = buildIncrementoImpacto(rows, mkCtx({}, rf), buildPeriodo('01/2025', '01/2025'));
    expect(out.skus[0].deltaAbs).toBe(50);
    expect(out.skus[0].deltaPct).toBe(0);
    expect(out.skus[0].flags).toContain('costo-anterior-cero');
  });

  it('marca sin-venta-en-periodo y deja impacto en 0 cuando el SKU no facturó dentro del rango', () => {
    const rows = [mkIncremento({ material: 'M1' })];
    // Factura fuera del periodo elegido.
    const rf = [mkRF({ material: 'M1', mesAno: '01/2024', cantidadFacturada: 999, importeFacturado: 99900 })];
    const out = buildIncrementoImpacto(rows, mkCtx({}, rf), buildPeriodo('01/2025', '12/2025'));
    expect(out.skus[0].flags).toContain('sin-venta-en-periodo');
    expect(out.skus[0].cantidadPeriodo).toBe(0);
    expect(out.skus[0].impactoPeriodo).toBe(0);
  });

  it('calcula el incremento promedio ponderado por volumen, no el promedio simple entre SKUs', () => {
    const rows = [
      mkIncremento({ material: 'M-A', costoAnteriorPieza: 100, costoNuevoPieza: 110 }), // +10%
      mkIncremento({ material: 'M-B', costoAnteriorPieza: 100, costoNuevoPieza: 150 }), // +50%
    ];
    const rf = [
      mkRF({ material: 'M-A', mesAno: '01/2025', cantidadFacturada: 900, importeFacturado: 90000 }),
      mkRF({ material: 'M-B', mesAno: '01/2025', cantidadFacturada: 100, importeFacturado: 10000 }),
    ];
    const ctx = mkCtx({ materiales: [mkMaterial({ material: 'M-A' }), mkMaterial({ material: 'M-B' })] }, rf);
    const out = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '01/2025'));
    // ponderado: (0.10*900 + 0.50*100) / 1000 = 0.14 — muy distinto del simple (0.10+0.50)/2 = 0.30
    expect(out.resumen.incrementoPromedioPonderado).toBeCloseTo(0.14, 6);
    expect(out.resumen.incrementoPromedioPonderado).not.toBeCloseTo(0.30, 2);
  });

  it('calcula el precio requerido para sostener el margen actual con el costo nuevo (base LISTA 06)', () => {
    // LISTA 06=150, costoAnt=100 -> margen 33.33%; costoNuevo=110 -> precio requerido = 110/(1-1/3) = 165
    const rows = [mkIncremento({ costoAnteriorPieza: 100, costoNuevoPieza: 110 })];
    const rf = [mkRF({ mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 1500 })];
    const ctx = mkCtx({ materiales: [mkMaterial({ lista06: 150 })] }, rf);
    const out = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '01/2025'));
    expect(out.skus[0].margenActPct).toBeCloseTo(1 / 3, 6);
    expect(out.skus[0].precioRequerido).toBeCloseTo(165, 6);
    expect(out.skus[0].incrementoRequeridoPct).toBeCloseTo(0.1, 6);
  });

  it('usa LISTA 06 del catálogo como base de margen — NO el precio neto histórico', () => {
    const rows = [mkIncremento({ costoAnteriorPieza: 100, costoNuevoPieza: 110 })];
    // Precio neto histórico muy distinto de LISTA 06 (p.ej. venta con descuento fuerte): 70 vs 150.
    const rf = [mkRF({ mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 700 })];
    const ctx = mkCtx({ materiales: [mkMaterial({ lista06: 150 })] }, rf);
    const out = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '01/2025'));
    expect(out.skus[0].precioNeto).toBe(70); // informativo, no debe usarse para margen
    expect(out.skus[0].precioLista06).toBe(150);
    expect(out.skus[0].margenActPct).toBeCloseTo((150 - 100) / 150, 6);
    expect(out.skus[0].margenActPct).not.toBeCloseTo((70 - 100) / 70, 2);
    expect(out.skus[0].precioRequerido).toBeCloseTo(165, 6);
  });

  it('marca sin-precio-lista06 cuando el material está en catálogo pero sin LISTA 06 capturada, y el margen queda en 0', () => {
    const rows = [mkIncremento({})];
    const ctx = mkCtx({ materiales: [mkMaterial({ lista06: 0 })] });
    const out = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '01/2025'));
    expect(out.skus[0].flags).toContain('sin-precio-lista06');
    expect(out.skus[0].margenActPct).toBe(0);
    expect(out.skus[0].precioRequerido).toBe(0);
  });

  it('calcula la cobertura de inventario en meses a la venta mensual promedio del periodo, tomada del reporte de Inventario (Resumen Sin Sugerencias)', () => {
    const rows = [mkIncremento({})];
    const rf = [
      mkRF({ mesAno: '01/2025', cantidadFacturada: 100, importeFacturado: 10000 }),
      mkRF({ mesAno: '02/2025', cantidadFacturada: 100, importeFacturado: 10000 }),
    ];
    const rss = mkRss([{ material: 'M1', sumaInv: 300 }]);
    const ctx = mkCtx({ rss }, rf);
    const out = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '02/2025'));
    expect(out.skus[0].cantidadMensualProm).toBe(100);
    expect(out.skus[0].invPiezas).toBe(300);
    expect(out.skus[0].coberturaMeses).toBeCloseTo(3, 6);
    // El colchón es la utilidad temporal del inventario ya comprado al costo viejo.
    expect(out.skus[0].colchonInventario).toBe(300 * 10);
  });

  it('suma los pedidos pendientes por material y calcula el riesgo al costo anterior', () => {
    const rows = [mkIncremento({ costoAnteriorPieza: 100, costoNuevoPieza: 110 })];
    const rf = [mkRF({ mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 1000 })];
    const sug = mkSugerencia({ materialBase: 'M1', cantidadPendiente: 50, precio: 100 });
    const bo = buildBO([sug], null);
    const out = buildIncrementoImpacto(rows, mkCtx({ bo }, rf), buildPeriodo('01/2025', '01/2025'));
    expect(out.skus[0].pedidoPendientePiezas).toBe(50);
    expect(out.skus[0].riesgoPedidosPendientes).toBe(50 * 10);
  });

  it('adjunta ejecutivo y grupo de cliente en cada entrada de Clientes', () => {
    const rows = [mkIncremento({})];
    const rf = [mkRF({ mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 1000, gpoVdor: 'Z1', gpoCte: 'G1' })];
    const catalog: CatalogSnapshot = {
      ...EMPTY_CATALOG,
      ejecutivos: [mkEjecutivo({ zona: 'Z1', ejecutivo: 'Juan', gpoCte: 'G1', grupoCliente: 'Grupo Norte' })],
    };
    const ctx = mkCtx({ enrich: buildEnrich(catalog) }, rf);
    const out = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '01/2025'));
    expect(out.clientes[0].ejecutivo).toBe('Juan');
    expect(out.clientes[0].grupo).toBe('Grupo Norte');
  });

  it('agrupa el impacto por canal (grupo de cliente) en porCanal', () => {
    const rows = [mkIncremento({})];
    const rf = [
      mkRF({ solicitante: 'S1', mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 1000, gpoCte: 'G1' }),
      mkRF({ solicitante: 'S2', mesAno: '01/2025', cantidadFacturada: 5, importeFacturado: 500, gpoCte: 'G2' }),
    ];
    const catalog: CatalogSnapshot = {
      ...EMPTY_CATALOG,
      ejecutivos: [
        mkEjecutivo({ gpoCte: 'G1', grupoCliente: 'Gobierno' }),
        mkEjecutivo({ gpoCte: 'G2', grupoCliente: 'Distribuidores' }),
      ],
    };
    const out = buildIncrementoImpacto(rows, mkCtx({ enrich: buildEnrich(catalog) }, rf), buildPeriodo('01/2025', '01/2025'));
    const canales = out.porCanal.map((g) => g.key).sort();
    expect(canales).toEqual(['Distribuidores', 'Gobierno']);
    expect(out.porCanal.find((g) => g.key === 'Gobierno')?.piezasPeriodo).toBe(10);
  });

  it('el filtro grupoCliente (canal) acota qué clientes entran a Clientes/porCanal', () => {
    const rows = [mkIncremento({})];
    const rf = [
      mkRF({ solicitante: 'S1', mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 1000, gpoCte: 'G1' }),
      mkRF({ solicitante: 'S2', mesAno: '01/2025', cantidadFacturada: 5, importeFacturado: 500, gpoCte: 'G2' }),
    ];
    const catalog: CatalogSnapshot = {
      ...EMPTY_CATALOG,
      ejecutivos: [
        mkEjecutivo({ gpoCte: 'G1', grupoCliente: 'Gobierno' }),
        mkEjecutivo({ gpoCte: 'G2', grupoCliente: 'Distribuidores' }),
      ],
    };
    const ctx = mkCtx({ enrich: buildEnrich(catalog) }, rf);
    const out = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '01/2025'), { grupoCliente: 'Gobierno' });
    expect(out.clientes.map((c) => c.key)).toEqual(['S1']);
    expect(out.porCanal.map((g) => g.key)).toEqual(['Gobierno']);
  });

  it('el arreglo skus queda ordenado por impacto financiero absoluto descendente', () => {
    const rows = [
      mkIncremento({ material: 'M-CHICO', costoAnteriorPieza: 100, costoNuevoPieza: 101 }), // delta 1
      mkIncremento({ material: 'M-GRANDE', costoAnteriorPieza: 100, costoNuevoPieza: 200 }), // delta 100
    ];
    const rf = [
      mkRF({ material: 'M-CHICO', mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 1000 }),
      mkRF({ material: 'M-GRANDE', mesAno: '01/2025', cantidadFacturada: 10, importeFacturado: 1000 }),
    ];
    const ctx = mkCtx({ materiales: [mkMaterial({ material: 'M-CHICO' }), mkMaterial({ material: 'M-GRANDE' })] }, rf);
    const out = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '01/2025'));
    expect(out.skus.map((s) => s.material)).toEqual(['M-GRANDE', 'M-CHICO']);
  });

  it('dos rangos de distinta longitud con la misma venta mensual dan impacto proporcional al periodo pero el mismo impacto anualizado', () => {
    const rows = [mkIncremento({ costoAnteriorPieza: 50, costoNuevoPieza: 60 })];
    const rf: ResumenFacRow[] = [];
    for (let m = 1; m <= 12; m++) {
      rf.push(mkRF({ mesAno: String(m).padStart(2, '0') + '/2025', cantidadFacturada: 10, importeFacturado: 1000 }));
    }
    const ctx = mkCtx({}, rf);
    const doce = buildIncrementoImpacto(rows, ctx, buildPeriodo('01/2025', '12/2025'));
    const seis = buildIncrementoImpacto(rows, ctx, buildPeriodo('07/2025', '12/2025'));

    expect(doce.skus[0].cantidadPeriodo).toBe(120);
    expect(seis.skus[0].cantidadPeriodo).toBe(60);
    // Impacto del periodo de 6 meses es la mitad del de 12 (misma venta mensual).
    expect(seis.skus[0].impactoPeriodo).toBeCloseTo(doce.skus[0].impactoPeriodo / 2, 6);
    // Impacto anualizado converge al mismo número en ambos rangos.
    expect(seis.skus[0].impactoAnualizado).toBeCloseTo(doce.skus[0].impactoAnualizado, 6);
    expect(doce.skus[0].impactoAnualizado).toBeCloseTo(10 * 120, 6);
  });
});

describe('puntoEquilibrio', () => {
  it('devuelve 0 cuando ni siquiera sin perder volumen se recupera la utilidad actual', () => {
    // Utilidad actual: (100-60)*1000 = 40000. Sin traslado, con costo nuevo:
    // (100-70)*1000 = 30000 < 40000 -> no hay volumen que compense, 0.
    const skus = [mkImpactoSku({
      precioLista06: 100, costoAnteriorPieza: 60, costoNuevoPieza: 70, cantidadPeriodo: 1000, utilidadAct: 40000,
    })];
    expect(puntoEquilibrio(skus, 0)).toBe(0);
  });

  it('calcula la fracción de volumen que se puede perder trasladando el incremento', () => {
    // Utilidad actual: (100-60)*1000 = 40000.
    // Con traslado 15%: (115-70)*1000 = 45000 -> puede perder 1 - 40000/45000 = 11.1%.
    const skus = [mkImpactoSku({
      precioLista06: 100, costoAnteriorPieza: 60, costoNuevoPieza: 70, cantidadPeriodo: 1000, utilidadAct: 40000,
    })];
    expect(puntoEquilibrio(skus, 0.15)).toBeCloseTo(1 - 40000 / 45000, 6);
  });
});

describe('buildEscenarios / defaultEscenarioGrid', () => {
  it('calcula la utilidad de cada celda de la matriz traslado×pérdida de volumen (base LISTA 06)', () => {
    const skus = [mkImpactoSku({
      precioLista06: 100, costoAnteriorPieza: 60, costoNuevoPieza: 70, cantidadPeriodo: 1000, utilidadAct: 40000,
    })];
    const out = buildEscenarios(skus, [{ trasladoPct: 0.1, perdidaVolPct: 0.1 }]);
    // (100*1.1 - 70)*1000*(1-0.1) = 40000*0.9 = 36000
    expect(out[0].utilidad).toBeCloseTo(36000, 6);
    expect(out[0].deltaUtilidadVsActual).toBeCloseTo(36000 - 40000, 6);
  });

  it('el grid por defecto no repite un traslado igual al promedio ponderado', () => {
    const grid = defaultEscenarioGrid(0.05);
    const traslados = new Set(grid.map((g) => g.trasladoPct));
    expect(traslados.size).toBe(3); // 0, 0.03, 0.05 (el promedio coincide con uno ya presente)
  });

  it('deduplica traslados que solo difieren por ruido de punto flotante', () => {
    const grid = defaultEscenarioGrid(0.03 + 1e-12);
    const traslados = [...new Set(grid.map((g) => g.trasladoPct))];
    expect(traslados).toEqual([0, 0.03, 0.05]);
  });

  it('el grid queda ordenado ascendente incluso cuando el promedio ponderado cae entre dos valores fijos', () => {
    const grid = defaultEscenarioGrid(0.02);
    const traslados = [...new Set(grid.map((g) => g.trasladoPct))];
    expect(traslados).toEqual([0, 0.02, 0.03, 0.05]);
  });
});
