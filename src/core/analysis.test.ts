import { describe, it, expect } from 'vitest';
import { computeBloqueados } from './analysis';
import type { Sugerencia } from './types';

function mkSug(over: Partial<Sugerencia>): Sugerencia {
  return {
    gpoCte: '', fecha: '', oc: '', pedido: 'P1', gpoVdor: '', solicitante: '', destinatario: '',
    razonSocial: '', centroPedido: '', almacen: '', materialSolicitado: 'M1', materialBase: 'M1',
    descripcionSolicitada: '', cantidadPedido: 0, cantidadPendiente: 10, cantidadOfertar: 0, precio: 5,
    consumoPromedio: 0, fuente: '', materialSugerido: '', descripcionSugerida: '', centroSugerido: '',
    almacenSugerido: '', disponible: 0, lote: '', fechaCaducidad: '', mesesVigenciaLote: 0, centroInv: '',
    mesesInventario: 0, promedioConsumo12M: 0, cantTransito: 0,
    ...over,
  } as Sugerencia;
}

describe('computeBloqueados', () => {
  it('agrupa importe pendiente por el motivo real, no como un booleano', () => {
    const sugerencias: Sugerencia[] = [
      mkSug({ bloqueado: 'Detenido', cantidadPendiente: 10, precio: 5 }), // 50
      mkSug({ bloqueado: 'Detenido', cantidadPendiente: 4, precio: 5 }), // 20
      mkSug({ bloqueado: 'Crédito', cantidadPendiente: 2, precio: 100 }), // 200
      mkSug({ bloqueado: 'Detenido por ambos', cantidadPendiente: 1, precio: 30 }), // 30
      mkSug({ bloqueado: '', cantidadPendiente: 999, precio: 999 }), // sin bloqueo, no cuenta
    ] as Sugerencia[];

    const out = computeBloqueados(sugerencias);
    expect(out.count).toBe(4);
    expect(out.importeTotal).toBe(300);
    expect(out.porMotivo).toEqual([
      { motivo: 'Crédito', count: 1, importePendiente: 200 },
      { motivo: 'Detenido', count: 2, importePendiente: 70 },
      { motivo: 'Detenido por ambos', count: 1, importePendiente: 30 },
    ]);
  });

  it('ignora bloqueado en blanco/espacios', () => {
    const out = computeBloqueados([mkSug({ bloqueado: '   ' })] as Sugerencia[]);
    expect(out.count).toBe(0);
    expect(out.porMotivo).toEqual([]);
  });

  it('vacío sin sugerencias', () => {
    expect(computeBloqueados([])).toEqual({ count: 0, importeTotal: 0, porMotivo: [] });
  });
});
