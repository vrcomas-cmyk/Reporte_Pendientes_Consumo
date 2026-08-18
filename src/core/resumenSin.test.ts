import { describe, it, expect } from 'vitest';
import {
  buildRSS, coberturaEstado, coberturaDeAlmacen, peorCobertura, summarizeCobertura,
  quiebreMitigadoPorTransito, summarizeCoberturaConTransito, esCentroDistribucion, esLento,
  type RSSAlmacen, type RSSCentro,
} from './resumenSin';
import type { ResumenSinSugerenciaRow } from './types';

function mkRow(raw: Record<string, unknown>): ResumenSinSugerenciaRow {
  return {
    centro: String(raw['Centro'] ?? ''),
    almacen: String(raw['Almacen'] ?? ''),
    pedidos: '',
    material: String(raw['Material'] ?? ''),
    descripcion: String(raw['Descripcion'] ?? ''),
    cantidadPendiente: 0,
    importePendiente: 0,
    promedioConsumo12M: Number(raw['Promedio_Consumo_12M'] ?? 0),
    mesesInventario: Number(raw['Meses_Inventario'] ?? 0),
    sumaInventario: Number(raw['Suma inventario'] ?? 0),
    sumaPendiente: 0,
    statusRevision: '',
    fuente: '',
    raw,
  };
}

function mkRawRow(over: Partial<{
  centro: string; almacen: string; material: string; descripcion: string;
  meses: number; promedio: number; sumaInventario: number; inv1030: number;
}>): ResumenSinSugerenciaRow {
  const o = { centro: '1001', almacen: '1030', material: 'M1', descripcion: 'Material Uno', meses: 3, promedio: 10, sumaInventario: 30, inv1030: 30, ...over };
  return mkRow({
    Centro: o.centro, Almacen: o.almacen, Material: o.material, Descripcion: o.descripcion,
    Meses_Inventario: o.meses, Promedio_Consumo_12M: o.promedio, 'Suma inventario': o.sumaInventario,
    'Inv 1030': o.inv1030, 'Inv 1031': 0, 'Inv 1032': 0, 'Inv 1060': 0,
    'Cantidad_Pendiente': 0, 'Importe_Pendiente': 0, 'Ultimo_Mes_Consumo': '', 'Cantidad_Ultimo_Mes': 0,
    'Penultimo_Mes_Consumo': '', 'Cantidad_Penultimo_Mes': 0, 'Cant. en Tránsito': 0,
    'Disponible 1031-1030': 0, 'Disponible 1031-1032': 0, 'Suma pendiente': 0, 'Status Revisión': '', Fuente: '', Pedidos: 0,
  });
}

describe('coberturaEstado', () => {
  it('quiebre: menos de 1 mes de cobertura con consumo activo', () => {
    expect(coberturaEstado(0.5, 10, 5)).toBe('quiebre');
  });
  it('sano: entre 1 y 6 meses (límites inclusive)', () => {
    expect(coberturaEstado(1, 10, 10)).toBe('sano');
    expect(coberturaEstado(6, 10, 60)).toBe('sano');
  });
  it('aceptable: entre 6 y 12 meses (zona gris, sin alerta)', () => {
    expect(coberturaEstado(6.01, 10, 60)).toBe('aceptable');
    expect(coberturaEstado(12, 10, 120)).toBe('aceptable');
  });
  it('exceso: más de 12 meses de cobertura', () => {
    expect(coberturaEstado(12.01, 10, 120)).toBe('exceso');
  });
  it('inmovilizado: sin consumo pero con inventario', () => {
    expect(coberturaEstado(999, 0, 50)).toBe('inmovilizado');
  });
  it('sinDatos: sin consumo ni inventario', () => {
    expect(coberturaEstado(0, 0, 0)).toBe('sinDatos');
  });
});

describe('coberturaDeAlmacen / peorCobertura', () => {
  const alm = (over: Partial<RSSAlmacen>): RSSAlmacen => ({
    alm: '1030', inv: 10, pend: 0, transito: 0, impPend: 0, prom: 5,
    ultMes: '', cantUlt: 0, penMes: '', cantPen: 0, meses: 3, status: '', fuente: '',
    ...over,
  });

  it('coberturaDeAlmacen delega en coberturaEstado con los campos del almacén', () => {
    expect(coberturaDeAlmacen(alm({ meses: 0.2, prom: 5, inv: 1 }))).toBe('quiebre');
  });

  it('peorCobertura elige el estado más urgente entre varios almacenes del mismo centro', () => {
    const co: RSSCentro = {
      centro: '1001', invAlm: { '1030': 0, '1031': 0, '1032': 0, '1060': 0 }, pend: 0, transito: 0, impPend: 0,
      pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map([
        ['1030', alm({ alm: '1030', meses: 3, prom: 5, inv: 15 })], // sano
        ['1031', alm({ alm: '1031', meses: 0.5, prom: 5, inv: 2 })], // quiebre — debe ganar
      ]),
    };
    expect(peorCobertura(co)).toBe('quiebre');
  });

  it('inmovilizado pesa más que exceso al elegir el peor', () => {
    const co: RSSCentro = {
      centro: '1001', invAlm: { '1030': 0, '1031': 0, '1032': 0, '1060': 0 }, pend: 0, transito: 0, impPend: 0,
      pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map([
        ['1030', alm({ alm: '1030', meses: 20, prom: 5, inv: 100 })], // exceso
        ['1031', alm({ alm: '1031', meses: 0, prom: 0, inv: 50 })], // inmovilizado — debe ganar
      ]),
    };
    expect(peorCobertura(co)).toBe('inmovilizado');
  });

  it('undefined cuando el centro no tiene almacenes', () => {
    const co: RSSCentro = { centro: '1001', invAlm: { '1030': 0, '1031': 0, '1032': 0, '1060': 0 }, pend: 0, transito: 0, impPend: 0, pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map() };
    expect(peorCobertura(co)).toBeUndefined();
    expect(peorCobertura(undefined)).toBeUndefined();
  });

  it('centro 1031 (hub de distribución) queda excluido aunque tenga almacenes en quiebre', () => {
    const co: RSSCentro = {
      centro: '1031', invAlm: { '1030': 0, '1031': 0, '1032': 0, '1060': 0 }, pend: 0, transito: 0, impPend: 0,
      pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map([
        ['1031', alm({ alm: '1031', meses: 0.1, prom: 5, inv: 1 })], // sería quiebre en cualquier otro centro
      ]),
    };
    expect(esCentroDistribucion('1031')).toBe(true);
    expect(peorCobertura(co)).toBeUndefined();
  });
});

describe('esLento — excluye el centro 1031', () => {
  it('no marca lento un centro 1031 sin movimiento, aunque cumpla el resto de condiciones', () => {
    const co: RSSCentro = {
      centro: '1031', invAlm: { '1030': 10, '1031': 0, '1032': 0, '1060': 0 }, pend: 0, transito: 0, impPend: 0,
      pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map(),
    };
    expect(esLento(co, 100)).toBe(false);
  });

  it('sí marca lento el mismo escenario en un centro normal', () => {
    const co: RSSCentro = {
      centro: '1001', invAlm: { '1030': 10, '1031': 0, '1032': 0, '1060': 0 }, pend: 0, transito: 0, impPend: 0,
      pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map(),
    };
    expect(esLento(co, 100)).toBe(true);
  });
});

describe('summarizeCobertura', () => {
  it('cuenta por clase e ignora undefined', () => {
    const out = summarizeCobertura(['quiebre', 'quiebre', 'sano', undefined, 'exceso']);
    expect(out).toEqual([
      { estado: 'quiebre', count: 2 },
      { estado: 'inmovilizado', count: 0 },
      { estado: 'exceso', count: 1 },
      { estado: 'aceptable', count: 0 },
      { estado: 'sano', count: 1 },
      { estado: 'sinDatos', count: 0 },
    ]);
  });
});

describe('quiebreMitigadoPorTransito / summarizeCoberturaConTransito', () => {
  const co = (over: Partial<RSSCentro>): RSSCentro => ({
    centro: '1001', invAlm: { '1030': 0, '1031': 0, '1032': 0, '1060': 0 }, pend: 0, transito: 0, impPend: 0,
    pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map(),
    ...over,
  });

  it('un quiebre con tránsito > 0 está mitigado; sin tránsito no', () => {
    expect(quiebreMitigadoPorTransito('quiebre', co({ transito: 10 }))).toBe(true);
    expect(quiebreMitigadoPorTransito('quiebre', co({ transito: 0 }))).toBe(false);
  });

  it('el tránsito no cambia nada si el estado no es quiebre', () => {
    expect(quiebreMitigadoPorTransito('exceso', co({ transito: 10 }))).toBe(false);
    expect(quiebreMitigadoPorTransito('inmovilizado', co({ transito: 10 }))).toBe(false);
  });

  it('sin centro no está mitigado', () => {
    expect(quiebreMitigadoPorTransito('quiebre', undefined)).toBe(false);
  });

  it('separa quiebres urgentes (sin tránsito) de mitigados (con tránsito) en el resumen', () => {
    const pares: { estado: 'quiebre' | 'sano'; co: RSSCentro }[] = [
      { estado: 'quiebre', co: co({ transito: 0 }) }, // urgente
      { estado: 'quiebre', co: co({ transito: 5 }) }, // mitigado
      { estado: 'quiebre', co: co({ transito: 0 }) }, // urgente
      { estado: 'sano', co: co({ transito: 0 }) },
    ];
    const out = summarizeCoberturaConTransito(pares);
    expect(out.quiebreUrgente).toBe(2);
    expect(out.quiebreMitigado).toBe(1);
    expect(out.base.find((s) => s.estado === 'quiebre')?.count).toBe(3);
  });
});

describe('integración con buildRSS (fila real -> almacén -> cobertura)', () => {
  it('clasifica un almacén de quiebre construido desde una fila cruda', () => {
    const rss = buildRSS([mkRawRow({ material: 'M-QUIEBRE', meses: 0.3, promedio: 20, sumaInventario: 6, inv1030: 6 })]);
    const mo = rss.mats.get('M-QUIEBRE')!;
    const co = mo.centros.get('1001')!;
    expect(peorCobertura(co)).toBe('quiebre');
  });
});
