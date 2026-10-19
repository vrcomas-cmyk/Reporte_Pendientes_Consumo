import { describe, it, expect } from 'vitest';
import {
  COL, columnasDirector, evaluarAutorizacion, filasParaDirector, leerArchivo, leerCeldaAutorizado, numeroCelda, type PropuestaExcel,
} from './autorizacionExcel';

const prop = (id: string, over: Partial<PropuestaExcel> = {}): PropuestaExcel => ({
  id, material: '100950', concepto: 'oferta', condicion: 'CC', costoAlEnviar: 50, baseAlEnviar: 80, precioCalculado: 65, precioPropuesto: 65, ...over,
});
const datos = { descripcion: () => 'CINTA', sector: () => 'GASAS', grupo: () => 'CINTA UMBILICAL', condicionTxt: (c: string) => (c === 'CC' ? 'Corta caducidad' : c), mostrarCosto: true };

/** Simula lo que hace el director: toma las filas exportadas y llena «Precio autorizado» (o la deja vacía). */
const respuesta = (rows: Record<string, unknown>[], autorizados: Record<number, unknown>) =>
  rows.map((r, i) => ({ ...r, [COL.autorizado]: i in autorizados ? autorizados[i] : '' }));

describe('numeroCelda / leerCeldaAutorizado', () => {
  it('lee precios en los formatos que pone Excel', () => {
    expect(numeroCelda(85.5)).toBe(85.5);
    expect(numeroCelda('$1,234.50')).toBe(1234.5);
    expect(numeroCelda('85,5')).toBe(85.5);
    expect(numeroCelda(' 70 ')).toBe(70);
    expect(numeroCelda('abc')).toBeNaN();
  });
  it('vacío, NO, guion y 0 = no autoriza; texto raro = inválido', () => {
    for (const v of ['', '  ', null, undefined]) expect(leerCeldaAutorizado(v)).toEqual({ tipo: 'vacio' });
    for (const v of ['NO', 'no', 'N/A', '-', 0, '0', 'No autorizado']) expect(leerCeldaAutorizado(v)).toEqual({ tipo: 'no' });
    expect(leerCeldaAutorizado('$72.00')).toEqual({ tipo: 'precio', valor: 72 });
    expect(leerCeldaAutorizado('pendiente')).toEqual({ tipo: 'invalido', texto: 'pendiente' });
  });
});

describe('filasParaDirector', () => {
  it('trae el ID, el precio propuesto y deja VACÍOS «Precio autorizado» y el comentario', () => {
    const [f] = filasParaDirector([prop('a1')], datos);
    expect(f![COL.id]).toBe('a1');
    expect(f![COL.concepto]).toBe('Oferta');
    expect(f![COL.condicion]).toBe('Corta caducidad');
    expect(f![COL.propuesto]).toBe(65);
    expect(f![COL.autorizado]).toBe('');
    expect(f![COL.comentario]).toBe('');
    expect(f![COL.descuento]).toBeCloseTo(18.8, 1); // 1 − 65/80
    expect(f![COL.cede]).toBe(50);
  });
  it('sin permiso de costos la columna Costo no se manda', () => {
    const [f] = filasParaDirector([prop('a1')], { ...datos, mostrarCosto: false });
    expect(COL.costo in f!).toBe(false);
    expect(columnasDirector(false)).not.toContain(COL.costo);
    expect(columnasDirector(true)).toContain(COL.costo);
  });
});

describe('leerArchivo', () => {
  it('reconoce los encabezados sin acentos ni mayúsculas', () => {
    const f = leerArchivo([{ 'id PROPUESTA': 'a1', material: '100950', 'PRECIO AUTORIZADO': 70, 'Comentario Del Director': 'ok' }]);
    expect(f).toEqual([{ fila: 2, id: 'a1', material: '100950', concepto: '', condicion: '', autorizado: { tipo: 'precio', valor: 70 }, comentario: 'ok' }]);
  });
  it('sin columna de precio autorizado avisa', () => {
    expect(() => leerArchivo([{ 'ID propuesta': 'a1', 'Precio propuesto': 65 }])).toThrow(/Precio autorizado/);
  });
  it('ignora renglones totalmente vacíos del final', () => {
    expect(leerArchivo([{ [COL.id]: 'a1', [COL.autorizado]: 65 }, { [COL.id]: '', [COL.autorizado]: '' }])).toHaveLength(1);
  });
});

describe('evaluarAutorizacion', () => {
  const pendientes = [prop('a1'), prop('a2', { material: '200', precioPropuesto: 100, baseAlEnviar: 150, costoAlEnviar: 60 }), prop('a3', { material: '300' })];
  const exportadas = filasParaDirector(pendientes, datos);
  const evalua = (autorizados: Record<number, unknown>, pend = pendientes) => evaluarAutorizacion(leerArchivo(respuesta(exportadas, autorizados)), pend, datos.condicionTxt);

  it('el director autoriza el 100 % tal cual: todo «aceptado»', () => {
    const r = evalua({ 0: 65, 1: 100, 2: 65 });
    expect(r.resumen).toEqual({ aceptados: 3, modificados: 0, noAutorizados: 0, errores: 0, noVinieron: 0 });
    expect(r.renglones.every((x) => x.estado === 'aceptado')).toBe(true);
  });

  it('autoriza solo una parte: lo vacío queda «no autorizado»', () => {
    const r = evalua({ 0: 65 });
    expect(r.resumen).toMatchObject({ aceptados: 1, noAutorizados: 2, errores: 0 });
  });

  it('cambia el precio a mano: «modificado» con su diferencia, descuento y margen', () => {
    const r = evalua({ 0: 72 });
    const m = r.renglones[0]!;
    expect(m.estado).toBe('modificado');
    expect(m.autorizado).toBe(72);
    expect(m.diferencia).toBeCloseTo(7, 6);
    expect(m.descuento).toBeCloseTo(0.1, 4); // 1 − 72/80
    expect(m.cede).toBeCloseTo(1 - 22 / 30, 4); // cede (80−72)/(80−50)
    expect(m.margen).toBeCloseTo(22 / 72, 4);
  });

  it('mezcla: aceptado, modificado y no autorizado en el mismo archivo', () => {
    const r = evalua({ 0: 65, 1: 120 });
    expect(r.renglones.map((x) => x.estado)).toEqual(['aceptado', 'modificado', 'no-autorizado']);
  });

  it('un precio ≤ costo es error y no se aplica', () => {
    const r = evalua({ 0: 50, 1: 40 });
    expect(r.renglones[0]).toMatchObject({ estado: 'error', error: expect.stringContaining('mayor al costo') });
    expect(r.renglones[1]!.estado).toBe('error');
    expect(r.resumen.errores).toBe(2);
  });

  it('texto que no es precio es error', () => {
    expect(evalua({ 0: 'pendiente' }).renglones[0]!.estado).toBe('error');
  });

  it('ID repetido o ajeno es error', () => {
    const filas = leerArchivo([
      { [COL.id]: 'a1', [COL.autorizado]: 65 },
      { [COL.id]: 'a1', [COL.autorizado]: 66 },
      { [COL.id]: 'zzz', [COL.autorizado]: 65 },
    ]);
    const r = evaluarAutorizacion(filas, pendientes, datos.condicionTxt);
    expect(r.renglones.map((x) => x.estado)).toEqual(['aceptado', 'error', 'error']);
    expect(r.renglones[1]!.error).toContain('repetida');
    expect(r.renglones[2]!.error).toContain('ID');
  });

  it('los pendientes que no vienen en el archivo se reportan y siguen pendientes', () => {
    const filas = leerArchivo(respuesta(exportadas.slice(0, 1), { 0: 65 }));
    const r = evaluarAutorizacion(filas, pendientes, datos.condicionTxt);
    expect(r.resumen.noVinieron).toBe(2);
    expect(r.noVinieron.map((p) => p.id)).toEqual(['a2', 'a3']);
  });

  it('sin ID empareja por material + concepto + condición si hay UNA candidata', () => {
    const filas = leerArchivo([{ [COL.material]: '200', [COL.concepto]: 'Oferta', [COL.condicion]: 'Corta caducidad', [COL.autorizado]: 100 }]);
    const r = evaluarAutorizacion(filas, pendientes, datos.condicionTxt);
    expect(r.renglones[0]).toMatchObject({ estado: 'aceptado' });
    expect(r.renglones[0]!.propuesta!.id).toBe('a2');
  });

  it('sin ID y con varias candidatas no adivina', () => {
    const dup = [prop('b1'), prop('b2')];
    const filas = leerArchivo([{ [COL.material]: '100950', [COL.concepto]: 'Oferta', [COL.condicion]: 'Corta caducidad', [COL.autorizado]: 65 }]);
    expect(evaluarAutorizacion(filas, dup, datos.condicionTxt).renglones[0]!.estado).toBe('error');
  });

  it('una propuesta ya resuelta (que no está entre las pendientes) no se vuelve a aplicar', () => {
    const r = evalua({ 0: 65, 1: 100, 2: 65 }, pendientes.slice(1));
    expect(r.renglones[0]!.estado).toBe('error');
    expect(r.resumen.aceptados).toBe(2);
  });
});
