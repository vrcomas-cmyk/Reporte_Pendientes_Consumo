import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simula la cadena de supabase-js: from().update().eq().select() y from().insert().
const estado = { filasActualizadas: 0, errUpdate: null as { message: string } | null, errInsert: null as { message: string } | null };
const insert = vi.fn(async () => ({ error: estado.errInsert }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => ({ select: async () => ({ data: Array.from({ length: estado.filasActualizadas }, () => ({ key: 'k' })), error: estado.errUpdate }) }) }),
      insert,
    }),
  },
}));

import { setConnectorValue } from './permissionsService';

beforeEach(() => { estado.filasActualizadas = 0; estado.errUpdate = null; estado.errInsert = null; insert.mockClear(); });

describe('setConnectorValue', () => {
  it('si la fila existe, la actualiza y no inserta', async () => {
    estado.filasActualizadas = 1;
    await setConnectorValue('filtros_grupos_excluidos', '["18"]', 'admin');
    expect(insert).not.toHaveBeenCalled();
  });

  it('si el update toca 0 filas (la fila no existe), la CREA en vez de decir «guardado» sin guardar', async () => {
    estado.filasActualizadas = 0;
    await setConnectorValue('filtros_grupos_excluidos', '["18","19"]', 'admin', 'Filtros · Grupos');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ key: 'filtros_grupos_excluidos', value: '["18","19"]', label: 'Filtros · Grupos' }));
  });

  it('si tampoco puede crearla (sin permiso), lanza el error para que la pantalla lo muestre', async () => {
    estado.errInsert = { message: 'new row violates row-level security policy' };
    await expect(setConnectorValue('k', 'v', 'u')).rejects.toThrow(/No se pudo guardar/);
  });

  it('un error del update se propaga', async () => {
    estado.errUpdate = { message: 'boom' };
    await expect(setConnectorValue('k', 'v', 'u')).rejects.toBeTruthy();
  });
});
