import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { leerArchivoDirector } from './autorizacionXlsx';
import { COL, columnasDirector, evaluarAutorizacion, filasParaDirector, leerArchivo, type PropuestaExcel } from '@/core/autorizacionExcel';

const prop = (id: string, material: string, precio: number): PropuestaExcel => ({
  id, material, concepto: 'oferta', condicion: 'CC', costoAlEnviar: 50, baseAlEnviar: 80, precioCalculado: precio, precioPropuesto: precio,
});
const datos = { descripcion: () => 'CINTA', sector: () => 'GASAS', grupo: () => 'CINTA', condicionTxt: (c: string) => (c === 'CC' ? 'Corta caducidad' : c), mostrarCosto: true };

/** Arma un .xlsx en memoria igual que el exportador y simula lo que hace el director en Excel. */
function archivoDelDirector(filas: Record<string, unknown>[], edita: (f: Record<string, unknown>[]) => Record<string, unknown>[], nombre = 'precios.xlsx'): File {
  const ws = XLSX.utils.json_to_sheet(edita(filas), { header: columnasDirector(true) });
  const wi = XLSX.utils.aoa_to_sheet([['Instrucciones']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wi, 'Instrucciones'); // la hoja de instrucciones va primero a propósito
  XLSX.utils.book_append_sheet(wb, ws, 'Precios');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], nombre);
}

describe('ida y vuelta del Excel del director', () => {
  const pendientes = [prop('a1', '100950', 65), prop('a2', '200', 70), prop('a3', '300', 75), prop('a4', '400', 80)];
  const filas = filasParaDirector(pendientes, datos);

  it('lee la hoja que trae «Precio autorizado» aunque no sea la primera, y evalúa aceptado / modificado / vacío / error', async () => {
    const file = archivoDelDirector(filas, (f) => f.map((r, i) => ({
      ...r,
      [COL.autorizado]: [65, 90, '', 40][i],        // aceptado · modificado · no autorizado · ≤ costo
      [COL.comentario]: i === 1 ? 'subir un poco' : '',
    })));
    const rows = await leerArchivoDirector(file);
    const r = evaluarAutorizacion(leerArchivo(rows), pendientes, datos.condicionTxt);
    expect(r.renglones.map((x) => x.estado)).toEqual(['aceptado', 'modificado', 'no-autorizado', 'error']);
    expect(r.renglones[1]).toMatchObject({ autorizado: 90, comentario: 'subir un poco' });
    expect(r.resumen).toEqual({ aceptados: 1, modificados: 1, noAutorizados: 1, errores: 1, noVinieron: 0 });
  });

  it('si el director autoriza el 100 % repitiendo los precios propuestos, todo queda aceptado', async () => {
    const file = archivoDelDirector(filas, (f) => f.map((r) => ({ ...r, [COL.autorizado]: r[COL.propuesto] })));
    const r = evaluarAutorizacion(leerArchivo(await leerArchivoDirector(file)), pendientes, datos.condicionTxt);
    expect(r.resumen).toMatchObject({ aceptados: 4, modificados: 0, noAutorizados: 0, errores: 0 });
  });

  it('si borra renglones, esas propuestas siguen pendientes', async () => {
    const file = archivoDelDirector(filas, (f) => f.slice(0, 2).map((r) => ({ ...r, [COL.autorizado]: r[COL.propuesto] })));
    const r = evaluarAutorizacion(leerArchivo(await leerArchivoDirector(file)), pendientes, datos.condicionTxt);
    expect(r.resumen).toMatchObject({ aceptados: 2, noVinieron: 2 });
  });

  it('precios escritos como texto con $ y comas también se entienden', async () => {
    const file = archivoDelDirector(filas, (f) => f.map((r, i) => ({ ...r, [COL.autorizado]: i === 0 ? '$65.00' : i === 1 ? '1,070.5' : '' })));
    const r = evaluarAutorizacion(leerArchivo(await leerArchivoDirector(file)), pendientes, datos.condicionTxt);
    expect(r.renglones[0]!.estado).toBe('aceptado');
    expect(r.renglones[1]).toMatchObject({ estado: 'modificado', autorizado: 1070.5 });
  });
});
