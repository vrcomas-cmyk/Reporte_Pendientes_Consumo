import { describe, it, expect } from 'vitest';
import {
  normalizeCondicion, condicionDeMaterial, condicionEfectivaMaterial,
  condicionTextoEfectivo, condicionesDisponibles, condicionPorMaterialIndex, lotesParaAlertas, candidatasSinCobertura,
  type OportunidadCandidata,
} from './oportunidad';
import type { BOItem } from './buildBO';
import type { Sugerencia, InvConsolidadoRow } from './types';

function mkSugerencia(over: Partial<Sugerencia>): Sugerencia {
  return {
    gpoCte: '', fecha: '', oc: '', pedido: '', gpoVdor: '', solicitante: '', destinatario: '', razonSocial: '',
    centroPedido: '', almacen: '', materialSolicitado: '', materialBase: 'MAT-A', descripcionSolicitada: '',
    cantidadPedido: 0, cantidadPendiente: 0, cantidadOfertar: 0, precio: 0, consumoPromedio: 0, fuente: '',
    materialSugerido: '', descripcionSugerida: '', centroSugerido: '', almacenSugerido: '', disponible: 0,
    lote: '', fechaCaducidad: '', mesesVigenciaLote: 0, centroInv: '', mesesInventario: 0, promedioConsumo12M: 0,
    cantTransito: 0, bloqueado: '', invByCenter: {}, raw: {},
    ...over,
  };
}

function mkBOItem(fuentes: Sugerencia[]): BOItem {
  return {
    bo: mkSugerencia({}), fuentes, k: '', serie: [], consumoProm: 0,
    status: { key: '', label: '', cls: '', pct: 0 }, tend: { dir: 'flat', txt: '' },
    cons: { tipo: 'sinDatos' } as unknown as BOItem['cons'],
  };
}

function mkInvRow(over: Partial<InvConsolidadoRow>): InvConsolidadoRow {
  return { material: 'MAT-A', textoBreve: '', condicion: '', sector: '', grupo: '', precioOferta: 0, invSuma: 0, ...over } as InvConsolidadoRow;
}

describe('normalizeCondicion', () => {
  it('reconoce las 4 condiciones especiales por texto libre, y "normal" para el resto', () => {
    expect(normalizeCondicion('Corta Caducidad')).toBe('corta-caducidad');
    expect(normalizeCondicion('Lento movimiento')).toBe('lento-movimiento');
    expect(normalizeCondicion('Calidad')).toBe('calidad');
    expect(normalizeCondicion('Dañado')).toBe('danado');
    expect(normalizeCondicion('Danado')).toBe('danado');
    expect(normalizeCondicion('cualquier otra cosa')).toBe('normal');
    expect(normalizeCondicion('')).toBe('normal');
  });
});

describe('condicionDeMaterial (columna Condición de Inv Condición)', () => {
  it('toma la condición de la fila de Inv Condición que corresponde al material', () => {
    const inv = [mkInvRow({ material: 'MAT-A', condicion: 'Lento Movimiento' })];
    expect(condicionDeMaterial('MAT-A', inv)).toBe('lento-movimiento');
  });

  it('normal si el material no aparece o no trae condición', () => {
    expect(condicionDeMaterial('MAT-A', [])).toBe('normal');
    expect(condicionDeMaterial('MAT-A', [mkInvRow({ material: 'MAT-A', condicion: '' })])).toBe('normal');
  });
});

describe('condicionEfectivaMaterial (Fuentes de Pedidos + Condición de Inv Condición)', () => {
  it('prioriza la Fuente de Pedidos sobre la Condición de Inv Condición', () => {
    const sug = [mkBOItem([mkSugerencia({ fuente: 'Corta Caducidad' })])];
    const inv = [mkInvRow({ condicion: 'Normal' })];
    expect(condicionEfectivaMaterial('MAT-A', sug, inv)).toBe('corta-caducidad');
  });

  it('sin Fuente clasificable en Pedidos, cae a la columna Condición de Inv Condición', () => {
    const sug = [mkBOItem([mkSugerencia({ fuente: '' })])];
    const inv = [mkInvRow({ condicion: 'Dañado' })];
    expect(condicionEfectivaMaterial('MAT-A', sug, inv)).toBe('danado');
  });

  it('revisa todas las fuentes de todos los BOItem, no solo la primera', () => {
    const sug = [
      mkBOItem([mkSugerencia({ fuente: '' })]),
      mkBOItem([mkSugerencia({ fuente: '' }), mkSugerencia({ fuente: 'Lento Movimiento' })]),
    ];
    expect(condicionEfectivaMaterial('MAT-A', sug, [])).toBe('lento-movimiento');
  });

  it('normal cuando ni Pedidos ni Inv Condición aportan nada', () => {
    expect(condicionEfectivaMaterial('MAT-A', [], [])).toBe('normal');
  });
});

describe('condicionTextoEfectivo (texto real, no la categoría normalizada)', () => {
  it('devuelve el texto real aunque no encaje en ninguna de las 4 categorías conocidas — caso "Cosmopark"/"PNC"', () => {
    const sug = [mkBOItem([mkSugerencia({ fuente: 'Cosmopark' })])];
    expect(condicionTextoEfectivo('MAT-A', sug, [])).toBe('Cosmopark');
    expect(normalizeCondicion('Cosmopark')).toBe('normal'); // confirma que el regex de 4 categorías no lo reconoce
  });

  it('cae a Inv Condición cuando Pedidos no aporta fuente', () => {
    const inv = [mkInvRow({ condicion: 'PNC' })];
    expect(condicionTextoEfectivo('MAT-A', [], inv)).toBe('PNC');
  });

  it('null cuando ninguna fuente aporta texto', () => {
    expect(condicionTextoEfectivo('MAT-A', [], [])).toBeNull();
  });
});

describe('condicionesDisponibles', () => {
  it('junta los valores reales de Fuente (Pedidos) e Inv Condición, sin duplicar por mayúsculas/espacios', () => {
    const sug = [mkBOItem([mkSugerencia({ fuente: 'Cosmopark' }), mkSugerencia({ fuente: ' cosmopark ' })])];
    const inv = [mkInvRow({ condicion: 'PNC' }), mkInvRow({ material: 'MAT-B', condicion: 'Corta Caducidad' })];
    expect(condicionesDisponibles(sug, inv).sort()).toEqual(['Corta Caducidad', 'Cosmopark', 'PNC'].sort());
  });
});

describe('condicionPorMaterialIndex + lotesParaAlertas — conserva el texto real aunque la categoría sea "normal"', () => {
  it('un material con condición "Cosmopark" queda indexado con su texto, aunque normalice a "normal"', () => {
    const idx = condicionPorMaterialIndex([], [mkInvRow({ material: 'MAT-A', condicion: 'Cosmopark' })]);
    expect(idx.get('MAT-A')).toEqual({ categoria: 'normal', texto: 'Cosmopark' });
  });

  it('lotesParaAlertas propaga condicion (categoría) y condicionTexto por separado', () => {
    const idx = condicionPorMaterialIndex([], [mkInvRow({ material: 'MAT-A', condicion: 'Cosmopark' })]);
    const lotes = lotesParaAlertas([{ material: 'MAT-A', textoBreve: '', centro: '', almacen: '', lote: 'L1', fechaCaducidad: null, cantidadDisp: 5 }], idx);
    expect(lotes[0]).toMatchObject({ condicion: 'normal', condicionTexto: 'Cosmopark', cantidadDisponible: 5 });
  });

  it('lotesParaAlertas propaga almacen y la fecha cruda de caducidad (no solo los días derivados)', () => {
    const idx = condicionPorMaterialIndex([], []);
    const lotes = lotesParaAlertas([{ material: 'MAT-A', textoBreve: '', centro: 'C1', almacen: 'AL1', lote: 'L1', fechaCaducidad: '2026-12-01', cantidadDisp: 5 }], idx);
    expect(lotes[0]).toMatchObject({ centro: 'C1', almacen: 'AL1', fechaCaducidad: '2026-12-01' });
  });
});

function mkCandidata(over: Partial<OportunidadCandidata>): OportunidadCandidata {
  return {
    material: 'MAT-A', descripcion: '', condicion: 'corta-caducidad', cantidadDisponible: 10,
    fechaCaducidad: null, precioOferta: 0, diasVigencia: 30, ...over,
  };
}

describe('candidatasSinCobertura', () => {
  it('excluye los materiales que ya tienen cliente candidato y agrupa el resto por material', () => {
    const candidatas = [
      mkCandidata({ material: 'MAT-A', lote: 'L1' } as Partial<OportunidadCandidata>),
      mkCandidata({ material: 'MAT-A', lote: 'L2', cantidadDisponible: 5, diasVigencia: 10 } as Partial<OportunidadCandidata>),
      mkCandidata({ material: 'MAT-B', lote: 'L3' } as Partial<OportunidadCandidata>),
    ];
    const out = candidatasSinCobertura(candidatas, new Set(['MAT-B']));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ material: 'MAT-A', lotesCount: 2, cantidadDisponible: 15, diasVigencia: 10 });
  });
});
