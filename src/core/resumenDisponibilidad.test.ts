import { describe, it, expect } from 'vitest';
import { buildFacMensual } from './facMensual';
import { hoyMes, mesAnterior } from './resumenFac';
import { indexarHoja, type HojaCruda, type LibroClave } from './pedidos';
import { buildRSS, invGen } from './resumenSin';
import { filasResumenDisponibilidad } from './resumenDisponibilidad';
import type { FacMensualCamRow } from './types';

function mkHoja(libro: LibroClave, matriz: string[][]) {
  const [columnas = [], ...rows] = matriz;
  return indexarHoja({ libro, hoja: 'Sheet1', nombreLibro: 'L', ultimaModificacion: '', columnas, rows, sincronizadoEn: '' } satisfies HojaCruda);
}

const dispo = mkHoja('disponibilidad', [
  ['Centro', 'Almacén', 'Material', 'Descripción', 'Libre Utilización', 'Cant. en Tránsito', 'Entrega a cliente'],
  ['1001', '1030', '100950', 'CINTA', '10', '2', '3'],
  ['1001', '1031', '100950', 'CINTA', '2', '1', '5'], // 2 − 5 → 0
  ['1001', '1032', '100950', 'CINTA', '9', '0', '0'],
  ['1031', '1030', '100950', 'CINTA', '40', '0', '0'],
  ['1031', '1032', '100950', 'CINTA', '6', '0', '0'],
]);
const pedidos = mkHoja('pedidos', [
  ['Pedido', 'Centro', 'Almacén', 'Material', 'Texto Material', 'Pendiente', 'Precio'],
  ['1', '1001', '1030', '100950', 'CINTA', '4', '12.5'],
  ['2', '1001', '1030', '100950', 'CINTA', '6', '10'],
  ['3', '1001', '1030', '100950', 'CINTA', '0', '10'], // sin pendiente: no cuenta
  ['4', '1018', '1030', '555', 'OTRA', '3', '2'], // sin inventario en Disponibilidad
]);

// Consumo: 12 meses cerrados con 6 unidades al mes en 1001/1030 → promedio 6.
const mk = (mesesAtras: number): string => {
  let m = mesAnterior(hoyMes());
  for (let i = 1; i < mesesAtras; i++) {
    const [mm, aaaa] = m.split('/').map(Number);
    m = mm === 1 ? `12/${(aaaa ?? 0) - 1}` : `${String((mm ?? 1) - 1).padStart(2, '0')}/${aaaa}`;
  }
  return m;
};
const cam: FacMensualCamRow[] = Array.from({ length: 12 }, (_, i) => ({ centro: '1001', almacen: '1030', material: '100950', textoMaterial: 'CINTA', mesAno: mk(i + 1), cantidad: 6, importe: 60 }));
const fac = buildFacMensual(cam);

describe('filasResumenDisponibilidad', () => {
  const filas = filasResumenDisponibilidad(dispo, pedidos, fac);
  const fila = (c: string, a: string, m: string) => filas.find((f) => f.centro === c && f.almacen === a && f.material === m);

  it('una fila por material/centro/almacén de Disponibilidad y de los pedidos con pendiente', () => {
    expect(filas).toHaveLength(6); // 5 de Disponibilidad + 1 pedido sin inventario
    expect(fila('1018', '1030', '555')).toMatchObject({ cantidadPendiente: 3, importePendiente: 6, descripcion: 'OTRA' });
  });

  it('el inventario es Libre Utilización − Entrega a cliente (piso 0) por almacén del centro', () => {
    const r = fila('1001', '1030', '100950')!;
    expect(r.raw['Inv 1030']).toBe(7);
    expect(r.raw['Inv 1031']).toBe(0);
    expect(r.raw['Inv 1032']).toBe(9);
    expect(r.raw['Cant. en Tránsito']).toBe(2);
  });

  it('pendiente solo de Seg pedidos con pendiente > 0 (suma, importe y # de pedidos)', () => {
    const r = fila('1001', '1030', '100950')!;
    expect(r).toMatchObject({ cantidadPendiente: 10, importePendiente: 4 * 12.5 + 6 * 10, pedidos: '2' });
  });

  it('consumo: promedio de los 12 meses cerrados, último y penúltimo mes, meses de inventario', () => {
    const r = fila('1001', '1030', '100950')!;
    expect(r.promedioConsumo12M).toBe(6);
    expect(r.raw['Cantidad_Ultimo_Mes']).toBe(6);
    expect(r.raw['Ultimo_Mes_Consumo']).toBe(mk(1));
    expect(r.raw['Penultimo_Mes_Consumo']).toBe(mk(2));
    expect(r.mesesInventario).toBeCloseTo(7 / 6);
    expect(fila('1031', '1030', '100950')?.promedioConsumo12M).toBe(0); // sin ventas en ese par
  });

  it('totales del material y Disponible del centro 1031', () => {
    const r = fila('1001', '1030', '100950')!;
    expect(r.sumaInventario).toBe(7 + 0 + 40); // 1030+1031+1060 de todos los centros, el 1032 no suma
    expect(r.sumaPendiente).toBe(10);
    expect(r.raw['Disponible 1031-1030']).toBe(40);
    expect(r.raw['Disponible 1031-1032']).toBe(6);
  });

  it('con esas filas `buildRSS` arma el pivot Material x Centro igual que con el reporte', () => {
    const rss = buildRSS(filas);
    const mat = rss.mats.get('100950')!;
    expect(rss.centros).toEqual(['1001', '1018', '1031']);
    expect(invGen(mat.centros.get('1001'))).toBe(7); // 1030 (7) + 1031 (0) + 1060 (0)
    expect(mat.centros.get('1001')?.pend).toBe(10);
    expect(mat.centros.get('1001')?.transito).toBe(3); // 2 (1030) + 1 (1031)
  });

  it('sin Fac_Mensual_CAM el consumo queda en 0 (no truena)', () => {
    expect(filasResumenDisponibilidad(dispo, pedidos, null).every((f) => f.promedioConsumo12M === 0)).toBe(true);
  });
});

describe('pendiente liberado', () => {
  it('un pedido con bloqueo de crédito o de entrega NO suma al pendiente; el liberado sí', () => {
    const d = mkHoja('disponibilidad', [
      ['Centro', 'Almacén', 'Material', 'Descripción', 'Libre Utilización', 'Cant. en Tránsito', 'Entrega a cliente'],
      ['1001', '1030', '777', 'X', '10', '0', '0'],
    ]);
    const p = mkHoja('pedidos', [
      ['Pedido', 'Centro', 'Almacén', 'Material', 'Texto Material', 'Pendiente', 'Precio', 'Sts. Créd.', 'Bloqueo Ent.'],
      ['1', '1001', '1030', '777', 'X', '5', '10', '', ''], // liberado
      ['2', '1001', '1030', '777', 'X', '3', '10', 'B', ''], // crédito
      ['3', '1001', '1030', '777', 'X', '2', '10', '', '30'], // bloqueo de entrega
    ]);
    const f = filasResumenDisponibilidad(d, p, null).find((r) => r.centro === '1001' && r.almacen === '1030' && r.material === '777')!;
    expect(f.cantidadPendiente).toBe(5);
    expect(f.importePendiente).toBe(50);
    expect(f.pedidos).toBe('1');
  });

  it('el filtro de bloqueo permite sumar también los bloqueados o ver solo los bloqueados', () => {
    const d = mkHoja('disponibilidad', [
      ['Centro', 'Almacén', 'Material', 'Descripción', 'Libre Utilización', 'Cant. en Tránsito', 'Entrega a cliente'],
      ['1001', '1030', '777', 'X', '10', '0', '0'],
    ]);
    const p = mkHoja('pedidos', [
      ['Pedido', 'Centro', 'Almacén', 'Material', 'Texto Material', 'Pendiente', 'Precio', 'Sts. Créd.', 'Bloqueo Ent.'],
      ['1', '1001', '1030', '777', 'X', '5', '10', '', ''], // liberado
      ['2', '1001', '1030', '777', 'X', '3', '10', 'B', ''], // crédito
      ['3', '1001', '1030', '777', 'X', '2', '10', '', '30'], // bloqueo de entrega
    ]);
    const fila = (modo?: 'liberados' | 'todos' | 'bloqueados') =>
      filasResumenDisponibilidad(d, p, null, modo).find((r) => r.centro === '1001' && r.almacen === '1030' && r.material === '777')!;
    expect(fila().cantidadPendiente).toBe(5); // por omisión: solo liberados
    expect(fila('liberados').cantidadPendiente).toBe(5);
    expect(fila('todos').cantidadPendiente).toBe(10);
    expect(fila('todos').importePendiente).toBe(100);
    expect(fila('todos').pedidos).toBe('3');
    expect(fila('bloqueados').cantidadPendiente).toBe(5); // 3 + 2
    expect(fila('bloqueados').pedidos).toBe('2');
  });
});
