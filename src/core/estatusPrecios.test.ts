import { describe, it, expect } from 'vitest';
import { estatusDeFila, prepararEnvio, resumenAvisos, type FilaEstatusEntrada, type PropuestaEstatus } from './estatusPrecios';

const fila = (over: Partial<FilaEstatusEntrada> = {}): FilaEstatusEntrada => ({
  material: '100950', combinacion: 'CC', costo: 50, precioCalculado: 65, lotes: ['1018|1032|A1'], ...over,
});
let n = 0;
const prop = (over: Partial<PropuestaEstatus> = {}): PropuestaEstatus => {
  n += 1;
  return {
    id: `p${n}`, material: '100950', concepto: 'oferta', condicion: 'CC', estado: 'enviado', costoAlEnviar: 50, precioCalculado: 65, precioPropuesto: 65,
    solicitadoEn: `2026-10-0${n}T10:00:00Z`, autorizadoEn: null, lotesEnviados: ['1018|1032|A1'], ...over,
  };
};

describe('estatusDeFila', () => {
  it('sin ninguna propuesta es NUEVO: sin enviar y precio autorizado «-»', () => {
    const e = estatusDeFila(fila(), []);
    expect(e).toMatchObject({ estatus: 'sin-enviar', autorizado: null, avisos: ['nuevo'], propuesta: null });
  });

  it('propuestas de otro material, de otra condición o de la base no cuentan', () => {
    const otras = [prop({ material: '999' }), prop({ condicion: 'PNC' }), prop({ concepto: 'base', condicion: '' }), prop({ estado: 'borrador' })];
    expect(estatusDeFila(fila(), otras).estatus).toBe('sin-enviar');
  });

  it('mandada y sin respuesta = pendiente (autorizado «-»)', () => {
    const e = estatusDeFila(fila(), [prop()]);
    expect(e).toMatchObject({ estatus: 'pendiente', autorizado: null, avisos: [] });
  });

  it('autorizada y válida = autorizado con su precio (el que fijó el director)', () => {
    const e = estatusDeFila(fila(), [prop({ estado: 'autorizado', precioPropuesto: 72, autorizadoEn: '2026-10-10T10:00:00Z' })]);
    expect(e).toMatchObject({ estatus: 'autorizado', autorizado: 72, avisos: [] });
  });

  it('rechazada = rechazado, sin precio autorizado', () => {
    expect(estatusDeFila(fila(), [prop({ estado: 'rechazado' })])).toMatchObject({ estatus: 'rechazado', autorizado: null });
  });

  it('el costo subió y el autorizado quedó ≤ costo: hay que reenviar (deja de propagarse)', () => {
    const e = estatusDeFila(fila({ costo: 70 }), [prop({ estado: 'autorizado', precioPropuesto: 65, autorizadoEn: '2026-10-10T10:00:00Z' })]);
    expect(e).toMatchObject({ estatus: 'reenviar', autorizado: null });
    expect(e.avisos).toContain('invalido');
  });

  it('un reenvío pendiente conserva el último precio autorizado válido', () => {
    const e = estatusDeFila(fila(), [
      prop({ estado: 'autorizado', precioPropuesto: 72, autorizadoEn: '2026-10-05T10:00:00Z', solicitadoEn: '2026-10-04T10:00:00Z' }),
      prop({ estado: 'enviado', precioPropuesto: 60, solicitadoEn: '2026-10-12T10:00:00Z' }),
    ]);
    expect(e).toMatchObject({ estatus: 'pendiente', autorizado: 72 });
  });

  it('una nueva autorización sustituye a la anterior', () => {
    const e = estatusDeFila(fila(), [
      prop({ estado: 'autorizado', precioPropuesto: 72, autorizadoEn: '2026-10-05T10:00:00Z' }),
      prop({ estado: 'autorizado', precioPropuesto: 68, autorizadoEn: '2026-10-15T10:00:00Z' }),
    ]);
    expect(e.autorizado).toBe(68);
  });

  describe('lotes nuevos', () => {
    const autorizada = prop({ estado: 'autorizado', precioPropuesto: 65, autorizadoEn: '2026-10-10T10:00:00Z', lotesEnviados: ['1018|1032|A1'] });
    it('un lote que no estaba cuando se mandó avisa', () => {
      const e = estatusDeFila(fila({ lotes: ['1018|1032|A1', '1018|1032|B2'] }), [autorizada]);
      expect(e.avisos).toContain('lote-nuevo');
      expect(e.lotesNuevos).toEqual(['1018|1032|B2']);
      expect(e.estatus).toBe('autorizado'); // sigue autorizado: el aviso es informativo
    });
    it('sin lotes nuevos no avisa', () => {
      expect(estatusDeFila(fila(), [autorizada]).avisos).toEqual([]);
    });
    it('una propuesta anterior sin lotes guardados no puede avisar', () => {
      const vieja = prop({ estado: 'autorizado', precioPropuesto: 65, autorizadoEn: '2026-10-10T10:00:00Z', lotesEnviados: null });
      expect(estatusDeFila(fila({ lotes: ['x|y|z'] }), [vieja]).avisos).toEqual([]);
    });
  });

  describe('cálculo distinto', () => {
    it('el precio calculado hoy no es el que se calculó al mandar: avisa', () => {
      const e = estatusDeFila(fila({ precioCalculado: 58 }), [prop({ estado: 'autorizado', autorizadoEn: '2026-10-10T10:00:00Z' })]);
      expect(e.avisos).toContain('calculo-distinto');
    });
    it('si el director MODIFICÓ el precio a propósito no avisa (se compara contra lo calculado, no contra lo autorizado)', () => {
      const e = estatusDeFila(fila({ precioCalculado: 65 }), [prop({ estado: 'autorizado', precioCalculado: 65, precioPropuesto: 90, autorizadoEn: '2026-10-10T10:00:00Z' })]);
      expect(e.avisos).toEqual([]);
      expect(e.autorizado).toBe(90);
    });
    it('un rechazo no es referencia', () => {
      expect(estatusDeFila(fila({ precioCalculado: 40 }), [prop({ estado: 'rechazado' })]).avisos).toEqual([]);
    });
  });
});

describe('resumenAvisos', () => {
  it('cuenta estatus y avisos para el banner', () => {
    const r = resumenAvisos([
      { estatus: 'sin-enviar', avisos: ['nuevo'] },
      { estatus: 'sin-enviar', avisos: ['nuevo'] },
      { estatus: 'autorizado', avisos: ['lote-nuevo', 'calculo-distinto'] },
      { estatus: 'reenviar', avisos: ['invalido'] },
      { estatus: 'pendiente', avisos: [] },
      { estatus: 'rechazado', avisos: [] },
    ]);
    expect(r).toEqual({
      sinEnviar: 2, pendientes: 1, autorizados: 1, rechazados: 1, reenviar: 1, nuevos: 2, loteNuevo: 1, calculoDistinto: 1, invalidos: 1, conAviso: 4,
    });
  });
});

describe('prepararEnvio · sin condición ni duplicados', () => {
  const sol = (material: string, condicion: string, concepto: 'base' | 'oferta' = 'oferta') => ({ material, concepto, condicion });
  it('la base (sin condición) nunca se manda', () => {
    const r = prepararEnvio([sol('100950', '', 'base'), sol('100950', 'CC')], []);
    expect(r.enviar).toEqual([sol('100950', 'CC')]);
    expect(r.omitidos).toEqual([{ item: sol('100950', '', 'base'), motivo: 'sin-condicion' }]);
  });
  it('una oferta sin condición tampoco', () => {
    expect(prepararEnvio([sol('100950', '  ')], []).omitidos[0]!.motivo).toBe('sin-condicion');
  });
  it('lo repetido dentro del mismo envío se manda una sola vez', () => {
    const r = prepararEnvio([sol('100950', 'CC'), sol('100950', 'CC'), sol('100950.0', 'CC')], []);
    expect(r.enviar).toHaveLength(1);
    expect(r.omitidos.map((o) => o.motivo)).toEqual(['repetido-en-el-envio', 'repetido-en-el-envio']);
  });
  it('lo que ya está pendiente de respuesta no se vuelve a mandar', () => {
    const r = prepararEnvio([sol('100950', 'CC'), sol('100950', 'CC + PNC'), sol('200', 'CC')], [sol('100950', 'CC'), sol('999', 'CC')]);
    expect(r.enviar.map((x) => `${x.material}|${x.condicion}`)).toEqual(['100950|CC + PNC', '200|CC']);
    expect(r.omitidos).toEqual([{ item: sol('100950', 'CC'), motivo: 'ya-pendiente' }]);
  });
  it('distinta condición del mismo material son solicitudes distintas', () => {
    expect(prepararEnvio([sol('100950', 'CC'), sol('100950', 'PNC'), sol('100950', 'CC + PNC')], []).enviar).toHaveLength(3);
  });
});
