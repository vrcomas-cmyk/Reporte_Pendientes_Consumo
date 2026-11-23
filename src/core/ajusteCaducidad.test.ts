import { describe, expect, it } from 'vitest';
import { aplicarAjusteCaducidad, claveAjuste, fechaIsoValida, indexarAjustes, type AjusteCaducidad } from './ajusteCaducidad';
import { parsearLotes } from './invCondicionLibros';
import { indexarHoja } from './pedidos';

const aj = (material: string, lote: string, fecha: string): AjusteCaducidad => ({ material, lote, fecha, sistema: '', usuario: 'u', actualizado: '', nota: '' });

describe('ajusteCaducidad', () => {
  it('la clave ignora espacios, el sufijo .0 del material y las mayúsculas del lote', () => {
    expect(claveAjuste(' 123.0 ', ' ab1 ')).toBe(claveAjuste('123', 'AB1'));
    expect(claveAjuste('123', 'A')).not.toBe(claveAjuste('124', 'A'));
  });

  it('valida fechas reales', () => {
    expect(fechaIsoValida('2027-02-28')).toBe('2027-02-28');
    expect(fechaIsoValida('2027-02-30')).toBeNull();
    expect(fechaIsoValida('28/02/2027')).toBeNull();
  });

  it('aplica el ajuste y conserva la fecha del sistema', () => {
    const buscar = indexarAjustes([aj('123', 'L1', '2028-01-31')]);
    const r = aplicarAjusteCaducidad({ material: '123', lote: 'l1', fechaCaducidad: '2026-12-01' }, buscar);
    expect(r.fechaCaducidad).toBe('2028-01-31');
    expect(r.caducidadAjustada).toBe(true);
    expect(r.caducidadSistema).toBe('2026-12-01');
  });

  it('sin ajuste devuelve la misma fila', () => {
    const fila = { material: '9', lote: 'X', fechaCaducidad: '2026-12-01' };
    expect(aplicarAjusteCaducidad(fila, indexarAjustes([aj('1', 'A', '2028-01-01')]))).toBe(fila);
    expect(aplicarAjusteCaducidad(fila, undefined)).toBe(fila);
  });

  it('un ajuste cambia la clasificación de corta caducidad al parsear el libro', () => {
    const hoy = new Date(2026, 10, 23);
    const hoja = indexarHoja({
      libro: 'condicion', hoja: 'Corta caducidad', nombreLibro: 'Inv', ultimaModificacion: '', sincronizadoEn: '',
      columnas: ['Material', 'Centro', 'Almacén', 'Lote', 'FeCaduc/FePrefercons', 'Libre utilización', 'Trans./Trasl.', 'Bloqueado', 'Texto breve de material'],
      rows: [['100', '1030', '1030', 'L1', '2027-01-15', '5', '0', '0', 'Mat']],
    });
    expect(parsearLotes(hoja, hoy)[0].motivo).toBe('VIGENCIA');
    const l = parsearLotes(hoja, hoy, indexarAjustes([aj('100', 'L1', '2029-06-30')]))[0];
    expect(l.fechaCaducidad).toBe('2029-06-30');
    expect(l.motivo).toBeNull();
    expect(l.caducidadAjustada).toBe(true);
    expect(l.caducidadSistema).toBe('2027-01-15');
  });
});
