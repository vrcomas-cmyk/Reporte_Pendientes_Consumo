import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));

import { estadoVigencia, historicoAutorizados, vigentes, type Propuesta } from './preciosService';

const prop = (over: Partial<Propuesta>): Propuesta => ({
  id: 'x', material: '100', concepto: 'oferta', condicion: 'CC', lote: '', costoAlEnviar: 10, baseAlEnviar: 50, precioCalculado: 40, precioPropuesto: 40,
  estado: 'autorizado', solicitadoPor: '', solicitadoEn: '2026-01-01T00:00:00Z', autorizadoPor: 'dir', autorizadoEn: '2026-01-01T00:00:00Z', comentario: null,
  precioEnviado: 40, archivoAutorizacion: null, lotesEnviados: null, vigenteDesde: null, vigenteHasta: null, ...over,
});

const base = prop({ id: 'base', precioPropuesto: 40 });
const concurso = prop({ id: 'concurso', precioPropuesto: 30, autorizadoEn: '2026-06-01T00:00:00Z', vigenteHasta: '2026-08-31' });
const costo = () => 10;

describe('vigencia de precios autorizados', () => {
  it('durante el concurso rige el temporal', () => {
    expect(vigentes([base, concurso], costo, '2026-07-15').map((p) => p.id)).toEqual(['concurso']);
  });
  it('al terminar el concurso vuelve el precio anterior', () => {
    expect(vigentes([base, concurso], costo, '2026-09-01').map((p) => p.id)).toEqual(['base']);
  });
  it('el último día de vigencia todavía cuenta', () => {
    expect(estadoVigencia(concurso, '2026-08-31')).toBe('vigente');
  });
  it('uno programado no rige hasta su fecha', () => {
    const futuro = prop({ id: 'futuro', autorizadoEn: '2026-07-01T00:00:00Z', vigenteDesde: '2026-12-01' });
    expect(vigentes([base, futuro], costo, '2026-10-01').map((p) => p.id)).toEqual(['base']);
  });
  it('el histórico conserva todos, el más reciente primero', () => {
    expect(historicoAutorizados([base, concurso]).get('100|CC')?.map((p) => p.id)).toEqual(['concurso', 'base']);
  });
});
