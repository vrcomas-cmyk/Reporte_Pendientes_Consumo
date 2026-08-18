import { describe, it, expect } from 'vitest';
import { reglaAplicable, evaluarAceptacion, destinatariosParaMaterial } from './matchingOfertas';
import type { ReglaAceptacion } from './types';

function mkRegla(over: Partial<ReglaAceptacion>): ReglaAceptacion {
  return {
    dest: 'CLI1', material: null, condiciones: [], estadoMaterial: 'indistinto',
    caducidadMinimaMeses: null, activa: true, notas: '', actualizadoEn: '', actualizadoPor: '',
    ...over,
  };
}

describe('reglaAplicable', () => {
  it('prioriza el override de material sobre la regla global del mismo destinatario', () => {
    const global = mkRegla({ dest: 'CLI1', material: null, notas: 'global' });
    const especifica = mkRegla({ dest: 'CLI1', material: 'MAT-A', notas: 'especifica' });
    expect(reglaAplicable([global, especifica], 'CLI1', 'MAT-A')?.notas).toBe('especifica');
    expect(reglaAplicable([global, especifica], 'CLI1', 'MAT-B')?.notas).toBe('global');
  });

  it('ignora reglas inactivas', () => {
    const inactiva = mkRegla({ dest: 'CLI1', material: null, activa: false });
    expect(reglaAplicable([inactiva], 'CLI1', 'MAT-A')).toBeNull();
  });

  it('null cuando el destinatario no tiene ninguna regla', () => {
    expect(reglaAplicable([], 'CLI1', 'MAT-A')).toBeNull();
  });

  it('ignora espacios de más (norm)', () => {
    const r = mkRegla({ dest: ' CLI1 ', material: ' MAT-A ' });
    expect(reglaAplicable([r], 'CLI1', 'MAT-A')).not.toBeNull();
  });
});

describe('evaluarAceptacion', () => {
  it('sin regla, no acepta', () => {
    expect(evaluarAceptacion(null, { condicion: 'normal', mesesCaducidad: 12, danado: false }).acepta).toBe(false);
  });

  it('acepta cuando la condición está en la lista de la regla', () => {
    const r = mkRegla({ condiciones: ['corta-caducidad'] });
    expect(evaluarAceptacion(r, { condicion: 'corta-caducidad', mesesCaducidad: null, danado: false }).acepta).toBe(true);
    expect(evaluarAceptacion(r, { condicion: 'danado', mesesCaducidad: null, danado: false }).acepta).toBe(false);
  });

  it('exige caducidad mínima cuando la regla la trae', () => {
    const r = mkRegla({ caducidadMinimaMeses: 3 });
    expect(evaluarAceptacion(r, { condicion: null, mesesCaducidad: 5, danado: false }).acepta).toBe(true);
    expect(evaluarAceptacion(r, { condicion: null, mesesCaducidad: 2, danado: false }).acepta).toBe(false);
    expect(evaluarAceptacion(r, { condicion: null, mesesCaducidad: null, danado: false }).acepta).toBe(false);
  });

  it('estado "buen-estado" rechaza material dañado; "danado" lo acepta', () => {
    const soloBueno = mkRegla({ estadoMaterial: 'buen-estado' });
    expect(evaluarAceptacion(soloBueno, { condicion: null, mesesCaducidad: null, danado: true }).acepta).toBe(false);
    const aceptaDanado = mkRegla({ estadoMaterial: 'danado' });
    expect(evaluarAceptacion(aceptaDanado, { condicion: null, mesesCaducidad: null, danado: true }).acepta).toBe(true);
  });

  it('combina varias condiciones — todas deben cumplirse', () => {
    const r = mkRegla({ condiciones: ['corta-caducidad'], caducidadMinimaMeses: 3, estadoMaterial: 'buen-estado' });
    expect(evaluarAceptacion(r, { condicion: 'corta-caducidad', mesesCaducidad: 5, danado: false }).acepta).toBe(true);
    expect(evaluarAceptacion(r, { condicion: 'corta-caducidad', mesesCaducidad: 1, danado: false }).acepta).toBe(false);
    expect(evaluarAceptacion(r, { condicion: 'corta-caducidad', mesesCaducidad: 5, danado: true }).acepta).toBe(false);
  });
});

describe('destinatariosParaMaterial', () => {
  const ctx = { condicion: 'corta-caducidad' as const, mesesCaducidad: 4, danado: false };

  it('el override de material gana sobre la regla global del mismo destinatario', () => {
    const reglas = [
      mkRegla({ dest: 'CLI1', material: null, condiciones: ['normal'] }),
      mkRegla({ dest: 'CLI1', material: 'MAT-A', condiciones: ['corta-caducidad'] }),
    ];
    const out = destinatariosParaMaterial(reglas, 'MAT-A', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].evaluacion.acepta).toBe(true);
  });

  it('ordena primero los que aceptan, luego por consumo histórico descendente', () => {
    const reglas = [
      mkRegla({ dest: 'A', condiciones: ['corta-caducidad'] }),
      mkRegla({ dest: 'B', condiciones: ['normal'] }), // no acepta corta-caducidad
      mkRegla({ dest: 'C', condiciones: ['corta-caducidad'] }),
    ];
    const consumo: Record<string, number> = { A: 10, C: 50 };
    const out = destinatariosParaMaterial(reglas, 'MAT-A', ctx, { consumoDe: (d) => consumo[d] ?? 0 });
    expect(out.map((o) => o.dest)).toEqual(['C', 'A', 'B']);
  });

  it('ignora reglas de otros materiales que no son globales', () => {
    const reglas = [mkRegla({ dest: 'A', material: 'OTRO-MAT' })];
    expect(destinatariosParaMaterial(reglas, 'MAT-A', ctx)).toHaveLength(0);
  });
});
