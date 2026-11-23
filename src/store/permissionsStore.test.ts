import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeEffectivePermissions } from '@/core/permissions';

const cargar = vi.fn();
vi.mock('@/services/permissionsService', () => ({ loadEffectivePermissions: (...a: unknown[]) => cargar(...a) }));
const warning = vi.fn();
vi.mock('@/store/toastStore', () => ({ toast: { warning: (...a: unknown[]) => warning(...a) } }));

import { usePermissionsStore } from './permissionsStore';

const admin = computeEffectivePermissions({ id: 'a', name: 'Admin', isAdmin: true }, []);
const ventas = computeEffectivePermissions({ id: 'r', name: 'Ventas', isAdmin: false }, []);

beforeEach(() => { vi.useFakeTimers(); cargar.mockReset(); warning.mockReset(); usePermissionsStore.getState().reset(); });
afterEach(() => { usePermissionsStore.getState().reset(); vi.useRealTimers(); });

describe('permissionsStore · estados', () => {
  it('lectura buena → ok, y no reintenta', async () => {
    cargar.mockResolvedValue({ perms: admin, origen: 'servidor' });
    await usePermissionsStore.getState().load('a@x.com');
    expect(usePermissionsStore.getState()).toMatchObject({ estado: 'ok', loaded: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it('servidor caído con copia → degradado (un solo aviso) y reintenta solo hasta recuperarse', async () => {
    cargar.mockResolvedValueOnce({ perms: ventas, origen: 'cache' }).mockResolvedValueOnce({ perms: ventas, origen: 'cache' }).mockResolvedValue({ perms: admin, origen: 'servidor' });
    await usePermissionsStore.getState().load('a@x.com');
    expect(usePermissionsStore.getState().estado).toBe('degradado');
    expect(warning).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(usePermissionsStore.getState().estado).toBe('degradado');
    expect(warning).toHaveBeenCalledTimes(1); // no se repite el aviso
    await vi.advanceTimersByTimeAsync(20_000);
    expect(usePermissionsStore.getState().estado).toBe('ok');
    expect(usePermissionsStore.getState().perms.isAdmin).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cargar).toHaveBeenCalledTimes(3); // ya no reintenta
  });

  it('sin copia → error (loaded para no quedarse en «verificando») y el reintento manual lo recupera', async () => {
    cargar.mockResolvedValueOnce({ perms: ventas, origen: 'error' }).mockResolvedValue({ perms: admin, origen: 'servidor' });
    await usePermissionsStore.getState().load('a@x.com');
    expect(usePermissionsStore.getState()).toMatchObject({ estado: 'error', loaded: true });
    await usePermissionsStore.getState().reintentar();
    expect(usePermissionsStore.getState().estado).toBe('ok');
  });

  it('cerrar sesión (reset) cancela los reintentos y descarta una lectura en vuelo', async () => {
    let resolver!: (v: unknown) => void;
    cargar.mockReturnValue(new Promise((r) => { resolver = r; }));
    const p = usePermissionsStore.getState().load('a@x.com');
    usePermissionsStore.getState().reset();
    resolver({ perms: admin, origen: 'servidor' });
    await p;
    expect(usePermissionsStore.getState()).toMatchObject({ estado: 'cargando', loaded: false });
  });

  it('dos load() a la vez comparten una sola lectura', async () => {
    cargar.mockResolvedValue({ perms: admin, origen: 'servidor' });
    await Promise.all([usePermissionsStore.getState().load('a@x.com'), usePermissionsStore.getState().load('a@x.com')]);
    expect(cargar).toHaveBeenCalledTimes(1);
  });
});
