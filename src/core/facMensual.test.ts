import { describe, it, expect } from 'vitest';
import { buildFacMensual, promedioPeriodo, rangoDisponible, mesDeKey } from './facMensual';
import { mesKey } from './resumenFac';
import { mapFacMensualCam } from './mappers';
import { roleOf } from './roleDetection';
import type { FacMensualCamRow } from './types';

const row = (o: Partial<FacMensualCamRow>): FacMensualCamRow => ({
  centro: '1001', almacen: '1030', material: 'M1', textoMaterial: 'Mat 1', mesAno: '01/2026', cantidad: 10, importe: 100, ...o,
});

describe('facMensual · promedioPeriodo', () => {
  const idx = buildFacMensual([
    row({ mesAno: '01/2026', cantidad: 10 }),
    row({ mesAno: '03/2026', cantidad: 20 }),
    row({ centro: '1002', almacen: '1030', mesAno: '02/2026', cantidad: 30 }),
    row({ almacen: '1031', mesAno: '02/2026', cantidad: 5 }),
    row({ material: 'M2', mesAno: '01/2026', cantidad: 99 }),
  ]);

  it('material: suma todos los centros/almacenes y divide entre los meses de calendario', () => {
    const r = promedioPeriodo(idx, { material: 'M1' }, '01/2026', '03/2026');
    expect(r.total).toBe(65);
    expect(r.meses).toBe(3);
    expect(r.promedio).toBeCloseTo(65 / 3, 6);
  });

  it('material·centro acota al centro', () => {
    const r = promedioPeriodo(idx, { material: 'M1', centro: '1001' }, '01/2026', '03/2026');
    expect(r.total).toBe(35);
    expect(r.promedio).toBeCloseTo(35 / 3, 6);
  });

  it('material·centro·almacén acota al almacén', () => {
    const r = promedioPeriodo(idx, { material: 'M1', centro: '1001', almacen: '1030' }, '01/2026', '03/2026');
    expect(r.total).toBe(30);
    expect(r.mesesConDato).toBe(2);
    expect(r.promedio).toBe(10);
  });

  it('los meses sin facturación cuentan como 0 en el denominador', () => {
    const r = promedioPeriodo(idx, { material: 'M1', centro: '1001', almacen: '1030' }, '01/2026', '06/2026');
    expect(r.meses).toBe(6);
    expect(r.promedio).toBe(5);
  });

  it('cruza el cambio de año sin saltarse meses', () => {
    const r = promedioPeriodo(buildFacMensual([row({ mesAno: '12/2025', cantidad: 12 })]), { material: 'M1' }, '11/2025', '02/2026');
    expect(r.meses).toBe(4);
    expect(r.promedio).toBe(3);
  });

  it('rango fuera de datos, invertido o incompleto → 0', () => {
    expect(promedioPeriodo(idx, { material: 'M1' }, '01/2030', '03/2030').promedio).toBe(0);
    expect(promedioPeriodo(idx, { material: 'M1' }, '03/2026', '01/2026').meses).toBe(0);
    expect(promedioPeriodo(idx, { material: 'M1' }, '', '03/2026').meses).toBe(0);
    expect(promedioPeriodo(idx, { material: 'NOEXISTE' }, '01/2026', '03/2026').promedio).toBe(0);
    expect(promedioPeriodo(null, { material: 'M1' }, '01/2026', '03/2026').promedio).toBe(0);
  });

  it('mesDeKey invierte mesKey, incluido diciembre', () => {
    expect(mesDeKey(mesKey('12/2025'))).toBe('12/2025');
    expect(mesDeKey(mesKey('01/2026'))).toBe('01/2026');
  });

  it('rangoDisponible devuelve primer y último mes cargados', () => {
    const r = rangoDisponible(idx)!;
    expect(r.max - r.min).toBe(2);
    expect(rangoDisponible(buildFacMensual([]))).toBeNull();
  });
});

describe('Fac_Mensual_CAM · detección y mapeo', () => {
  const headers = ['Centro', 'Almacén', 'Material', 'Texto de material', 'Periodo', 'Mes y año', 'Cantidad facturada', 'Importe facturado'];

  it('se detecta como facMensualCam, no como resumenFac', () => {
    expect(roleOf(headers)).toBe('facMensualCam');
  });

  it('Resumen_Fac sigue detectándose como resumenFac', () => {
    expect(roleOf(['Solicitante', 'Material', 'Mes y año', 'Cantidad facturada', 'Importe facturado', 'Centro'])).toBe('resumenFac');
  });

  it('mapFacMensualCam toma "Mes y año" (no "Periodo") y tolera Almacen sin acento', () => {
    const r = mapFacMensualCam({
      Centro: '1001', Almacen: '1030', Material: 'M1', 'Texto de material': 'X', Periodo: '2026', 'Mes y año': '7/2026',
      'Cantidad facturada': '1,234', 'Importe facturado': '$ 99.5',
    });
    expect(r).toMatchObject({ centro: '1001', almacen: '1030', material: 'M1', mesAno: '07/2026', cantidad: 1234, importe: 99.5 });
  });
});
