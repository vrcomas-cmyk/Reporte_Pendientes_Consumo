import { describe, it, expect } from 'vitest';
import { promedio12Cerrados, detalle12Cerrados, ayudaPromedio12 } from './promedio12';
import { buildFacMensual, serieFacMensualCam, periodo12Cerrados, mesDeKey } from '@/core/facMensual';
import { hoyMes, mesAnterior, mesKey } from '@/core/resumenFac';
import type { FacMensualCamRow } from '@/core/types';
import type { Analytics } from './AnalyticsContext';

const cam = (mes: string, cantidad: number, over: Partial<FacMensualCamRow> = {}): FacMensualCamRow => ({
  centro: '1001', almacen: '1030', material: 'M1', textoMaterial: '', mesAno: mes, cantidad, importe: cantidad * 10, ...over,
});
type A = Pick<Analytics, 'facMensual' | 'rss'>;
const a = (rows: FacMensualCamRow[], rss: unknown = null) => ({ facMensual: buildFacMensual(rows), rss }) as unknown as A;

describe('periodo12Cerrados', () => {
  it('es una ventana fija de 12 meses que termina en el mes anterior a hoy', () => {
    const per = periodo12Cerrados(buildFacMensual([cam(mesAnterior(hoyMes()), 1)]))!;
    expect(per.hasta).toBe(mesDeKey(mesKey(mesAnterior(hoyMes()))));
    expect(mesKey(per.hasta) - mesKey(per.desde)).toBe(11);
  });
  it('no se recorta al último mes de la hoja (los meses faltantes cuentan 0)', () => {
    const viejo = mesDeKey(mesKey(mesAnterior(hoyMes())) - 3);
    const per = periodo12Cerrados(buildFacMensual([cam(viejo, 5)]))!;
    expect(per.hasta).toBe(mesAnterior(hoyMes()));
    expect(per.ultimoMes).toBe(viejo);
  });
  it('sin hoja no hay periodo', () => expect(periodo12Cerrados(null)).toBeNull());
});

describe('promedio12Cerrados', () => {
  const ult = mesAnterior(hoyMes());
  const rows = [cam(ult, 120), cam(hoyMes(), 9999), cam(ult, 60, { almacen: '1032' }), cam(ult, 12, { centro: '1003' })];
  it('suma los 12 meses cerrados ÷ 12, sin contar el mes en curso', () => {
    expect(promedio12Cerrados(a(rows), 'M1', '1001')).toBe((120 + 60) / 12);
  });
  it('acota a un almacén', () => expect(promedio12Cerrados(a(rows), 'M1', '1001', '1032')).toBe(60 / 12));
  it('con Fac_Mensual_CAM cargada es la única fuente: un par sin ventas es 0, no el valor de Resumen Sin', () => {
    const rss = { mats: new Map([['M1', { centros: new Map([['1004', { alm: new Map([['1030', { prom: 7 }]]) }]]) }]]) };
    expect(promedio12Cerrados(a(rows, rss), 'M1', '1004', '1030')).toBe(0);
  });
  it('sin Fac_Mensual_CAM cae al Promedio_Consumo_12M de Resumen Sin', () => {
    const rss = { mats: new Map([['M1', { centros: new Map([['1004', { alm: new Map([['1030', { prom: 7 }], ['1032', { prom: 3 }]]) }]]) }]]) };
    const sinCam = { facMensual: null, rss } as unknown as A;
    expect(promedio12Cerrados(sinCam, 'M1', '1004')).toBe(10);
    expect(promedio12Cerrados(sinCam, 'M1', '1004', '1030')).toBe(7);
  });
  it('sin ninguna fuente = 0', () => expect(promedio12Cerrados(a([]), 'M1', '1001')).toBe(0));
  it('la ayuda avisa si la hoja no llega al fin de la ventana', () => {
    const viejo = mesDeKey(mesKey(mesAnterior(hoyMes())) - 3);
    expect(ayudaPromedio12(detalle12Cerrados(a([cam(viejo, 12)]), 'M1', '1001'))).toContain('la hoja llega hasta');
  });
});

describe('serieFacMensualCam', () => {
  it('serie con cantidad e importe, acotada a centro+almacén', () => {
    const s = serieFacMensualCam([cam('01/2026', 5), cam('01/2026', 5, { almacen: '1032' }), cam('02/2026', 3)], { material: 'M1', centro: '1001', almacen: '1030' });
    expect(s).toEqual([{ mes: '01/2026', cant: 5, imp: 50 }, { mes: '02/2026', cant: 3, imp: 30 }]);
  });
});
