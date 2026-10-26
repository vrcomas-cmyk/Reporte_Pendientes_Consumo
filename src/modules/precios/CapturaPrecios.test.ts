import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
import { leerPegado } from './CapturaPrecios';

describe('leerPegado', () => {
  it('lee dos columnas de Excel (tab)', () => {
    expect(leerPegado('100234\t45.50\n100871\t$1,200')).toEqual([{ material: '100234', precio: 45.5 }, { material: '100871', precio: 1200 }]);
  });
  it('acepta espacios, ignora líneas vacías y deja sin precio el que falta', () => {
    expect(leerPegado('100234 45\n\n100871')).toEqual([{ material: '100234', precio: 45 }, { material: '100871', precio: null }]);
  });
});
