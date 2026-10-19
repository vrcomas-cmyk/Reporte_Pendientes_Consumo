import { describe, it, expect } from 'vitest';
import {
  analisisPrecio, calcularPrecioBase, calcularPrecioOferta, combinacionDe, tramoCcDe, percentilPonderado, pisoDuro, precioValido, resolverMargenMin,
  POLITICA_DEFECTO, type Politica,
} from './politicaPrecios';

const params = { margenMin: 0.15, margenObjetivo: 0.3 };
// Costo 50; clave a 70 (mucho volumen), mercado 80, esporádico a 100.
const precios = [{ valor: 70, peso: 500 }, { valor: 80, peso: 300 }, { valor: 100, peso: 20 }];
// 6 facturas = suficientes para confiar en la mediana del material.
const muchos = Array.from({ length: 6 }, () => ({ valor: 80, peso: 10 }));

describe('combinacionDe / tramoCcDe', () => {
  it('ordena CC, Status (alfabético) y PNC; deduplica', () => {
    expect(combinacionDe(['PNC', 'CC'])).toBe('CC + PNC');
    expect(combinacionDe(['PNC', 'Zeta', 'CC', 'Alfa'])).toBe('CC + Alfa + Zeta + PNC');
    expect(combinacionDe(['LM', 'LM'])).toBe('LM');
    expect(combinacionDe([])).toBe('');
  });
  it('tramos de caducidad', () => {
    expect(tramoCcDe(2)).toBe('<=3');
    expect(tramoCcDe(5)).toBe('<=6');
    expect(tramoCcDe(12)).toBe('<=12');
    expect(tramoCcDe(13)).toBe('');
    expect(tramoCcDe(null)).toBe('');
  });
});

describe('percentilPonderado', () => {
  it('pondera por volumen', () => {
    expect(percentilPonderado(precios, 0.5)).toBe(70);
    expect(percentilPonderado(precios, 0.99)).toBe(100);
    expect(percentilPonderado([], 0.5)).toBe(0);
  });
});

describe('calcularPrecioBase · el punto medio es la mediana (P50)', () => {
  it('con suficientes facturas la base es la mediana del material', () => {
    const b = calcularPrecioBase({ costo: 50, precios: muchos }, params);
    expect(b.base).toBe(80);
    expect(b.origenBase).toBe('mercado-p50');
  });
  it('con pocas facturas usa la razón precio/costo del grupo aplicada al costo', () => {
    const b = calcularPrecioBase({ costo: 50, precios: [{ valor: 60, peso: 1 }], ref: { razon: 1.6, origen: 'grupo' } }, params);
    expect(b.base).toBe(80);
    expect(b.origenBase).toBe('grupo');
  });
  it('sin ninguna referencia usa el margen objetivo', () => {
    const b = calcularPrecioBase({ costo: 50, precios: [] }, params);
    expect(b.origenBase).toBe('sin-historial');
    expect(b.base).toBeCloseTo(71.43, 2);
    expect(b.flags).toContain('sin-historial');
  });
  it('sin costo no hay precio', () => {
    expect(calcularPrecioBase({ costo: 0, precios: muchos }, params).base).toBeNull();
  });
  it('tope LISTA 06: la base no la supera', () => {
    const b = calcularPrecioBase({ costo: 50, precios: [{ valor: 120, peso: 10 }, ...muchos.map((m) => ({ ...m, valor: 120 }))], lista06: 100 }, params);
    expect(b.origenBase).toBe('tope-lista06');
    expect(b.base).toBe(100);
  });
  it('el margen mínimo sube una base que quedó muy baja', () => {
    const b = calcularPrecioBase({ costo: 50, precios: muchos.map((m) => ({ ...m, valor: 52 })) }, params);
    expect(b.origenBase).toBe('piso-margen');
    expect(b.base).toBeCloseTo(58.83, 2); // 50 / (1 − 15 %)
  });
  it('Mín/Máx reales sobreescriben a los de los puntos', () => {
    const b = calcularPrecioBase({ costo: 50, precios, minReal: 66, maxReal: 130 }, params);
    expect([b.min, b.max]).toEqual([66, 130]);
  });
});

describe('calcularPrecioOferta · cede un % del MARGEN', () => {
  // base 80, costo 50 → margen de 30. CC ≤6 meses cede 50 % → 65.
  const of = (banderas: string[], mesesCc?: number, pol: Politica = POLITICA_DEFECTO, extra = {}) =>
    calcularPrecioOferta({ base: 80, costo: 50, sector: '17', banderas, mesesCc, ...extra }, pol)!;

  it('el precio es costo + margen × (1 − cede): 25 / 50 / 75 % de corta caducidad', () => {
    expect(of(['CC'], 11).precio).toBe(72.5);
    expect(of(['CC'], 5).precio).toBe(65);
    expect(of(['CC'], 2).precio).toBe(57.5);
  });
  it('los % se apilan y cada condición adicional cede más', () => {
    const pol: Politica = { ...POLITICA_DEFECTO, condiciones: { LM: { incluida: true, pctCede: 0.3, margenMin: 0.05 } } };
    const cc = of(['CC'], 5, pol);
    const ccLm = of(['CC', 'LM'], 5, pol);
    expect(ccLm.pctCede).toBeCloseTo(0.65, 4); // 1 − (1 − .5)(1 − .3)
    expect(ccLm.precio).toBeCloseTo(60.5, 2);
    expect(ccLm.precio).toBeLessThan(cc.precio);
    expect(of(['CC', 'LM', 'PNC'], 5, pol).precio).toBeLessThan(ccLm.precio);
  });
  it('sin condición no cede nada', () => {
    const r = of([]);
    expect(r.pctCede).toBe(0);
    expect(r.precio).toBe(80);
  });
  it('NUNCA queda ≤ costo, aunque se cedan % enormes o el margen mínimo llegue en 0', () => {
    const pol: Politica = { ...POLITICA_DEFECTO, condiciones: { LM: { incluida: true, pctCede: 0.99, margenMin: 0 } }, markdown: [] };
    const r = of(['LM'], undefined, pol);
    expect(r.precio).toBeGreaterThan(50);
    expect(r.piso).toBeGreaterThan(50);
  });
  it('con margen chico el descuento en pesos es chico solo (no baja del costo como un % del precio)', () => {
    const r = calcularPrecioOferta({ base: 55, costo: 50, sector: '17', banderas: ['CC'], mesesCc: 5 }, POLITICA_DEFECTO)!;
    expect(r.precio).toBeCloseTo(52.5, 2);
    expect(r.recortado).toBe(false);
  });
});

describe('margen mínimo decidido por material, grupo, sector o condición', () => {
  const regla = (ambito: 'material' | 'grupo' | 'sector', clave: string, margenMin: number, condicion = '') => ({ ambito, clave, condicion, margenMin });
  const pol = (...reglas: ReturnType<typeof regla>[]): Politica => ({ ...POLITICA_DEFECTO, margenesMin: reglas });
  const caso = { material: '100950', grupo: 'CINTA', sector: 'GASAS', banderas: ['CC'] };

  it('gana el más específico: material › grupo › sector', () => {
    expect(resolverMargenMin(pol(regla('sector', 'GASAS', 0.1), regla('grupo', 'CINTA', 0.2), regla('material', '100950', 0.3)), caso)).toBe(0.3);
    expect(resolverMargenMin(pol(regla('sector', 'GASAS', 0.1), regla('grupo', 'CINTA', 0.2)), caso)).toBe(0.2);
    expect(resolverMargenMin(pol(regla('sector', 'GASAS', 0.1)), caso)).toBe(0.1);
    expect(resolverMargenMin(pol(), caso)).toBeNull();
  });
  it('una regla para la condición gana sobre la de "cualquiera" dentro del mismo ámbito', () => {
    const p = pol(regla('sector', 'GASAS', 0.1), regla('sector', 'GASAS', 0.25, 'CC'));
    expect(resolverMargenMin(p, caso)).toBe(0.25);
    expect(resolverMargenMin(p, { ...caso, banderas: ['PNC'] })).toBe(0.1);
  });
  it('sube el piso de la oferta: con 40 % mínimo el precio no baja de costo / 0.6', () => {
    const r = calcularPrecioOferta({ base: 80, costo: 50, sector: 'GASAS', banderas: ['CC'], mesesCc: 2, material: '100950', grupo: 'CINTA' }, pol(regla('material', '100950', 0.4)))!;
    expect(r.precio).toBeCloseTo(83.34, 2); // piso = 50 / (1 − 40 %) y supera incluso a la base
    expect(r.origenMargenMin).toBe('material');
    expect(r.recortado).toBe(true);
  });
  it('un margen decidido a mano para el caso gana sobre las reglas', () => {
    const r = calcularPrecioOferta({ base: 80, costo: 50, sector: 'GASAS', banderas: ['CC'], mesesCc: 2, material: '100950', margenMinManual: 0.2 }, pol(regla('material', '100950', 0.4)))!;
    expect(r.origenMargenMin).toBe('manual');
    expect(r.piso).toBeCloseTo(62.5, 2); // 50 / 0.8
    expect(r.precio).toBeCloseTo(62.5, 2);
  });
});

describe('analisisPrecio · cálculo inverso', () => {
  it('de un precio autorizado saca descuento, % del margen cedido y margen', () => {
    // base 80, costo 50, precio 65 → descuento 18.75 %, cede la mitad del margen (15 de 30), margen 23.08 %
    const a = analisisPrecio(65, 80, 50)!;
    expect(a.descuento).toBeCloseTo(0.1875, 4);
    expect(a.cede).toBeCloseTo(0.5, 4);
    expect(a.margen).toBeCloseTo(0.2308, 4);
    expect(a.utilidad).toBe(15);
  });
  it('si calculó 20 y autorizaron 25, el análisis cambia en consecuencia', () => {
    const calc = analisisPrecio(20, 30, 15)!;
    const aut = analisisPrecio(25, 30, 15)!;
    expect(aut.cede).toBeLessThan(calc.cede);
    expect(aut.margen).toBeGreaterThan(calc.margen);
  });
  it('entradas inválidas → null', () => {
    expect(analisisPrecio(0, 80, 50)).toBeNull();
    expect(analisisPrecio(65, 80, 0)).toBeNull();
  });
});

describe('pisoDuro / precioValido', () => {
  it('siempre > costo', () => {
    expect(pisoDuro(50, 0)).toBeGreaterThan(50);
    expect(pisoDuro(50, -1)).toBeGreaterThan(50);
    expect(pisoDuro(0.001, 0.05)).toBeGreaterThan(0.001);
  });
  it('piso = costo / (1 − margen)', () => {
    expect(pisoDuro(50, 0.2)).toBe(62.5);
  });
  it('precioValido', () => {
    expect(precioValido(50, 50)).toBe(false);
    expect(precioValido(50.01, 50)).toBe(true);
    expect(precioValido(60, 0)).toBe(false);
  });
});
