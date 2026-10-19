import { describe, it, expect } from 'vitest';
import { agruparFac, ORDEN_NIVELES_FAC, type DispersionMaterial, type RenglonFac } from './facPorNivel';

const disp = (spread: number): DispersionMaterial => ({ spread, precioMin: 10, precioMax: 10 * (1 + spread), clienteMin: 'A', clienteMax: 'B', nClientes: 3 });
const r = (material: string, gerente: string, sector: string, grupo: string, imp: number, cant: number, dispersion: DispersionMaterial | null = null): RenglonFac =>
  ({ material, descripcion: `DESC ${material}`, gerente, sector, grupo, imp, cant, dispersion });

const datos = [
  r('M1', 'Ana', 'GASAS', 'CINTA', 1200, 120, disp(0.5)),
  r('M2', 'Ana', 'GASAS', 'APOSITO', 600, 60),
  r('M3', 'Ana', 'JERINGAS', 'JER 3ML', 300, 30, disp(1.2)),
  r('M4', 'Luis', 'GUANTES', 'LATEX', 2400, 240),
  r('M5', '', '', '', 120, 12),
];

describe('agruparFac · facturación promedio mensual', () => {
  it('el importe y las piezas son el promedio mensual: total de la ventana ÷ meses', () => {
    const n = agruparFac(datos, ['material'], 12, 'facturacion');
    const m1 = n.find((x) => x.clave === 'M1')!;
    expect(m1.imp).toBe(100);
    expect(m1.cant).toBe(10);
  });

  it('por gerente suma sus materiales y ordena de mayor a menor facturación', () => {
    const n = agruparFac(datos, ORDEN_NIVELES_FAC, 6, 'facturacion');
    expect(n.map((x) => x.clave)).toEqual(['Luis', 'Ana', 'Sin gerente']);
    const ana = n.find((x) => x.clave === 'Ana')!;
    expect(ana.imp).toBe((1200 + 600 + 300) / 6);
    expect(ana.materiales).toBe(3);
  });

  it('desglosa gerente → sector → grupo → material', () => {
    const ana = agruparFac(datos, ORDEN_NIVELES_FAC, 6, 'facturacion').find((x) => x.clave === 'Ana')!;
    expect(ana.hijos.map((x) => x.clave)).toEqual(['GASAS', 'JERINGAS']);
    const gasas = ana.hijos[0]!;
    expect(gasas.hijos.map((x) => x.clave)).toEqual(['CINTA', 'APOSITO']);
    expect(gasas.hijos[0]!.hijos.map((x) => x.clave)).toEqual(['M1']);
    expect(gasas.hijos[0]!.hijos[0]!.desc).toBe('DESC M1');
  });

  it('el nivel elegido arranca la jerarquía: por sector solo desglosa hacia grupo y material', () => {
    const n = agruparFac(datos, ORDEN_NIVELES_FAC.slice(1), 6, 'facturacion');
    expect(n.map((x) => x.clave)).toEqual(['GUANTES', 'GASAS', 'JERINGAS', 'Sin sector']);
    expect(n[1]!.hijos.map((x) => x.nivel)).toEqual(['grupoart', 'grupoart']);
  });
});

describe('agruparFac · dispersión de precios', () => {
  it('cuenta los materiales con dispersión y la mayor, también en los niveles de arriba', () => {
    const ana = agruparFac(datos, ORDEN_NIVELES_FAC, 6, 'facturacion').find((x) => x.clave === 'Ana')!;
    expect(ana.conDispersion).toBe(2);
    expect(ana.maxSpread).toBe(1.2);
    expect(agruparFac(datos, ORDEN_NIVELES_FAC, 6, 'facturacion').find((x) => x.clave === 'Luis')!.maxSpread).toBeNull();
  });
  it('el nodo de material trae su dispersión (precios, clientes)', () => {
    const m1 = agruparFac(datos, ['material'], 6, 'facturacion').find((x) => x.clave === 'M1')!;
    expect(m1.dispersion).toMatchObject({ spread: 0.5, clienteMin: 'A', clienteMax: 'B', nClientes: 3 });
  });
  it('ordenado por dispersión deja solo lo que tiene dispersión, de mayor a menor', () => {
    const n = agruparFac(datos, ['material'], 6, 'dispersion');
    expect(n.map((x) => x.clave)).toEqual(['M3', 'M1']);
    expect(agruparFac(datos, ORDEN_NIVELES_FAC, 6, 'dispersion').map((x) => x.clave)).toEqual(['Ana']);
  });
  it('sin datos no hay nodos', () => {
    expect(agruparFac([], ORDEN_NIVELES_FAC, 6, 'facturacion')).toEqual([]);
  });
});
