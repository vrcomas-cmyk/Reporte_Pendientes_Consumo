import { describe, expect, it } from 'vitest';
import { hojasExcel, nombreLegible } from './comodatoExport';

const seg = {
  cliente: '100', razon_social: 'Cliente A', material_comodato: '1331100', descripcion_comodato: 'CANISTER', cantidad_comodato: 2, inversion_comodato: 2000.456, facturacion_total: 12000,
  margen_total: 4800, roi: 2.4000001, ultima_factura: '2026-09-18', dias_sin_compra: 10, status_actividad: 'Activo', 'Sin comodato asignado': 'No', Zona: '002', campo_nuevo_del_sql: 'x',
};

describe('exportación a Excel', () => {
  const hojas = hojasExcel({
    seguimiento: [seg],
    serie: [{ cliente: '100', codigo_equipo: '1331100', descripcion_equipo: 'CANISTER', periodo: '2026-09-01', piezas_netas_mes: 2, bolsas_mes: 50, importe_mes: 5000, margen_mes: 2000 }],
    bolsas: [{ codigo_consumible: '1330130', descripcion_consumible: 'BOLSA', importe_vendido: 12000, num_clientes: 3, pct_margen: 40 }],
    razonDe: (c) => (c === '100' ? 'Cliente A' : ''),
  });
  const fila = hojas[0]!.rows[0]!;

  it('tres hojas con nombres en español', () => {
    expect(hojas.map((h) => h.name)).toEqual(['Seguimiento por cliente', 'Evolución mensual', 'Facturación por bolsa']);
  });
  it('ningún encabezado trae guion bajo y el solicitante no se llama "cliente"/"código"', () => {
    for (const h of hojas) for (const k of Object.keys(h.rows[0]!)) expect(k).not.toContain('_');
    expect(fila['Solicitante']).toBe('100');
    expect(fila['Cliente (razón social)']).toBe('Cliente A');
  });
  it('importes y números redondeados a 2 decimales, fechas como dd/mm/aaaa', () => {
    expect(fila['Inversión en comodato']).toBe(2000.46);
    expect(fila['ROI (x)']).toBe(2.4);
    expect(fila['Última facturación']).toBe('18/09/2026');
    expect(hojas[1]!.rows[0]!['Mes']).toBe('09/2026');
  });
  it('agrega tipo de equipo y con/sin comodato; una columna nueva del SQL sale con nombre legible', () => {
    expect(fila['Tipo de equipo']).toBe('Canister');
    expect(fila['Con comodato']).toBe('Sí');
    expect(fila['Campo nuevo del sql']).toBe('x');
  });
  it('la hoja de la serie trae la razón social del solicitante', () => {
    expect(hojas[1]!.rows[0]!['Cliente (razón social)']).toBe('Cliente A');
  });
  it('nombreLegible', () => {
    expect(nombreLegible('importe_mes_actual')).toBe('Importe mes actual');
  });
});
