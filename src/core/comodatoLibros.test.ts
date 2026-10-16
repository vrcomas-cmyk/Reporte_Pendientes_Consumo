import { describe, expect, it } from 'vitest';
import { clientesDelLibro, hojaAFilas, resumenFacAFilasFacturacion } from './comodatoLibros';
import type { ResumenFacRow } from './types';

const fila = (over: Partial<ResumenFacRow>): ResumenFacRow => ({
  solicitante: '100', razonSocial: 'Cliente A', destinatario: '100', material: '1330130', textoMaterial: 'BOLSA', mesAno: '09/2026',
  cantidadFacturada: 10, importeFacturado: 500, gpoCte: '19', gpoVdor: '24', centro: '1018', ...over,
});

describe('hojaAFilas', () => {
  it('conserva los encabezados tal cual y convierte vacíos en null', () => {
    const hoja = { columnas: ['Solicitante', 'Clase doc.ventas', 'Creado el3'], rows: [['100', 'YBFD', ''], ['200', 'ZBRE', '15/09/2026']] };
    expect(hojaAFilas(hoja)).toEqual([
      { Solicitante: '100', 'Clase doc.ventas': 'YBFD', 'Creado el3': null },
      { Solicitante: '200', 'Clase doc.ventas': 'ZBRE', 'Creado el3': '15/09/2026' },
    ]);
  });
  it('clientesDelLibro limpia espacios y el ".0" final', () => {
    const hoja = { columnas: ['Material', 'Solicitante'], rows: [['1331100', ' 100.0 '], ['1331100', '200'], ['1331100', '']] };
    expect([...clientesDelLibro(hoja)].sort()).toEqual(['100', '200']);
  });
});

describe('resumenFacAFilasFacturacion', () => {
  it('trae las bolsas de cualquier cliente y todo lo de los clientes del comodato; lo demás no', () => {
    const rows = [
      fila({ solicitante: '100', material: '1330130' }), // bolsa de un cliente con comodato
      fila({ solicitante: '100', material: '999' }), // otra cosa del mismo cliente: entra (zona y grupo)
      fila({ solicitante: '300', material: '1330150' }), // bolsa de un cliente SIN comodato: entra (factura sin comodato)
      fila({ solicitante: '300', material: '555' }), // otra cosa de otro cliente: no
    ];
    const r = resumenFacAFilasFacturacion(rows, new Set(['100']));
    expect(r.map((x) => `${x.Solicitante}/${x.Material}`)).toEqual(['100/1330130', '100/999', '300/1330150']);
  });
  it('Fecha: la de la última línea; sin ella, el día 1 del mes. Factura: mes|cliente|material', () => {
    const r = resumenFacAFilasFacturacion([fila({ fechaMax: '2026-09-18' }), fila({ mesAno: '08/2026', fechaMax: '' })], new Set());
    expect(r[0]).toMatchObject({ Fecha: '2026-09-18', Factura: '09/2026|100|1330130', Cantidad: 10, Importe: 500, 'Gpo. Vdor.': '24', 'Grp. Cliente': '19' });
    expect(r[1]!.Fecha).toBe('2026-08-01');
  });
  it('el material con ceros a la izquierda se normaliza para coincidir con las bolsas', () => {
    const r = resumenFacAFilasFacturacion([fila({ material: '0001330130' })], new Set());
    expect(r).toHaveLength(1);
    expect(r[0]!.Material).toBe('1330130');
  });
});
