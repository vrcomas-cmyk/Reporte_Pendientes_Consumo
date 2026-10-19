import { describe, it, expect } from 'vitest';
import { clasificarModulosAdmin, moduloDeRuta, unirModulos } from './permissionsRegistry';

const mod = (key: string) => ({ key, label: key });

describe('moduloDeRuta', () => {
  it('la raíz es el panel; el resto, la ruta sin barras ni parámetros', () => {
    expect(moduloDeRuta('/')).toBe('dashboard');
    expect(moduloDeRuta('/seg-pedidos')).toBe('seg-pedidos');
    expect(moduloDeRuta('/precios?x=1')).toBe('precios');
  });
});

describe('clasificarModulosAdmin', () => {
  const todos = ['dashboard', 'hoy', 'sugerencias', 'consumo', 'inventario', 'precios', 'seg-pedidos'].filter((k) => k !== 'hoy').map(mod);
  const retirados = new Set(['dashboard', 'sugerencias', 'consumo', 'inventario']);
  const r = clasificarModulosAdmin(todos, { retirados, enMenu: ['hoy', 'precios', 'seg-pedidos'] });

  it('los retirados SIN controles se ocultan', () => {
    expect(r.ocultos.map((m) => m.key).sort()).toEqual(['consumo', 'dashboard']);
    expect(r.visibles.map((v) => v.modulo.key)).not.toContain('consumo');
  });

  it('los retirados CON controles se muestran marcados, con la nota de lo que aún controlan', () => {
    const inv = r.visibles.find((v) => v.modulo.key === 'inventario')!;
    expect(inv.estado).toBe('retirado');
    expect(inv.nota).toContain('Costo del material');
    const sug = r.visibles.find((v) => v.modulo.key === 'sugerencias')!;
    expect(sug.estado).toBe('retirado');
    expect(sug.nota).toContain('Precio');
  });

  it('los activos salen normales y sin nota', () => {
    for (const k of ['precios', 'seg-pedidos']) {
      expect(r.visibles.find((v) => v.modulo.key === k)).toMatchObject({ estado: 'normal' });
    }
  });

  it('detecta los módulos del menú que no existen en la base (hoy no se puede conceder)', () => {
    expect(r.faltantes).toEqual(['hoy']);
  });
});

describe('unirModulos', () => {
  const base = [{ key: 'seg-pedidos', label: 'Seg. de pedidos', sortOrder: 5 }, { key: 'precios', label: 'Precios', sortOrder: 14 }];
  const menu = [
    { key: 'hoy', label: 'Hoy' }, { key: 'seg-pedidos', label: 'Seguimiento' }, { key: 'facturacion', label: 'Facturación' },
    { key: 'inv-disponibilidad', label: 'Inventario · Disponibilidad' }, { key: 'precios', label: 'Precios' }, { key: 'nuevo-futuro', label: 'Módulo futuro' },
  ];
  const r = unirModulos(base, menu);

  it('los módulos del menú que no están en la base salen como nuevos (para registrarlos), cada uno una vez', () => {
    expect(r.nuevos.map((m) => m.key)).toEqual(['hoy', 'facturacion', 'inv-disponibilidad', 'nuevo-futuro']);
    expect(unirModulos(base, [...menu, ...menu]).nuevos).toHaveLength(4);
  });
  it('aparecen TODOS en la lista, también los futuros, sin repetir', () => {
    expect(r.todos.map((m) => m.key).sort()).toEqual(['facturacion', 'hoy', 'inv-disponibilidad', 'nuevo-futuro', 'precios', 'seg-pedidos']);
  });
  it('lo ya registrado conserva su etiqueta y orden', () => {
    expect(r.todos.find((m) => m.key === 'seg-pedidos')).toEqual({ key: 'seg-pedidos', label: 'Seg. de pedidos', sortOrder: 5 });
  });
  it('si no falta nada no hay nada que registrar', () => {
    expect(unirModulos(r.todos, menu).nuevos).toEqual([]);
  });
});
