import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { libroOferta } from './ofertaEjecutivoXlsx';
import { nombreArchivoOferta } from '@/core/ofertaEjecutivoExcel';
import type { GrupoEjecutivo, LineaOferta } from '@/core/ofertasEjecutivo';

const linea = (p: Partial<LineaOferta>): LineaOferta => ({
  ejecutivo: 'Ana Pérez', zona: '101', pedido: '77', oc: 'OC', fechaPedido: '01/10/2026', solicitante: 'S', destinatario: 'D1', razonSocial: 'Cliente A', centroPedido: '1001', almacenPedido: '',
  materialSolicitado: 'N', descripcionSolicitada: 'Mat N', pendiente: 10, materialOfertado: 'N', descripcionOfertada: 'Mat N', relacion: 'Mismo material', condicion: 'Corta caducidad',
  centroOrigen: '1017', almacenOrigen: '1032', lote: 'L1', caducidad: '2027-01-31', disponible: 50, precio: 9.5, almacenDestino: '1032', ...p,
});
const g: GrupoEjecutivo = { ejecutivo: 'Ana Pérez', zona: '101', pedidos: 1, clientes: 1, lineas: [linea({}), linea({ lote: 'L2', precio: 0 })] };

describe('Excel de oferta por ejecutivo', () => {
  it('trae ejecutivo, zona, centros y una línea por lote con precio vacío si no está autorizado', () => {
    const wb = libroOferta(g, { centros: ['1017'], generadaEn: 'hoy', alerta: (l) => (l.lote === 'L1' ? 'Ya aceptó este material' : '') });
    expect(wb.SheetNames).toEqual(['Oferta', 'Instrucciones']);
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Oferta']!, { header: 1, defval: '' });
    expect((filas[0] as unknown[]).slice(0, 2)).toEqual(['Oferta para', 'Ana Pérez']);
    expect((filas[1] as unknown[]).slice(0, 2)).toEqual(['Zona', '101']);
    expect((filas[2] as unknown[]).slice(0, 2)).toEqual(['Centros considerados', '1017']);
    expect(filas[6]![0]).toBe('Pedido');
    expect(filas).toHaveLength(9);
    const l1 = filas[7] as unknown[];
    expect(l1[17]).toBe('L1');
    expect(l1[20]).toBe(9.5);
    expect(l1[22]).toBe('Ya aceptó este material');
    expect((filas[8] as unknown[])[20]).toBe('');
  });
  it('no incluye costos', () => {
    const wb = libroOferta(g, { centros: [] });
    expect(JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets['Oferta']!, { header: 1 }))).not.toMatch(/costo/i);
  });
  it('el nombre del archivo lleva zona y ejecutivo sin acentos ni símbolos', () => {
    expect(nombreArchivoOferta(g, '2026-10-20-10-00-00')).toBe('Oferta_101_Ana_Perez_2026-10-20-10-00-00.xlsx');
  });
});
