import { describe, it, expect } from 'vitest';
import { esCondicionCortaCaducidad, almacenesDeCondicion, ALMACENES_GENERALES, ALMACEN_CADUCIDAD_CONDICION, evaluarCortaCaducidad } from './inventoryRules';

describe('esCondicionCortaCaducidad (RN-INV-002)', () => {
  it('reconoce variantes con "caducidad" en el texto', () => {
    expect(esCondicionCortaCaducidad('Corta caducidad')).toBe(true);
    expect(esCondicionCortaCaducidad('CADUCIDAD PRÓXIMA')).toBe(true);
    expect(esCondicionCortaCaducidad('caducidad')).toBe(true);
  });
  it('no marca condiciones sin "caducidad"', () => {
    expect(esCondicionCortaCaducidad('Normal')).toBe(false);
    expect(esCondicionCortaCaducidad('Lento movimiento')).toBe(false);
    expect(esCondicionCortaCaducidad('Cosmopark')).toBe(false);
    expect(esCondicionCortaCaducidad('')).toBe(false);
    expect(esCondicionCortaCaducidad(null)).toBe(false);
    expect(esCondicionCortaCaducidad(undefined)).toBe(false);
  });
});

describe('almacenesDeCondicion (RN-INV-002)', () => {
  it('solo 1032 cuando la condición es de caducidad', () => {
    expect(almacenesDeCondicion('Corta caducidad')).toEqual([ALMACEN_CADUCIDAD_CONDICION]);
  });
  it('1030+1031+1060 en cualquier otro caso', () => {
    expect(almacenesDeCondicion('Normal')).toEqual(ALMACENES_GENERALES);
    expect(almacenesDeCondicion('Cosmopark')).toEqual(ALMACENES_GENERALES);
    expect(almacenesDeCondicion('')).toEqual(ALMACENES_GENERALES);
  });
});

describe('evaluarCortaCaducidad (RN-INV-001, regresión)', () => {
  it('sigue funcionando con la extensión de RN-INV-002', () => {
    const r = evaluarCortaCaducidad('2020-01-01', '1030', new Date('2024-01-01'));
    expect(r.esCortaCaducidad).toBe(true);
    expect(r.motivo).toBe('VIGENCIA');
  });
});
