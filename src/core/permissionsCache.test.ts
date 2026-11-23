import { describe, expect, it } from 'vitest';
import { computeEffectivePermissions, deserializarPermisos, serializarPermisos, type PermissionRow } from './permissions';

const fila = (moduleKey: string, scope: PermissionRow['scope'], itemKey: string, allowed: boolean): PermissionRow =>
  ({ subjectType: 'role', subjectId: 'r1', moduleKey, scope, itemKey, allowed });

describe('serializarPermisos / deserializarPermisos', () => {
  it('ida y vuelta conserva módulos, columnas y detalles ocultos y los datos del usuario (a través de JSON)', () => {
    const original = computeEffectivePermissions(
      { id: 'r1', name: 'Ventas', isAdmin: false },
      [fila('inventario', 'module', '', true), fila('sugerencias', 'module', '', true), fila('sugerencias', 'column', 'precio', false), fila('inventario', 'detail', 'costo', false)],
      { email: 'a@x.com', restringirZona: true, zonasManual: ['Z1'], verCosto: false, verPrecioOtrasZonas: false, condicionesPermitidas: ['Corta caducidad'], caducidadMaxMeses: { 'Corta caducidad': 12 }, verReglaCC1032: false },
    );
    const copia = deserializarPermisos(JSON.parse(JSON.stringify(serializarPermisos(original))));
    expect(copia).toEqual(original);
    expect(copia?.allowedModules).toBeInstanceOf(Set);
    expect(copia?.hiddenColumns.get('sugerencias')?.has('precio')).toBe(true);
  });

  it('un admin (allowedModules null = sin restricción) vuelve como admin', () => {
    const admin = computeEffectivePermissions({ id: 'a', name: 'Admin', isAdmin: true }, []);
    const copia = deserializarPermisos(JSON.parse(JSON.stringify(serializarPermisos(admin))));
    expect(copia?.isAdmin).toBe(true);
    expect(copia?.allowedModules).toBeNull();
  });

  it('lo que no tiene la forma esperada da null y nunca lanza', () => {
    for (const malo of [null, undefined, 5, 'x', [], {}, { isAdmin: 'si' }, { isAdmin: true, allowedModules: 'todos' }]) {
      expect(deserializarPermisos(malo)).toBeNull();
    }
  });

  it('tolera campos opcionales ausentes (copia de una versión anterior)', () => {
    const r = deserializarPermisos({ isAdmin: false, allowedModules: ['inventario'] });
    expect(r?.allowedModules?.has('inventario')).toBe(true);
    expect(r?.hiddenColumns.size).toBe(0);
    expect(r?.datos.verCosto).toBe(true);
  });
});
