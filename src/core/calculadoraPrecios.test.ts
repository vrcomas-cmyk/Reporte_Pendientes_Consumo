import { describe, it, expect } from 'vitest';
import { combinacionesEncontradas, filasCalculadora, historialDeFacturacion, recalcularOferta, segmentosDeMaterial, lotesPncDeDetalle, type EntradaSegmentos } from './calculadoraPrecios';
import { POLITICA_DEFECTO, combinacionDe } from './politicaPrecios';

const HOY = new Date(2026, 9, 16);
const mat = { material: '100950', texto: 'CINTA', sector: 'GASAS', grupo: 'CINTA', costo: 50 };
const hist = new Map([['100950', { puntos: [{ valor: 70, peso: 500 }, { valor: 80, peso: 300 }, { valor: 100, peso: 20 }], min: 65, max: 110 }]]);
const vence = (meses: number) => new Date(HOY.getFullYear(), HOY.getMonth() + meses, HOY.getDate());
const vacio: EntradaSegmentos = { lotesCc: [], lotesPnc: [], libreGeneral: 0, estados: [] };
const combos = (e: Partial<EntradaSegmentos>) => segmentosDeMaterial({ ...vacio, ...e }, HOY).map((s) => combinacionDe(s.banderas)).sort();
const filas = (e: Partial<EntradaSegmentos>) => filasCalculadora([mat], hist, new Map([['100950', segmentosDeMaterial({ ...vacio, ...e }, HOY)]]), POLITICA_DEFECTO);

describe('segmentosDeMaterial', () => {
  it('sin lento ni lotes no hay segmentos (Lento mov solo aparece si el archivo lo trae)', () => {
    expect(combos({ libreGeneral: 100 })).toEqual([]);
  });
  it('lento con stock general → fila Lento mov; sin stock general → no hay fila Lento mov', () => {
    expect(combos({ estados: ['Lento mov'], libreGeneral: 40 })).toEqual(['Lento mov']);
    expect(combos({ estados: ['Lento mov'], libreGeneral: 0 })).toEqual([]);
  });
  it('CC y CC+Lento mov son filas distintas según el archivo diga lento', () => {
    const cc = [{ cantidad: 10, vence: vence(5) }];
    expect(combos({ lotesCc: cc })).toEqual(['CC']);
    expect(combos({ lotesCc: cc, estados: ['Lento mov'], libreGeneral: 40 })).toEqual(['CC + Lento mov', 'Lento mov']);
  });
  it('material con las 3 condiciones: Lento mov, CC+Lento mov, Lento mov+PNC y CC+Lento mov+PNC (cada una su segmento)', () => {
    expect(combos({
      estados: ['Lento mov'], libreGeneral: 40, lotesCc: [{ cantidad: 10, vence: vence(5) }],
      lotesPnc: [{ cantidad: 3, vence: vence(30) }, { cantidad: 2, vence: vence(4) }],
    })).toEqual(['CC + Lento mov', 'CC + Lento mov + PNC', 'Lento mov', 'Lento mov + PNC']);
  });
  it('PNC sin fecha o a más de 12 meses es PNC; a ≤12 meses es CC+PNC', () => {
    expect(combos({ lotesPnc: [{ cantidad: 1, vence: null }, { cantidad: 1, vence: vence(20) }] })).toEqual(['PNC']);
    expect(combos({ lotesPnc: [{ cantidad: 1, vence: vence(8) }] })).toEqual(['CC + PNC']);
  });
  it('lotes sin existencia no generan segmento', () => {
    expect(combos({ lotesCc: [{ cantidad: 0, vence: vence(2) }] })).toEqual([]);
  });
});

describe('filasCalculadora', () => {
  const todas = filas({
    estados: ['Lento mov'], libreGeneral: 40, lotesCc: [{ cantidad: 10, vence: vence(5) }],
    lotesPnc: [{ cantidad: 3, vence: vence(30) }, { cantidad: 2, vence: vence(4) }],
  });
  const dto = (c: string) => todas.find((f) => combinacionDe(f.banderas) === c)!.oferta!.pctCede;
  it('cada condición añadida descuenta estrictamente más: Lento mov < CC+Lento mov < CC+Lento mov+PNC', () => {
    expect(dto('CC + Lento mov')).toBeGreaterThan(dto('Lento mov'));
    expect(dto('CC + Lento mov + PNC')).toBeGreaterThan(dto('CC + Lento mov'));
    expect(dto('Lento mov + PNC')).toBeGreaterThan(dto('Lento mov'));
  });
  it('todas las ofertas quedan por encima del costo y traen su inventario', () => {
    for (const f of todas) {
      expect(f.oferta!.precio).toBeGreaterThan(50);
      expect(f.inventario).toBeGreaterThan(0);
    }
  });
  it('en TODOS los tramos de vigencia, CC+Lento mov descuenta estrictamente más que CC', () => {
    for (const meses of [2, 5, 10, 20]) {
      const cc = filas({ lotesCc: [{ cantidad: 1, vence: vence(meses) }] })[0].oferta!;
      const ccLm = filas({ lotesCc: [{ cantidad: 1, vence: vence(meses) }], estados: ['Lento mov'] })[0].oferta!;
      expect(ccLm.pctCede, `meses=${meses}`).toBeGreaterThan(cc.pctCede);
    }
  });
});

describe('lotesPncDeDetalle', () => {
  it('lee Cantidad y Caducidad dd/mm/aaaa por material', () => {
    const m = lotesPncDeDetalle({ columnas: ['Material', 'Cantidad', 'Caducidad'], filas: [
      { material: '1608700', centro: '1018', celdas: ['1608700', '10', '17/5/2026'] },
      { material: '1608700', centro: '1018', celdas: ['1608700', '0', '1/1/2030'] },
    ] });
    expect(m.get('1608700')).toEqual([{ cantidad: 10, vence: new Date(2026, 4, 17) }]);
  });
});

describe('historialDeFacturacion', () => {
  const fila = (mesAno: string, cant: number, imp: number, extra = {}) => ({
    solicitante: '', razonSocial: '', destinatario: '', material: '100950', textoMaterial: '', mesAno, cantidadFacturada: cant, importeFacturado: imp,
    gpoCte: '', gpoVdor: '', centro: '', ...extra,
  });
  it('precio = importe/cantidad, ponderado, y respeta los extremos de las líneas', () => {
    const h = historialDeFacturacion([fila('03/2026', 10, 700, { precioMin: 65, precioMax: 75 }), fila('04/2026', 10, 900)], new Set(['03/2026', '04/2026'])).get('100950')!;
    expect(h.puntos).toEqual([{ valor: 70, peso: 10 }, { valor: 90, peso: 10 }]);
    expect(h.min).toBe(65);
    expect(h.max).toBe(90);
  });
  it('ignora meses fuera del conjunto', () => {
    expect(historialDeFacturacion([fila('01/2025', 10, 700)], new Set(['03/2026'])).size).toBe(0);
  });
});

describe('varios Status de Revision a la vez', () => {
  it('se apilan en un solo segmento y descuentan más que cada uno solo', () => {
    const uno = filas({ estados: ['Lento mov'], libreGeneral: 40 })[0].oferta!;
    const dos = filas({ estados: ['Lento mov', 'Obsoleto'], libreGeneral: 40 })[0];
    expect(combinacionDe(dos.banderas)).toBe('Lento mov + Obsoleto');
    expect(dos.oferta!.pctCede).toBeGreaterThan(uno.pctCede);
    expect(dos.oferta!.precio).toBeGreaterThan(50);
  });
});

describe('combinacionesEncontradas', () => {
  const entradas = new Map([
    ['A', { ...vacio, sector: 'GASAS', estados: ['Lento mov', 'Revision Liz'], libreGeneral: 40, lotesCc: [{ cantidad: 10, vence: vence(5) }], lotesPnc: [{ cantidad: 2, vence: vence(30) }] }],
    ['B', { ...vacio, sector: 'GASAS', estados: ['Lento mov'], libreGeneral: 5 }],
  ]);
  it('lista cada combinación distinta con materiales, inventario y descuento; marca si entra según los Status incluidos', () => {
    const pol = { ...POLITICA_DEFECTO, condiciones: { 'Lento mov': { incluida: true, pctCede: 0.3, margenMin: 0.05 } } };
    const r = combinacionesEncontradas(entradas, pol, HOY);
    const por = Object.fromEntries(r.map((c) => [c.combinacion, c]));
    expect(Object.keys(por)).toContain('Lento mov');
    expect(Object.keys(por)).toContain('CC + Lento mov + Revision Liz');
    expect(Object.keys(por)).toContain('Lento mov + Revision Liz + PNC');
    expect(por['Lento mov'].materiales).toBe(1); // A lleva además Revision Liz → su segmento general es otra combinación
    expect(por['Lento mov'].entra).toBe(true);
    expect(por['Lento mov + Revision Liz'].entra).toBe(false); // Revision Liz sin incluir
    expect(por['CC + Lento mov + Revision Liz'].dtoMax).toBeGreaterThan(por['Lento mov'].dtoMax);
  });
});

describe('referencia del grupo de artículos cuando el material casi no se vende', () => {
  const mk = (material: string, costo: number) => ({ material, texto: material, sector: 'GASAS', grupo: 'CINTA', costo });
  const pts = (precio: number, n: number) => Array.from({ length: n }, () => ({ valor: precio, peso: 10 }));
  it('usa la razón precio/costo del grupo (mediana de sus materiales) aplicada al costo del material', () => {
    const vende = mk('A', 50); // 80 / 50 = 1.6
    const raro = mk('B', 100); // casi sin ventas: 1 factura
    const historial = new Map([['A', { puntos: pts(80, 8), min: 78, max: 82 }], ['B', { puntos: pts(130, 1), min: 130, max: 130 }]]);
    const segs = new Map([['B', segmentosDeMaterial({ ...vacio, lotesCc: [{ cantidad: 5, vence: vence(5) }] }, HOY)]]);
    const [f] = filasCalculadora([raro], historial, segs, POLITICA_DEFECTO, [vende, raro]);
    expect(f.base.origenBase).toBe('grupo');
    expect(f.base.base).toBe(160); // 100 × 1.6, no los 130 de su única factura
  });
  it('recalcularOferta con un margen mínimo a mano sube el piso de ese caso', () => {
    const segs = new Map([['100950', segmentosDeMaterial({ ...vacio, lotesCc: [{ cantidad: 5, vence: vence(2) }] }, HOY)]]);
    const [f] = filasCalculadora([mat], hist, segs, POLITICA_DEFECTO);
    const sin = f.oferta!;
    const conMin = recalcularOferta(f, POLITICA_DEFECTO, 0.4)!;
    expect(conMin.precio).toBeGreaterThanOrEqual(sin.precio);
    expect(conMin.piso).toBe(83.34); // 50 / 0.6, redondeado hacia arriba al centavo
    expect(conMin.origenMargenMin).toBe('manual');
  });
});

describe('lotes del segmento (para avisar de lotes nuevos)', () => {
  it('cada segmento lleva las claves de sus lotes, sin repetir y en orden', () => {
    const segs = segmentosDeMaterial({
      ...vacio,
      lotesCc: [{ cantidad: 3, vence: vence(5), id: '1018|1032|B2' }, { cantidad: 2, vence: vence(6), id: '1018|1032|A1' }, { cantidad: 1, vence: vence(7), id: '1018|1032|A1' }],
      lotesPnc: [{ cantidad: 4, vence: vence(30), id: '1018|1038|P1' }],
      estados: ['Lento mov'], libreGeneral: 40,
    }, HOY);
    const por = Object.fromEntries(segs.map((s) => [combinacionDe(s.banderas), s.lotes]));
    expect(por['CC + Lento mov']).toEqual(['1018|1032|A1', '1018|1032|B2']);
    expect(por['Lento mov + PNC']).toEqual(['1018|1038|P1']);
    expect(por['Lento mov']).toEqual([]); // existencia general: sin lotes
  });
  it('lotesPncDeDetalle arma la clave centro|almacén|lote', () => {
    const m = lotesPncDeDetalle({ columnas: ['Centro', 'Almacén', 'Material', 'Lote', 'Cantidad', 'Caducidad'], filas: [
      { material: '1608700', centro: '1018', celdas: ['1018', '1038', '1608700', '2A05', '10', '17/5/2030'] },
    ] });
    expect(m.get('1608700')![0]).toMatchObject({ cantidad: 10, id: '1018|1038|2A05' });
  });
});
