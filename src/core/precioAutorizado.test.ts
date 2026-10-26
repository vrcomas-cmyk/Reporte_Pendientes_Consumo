import { describe, it, expect } from 'vitest';
import { condicionDeLote, condicionesDeTexto, crearPreciosAutorizados, SIN_PRECIOS_AUTORIZADOS } from './precioAutorizado';

// 100950: autorizados CC (72), CC + Lento mov (60), Lento mov (80). 200: PNC (30). 300: sin autorizados.
const entradas = [
  { material: '100950', combinacion: 'CC', precio: 72 },
  { material: '100950', combinacion: 'CC + Lento mov', precio: 60 },
  { material: '100950', combinacion: 'Lento mov', precio: 80 },
  { material: '200', combinacion: 'PNC', precio: 30 },
];
// 100950 es «lento» (Status incluido en Precios); los demás no tienen Status incluidos.
const incluidos = (m: string) => (m === '100950' ? ['Lento mov'] : []);
const p = crearPreciosAutorizados(entradas, incluidos);

describe('condicionesDeTexto', () => {
  it('reconoce corta caducidad y PNC en textos de condición o de fuente', () => {
    expect(condicionesDeTexto('Corta caducidad')).toEqual({ cc: true, pnc: false });
    expect(condicionesDeTexto('Sustituto/Corta caducidad')).toEqual({ cc: true, pnc: false });
    expect(condicionesDeTexto('PNC')).toEqual({ cc: false, pnc: true });
    expect(condicionesDeTexto('CC + PNC')).toEqual({ cc: true, pnc: true });
  });
  it('Sustituto, General y los Status no son condiciones fijas', () => {
    expect(condicionesDeTexto('Sustituto')).toEqual({ cc: false, pnc: false });
    expect(condicionesDeTexto('General')).toEqual({ cc: false, pnc: false });
    expect(condicionesDeTexto('Revision Liz/Urgente')).toEqual({ cc: false, pnc: false });
  });
});

describe('PreciosAutorizados · mismas condiciones que Precios', () => {
  it('un material lento: sus lotes de corta caducidad son «CC + Lento mov» y su existencia general «Lento mov»', () => {
    expect(p.precio('100950', 'Corta caducidad')).toBe(60);
    expect(p.combinacion('100950', 'Corta caducidad')).toBe('CC + Lento mov');
    expect(p.precio('100950', 'General')).toBe(80);
    expect(p.precio('100950', 'Revision Liz')).toBe(80);
  });
  it('un material sin Status incluidos: corta caducidad es solo «CC»; PNC es «PNC»', () => {
    const q = crearPreciosAutorizados([{ material: '300', combinacion: 'CC', precio: 55 }, ...entradas], incluidos);
    expect(q.precio('300', 'Corta caducidad')).toBe(55);
    expect(p.precio('200', 'PNC')).toBe(30);
  });
  it('lo que Precios no autorizó queda en null (nunca se inventa el precio de otra combinación)', () => {
    expect(p.precio('200', 'Corta caducidad')).toBeNull(); // 200 solo tiene PNC autorizado
    expect(p.precio('200', 'General')).toBeNull();
    expect(p.precio('300', 'Corta caducidad')).toBeNull();
    expect(p.precio('100950', 'PNC')).toBeNull(); // «Lento mov + PNC» no está autorizado
  });
  it('un sustituto se busca con SU propio código y sus propias condiciones', () => {
    expect(p.precio('200', 'Sustituto/PNC')).toBe(30);
    expect(p.precio('999', 'Sustituto')).toBeNull();
  });
  it('lista todos los autorizados de un material y tolera códigos con «.0»', () => {
    expect(p.deMaterial('100950')).toHaveLength(3);
    expect(p.deMaterial('100950.0')).toHaveLength(3);
    expect(p.deMaterial('zzz')).toEqual([]);
  });
  it('sin precios autorizados todo es null', () => {
    expect(SIN_PRECIOS_AUTORIZADOS.precio('100950', 'Corta caducidad')).toBeNull();
    expect(SIN_PRECIOS_AUTORIZADOS.deMaterial('100950')).toEqual([]);
  });
});

describe('condicionDeLote · un PNC que vence pronto también es corta caducidad', () => {
  const HOY = new Date(2026, 9, 8);
  it('PNC con ≤ 12 meses suma «Corta caducidad»; con más no', () => {
    expect(condicionDeLote('PNC', '2027-04-08', HOY)).toBe('PNC/Corta caducidad');
    expect(condicionDeLote('PNC', '8/10/2027', HOY)).toBe('PNC/Corta caducidad'); // el último día cuenta
    expect(condicionDeLote('PNC', '9/10/2027', HOY)).toBe('PNC');
    expect(condicionDeLote('PNC', '2030-01-01', HOY)).toBe('PNC');
  });
  it('sin fecha, o si ya es corta caducidad o no es PNC, no cambia', () => {
    expect(condicionDeLote('PNC', '', HOY)).toBe('PNC');
    expect(condicionDeLote('Corta caducidad', '2027-04-08', HOY)).toBe('Corta caducidad');
    expect(condicionDeLote('General', '2027-04-08', HOY)).toBe('General');
  });
  it('con eso el precio sale del segmento correcto («CC + PNC»)', () => {
    const q = crearPreciosAutorizados([{ material: '500', combinacion: 'PNC', precio: 20 }, { material: '500', combinacion: 'CC + PNC', precio: 12 }], () => []);
    expect(q.precio('500', condicionDeLote('PNC', '2027-04-08', HOY))).toBe(12);
    expect(q.precio('500', condicionDeLote('PNC', '2030-01-01', HOY))).toBe(20);
  });
});

describe('que los precios NO se revuelvan (casos del usuario)', () => {
  // Código A: solo tiene autorizada su corta caducidad ($10). Código B (lento): CC + Lento mov ($7) y Lento mov ($12).
  const q = crearPreciosAutorizados(
    [{ material: 'A', combinacion: 'CC', precio: 10 }, { material: 'B', combinacion: 'CC + Lento mov', precio: 7 }, { material: 'B', combinacion: 'Lento mov', precio: 12 }],
    (m) => (m === 'B' ? ['Lento mov'] : []),
  );
  it('un lote de corta caducidad tiene su precio y el MISMO material con buena caducidad no tiene oferta', () => {
    expect(q.precio('A', 'Corta caducidad')).toBe(10);
    expect(q.precio('A', 'General')).toBeNull();
  });
  it('el sustituto de buena caducidad NO hereda el precio de corta caducidad; su lote de corta caducidad sí tiene el suyo', () => {
    expect(q.precio('A', 'Sustituto')).toBeNull();
    expect(q.precio('A', 'Sustituto/Corta caducidad')).toBe(10);
  });
  it('material con corta caducidad + lento movimiento: cada segmento su precio (CC + Lento mov ≠ Lento mov)', () => {
    expect(q.precio('B', 'Corta caducidad')).toBe(7);
    expect(q.precio('B', 'General')).toBe(12);
    expect(q.precio('B', 'Sustituto')).toBe(12); // la buena caducidad de un material lento SÍ tiene su precio de Lento mov
  });
  it('las condiciones de un código no se aplican al otro', () => {
    expect(q.precio('B', 'PNC')).toBeNull();
    expect(q.precio('C', 'Corta caducidad')).toBeNull();
  });
});
