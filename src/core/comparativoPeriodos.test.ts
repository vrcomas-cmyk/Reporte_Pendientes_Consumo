import { describe, expect, it } from 'vitest';
import { agregarSerie, compararPeriodos, extremosDePrecio, desplazarMes, periodoAnioEnCurso, serieMensualMaterial, ultimosMesesCerrados, desplazarPeriodo, opcionesPeriodo, periodoAnterior, variacionPct } from './comparativoPeriodos';
import { buildEnrich } from './enrich';
import { buildRF } from './resumenFac';
import type { CatalogSnapshot, ResumenFacRow } from './types';

const fila = (material: string, mesAno: string, cant: number, imp: number): ResumenFacRow => ({
  solicitante: 'S1', razonSocial: 'R', destinatario: 'D1', material, textoMaterial: `Mat ${material}`, mesAno,
  cantidadFacturada: cant, importeFacturado: imp, gpoCte: 'G', gpoVdor: 'V', centro: '1018',
}) as unknown as ResumenFacRow;

const catalogo = {
  ejecutivos: [],
  materiales: [
    { material: '100', descrSector: 'Suturas', descrGrupoArt: 'Seda', textoBreve: 'Sutura seda' },
    { material: '200', descrSector: 'Suturas', descrGrupoArt: 'Nylon', textoBreve: 'Sutura nylon' },
    { material: '300', descrSector: 'Guantes', descrGrupoArt: 'Latex', textoBreve: 'Guante' },
  ],
  invConsolidado: [],
  gerenciaMarca: [{ sector: 'Suturas', gerente: 'Ana' }, { sector: 'Guantes', gerente: 'Luis' }],
} as unknown as CatalogSnapshot;

describe('periodos', () => {
  it('desplaza meses y arma el periodo anterior del mismo largo', () => {
    expect(desplazarMes('01/2026', -1)).toBe('12/2025');
    expect(desplazarPeriodo({ desde: '01/2026', hasta: '03/2026' }, -12)).toEqual({ desde: '01/2025', hasta: '03/2025' });
    expect(periodoAnterior({ desde: '04/2026', hasta: '06/2026' })).toEqual({ desde: '01/2026', hasta: '03/2026' });
    expect(periodoAnterior({ desde: '01/2026', hasta: '12/2026' })).toEqual({ desde: '01/2025', hasta: '12/2025' });
  });
  it('opciones de mes, trimestre y año con datos, del más reciente al más antiguo', () => {
    const meses = ['11/2025', '01/2026', '02/2026', '05/2026'];
    expect(opcionesPeriodo('mes', meses).map((o) => o.etiqueta)).toEqual(['May 2026', 'Feb 2026', 'Ene 2026', 'Nov 2025']);
    expect(opcionesPeriodo('trimestre', meses).map((o) => o.etiqueta)).toEqual(['T2 2026', 'T1 2026', 'T4 2025']);
    expect(opcionesPeriodo('trimestre', meses)[1]).toMatchObject({ desde: '01/2026', hasta: '03/2026' });
    expect(opcionesPeriodo('anio', meses).map((o) => o.etiqueta)).toEqual(['2026', '2025']);
  });
});

describe('agregarSerie (precios)', () => {
  const serie = [
    { mes: '01/2026', cant: 10, imp: 100 }, // 10
    { mes: '02/2026', cant: 10, imp: 150 }, // 15
    { mes: '03/2026', cant: 20, imp: 200 }, // 10
    { mes: '04/2026', cant: 5, imp: 100 }, // fuera del periodo
  ];
  it('venta, cantidad y precio mínimo / máximo mensual / promedio del periodo', () => {
    const a = agregarSerie(serie, { desde: '01/2026', hasta: '03/2026' });
    expect(a).toMatchObject({ imp: 450, cant: 40 });
    expect(a.precio.min).toBe(10);
    expect(a.precio.max).toBe(15);
    expect(a.precio.prom).toBeCloseTo(450 / 40);
    expect(a.precio.meses).toBe(3);
  });
  it('sin ventas en el periodo: ceros', () => {
    expect(agregarSerie(serie, { desde: '07/2026', hasta: '07/2026' })).toMatchObject({ imp: 0, cant: 0, precio: { prom: 0, min: 0, max: 0 } });
  });
  it('una devolución (cantidad negativa) resta venta pero no cuenta para precios', () => {
    const a = agregarSerie([{ mes: '01/2026', cant: 10, imp: 100 }, { mes: '02/2026', cant: -2, imp: -20 }], { desde: '01/2026', hasta: '02/2026' });
    expect(a).toMatchObject({ imp: 80, cant: 8 });
    expect(a.precio).toMatchObject({ prom: 10, min: 10, max: 10, meses: 1 });
  });
});

describe('compararPeriodos', () => {
  const rf = buildRF([
    fila('100', '01/2026', 10, 100), fila('100', '02/2026', 10, 200),
    fila('200', '01/2026', 5, 50), fila('200', '02/2026', 5, 25),
    fila('300', '02/2026', 4, 40),
  ]);
  const enrich = buildEnrich(catalogo);
  const A = { desde: '01/2026', hasta: '01/2026' };
  const B = { desde: '02/2026', hasta: '02/2026' };

  it('por gerencia: suma sus sectores y calcula variaciones', () => {
    const r = compararPeriodos(rf, enrich, A, B, 'gerente');
    const ana = r.filas.find((f) => f.clave === 'Ana')!;
    expect(ana.a.imp).toBe(150);
    expect(ana.b.imp).toBe(225);
    expect(ana.dImp).toBe(75);
    expect(ana.dImpPct).toBeCloseTo(50);
    expect(r.total.b.imp).toBe(265);
    expect(r.materiales).toBe(3);
  });
  it('baja al nivel siguiente con la ruta (gerente → sector → grupo → material)', () => {
    const r = compararPeriodos(rf, enrich, A, B, 'material', { gerente: 'Ana', sector: 'Suturas', grupo: 'Nylon' });
    expect(r.filas.map((f) => f.clave)).toEqual(['200']);
    expect(r.filas[0]!.precios!.a.prom).toBe(10);
    expect(r.filas[0]!.precios!.b.prom).toBe(5);
    expect(r.filas[0]!.precios!.dPromPct).toBeCloseTo(-50);
  });
  it('materiales pegados: trae solo esos y avisa los que no tienen venta', () => {
    const r = compararPeriodos(rf, enrich, A, B, 'material', {}, ['100', '999', '0300']);
    expect(r.filas.map((f) => f.clave).sort()).toEqual(['100', '300']);
    expect(r.faltantes).toEqual(['999']);
  });
  it('variacionPct', () => {
    expect(variacionPct(100, 150)).toBe(50);
    expect(variacionPct(0, 10)).toBe(100);
    expect(variacionPct(0, 0)).toBe(0);
  });
});

describe('un solo periodo (sin comparar)', () => {
  const rf = buildRF([fila('100', '01/2026', 10, 100), fila('100', '02/2026', 10, 80), fila('100', '04/2026', 10, 120)]);
  const enrich = buildEnrich(catalogo);

  it('con A en null solo trae el periodo B y los meses del mínimo / máximo', () => {
    const r = compararPeriodos(rf, enrich, null, { desde: '01/2026', hasta: '04/2026' }, 'material');
    const f = r.filas[0]!;
    expect(f.a).toEqual({ imp: 0, cant: 0 });
    expect(f.b).toEqual({ imp: 300, cant: 30 });
    expect(f.precios!.b).toMatchObject({ min: 8, mesMin: '02/2026', max: 12, mesMax: '04/2026', meses: 3 });
  });
  it('año en curso = enero del último año con datos hasta el último mes con datos', () => {
    expect(periodoAnioEnCurso(['11/2025', '01/2026', '05/2026'])).toEqual({ desde: '01/2026', hasta: '05/2026' });
    expect(periodoAnioEnCurso([])).toBeNull();
  });
  it('últimos meses cerrados no cuentan el mes en curso', () => {
    const meses = ['01/2026', '02/2026', '03/2026', '04/2026', '05/2026'];
    expect(ultimosMesesCerrados(meses, 3, new Date(2026, 4, 15))).toEqual({ desde: '02/2026', hasta: '04/2026' }); // hoy = mayo: mayo no cuenta
    expect(ultimosMesesCerrados(meses, 3, new Date(2026, 5, 2))).toEqual({ desde: '03/2026', hasta: '05/2026' }); // hoy = junio: mayo ya cerró
    expect(ultimosMesesCerrados([], 3)).toBeNull();
  });
  it('mes a mes de un material incluye los meses sin venta en cero', () => {
    const s = serieMensualMaterial(rf, '100', { desde: '01/2026', hasta: '04/2026' });
    expect(s.map((x) => x.mes)).toEqual(['01/2026', '02/2026', '03/2026', '04/2026']);
    expect(s[2]).toEqual({ mes: '03/2026', cant: 0, imp: 0, precio: 0 });
    expect(s[1]!.precio).toBe(8);
  });
});

describe('mínimo y máximo por fila de facturación (no por promedio mensual)', () => {
  const f = (dest: string, mes: string, cant: number, imp: number) => ({ ...fila('500', mes, cant, imp), destinatario: dest, razonSocial: `Cliente ${dest}` }) as ResumenFacRow;
  const rf = buildRF([f('D1', '01/2026', 10, 100), f('D2', '01/2026', 10, 60), f('D1', '02/2026', 10, 90)]); // ene: 10 y 6 → promedio 8; feb: 9
  const enrich = buildEnrich(catalogo);
  const P = { desde: '01/2026', hasta: '02/2026' };

  it('el mínimo es el de la fila más barata (6), no el del mejor promedio mensual (8)', () => {
    const ext = extremosDePrecio(rf).get('500');
    const conFilas = agregarSerie(rf.mat.get('500'), P, ext);
    const soloPromedio = agregarSerie(rf.mat.get('500'), P);
    expect(soloPromedio.precio.min).toBe(8);
    expect(conFilas.precio.min).toBe(6);
    expect(conFilas.precio.mesMin).toBe('01/2026');
    expect(conFilas.precio.refMin).toContain('Cliente D2');
    expect(conFilas.precio.max).toBe(10);
    expect(conFilas.precio.prom).toBeCloseTo(250 / 30); // el promedio sigue siendo importe ÷ cantidad del periodo
  });
  it('compararPeriodos usa los extremos de las filas', () => {
    const r = compararPeriodos(rf, enrich, null, P, 'material', {}, ['500']);
    expect(r.filas[0]!.precios!.b).toMatchObject({ min: 6, max: 10 });
  });
  it('un periodo sin esa fila no la cuenta', () => {
    const feb = agregarSerie(rf.mat.get('500'), { desde: '02/2026', hasta: '02/2026' }, extremosDePrecio(rf).get('500'));
    expect(feb.precio).toMatchObject({ min: 9, max: 9 });
  });
});

describe('mínimo y máximo con el precio de las líneas (libros nuevos)', () => {
  const f = (cant: number, imp: number, precioMin: number, precioMax: number) => ({ ...fila('102000', '09/2026', cant, imp), razonSocial: 'Cliente X', precioMin, precioMax }) as ResumenFacRow;
  it('usa el menor / mayor precio de las líneas, no el promedio de la fila', () => {
    const rf = buildRF([f(20, 1261.5, 61.15, 65)]); // promedio de la fila 63.075; la línea más barata costó 61.15
    const e = buildEnrich(catalogo);
    const r = compararPeriodos(rf, e, null, { desde: '09/2026', hasta: '09/2026' }, 'material', {}, ['102000']);
    expect(r.filas[0]!.precios!.b).toMatchObject({ min: 61.15, max: 65 });
    expect(r.filas[0]!.precios!.b.prom).toBeCloseTo(63.075);
  });
});
