import { describe, it, expect } from 'vitest';
import { centroPasaFiltro } from './centrosFiltroStore';

describe('centroPasaFiltro', () => {
  it('sin centros elegidos pasa todo', () => expect(centroPasaFiltro('1001', '1004', [])).toBe(true));
  it('pasa el centro del pedido, los elegidos y los vacíos', () => {
    const sel = ['1018', '1031'];
    expect(centroPasaFiltro('1004', '1004', sel)).toBe(true);
    expect(centroPasaFiltro('1018', '1004', sel)).toBe(true);
    expect(centroPasaFiltro('', '1004', sel)).toBe(true);
  });
  it('descarta el resto', () => expect(centroPasaFiltro('1001', '1004', ['1018'])).toBe(false));
});
