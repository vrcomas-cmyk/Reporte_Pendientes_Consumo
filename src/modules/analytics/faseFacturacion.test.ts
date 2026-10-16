import { describe, expect, it } from 'vitest';
import { faseFacturacion, textoFase } from './faseFacturacion';

const base = { hidratado: true, sincronizando: false, hayFilas: false, calculando: false, listos: false, error: null as string | null };

describe('faseFacturacion', () => {
  it('antes de leer la caché local: restaurando', () => {
    expect(faseFacturacion({ ...base, hidratado: false })).toBe('restaurando');
  });
  it('primera descarga (sin filas todavía): descargando, no "no cargada"', () => {
    expect(faseFacturacion({ ...base, sincronizando: true })).toBe('descargando');
  });
  it('con filas y armando índices: calculando', () => {
    expect(faseFacturacion({ ...base, hayFilas: true, calculando: true })).toBe('calculando');
  });
  it('un error se ve como error (no se queda en calculando)', () => {
    expect(faseFacturacion({ ...base, hayFilas: true, calculando: false, error: 'boom' })).toBe('error');
    expect(textoFase('error', 'boom', null)).toContain('boom');
  });
  it('índices listos: lista, aunque haya un error viejo del store', () => {
    expect(faseFacturacion({ ...base, hayFilas: true, listos: true, error: 'viejo' })).toBe('lista');
  });
  it('sin nada cargado ni en curso: vacía', () => {
    expect(faseFacturacion(base)).toBe('vacia');
    expect(textoFase('vacia', null, null)).toBe('Facturación no cargada');
  });
  it('el texto de la descarga lleva el porcentaje', () => {
    expect(textoFase('descargando', null, 41.6)).toBe('Descargando facturación… 42%');
  });
});
