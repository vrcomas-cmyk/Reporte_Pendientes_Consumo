import { beforeEach, describe, expect, it } from 'vitest';
import { indexarHoja, type HojaCruda, type LibroClave } from '@/core/pedidos';
import { hojasDeLibro, usePedidosStore } from './pedidosStore';

const hoja = (libro: LibroClave, nombre: string, filas: string[][] = [['1']]): ReturnType<typeof indexarHoja> =>
  indexarHoja({ libro, hoja: nombre, nombreLibro: 'L', ultimaModificacion: '2026-10-08', columnas: ['Material'], rows: filas, sincronizadoEn: '2026-10-08' } satisfies HojaCruda);
const info = (filas: number) => ({ nombre: 'L', modificado: '2026-10-08', leidoEn: '2026-10-08', filas });

describe('usePedidosStore.reemplazarLibro', () => {
  beforeEach(() => usePedidosStore.setState({ hojas: {}, fuentes: {}, hidratado: false, syncing: false, progress: null, error: null, ultimaRevision: null }));

  it('reemplaza TODAS las hojas del libro (borra las que ya no vienen) sin tocar los demás libros', () => {
    const { restaurar, reemplazarLibro } = usePedidosStore.getState();
    restaurar([hoja('condicion', 'Corta caducidad'), hoja('condicion', 'Caduco'), hoja('pedidos', 'Sheet1')], {});

    reemplazarLibro('condicion', [hoja('condicion', 'Corta caducidad', [['9'], ['8']])], info(2));

    const { hojas, fuentes } = usePedidosStore.getState();
    expect(Object.keys(hojas).sort()).toEqual(['condicion:Corta caducidad', 'pedidos:Sheet1']);
    expect(hojas['condicion:Corta caducidad']?.rows).toHaveLength(2);
    expect(hojasDeLibro(hojas, 'pedidos')).toHaveLength(1);
    expect(fuentes.condicion?.filas).toBe(2);
  });

  it('finish sin error marca la revisión; con error no (para reintentar al volver a abrir)', () => {
    const { start, finish } = usePedidosStore.getState();
    start();
    finish();
    expect(usePedidosStore.getState().ultimaRevision).not.toBeNull();
    start();
    finish('falló');
    expect(usePedidosStore.getState()).toMatchObject({ error: 'falló', ultimaRevision: null, syncing: false });
  });
});
