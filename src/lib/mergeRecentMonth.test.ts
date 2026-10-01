import { describe, it, expect } from 'vitest';
import { mergeRecentMonth } from './mergeRecentMonth';
import { buildRF, esMesValido } from '@/core/resumenFac';
import { monthlyInvoicing } from '@/core/analysis';
import type { ResumenFacRow } from '@/core/types';

const OLD = ['Solicitante', 'Material', 'Mes y año', 'Importe facturado'];
const NEW = ['Centro', 'Solicitante', 'Material', 'Mes y año', 'Importe facturado'];

describe('mergeRecentMonth', () => {
  it('reacomoda la caché vieja al esquema nuevo (Centro al inicio) por nombre de columna', () => {
    const cached = { headers: OLD, rows: [['S1', 'M1', '08/2026', 100], ['S1', 'M1', '10/2026', 5]] };
    const fresh = { headers: NEW, rows: [['1001', 'S1', 'M2', '10/2026', 70]] };
    const out = mergeRecentMonth(cached, fresh, '10/2026')!;
    expect(out.headers).toEqual(NEW);
    expect(out.rows).toEqual([['', 'S1', 'M1', '08/2026', 100], ['1001', 'S1', 'M2', '10/2026', 70]]);
  });

  it('descarta filas basura (mes inválido) que quedaron en caché', () => {
    const cached = { headers: NEW, rows: [['1001', 'S1', 'M1', '08/2026', 1], ['1001', 'S1', 'M1', '1002345', 9]] };
    const fresh = { headers: NEW, rows: [] as unknown[][] };
    expect(mergeRecentMonth(cached, fresh, '10/2026')!.rows).toHaveLength(1);
  });

  it('null si fresh no trae la columna de mes', () => {
    expect(mergeRecentMonth({ headers: OLD, rows: [] }, { headers: ['A'], rows: [] }, '10/2026')).toBeNull();
  });
});

describe('mes válido', () => {
  const row = (mesAno: string, imp = 1): ResumenFacRow => ({
    solicitante: 'S', razonSocial: '', destinatario: 'S', material: 'M', textoMaterial: '', mesAno,
    cantidadFacturada: 1, importeFacturado: imp, gpoCte: '', gpoVdor: '', centro: '',
  });
  it('esMesValido', () => {
    expect(esMesValido('10/2026')).toBe(true);
    expect(esMesValido('13/2026')).toBe(false);
    expect(esMesValido('1002345')).toBe(false);
  });
  it('buildRF ignora meses basura', () => {
    const rf = buildRF([row('10/2026'), row('1002345')]);
    expect(rf.curmes).toBe('10/2026');
    expect(rf.mat.get('M')).toHaveLength(1);
  });
  it('monthlyInvoicing ordena cronológicamente entre años y omite basura', () => {
    const out = monthlyInvoicing([row('01/2026'), row('12/2025'), row('02/2025'), row('1002345')]);
    expect(out.map((m) => m.mes)).toEqual(['02/2025', '12/2025', '01/2026']);
  });
});
