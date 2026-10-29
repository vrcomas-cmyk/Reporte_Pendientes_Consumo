import { describe, expect, it } from 'vitest';
import {
  POLITICA_ABIERTA, condicionVisible, filtrarFacturacion, filtrarHoja, filtrarPestanaCatalogo, filtrarRelacion, mapaZonas, normCode, politicaDe,
  type PoliticaDatos,
} from '../../supabase/functions/datos/accesoDatos';

const hoy = new Date(2026, 9, 28);
const ejecutivos = [
  { Zona: '101', Ejecutivo: 'Ana', 'Cod Of Vtas': 'A01', 'Correo Electrónico': 'ana@x.com; ANA2@x.com' },
  { Zona: '102', Ejecutivo: 'Beto', 'Cod Of Vtas': 'B01', 'Correo Electrónico': 'beto@x.com' },
];
const mapa = mapaZonas(ejecutivos);
const ejecutivo = (extra: Partial<PoliticaDatos> = {}): PoliticaDatos => ({
  ...POLITICA_ABIERTA, sinRestriccion: false, restringirZona: true, zonas: ['101'], verPrecioOtrasZonas: false, verCosto: false, ...extra,
});

describe('zonas', () => {
  it('normCode quita ceros y decimales', () => {
    expect(normCode('002')).toBe('2');
    expect(normCode('2.0')).toBe('2');
    expect(normCode(' ABC ')).toBe('abc');
  });
  it('el correo lleva a la zona (sin importar mayúsculas) y el código de oficina también', () => {
    expect(mapa.zonasDeCorreo('Ana@X.com')).toEqual(['101']);
    expect(mapa.zonasDeCorreo('ana2@x.com')).toEqual(['101']);
    expect(mapa.zonasDeCorreo('nadie@x.com')).toEqual([]);
    expect(mapa.zonaDe('A01')).toBe('101');
    expect(mapa.zonaDe('102')).toBe('102');
    expect(mapa.zonaDe('999')).toBe('');
  });
});

describe('politicaDe', () => {
  it('admin o sin rol: sin restricción', () => {
    expect(politicaDe(null, null, []).sinRestriccion).toBe(true);
    expect(politicaDe({ is_admin: true, restringir_zona: true }, null, []).sinRestriccion).toBe(true);
  });
  it('un rol sin configurar no restringe nada (como hoy)', () => {
    expect(politicaDe({ is_admin: false }, null, []).sinRestriccion).toBe(true);
  });
  it('cualquier campo restrictivo activa la política, y el override del usuario gana', () => {
    expect(politicaDe({ restringir_zona: true }, null, ['101']).sinRestriccion).toBe(false);
    expect(politicaDe({ ver_costo: false }, null, []).sinRestriccion).toBe(false);
    expect(politicaDe({ condiciones_permitidas: ['PNC'] }, null, []).sinRestriccion).toBe(false);
    expect(politicaDe({ ver_regla_cc_1032: false }, null, []).sinRestriccion).toBe(false);
    expect(politicaDe({ caducidad_max_meses: { 'Corta caducidad': 12 } }, null, []).sinRestriccion).toBe(false);
    expect(politicaDe({ caducidad_max_meses: {} }, null, []).sinRestriccion).toBe(true);
    expect(politicaDe({ ver_costo: false }, { verCosto: true }, []).sinRestriccion).toBe(true);
  });
});

describe('filtrarHoja · pedidos', () => {
  const columnas = ['Pedido', 'Razon Social', 'Material', 'Cantidad', 'Pendiente', 'Precio', 'Precio1', '$ Pendiente', 'Gpo. Vdor.', 'Ped. Cte.'];
  const propio = ['P1', 'Clínica A', '100', 10, 4, 55, 55, 220, 'A01', 'OC-9'];
  const ajeno = ['P2', 'Clínica B', '100', 8, 8, 70, 70, 560, 'B01', 'OC-7'];

  it('renglones de la zona propia llegan completos; los ajenos sin precio ni importe (cliente, cantidad y pendiente sí)', () => {
    const out = filtrarHoja('pedidos', 'Hoja1', { columnas, rows: [propio, ajeno] }, ejecutivo({ verCosto: true }), mapa.zonaDe, hoy);
    expect(out.rows[0]).toEqual(propio);
    expect(out.rows[1]).toEqual(['P2', 'Clínica B', '100', 8, 8, '', '', '', 'B01', '']);
  });
  it('con ver precio de otras zonas, el renglón ajeno llega completo', () => {
    const out = filtrarHoja('pedidos', 'Hoja1', { columnas, rows: [ajeno] }, ejecutivo({ verPrecioOtrasZonas: true, verCosto: true }), mapa.zonaDe, hoy);
    expect(out.rows[0]).toEqual(ajeno);
  });
  it('zona desconocida o sin Gpo. Vdor. se trata como ajena (falla cerrado)', () => {
    const raro = ['P3', 'Clínica C', '100', 1, 1, 9, 9, 9, 'ZZZ', 'x'];
    const out = filtrarHoja('pedidos', 'Hoja1', { columnas, rows: [raro] }, ejecutivo({ verCosto: true }), mapa.zonaDe, hoy);
    expect(out.rows[0]![5]).toBe('');
  });
  it('admin: la hoja pasa idéntica', () => {
    const h = { columnas, rows: [ajeno] };
    expect(filtrarHoja('pedidos', 'Hoja1', h, POLITICA_ABIERTA, mapa.zonaDe, hoy)).toBe(h);
  });
  it('comodato: quien ve solo su zona recibe únicamente los renglones de su zona', () => {
    const out = filtrarHoja('comodato', 'x', { columnas, rows: [propio, ajeno] }, ejecutivo(), mapa.zonaDe, hoy);
    expect(out.rows).toEqual([propio]);
  });
  it('comodato sin columna de zona no se entrega a quien ve solo su zona (falla cerrado)', () => {
    const out = filtrarHoja('comodato', 'x', { columnas: ['Solicitante', 'Material'], rows: [['1', '2']] }, ejecutivo(), mapa.zonaDe, hoy);
    expect(out.rows).toEqual([]);
  });
});

describe('filtrarHoja · costos, condiciones y caducidad', () => {
  it('vacía las columnas de costo y margen', () => {
    const h = { columnas: ['Material', 'Costo Estándar', 'Margen %'], rows: [['1', 30, 0.2]] };
    const out = filtrarHoja('disponibilidad', 'x', h, ejecutivo({ restringirZona: false }), mapa.zonaDe, hoy);
    expect(out.rows[0]).toEqual(['1', '', '']);
  });
  it('una pestaña de condición no permitida llega vacía; la permitida respeta el tope de caducidad', () => {
    const h = { columnas: ['Material', 'FechaCaducidad'], rows: [['1', '2027-03-01'], ['2', '2029-03-01'], ['3', '']] };
    const p = ejecutivo({ restringirZona: false, verCosto: true, condicionesPermitidas: ['Corta caducidad'], caducidadMaxMeses: { 'Corta caducidad': 12 } });
    expect(filtrarHoja('condicion', 'PNC', h, p, mapa.zonaDe, hoy).rows).toEqual([]);
    expect(filtrarHoja('condicion', 'Corta caducidad', h, p, mapa.zonaDe, hoy).rows.map((r) => r[0])).toEqual(['1', '3']);
  });
  it('regla del 1032: sin permiso no recibe lotes del 1032 con más de 12 meses; el resto sí', () => {
    const h = { columnas: ['Material', 'Almacén', 'FechaCaducidad'], rows: [['1', '1032', '2028-01-01'], ['2', '1032', '2027-02-01'], ['3', '1030', '2028-01-01']] };
    const p = ejecutivo({ restringirZona: false, verCosto: true, verReglaCC1032: false });
    expect(filtrarHoja('disponibilidad', 'x', h, p, mapa.zonaDe, hoy).rows.map((r) => r[0])).toEqual(['2', '3']);
  });
  it('fechas dd/mm/aaaa y mm/dd/aaaa se leen según la columna', () => {
    const dmy = { columnas: ['Material', 'Almacén', 'FechaCaducidad'], rows: [['1', '1032', '25/12/2028'], ['2', '1032', '05/01/2027']] };
    const p = ejecutivo({ restringirZona: false, verCosto: true, verReglaCC1032: false });
    expect(filtrarHoja('disponibilidad', 'x', dmy, p, mapa.zonaDe, hoy).rows.map((r) => r[0])).toEqual(['2']);
  });
});

describe('filtrarHoja · Revision por Status', () => {
  const h = { columnas: ['Material', 'Status'], rows: [['1', 'Liz/Lento mov'], ['2', 'Marcas propias'], ['3', 'Revision Liz'], ['4', '']] };
  it('filtra renglón por renglón según los Status permitidos y deja solo las partes permitidas', () => {
    const p = ejecutivo({ restringirZona: false, verCosto: true, condicionesPermitidas: ['Lento mov', 'Revision Liz'] });
    expect(filtrarHoja('condicion', 'Revision', h, p, mapa.zonaDe, hoy).rows).toEqual([['1', 'Lento mov'], ['3', 'Revision Liz']]);
  });
  it('sin ninguna condición de Revision permitida, la pestaña llega vacía; con Marcas propias fuera, ese material no llega', () => {
    const p = ejecutivo({ restringirZona: false, verCosto: true, condicionesPermitidas: ['PNC'] });
    expect(filtrarHoja('condicion', 'Revision', h, p, mapa.zonaDe, hoy).rows).toEqual([]);
    const q = ejecutivo({ restringirZona: false, verCosto: true, condicionesPermitidas: ['Lento mov', 'Revision Liz'] });
    expect(filtrarHoja('condicion', 'Revision2', h, q, mapa.zonaDe, hoy).rows.map((r) => r[0])).not.toContain('2');
  });
  it('otras pestañas sin permiso siguen llegando vacías', () => {
    const p = ejecutivo({ restringirZona: false, verCosto: true, condicionesPermitidas: ['Lento mov'] });
    expect(filtrarHoja('condicion', 'PNC', { columnas: ['Material'], rows: [['1']] }, p, mapa.zonaDe, hoy).rows).toEqual([]);
  });
});

describe('filtrarFacturacion', () => {
  const columnas = ['Mes', 'Solicitante', 'Razon Social', 'Destinatario', 'Material', 'Centro', 'Gpo. Vdor.', 'Cantidad', 'Importe', 'Precio Min', 'Precio Max'];
  const propio = ['10/2026', 'S1', 'Clínica A', 'D1', '100', '1001', 'A01', 5, 500, 90, 110];
  const ajeno = ['10/2026', 'S2', 'Clínica B', 'D2', '100', '1001', 'B01', 7, 900, 120, 140];
  it('la zona propia completa; la ajena conserva la cantidad pero sin cliente ni importes', () => {
    const out = filtrarFacturacion({ columnas, rows: [propio, ajeno] }, ejecutivo({ verCosto: true }), mapa.zonaDe);
    expect(out.rows[0]).toEqual(propio);
    expect(out.rows[1]).toEqual(['10/2026', '', '', '', '100', '1001', 'B01', 7, '', '', '']);
  });
});

describe('catálogo', () => {
  it('InvConsolidado: solo las condiciones permitidas, y de una compuesta solo las partes permitidas', () => {
    const rows = [{ Material: '1', Condicion: 'Liz/Lento mov' }, { Material: '2', Condicion: 'PNC' }, { Material: '3', Condicion: '' }];
    const out = filtrarPestanaCatalogo('InvConsolidado', rows, ejecutivo({ restringirZona: false, verCosto: true, condicionesPermitidas: ['Lento mov'] }), hoy);
    expect(out).toEqual([{ Material: '1', Condicion: 'Lento mov' }, { Material: '3', Condicion: '' }]);
  });
  it('Materiales: sin permiso de costos el costo no viaja', () => {
    const out = filtrarPestanaCatalogo('Materiales', [{ Material: '1', 'Costo Unitario': 12, Precio: 40 }], ejecutivo({ restringirZona: false }), hoy);
    expect(out).toEqual([{ Material: '1', 'Costo Unitario': '', Precio: 40 }]);
  });
  it('InvDetalle: aplica la regla del 1032', () => {
    const rows = [{ Almacén: '1032', FechaCaducidad: '2028-05-01' }, { Almacén: '1032', FechaCaducidad: '2027-05-01' }];
    const out = filtrarPestanaCatalogo('InvDetalle', rows, ejecutivo({ restringirZona: false, verCosto: true, verReglaCC1032: false }), hoy);
    expect(out).toHaveLength(1);
  });
});

describe('relacion y condiciones', () => {
  it('el manifiesto no lista las pestañas de condición que no puede ver', () => {
    const rel = [{ clave: 'condicion', hojas: [{ nombre: 'PNC' }, { nombre: 'Corta caducidad' }] }, { clave: 'pedidos', hojas: [{ nombre: 'Hoja1' }] }];
    const out = filtrarRelacion(rel, ejecutivo({ condicionesPermitidas: ['PNC'] })) as { hojas: { nombre: string }[] }[];
    expect(out[0]!.hojas.map((h) => h.nombre)).toEqual(['PNC']);
    expect(out[1]!.hojas).toHaveLength(1);
  });
  it('condicionVisible', () => {
    expect(condicionVisible('A/B', ['b'])).toBe('B');
    expect(condicionVisible('A', ['b'])).toBeNull();
    expect(condicionVisible('A', null)).toBe('A');
  });
});
