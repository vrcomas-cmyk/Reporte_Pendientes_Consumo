import { describe, expect, it } from 'vitest';
import {
  ACCIONES, configTransmision, listaDeOrigenes, moduloDeAccion, moduloPermitido, ordenarPermisos, origenPermitido, parametrosDeAccion, urlLibroValida, type FilaPermiso,
} from '../../supabase/functions/envios/acceso';

const URL_OK = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0';

describe('configuración de Transmisión (se guarda desde la app)', () => {
  it('una URL de libro solo es válida si es de Google Sheets (https)', () => {
    expect(urlLibroValida(URL_OK)).toBe(true);
    expect(urlLibroValida('https://evil.example/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe(false);
    expect(urlLibroValida('http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe(false);
    expect(urlLibroValida('https://docs.google.com/spreadsheets/d/corto')).toBe(false);
    expect(urlLibroValida(null)).toBe(false);
  });
  it('tx_pestanas solo acepta una URL de Google Sheets válida y es acción de administrador', () => {
    expect(moduloDeAccion('tx_pestanas')).toBe('admin');
    expect(parametrosDeAccion('tx_pestanas', { url: URL_OK, otro: 'x' })).toEqual({ url: URL_OK });
    expect(parametrosDeAccion('tx_pestanas', { url: 'https://evil.example' })).toBeNull();
  });
  it('las acciones de configuración son SOLO de administradores (aunque el usuario no tenga rol)', () => {
    expect(moduloPermitido(true, true, [], 'admin')).toBe(true);
    expect(moduloPermitido(false, false, [], 'admin')).toBe(false);
    expect(moduloPermitido(false, true, [{ subject_type: 'role', scope: 'module', module_key: 'admin', allowed: true }], 'admin')).toBe(false);
  });
  it('configTransmision: acepta JSON, descarta URLs inválidas y deja pestañas null = «todas»', () => {
    const cfg = configTransmision(JSON.stringify({
      libros: [{ url: URL_OK, pestanas: ['Nov 2026', ' Oct 2026 ', '', 'Nov 2026'] }, { url: 'https://evil.example' }, { url: URL_OK, pestanas: [] }],
      histUrl: URL_OK,
    }));
    expect(cfg).toEqual({ libros: [{ url: URL_OK, pestanas: ['Nov 2026', 'Oct 2026'] }, { url: URL_OK, pestanas: null }], histUrl: URL_OK });
    expect(configTransmision({ libros: [{ url: URL_OK }], histUrl: 'no es url' })).toEqual({ libros: [{ url: URL_OK, pestanas: null }], histUrl: '' });
  });
  it('configTransmision: sin libros válidos o con basura → null; limita libros y pestañas', () => {
    expect(configTransmision(null)).toBeNull();
    expect(configTransmision('no es json')).toBeNull();
    expect(configTransmision({ libros: [] })).toBeNull();
    expect(configTransmision({ libros: [{ url: 'x' }] })).toBeNull();
    expect(configTransmision({ libros: Array.from({ length: 30 }, () => ({ url: URL_OK })) })?.libros).toHaveLength(10);
    expect(configTransmision({ libros: [{ url: URL_OK, pestanas: Array.from({ length: 200 }, (_, i) => `P${i}`) }] })?.libros[0].pestanas).toHaveLength(80);
  });
});

const mod = (key: string, allowed: boolean, subject = 'role'): FilaPermiso => ({ subject_type: subject, scope: 'module', module_key: key, allowed });

describe('lista blanca de acciones', () => {
  it('solo existen las acciones declaradas y cada una exige su módulo', () => {
    expect(moduloDeAccion('tx_indice')).toBe('transmision');
    expect(moduloDeAccion('tx_historial')).toBe('transmision');
    expect(moduloDeAccion('borrarTodo')).toBeNull();
    expect(moduloDeAccion('toString')).toBeNull(); // no se cuela por el prototipo
    expect(moduloDeAccion(undefined)).toBeNull();
    expect(Object.keys(ACCIONES).sort()).toEqual(['cad_borrar', 'cad_guardar', 'cad_listar', 'tx_historial', 'tx_indice', 'tx_pestanas']);
    expect(moduloDeAccion('cad_guardar')).toBe('inventario');
  });

  it('cad_guardar: valida material, lote y fecha real; neutraliza fórmulas en la nota', () => {
    const ok = { material: '123', lote: 'L1', fecha: '2028-01-31', sistema: '2026-12-01', nota: 'corregido' };
    expect(parametrosDeAccion('cad_guardar', { ...ok, extra: 'x' })).toEqual(ok);
    expect(parametrosDeAccion('cad_guardar', { ...ok, fecha: '2028-02-30' })).toBeNull();
    expect(parametrosDeAccion('cad_guardar', { ...ok, fecha: '31/01/2028' })).toBeNull();
    expect(parametrosDeAccion('cad_guardar', { ...ok, lote: '' })).toBeNull();
    expect(parametrosDeAccion('cad_guardar', { ...ok, lote: '=HYPERLINK("x")' })).toBeNull();
    expect(parametrosDeAccion('cad_guardar', { ...ok, sistema: 'basura' })).toBeNull();
    expect(parametrosDeAccion('cad_guardar', { ...ok, sistema: '' })).toMatchObject({ sistema: '' });
    expect(parametrosDeAccion('cad_guardar', { ...ok, nota: '=1+1' })).toMatchObject({ nota: "'=1+1" });
  });

  it('cad_borrar y cad_listar: solo material/lote o nada', () => {
    expect(parametrosDeAccion('cad_borrar', { material: '123', lote: 'L1', otro: 1 })).toEqual({ material: '123', lote: 'L1' });
    expect(parametrosDeAccion('cad_borrar', { material: '123' })).toBeNull();
    expect(parametrosDeAccion('cad_listar', { material: '123' })).toEqual({});
  });

  it('tx_indice no reenvía parámetros aunque el cliente mande otros', () => {
    expect(parametrosDeAccion('tx_indice', { url: 'https://evil', token: 'x' })).toEqual({});
  });

  it('tx_historial: valida y recorta las entregas (únicas, texto corto, tope)', () => {
    expect(parametrosDeAccion('tx_historial', { deliverys: ['81', ' 81 ', '82', '', null] })).toEqual({ deliverys: ['81', '82'] });
    expect(parametrosDeAccion('tx_historial', { deliverys: 'no es lista' })).toBeNull();
    expect(parametrosDeAccion('tx_historial', { deliverys: [] })).toBeNull();
    expect(parametrosDeAccion('tx_historial', { deliverys: ['x'.repeat(40)] })).toBeNull(); // largo excesivo → se descarta → queda vacío
    expect(parametrosDeAccion('tx_historial', { deliverys: Array.from({ length: 3001 }, (_, i) => String(i + 1)) })).toBeNull();
    expect(parametrosDeAccion('otra', {})).toBeNull();
  });
});

describe('permiso de módulo (misma regla que el cliente)', () => {
  it('administrador o usuario sin rol: sin restricciones', () => {
    expect(moduloPermitido(true, true, [], 'transmision')).toBe(true);
    expect(moduloPermitido(false, false, [], 'transmision')).toBe(true);
  });
  it('un rol restringido solo entra a lo que se le concedió explícitamente', () => {
    expect(moduloPermitido(false, true, [], 'transmision')).toBe(false);
    expect(moduloPermitido(false, true, [mod('transmision', true)], 'transmision')).toBe(true);
    expect(moduloPermitido(false, true, [mod('solicitudes', true)], 'transmision')).toBe(false);
    expect(moduloPermitido(false, true, [mod('transmision', false)], 'transmision')).toBe(false);
  });
  it('la excepción del usuario gana a la del rol, en ambos sentidos', () => {
    const f = ordenarPermisos([mod('transmision', false, 'user'), mod('transmision', true, 'role')]);
    expect(moduloPermitido(false, true, f, 'transmision')).toBe(false);
    const g = ordenarPermisos([mod('transmision', true, 'user'), mod('transmision', false, 'role')]);
    expect(moduloPermitido(false, true, g, 'transmision')).toBe(true);
  });
  it('los permisos de columna o detalle no abren un módulo', () => {
    expect(moduloPermitido(false, true, [{ subject_type: 'role', scope: 'column', module_key: 'transmision', allowed: true }], 'transmision')).toBe(false);
  });
});

describe('CORS por lista de orígenes', () => {
  const permitidos = listaDeOrigenes('https://portal.degasa.example, https://otro.example/');
  it('permite los de la lista (sin barra final) y localhost', () => {
    expect(origenPermitido('https://portal.degasa.example', permitidos)).toBe('https://portal.degasa.example');
    expect(origenPermitido('https://otro.example/', permitidos)).toBe('https://otro.example');
    expect(origenPermitido('http://localhost:5173', permitidos)).toBe('http://localhost:5173');
    expect(origenPermitido('http://127.0.0.1:5199', [])).toBe('http://127.0.0.1:5199');
  });
  it('bloquea cualquier otro origen y, sin lista, todo lo que no sea localhost', () => {
    expect(origenPermitido('https://malo.example', permitidos)).toBe('');
    expect(origenPermitido('https://portal.degasa.example.malo.com', permitidos)).toBe('');
    expect(origenPermitido('https://portal.degasa.example', [])).toBe('');
    expect(origenPermitido(null, permitidos)).toBe('');
    expect(origenPermitido('http://localhost.malo.com', permitidos)).toBe('');
  });
});
