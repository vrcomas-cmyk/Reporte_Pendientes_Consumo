import { describe, it, expect } from 'vitest';
import { buildRiesgoCaducidad } from './caducidad';
import type { InvDetalleRow } from './types';

function mkLote(over: Partial<InvDetalleRow>): InvDetalleRow {
  return {
    material: 'M1',
    textoBreve: 'Material Uno',
    centro: '1001',
    almacen: '1030',
    lote: 'L1',
    fechaCaducidad: null,
    cantidadDisp: 0,
    precioOferta: 0,
    ...over,
  };
}

/** yyyy-mm-dd para "en n meses desde hoy" — mismo cálculo que usa HoyPage para "días hasta vencer". */
function inMonths(n: number): string {
  const d = new Date();
  d.setDate(1); // evita que un mes con menos días rebote al siguiente
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

const precioDe = (material: string) => (material === 'M1' ? 100 : material === 'M2' ? 50 : 0);
const conDemandaSet = new Set(['M1']);
const tieneDemanda = (m: string) => conDemandaSet.has(m);

describe('buildRiesgoCaducidad', () => {
  it('agrupa por mes de vencimiento, suma cantidad*precio y separa lo que tiene demanda', () => {
    const lotes: InvDetalleRow[] = [
      mkLote({ material: 'M1', fechaCaducidad: inMonths(1), cantidadDisp: 10 }), // 1000, con demanda
      mkLote({ material: 'M2', fechaCaducidad: inMonths(1), cantidadDisp: 4 }), // 200, sin demanda
      mkLote({ material: 'M1', fechaCaducidad: inMonths(3), cantidadDisp: 5 }), // 500, con demanda, otro mes
    ];
    const out = buildRiesgoCaducidad(lotes, { precioDe, tieneDemanda });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ lotes: 2, cantidadTotal: 14, importeTotal: 1200, cantidadConDemanda: 10, importeConDemanda: 1000 });
    expect(out[1]).toMatchObject({ lotes: 1, cantidadTotal: 5, importeTotal: 500, cantidadConDemanda: 5, importeConDemanda: 500 });
    // Orden cronológico.
    expect(out[0].mesKey).toBeLessThan(out[1].mesKey);
  });

  it('usa precioOferta de la fila si viene > 0, sin llamar a precioDe', () => {
    const lotes: InvDetalleRow[] = [mkLote({ material: 'M1', fechaCaducidad: inMonths(1), cantidadDisp: 2, precioOferta: 999 })];
    const out = buildRiesgoCaducidad(lotes, { precioDe, tieneDemanda });
    expect(out[0].importeTotal).toBe(2 * 999);
  });

  it('los lotes ya vencidos caen en el mes de hoy, no se descartan', () => {
    const lotes: InvDetalleRow[] = [mkLote({ material: 'M1', fechaCaducidad: inMonths(-2), cantidadDisp: 3 })];
    const out = buildRiesgoCaducidad(lotes, { precioDe, tieneDemanda });
    expect(out).toHaveLength(1);
    const hoy = new Date();
    expect(out[0].mesKey).toBe(hoy.getFullYear() * 12 + hoy.getMonth());
  });

  it('descarta lotes fuera del horizonte y sin fecha/cantidad', () => {
    const lotes: InvDetalleRow[] = [
      mkLote({ fechaCaducidad: inMonths(24), cantidadDisp: 10 }), // fuera del horizonte default (12m)
      mkLote({ fechaCaducidad: null, cantidadDisp: 10 }),
      mkLote({ fechaCaducidad: inMonths(1), cantidadDisp: 0 }),
    ];
    expect(buildRiesgoCaducidad(lotes, { precioDe, tieneDemanda })).toEqual([]);
  });

  it('respeta un horizonMeses custom', () => {
    const lotes: InvDetalleRow[] = [mkLote({ material: 'M1', fechaCaducidad: inMonths(2), cantidadDisp: 1 })];
    expect(buildRiesgoCaducidad(lotes, { precioDe, tieneDemanda, horizonMeses: 1 })).toEqual([]);
    expect(buildRiesgoCaducidad(lotes, { precioDe, tieneDemanda, horizonMeses: 2 })).toHaveLength(1);
  });
});
