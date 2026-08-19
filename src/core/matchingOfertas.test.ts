import { describe, it, expect } from 'vitest';
import { reglaAplicable, evaluarAceptacion, destinatariosParaMaterial, reglaFicha, reglaOverride, alertasColocacion, agruparAlertasPorMaterial, type LoteOfertable } from './matchingOfertas';
import type { ClienteConocimiento, ReglaAceptacion } from './types';

function mkFicha(over: Partial<ClienteConocimiento>): ClienteConocimiento {
  return {
    dest: 'CLI1', razonSocial: '', condicionesAceptadas: [], estadoMaterial: 'indistinto',
    caducidadMinimaDias: null, activa: true, descuentoHabitualPct: null,
    contactoNombre: '', contactoTelefono: '', contactoCorreo: '', canalPreferido: '', notasComerciales: '',
    actualizadoEn: '', actualizadoPor: '',
    ...over,
  };
}

function mkOverride(over: Partial<ReglaAceptacion>): ReglaAceptacion {
  return {
    dest: 'CLI1', material: 'MAT-A', condiciones: [], estadoMaterial: 'indistinto',
    caducidadMinimaMeses: null, activa: true, notas: '', actualizadoEn: '', actualizadoPor: '',
    ...over,
  };
}

describe('reglaAplicable', () => {
  it('prioriza el override de material sobre la ficha (regla global) del mismo cliente', () => {
    const ficha = mkFicha({ dest: 'CLI1', caducidadMinimaDias: 30, notasComerciales: 'global' });
    const override = mkOverride({ dest: 'CLI1', material: 'MAT-A', notas: 'especifica' });
    expect(reglaAplicable([ficha], [override], 'CLI1', 'MAT-A')?.notas).toBe('especifica');
    expect(reglaAplicable([ficha], [override], 'CLI1', 'MAT-B')?.notas).toBe('global');
  });

  it('sin ficha ni override, null', () => {
    expect(reglaAplicable([], [], 'CLI1', 'MAT-A')).toBeNull();
  });

  it('ignora fichas inactivas y overrides inactivos', () => {
    const ficha = mkFicha({ activa: false });
    expect(reglaAplicable([ficha], [], 'CLI1', 'MAT-A')).toBeNull();
    const override = mkOverride({ activa: false });
    expect(reglaAplicable([], [override], 'CLI1', 'MAT-A')).toBeNull();
  });

  it('ignora espacios de más (norm)', () => {
    const ficha = mkFicha({ dest: ' CLI1 ', caducidadMinimaDias: 30 });
    expect(reglaAplicable([ficha], [], 'CLI1', 'MAT-A')).not.toBeNull();
  });

  it('una ficha sin ningún criterio marcado NO cuenta como regla global (no "acepta todo" por defecto)', () => {
    const ficha = mkFicha({ dest: 'CLI1' }); // condicionesAceptadas: [], estadoMaterial: 'indistinto', caducidadMinimaDias: null
    expect(reglaAplicable([ficha], [], 'CLI1', 'MAT-A')).toBeNull();
  });
});

describe('evaluarAceptacion', () => {
  const ctx = { condicion: 'normal' as const, diasCaducidad: 360, danado: false, condicionTexto: null };

  it('sin regla, no acepta', () => {
    expect(evaluarAceptacion(null, ctx).acepta).toBe(false);
  });

  it('acepta cuando la condición está en la ficha', () => {
    const ficha = mkFicha({ condicionesAceptadas: ['corta-caducidad'] });
    expect(evaluarAceptacion(reglaFicha(ficha), { ...ctx, condicion: 'corta-caducidad', diasCaducidad: null }).acepta).toBe(true);
    expect(evaluarAceptacion(reglaFicha(ficha), { ...ctx, condicion: 'danado', diasCaducidad: null }).acepta).toBe(false);
  });

  it('exige caducidad mínima cuando la ficha la trae (días)', () => {
    const ficha = mkFicha({ caducidadMinimaDias: 90 });
    expect(evaluarAceptacion(reglaFicha(ficha), { ...ctx, diasCaducidad: 150 }).acepta).toBe(true);
    expect(evaluarAceptacion(reglaFicha(ficha), { ...ctx, diasCaducidad: 60 }).acepta).toBe(false);
    expect(evaluarAceptacion(reglaFicha(ficha), { ...ctx, diasCaducidad: null }).acepta).toBe(false);
  });

  it('estado "buen-estado" rechaza material dañado; "danado" lo acepta', () => {
    const soloBueno = mkFicha({ estadoMaterial: 'buen-estado' });
    expect(evaluarAceptacion(reglaFicha(soloBueno), { ...ctx, danado: true, condicionTexto: null }).acepta).toBe(false);
    const aceptaDanado = mkFicha({ estadoMaterial: 'danado' });
    expect(evaluarAceptacion(reglaFicha(aceptaDanado), { ...ctx, danado: true, condicionTexto: null }).acepta).toBe(true);
  });

  it('combina varias condiciones — todas deben cumplirse', () => {
    const ficha = mkFicha({ condicionesAceptadas: ['corta-caducidad'], caducidadMinimaDias: 90, estadoMaterial: 'buen-estado' });
    const ok = { condicion: 'corta-caducidad' as const, diasCaducidad: 150, danado: false, condicionTexto: null };
    expect(evaluarAceptacion(reglaFicha(ficha), ok).acepta).toBe(true);
    expect(evaluarAceptacion(reglaFicha(ficha), { ...ok, diasCaducidad: 30 }).acepta).toBe(false);
    expect(evaluarAceptacion(reglaFicha(ficha), { ...ok, danado: true, condicionTexto: null }).acepta).toBe(false);
  });
});

describe('destinatariosParaMaterial', () => {
  const ctx = { condicion: 'corta-caducidad' as const, diasCaducidad: 120, danado: false, condicionTexto: null };

  it('el override de material gana sobre la ficha del mismo cliente', () => {
    const fichas = [mkFicha({ dest: 'CLI1', condicionesAceptadas: ['normal'] })];
    const overrides = [mkOverride({ dest: 'CLI1', material: 'MAT-A', condiciones: ['corta-caducidad'] })];
    const out = destinatariosParaMaterial(fichas, overrides, 'MAT-A', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].origen).toBe('override');
    expect(out[0].evaluacion.acepta).toBe(true);
  });

  it('incluye clientes con ficha (regla global) y ordena aceptan primero, luego consumo', () => {
    const fichas = [
      mkFicha({ dest: 'A', condicionesAceptadas: ['corta-caducidad'] }),
      mkFicha({ dest: 'B', condicionesAceptadas: ['normal'] }), // no acepta corta-caducidad
      mkFicha({ dest: 'C', condicionesAceptadas: ['corta-caducidad'] }),
    ];
    const consumo: Record<string, number> = { A: 10, C: 50 };
    const out = destinatariosParaMaterial(fichas, [], 'MAT-A', ctx, { consumoDe: (d) => consumo[d] ?? 0 });
    expect(out.map((o) => o.dest)).toEqual(['C', 'A', 'B']);
  });

  it('ignora overrides de otros materiales', () => {
    const overrides = [mkOverride({ dest: 'A', material: 'OTRO-MAT' })];
    expect(destinatariosParaMaterial([], overrides, 'MAT-A', ctx)).toHaveLength(0);
  });

  it('no lista fichas inactivas', () => {
    const fichas = [mkFicha({ dest: 'A', activa: false, caducidadMinimaDias: 30 })];
    expect(destinatariosParaMaterial(fichas, [], 'MAT-A', ctx)).toHaveLength(0);
  });

  it('no lista fichas sin ningún criterio marcado — no "acepta todo" por defecto', () => {
    const fichas = [mkFicha({ dest: 'A' })]; // ficha activa pero en blanco
    expect(destinatariosParaMaterial(fichas, [], 'MAT-A', ctx)).toHaveLength(0);
  });

  it('una ficha en blanco no oculta el override específico del mismo material', () => {
    const fichas = [mkFicha({ dest: 'A' })];
    const overrides = [mkOverride({ dest: 'A', material: 'MAT-A', condiciones: ['corta-caducidad'] })];
    const out = destinatariosParaMaterial(fichas, overrides, 'MAT-A', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].origen).toBe('override');
    expect(out[0].evaluacion.acepta).toBe(true);
  });
});

// Casos reales descritos por el negocio — cada uno documenta cómo se
// configura y qué evalúa el motor. Sirven de contrato: si alguno de estos
// deja de pasar, el modelo de aceptación dejó de cubrir un caso real.
describe('casos de negocio (clientes A-G, modelo fusionado)', () => {
  it('Cliente A — cualquier material, siempre que tenga más de 8 meses de caducidad (ficha: caducidad mínima, sin condiciones)', () => {
    const ficha = mkFicha({ dest: 'A', caducidadMinimaDias: 240 });
    expect(evaluarAceptacion(reglaFicha(ficha), { condicion: 'normal', diasCaducidad: 270, danado: false, condicionTexto: null }).acepta).toBe(true);
    expect(evaluarAceptacion(reglaFicha(ficha), { condicion: 'danado', diasCaducidad: 270, danado: true, condicionTexto: null }).acepta).toBe(true); // no le importa condición ni daño
    expect(evaluarAceptacion(reglaFicha(ficha), { condicion: 'normal', diasCaducidad: 210, danado: false, condicionTexto: null }).acepta).toBe(false);
  });

  it('Cliente B — acepta corta caducidad, pero SOLO en los materiales que él mueve rápido (overrides, sin ficha)', () => {
    // Sin ficha: cualquier material sin override queda fuera del todo.
    const overrides = [
      mkOverride({ dest: 'B', material: 'MAT-RAPIDO-1', condiciones: ['corta-caducidad'] }),
      mkOverride({ dest: 'B', material: 'MAT-RAPIDO-2', condiciones: ['corta-caducidad'] }),
    ];
    expect(evaluarAceptacion(reglaAplicable([], overrides, 'B', 'MAT-RAPIDO-1'), { condicion: 'corta-caducidad', diasCaducidad: null, danado: false, condicionTexto: null }).acepta).toBe(true);
    expect(reglaAplicable([], overrides, 'B', 'MAT-NO-LISTADO')).toBeNull(); // no aparece como candidato para este material
  });

  it('Cliente C — solo el material X con corta-caducidad, sin importar si está dañado (override único)', () => {
    const override = mkOverride({ dest: 'C', material: 'MAT-X', condiciones: ['corta-caducidad'], estadoMaterial: 'indistinto' });
    expect(evaluarAceptacion(reglaOverride(override), { condicion: 'corta-caducidad', diasCaducidad: null, danado: true, condicionTexto: null }).acepta).toBe(true);
    expect(evaluarAceptacion(reglaOverride(override), { condicion: 'normal', diasCaducidad: null, danado: false, condicionTexto: null }).acepta).toBe(false); // otra condición, no aplica
  });

  it('Cliente D — acepta material dañado, pero solo con más de 12 meses de caducidad (ficha)', () => {
    const ficha = mkFicha({ dest: 'D', estadoMaterial: 'danado', caducidadMinimaDias: 360 });
    expect(evaluarAceptacion(reglaFicha(ficha), { condicion: 'danado', diasCaducidad: 390, danado: true, condicionTexto: null }).acepta).toBe(true);
    expect(evaluarAceptacion(reglaFicha(ficha), { condicion: 'danado', diasCaducidad: 180, danado: true, condicionTexto: null }).acepta).toBe(false);
  });

  it('Cliente E — código 1 con corta-caducidad, código 2 y el resto requieren buena caducidad (2 overrides + ficha)', () => {
    const ficha = mkFicha({ dest: 'E', caducidadMinimaDias: 240 }); // "el resto"
    const overrides = [
      mkOverride({ dest: 'E', material: 'COD-1', condiciones: ['corta-caducidad'] }),
      mkOverride({ dest: 'E', material: 'COD-2', caducidadMinimaMeses: 8 }),
    ];
    expect(evaluarAceptacion(reglaAplicable([ficha], overrides, 'E', 'COD-1'), { condicion: 'corta-caducidad', diasCaducidad: 30, danado: false, condicionTexto: null }).acepta).toBe(true);
    expect(evaluarAceptacion(reglaAplicable([ficha], overrides, 'E', 'COD-2'), { condicion: 'normal', diasCaducidad: 270, danado: false, condicionTexto: null }).acepta).toBe(true);
    expect(evaluarAceptacion(reglaAplicable([ficha], overrides, 'E', 'COD-2'), { condicion: 'normal', diasCaducidad: 90, danado: false, condicionTexto: null }).acepta).toBe(false);
    expect(evaluarAceptacion(reglaAplicable([ficha], overrides, 'E', 'COD-3'), { condicion: 'normal', diasCaducidad: 270, danado: false, condicionTexto: null }).acepta).toBe(true); // cae en "el resto"
  });

  it('Cliente G — no importa caducidad ni daño; "oferta atractiva" queda en notas, no bloquea el matching', () => {
    const ficha = mkFicha({ dest: 'G', notasComerciales: 'Solo si la oferta es atractiva (a criterio del ejecutivo).' });
    expect(evaluarAceptacion(reglaFicha(ficha), { condicion: 'danado', diasCaducidad: 0, danado: true, condicionTexto: null }).acepta).toBe(true);
  });

  it('Cliente ARG — acepta "Cosmopark" o "PNC", valores reales de negocio que no son ninguna de las 4 categorías fijas', () => {
    const ficha = mkFicha({ dest: 'ARG', condicionesAceptadas: ['Cosmopark', 'PNC'] });
    const regla = reglaFicha(ficha);
    // El lote trae condicion:'normal' (el regex de 4 categorías no reconoce "Cosmopark"),
    // pero condicionTexto sí trae el valor real — debe aceptar por texto, no por categoría.
    expect(evaluarAceptacion(regla, { condicion: 'normal', condicionTexto: 'Cosmopark', diasCaducidad: null, danado: false }).acepta).toBe(true);
    expect(evaluarAceptacion(regla, { condicion: 'normal', condicionTexto: 'PNC', diasCaducidad: null, danado: false }).acepta).toBe(true);
    expect(evaluarAceptacion(regla, { condicion: 'normal', condicionTexto: ' pnc ', diasCaducidad: null, danado: false }).acepta).toBe(true); // mayúsculas/espacios no importan
    expect(evaluarAceptacion(regla, { condicion: 'normal', condicionTexto: 'Otro valor', diasCaducidad: null, danado: false }).acepta).toBe(false);
  });
});

function mkLote(over: Partial<LoteOfertable>): LoteOfertable {
  return { material: 'MAT-A', descripcion: 'Material A', condicion: 'normal', condicionTexto: null, diasCaducidad: null, cantidadDisponible: 10, ...over };
}

describe('alertasColocacion — cruza todo el inventario contra todos los clientes de una sola vez', () => {
  it('avisa cuando el inventario disponible cumple la regla configurada de un cliente (caso del negocio: código A, ≥1 mes)', () => {
    const ficha = mkFicha({ dest: 'CLI1' }); // sin criterio: no debe avisar
    const overrideCodigoA = mkOverride({ dest: 'CLI1', material: 'COD-A', caducidadMinimaMeses: 1 });
    const lotes = [
      mkLote({ material: 'COD-A', diasCaducidad: 45, cantidadDisponible: 20 }), // cumple (>1 mes)
      mkLote({ material: 'COD-A', diasCaducidad: 10, cantidadDisponible: 5 }),  // no cumple
      mkLote({ material: 'COD-B', diasCaducidad: 200, cantidadDisponible: 50 }), // sin regla para este material
    ];
    const out = alertasColocacion([ficha], [overrideCodigoA], lotes);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dest: 'CLI1', material: 'COD-A', cantidadDisponible: 20, diasCaducidad: 45, origen: 'override' });
  });

  it('no avisa de un cliente sin nada configurado, aunque haya inventario especial disponible', () => {
    const ficha = mkFicha({ dest: 'CLI1' }); // en blanco
    const lotes = [mkLote({ material: 'COD-A', condicion: 'corta-caducidad', diasCaducidad: 20 })];
    expect(alertasColocacion([ficha], [], lotes)).toHaveLength(0);
  });

  it('ordena por caducidad más próxima primero', () => {
    const ficha = mkFicha({ dest: 'CLI1', caducidadMinimaDias: 1 });
    const lotes = [
      mkLote({ material: 'A', diasCaducidad: 90 }),
      mkLote({ material: 'B', diasCaducidad: 5 }),
      mkLote({ material: 'C', diasCaducidad: 30 }),
    ];
    const out = alertasColocacion([ficha], [], lotes);
    expect(out.map((o) => o.material)).toEqual(['B', 'C', 'A']);
  });

  it('una fila por (cliente, material) — varios lotes del mismo material se suman, no se repiten', () => {
    const ficha = mkFicha({ dest: 'CLI1', caducidadMinimaDias: 1 });
    const lotes = [
      mkLote({ material: 'COD-A', diasCaducidad: 90, cantidadDisponible: 10 }),
      mkLote({ material: 'COD-A', diasCaducidad: 40, cantidadDisponible: 15 }), // más urgente — representa la alerta
      mkLote({ material: 'COD-A', diasCaducidad: 200, cantidadDisponible: 5 }),
    ];
    const out = alertasColocacion([ficha], [], lotes);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ material: 'COD-A', lotesCount: 3, cantidadDisponible: 30, diasCaducidad: 40 });
  });

  it('varios clientes distintos pueden salir avisados para el mismo lote', () => {
    const fichas = [
      mkFicha({ dest: 'A', condicionesAceptadas: ['corta-caducidad'] }),
      mkFicha({ dest: 'B', condicionesAceptadas: ['corta-caducidad'] }),
    ];
    const lotes = [mkLote({ material: 'MAT-X', condicion: 'corta-caducidad', diasCaducidad: 15 })];
    const out = alertasColocacion(fichas, [], lotes);
    expect(out.map((o) => o.dest).sort()).toEqual(['A', 'B']);
  });
});

describe('agruparAlertasPorMaterial — enfoque "código A tiene 3 lotes, N clientes califican"', () => {
  it('el total de lotes/cantidad del material viene del inventario, no de sumar las alertas por cliente (evita duplicar el mismo lote una vez por cliente)', () => {
    const fichas = [
      mkFicha({ dest: 'A', caducidadMinimaDias: 1 }),
      mkFicha({ dest: 'B', caducidadMinimaDias: 1 }),
    ];
    const lotes = [
      mkLote({ material: 'COD-A', diasCaducidad: 90, cantidadDisponible: 10 }),
      mkLote({ material: 'COD-A', diasCaducidad: 40, cantidadDisponible: 15 }),
    ];
    const alertas = alertasColocacion(fichas, [], lotes);
    // Cada cliente ve el material completo (30 unid., 2 lotes) — sumar las
    // dos alertas daría 60, que es incorrecto: es el mismo inventario.
    expect(alertas).toHaveLength(2);
    const grupos = agruparAlertasPorMaterial(alertas, lotes);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ material: 'COD-A', lotesCount: 2, cantidadDisponible: 25, diasCaducidad: 40 });
    expect(grupos[0].clientes).toHaveLength(2);
  });

  it('excluye materiales sin ningún cliente candidato aunque tengan inventario', () => {
    const lotes = [mkLote({ material: 'COD-B', diasCaducidad: 90 })];
    expect(agruparAlertasPorMaterial([], lotes)).toHaveLength(0);
  });

  it('ordena por cantidad de clientes candidatos, luego por caducidad más próxima', () => {
    const fichaVarios = [
      mkFicha({ dest: 'A', caducidadMinimaDias: 1 }),
      mkFicha({ dest: 'B', caducidadMinimaDias: 1 }),
    ];
    const lotes = [
      mkLote({ material: 'COD-A', diasCaducidad: 90 }),
      mkLote({ material: 'COD-B', diasCaducidad: 10 }),
    ];
    const alertas = alertasColocacion(fichaVarios, [], lotes);
    const grupos = agruparAlertasPorMaterial(alertas, lotes);
    // Mismo número de clientes candidatos (2) en ambos materiales — desempata
    // el que vence antes (COD-B, 10 días) sobre COD-A (90 días).
    expect(grupos.map((g) => g.material)).toEqual(['COD-B', 'COD-A']);
    expect(grupos[0].clientes).toHaveLength(2);
    expect(grupos[1].clientes).toHaveLength(2);
  });
});