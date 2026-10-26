import { describe, it, expect } from 'vitest';
import { baseDeSeguimiento, evaluarTraslado, snapshotDeInventario, textoCorreoTraslado, textoSeguimiento, type SnapDisponibilidad } from './seguimientoTraslado';
import type { Traslado } from './types';

const snap = (libre: number, transito: number, leidoEn: string): SnapDisponibilidad => ({
  leidoEn,
  libre: (m, c, a) => (m === 'N' && c === '1001' && a === '1032' ? libre : 0),
  transito: (m, c) => (m === 'N' && c === '1001' ? transito : 0),
});

const traslado = (p: Partial<Traslado> = {}): Traslado => ({
  pedido: '77', destinatario: 'D1', razonSocial: 'Cliente A', ejecutivo: 'Ana', zona: '101', material: 'N', descripcion: 'Material N', cantidad: 100, um: 'PZ',
  centroOrigen: '1031', almacenOrigen: '1032', centroDestino: '1001', almacenDestino: '1032', condicion: 'Corta caducidad', lote: 'L1', comentarios: '', destinatariosCorreo: [],
  estatus: 'solicitado', creadoEn: '2026-10-01T10:00:00Z', creadoPor: 'x', baseLibre: 20, baseTransito: 5, baseLeidoEn: '2026-10-01T12:00:00Z', ...p,
});

describe('baseDeSeguimiento', () => {
  it('guarda libre y tránsito del destino con la fecha de la foto', () => {
    expect(baseDeSeguimiento(traslado(), snap(20, 5, '2026-10-01T12:00:00Z'))).toEqual({ baseLibre: 20, baseTransito: 5, baseLeidoEn: '2026-10-01T12:00:00Z' });
  });
  it('arma la foto desde los índices de Disponibilidad', () => {
    const s = snapshotDeInventario({ porCentroAlm: new Map([['N|1001|1032', 7]]), porCentro: new Map(), transito: new Map([['N|1001', 3]]) }, 'x');
    expect(s.libre('N', '1001', '1032')).toBe(7);
    expect(s.transito('N', '1001')).toBe(3);
  });
});

describe('evaluarTraslado', () => {
  it('sin una actualización posterior a la base no cambia nada', () => {
    expect(evaluarTraslado(traslado(), snap(20, 105, '2026-10-01T12:00:00Z'))).toBeNull();
    expect(evaluarTraslado(traslado(), snap(20, 105, '2026-09-30T12:00:00Z'))).toBeNull();
  });
  it('tránsito que sube hacia el destino = En curso con las piezas y la fecha de la actualización', () => {
    expect(evaluarTraslado(traslado(), snap(20, 105, '2026-10-02T08:00:00Z'))).toEqual({ estatus: 'en-curso', enCursoCant: 100, enCursoLeidoEn: '2026-10-02T08:00:00Z' });
  });
  it('libre que sube lo solicitado = Recibido con la cantidad detectada (sin lote)', () => {
    const r = evaluarTraslado(traslado({ estatus: 'en-curso' }), snap(125, 5, '2026-10-03T08:00:00Z'));
    expect(r).toEqual({ estatus: 'recibido', recibidoCant: 105, recibidoLeidoEn: '2026-10-03T08:00:00Z' });
    expect(r).not.toHaveProperty('lote');
  });
  it('un aumento menor a lo solicitado NO se marca recibido: queda pendiente de revisión', () => {
    const r = evaluarTraslado(traslado(), snap(50, 5, '2026-10-03T08:00:00Z'));
    expect(r?.estatus).toBe('revision');
    expect(r?.notaRevision).toContain('30 de 100');
  });
  it('en curso que desaparece sin subir el libre = pendiente de revisión', () => {
    expect(evaluarTraslado(traslado({ estatus: 'en-curso' }), snap(20, 5, '2026-10-03T08:00:00Z'))?.estatus).toBe('revision');
  });
  it('solicitado que no se mueve se queda como está; sin base o ya cerrado no se evalúa', () => {
    expect(evaluarTraslado(traslado(), snap(20, 5, '2026-10-03T08:00:00Z'))).toBeNull();
    expect(evaluarTraslado(traslado({ baseLeidoEn: undefined }), snap(500, 500, '2026-10-03T08:00:00Z'))).toBeNull();
    expect(evaluarTraslado(traslado({ estatus: 'preparado' }), snap(500, 500, '2026-10-03T08:00:00Z'))).toBeNull();
    expect(evaluarTraslado(traslado({ estatus: 'recibido' }), snap(500, 500, '2026-10-03T08:00:00Z'))).toBeNull();
  });
});

describe('textos', () => {
  it('el correo trae material, cantidad, origen, destino, pedido y comentarios', () => {
    const { asunto, cuerpo } = textoCorreoTraslado(traslado({ comentarios: 'Urgente' }));
    expect(asunto).toContain('pedido 77');
    expect(cuerpo).toContain('Origen (centro/almacén): 1031/1032');
    expect(cuerpo).toContain('Destino (centro/almacén): 1001/1032');
    expect(cuerpo).toContain('Comentarios: Urgente');
  });
  it('omite lo que no tiene dato', () => {
    expect(textoCorreoTraslado(traslado({ lote: '', comentarios: '' })).cuerpo).not.toContain('Lote:');
  });
  it('el estado muestra piezas y fecha', () => {
    expect(textoSeguimiento(traslado({ estatus: 'en-curso', enCursoCant: 40 }))).toBe('En curso · 40 pzas');
    expect(textoSeguimiento(traslado({ estatus: 'revision' }))).toBe('Pendiente de revisión');
  });
});
