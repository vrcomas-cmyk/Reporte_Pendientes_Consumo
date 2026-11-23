import { describe, expect, it } from 'vitest';
import {
  CLAVE_CFG_TRANSMISION, parseConfigTransmision, pestanasDeRespuesta, pestanasQueSeLeen, serializarConfigTransmision, urlLibroValida, validarConfigTransmision,
} from './enviosConfig';
import { configTransmision } from '../../supabase/functions/envios/acceso';

const URL_A = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0';
const URL_B = 'https://docs.google.com/spreadsheets/d/9ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210/edit';

describe('configuración de Transmisión guardada desde la app', () => {
  it('la clave lleva el prefijo que la oculta del listado genérico de Conectores', () => {
    expect(CLAVE_CFG_TRANSMISION.startsWith('envios_cfg_')).toBe(true);
  });

  it('lo guardado se lee de vuelta igual y lo vacío o ilegible da configuración vacía', () => {
    const cfg = { libros: [{ url: URL_A, pestanas: ['Nov 2026'] }, { url: URL_B, pestanas: null }], histUrl: URL_B };
    expect(parseConfigTransmision(serializarConfigTransmision(cfg))).toEqual(cfg);
    expect(parseConfigTransmision('')).toEqual({ libros: [], histUrl: '' });
    expect(parseConfigTransmision(null)).toEqual({ libros: [], histUrl: '' });
    expect(parseConfigTransmision('no es json')).toEqual({ libros: [], histUrl: '' });
  });

  it('al guardar recorta espacios, quita pestañas repetidas y usa null (= todas) si no se eligió ninguna', () => {
    const json = JSON.parse(serializarConfigTransmision({ libros: [{ url: ` ${URL_A} `, pestanas: [' Oct ', 'Oct', ''] }, { url: URL_B, pestanas: [] }], histUrl: '' }));
    expect(json.libros).toEqual([{ url: URL_A, pestanas: ['Oct'] }, { url: URL_B, pestanas: null }]);
  });

  it('el análisis es tolerante: conserva una URL mal escrita para que el admin la corrija', () => {
    const c = parseConfigTransmision(JSON.stringify({ libros: [{ url: 'esto no es una url', pestanas: [] }], histUrl: '' }));
    expect(c.libros).toEqual([{ url: 'esto no es una url', pestanas: null }]);
    expect(validarConfigTransmision(c)).toEqual(expect.arrayContaining([expect.stringContaining('Libro 1')]));
  });

  it('validarConfigTransmision: exige libros válidos, sin repetir; el histórico es opcional pero, si se pone, debe ser válido', () => {
    expect(validarConfigTransmision({ libros: [{ url: URL_A, pestanas: null }], histUrl: '' })).toEqual([]);
    expect(validarConfigTransmision({ libros: [], histUrl: '' })).toHaveLength(1);
    expect(validarConfigTransmision({ libros: [{ url: URL_A, pestanas: null }, { url: URL_A, pestanas: null }], histUrl: '' })).toContain('Hay un libro repetido.');
    expect(validarConfigTransmision({ libros: [{ url: URL_A, pestanas: null }], histUrl: 'x' })).toHaveLength(1);
    expect(urlLibroValida(URL_A)).toBe(true);
    expect(urlLibroValida('https://evil.example/d/xxxxxxxxxxxxxxxxxxxxxxxx')).toBe(false);
  });

  it('lo que guarda la app es EXACTAMENTE lo que el servidor acepta (mismo criterio en ambos lados)', () => {
    const cfg = { libros: [{ url: URL_A, pestanas: ['Nov 2026', 'Oct 2026'] }, { url: URL_B, pestanas: null }], histUrl: URL_B };
    expect(configTransmision(serializarConfigTransmision(cfg))).toEqual(cfg);
    // y lo que la app no deja guardar tampoco lo acepta el servidor
    expect(configTransmision(serializarConfigTransmision({ libros: [{ url: 'x', pestanas: null }], histUrl: '' }))).toBeNull();
  });
});

describe('pestañas de un libro', () => {
  const resp = { nombre: 'Transmisión 2026', pestanas: [
    { nombre: 'Nov 2026', transmision: true, filas: 120 }, { nombre: 'Oct 2026', transmision: true, filas: 300 },
    { nombre: 'Facturación', transmision: false, filas: 50 }, { nombre: '', transmision: true, filas: 1 }, 'basura',
  ] };

  it('pestanasDeRespuesta valida la forma y descarta lo que no sirve', () => {
    const r = pestanasDeRespuesta(resp);
    expect(r.nombre).toBe('Transmisión 2026');
    expect(r.pestanas.map((p) => p.nombre)).toEqual(['Nov 2026', 'Oct 2026', 'Facturación']);
    expect(pestanasDeRespuesta(null)).toEqual({ nombre: '', pestanas: [] });
  });

  it('sin selección se leen todas las pestañas de transmisión (y los meses nuevos entran solos); con selección, solo esas', () => {
    const { pestanas } = pestanasDeRespuesta(resp);
    expect(pestanasQueSeLeen(pestanas, null)).toEqual(['Nov 2026', 'Oct 2026']);
    expect(pestanasQueSeLeen(pestanas, ['Oct 2026'])).toEqual(['Oct 2026']);
    expect(pestanasQueSeLeen(pestanas, ['Ya no existe'])).toEqual([]);
  });
});
