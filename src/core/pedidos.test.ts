import { describe, it, expect } from 'vitest';
import { buildBOPorFila } from './buildBO';
import { libreReal } from './inventoryRules';
import {
  bloqueoPedido,
  buscarSustitutos,
  claveMaterial,
  construirDetalleMaterial,
  formatearFecha,
  indexarHoja,
  inventarioDesdeDisponibilidad,
  sugerenciasDesdeSegPedidos,
  precioPendiente,
  mesesVigencia,
  numero,
  parsearFechaSheet,
  vistaConCaducidad,
  vistaCortaCaducidad,
  validarHojaCruda,
  vistaDisponibilidad,
  type HojaCruda,
  type LibroClave,
  libroSinHojas,
} from './pedidos';

// "Hoy" fijo para que las vigencias no dependan del reloj: 8/oct/2026.
const HOY = new Date(2026, 9, 8);

function mkHoja(libro: LibroClave, hoja: string, matriz: string[][]): HojaCruda {
  const [columnas = [], ...rows] = matriz;
  return { libro, hoja, nombreLibro: 'Libro', ultimaModificacion: '2026-10-05T00:00:00Z', columnas, rows, sincronizadoEn: '2026-10-05T00:00:00Z' };
}

describe('utilidades', () => {
  it('libreReal: Libre − Entrega con piso en 0', () => {
    expect(libreReal(10, 3)).toBe(7);
    expect(libreReal(2, 5)).toBe(0);
    expect(libreReal(0, 0)).toBe(0);
  });

  it('numero: tolera comas, símbolos y texto', () => {
    expect(numero('1,234.500')).toBe(1234.5);
    expect(numero('$ 12.45')).toBe(12.45);
    expect(numero('')).toBe(0);
    expect(numero('-')).toBe(0);
  });

  it('claveMaterial: recorta espacios y sufijo .0', () => {
    expect(claveMaterial(' 100950.0 ')).toBe('100950');
    expect(claveMaterial(100950)).toBe('100950');
    expect(claveMaterial(null)).toBe('');
  });

  it('parsearFechaSheet: mes/día/año, cae a día/mes si no puede ser mes, ISO y basura', () => {
    expect(formatearFecha(parsearFechaSheet('11/15/2029'))).toBe('15/11/2029');
    expect(formatearFecha(parsearFechaSheet('9/2/2029'))).toBe('02/09/2029');
    expect(formatearFecha(parsearFechaSheet('15/11/2029'))).toBe('15/11/2029');
    expect(formatearFecha(parsearFechaSheet('2029-09-02'))).toBe('02/09/2029');
    expect(parsearFechaSheet('N/A')).toBeNull();
    expect(parsearFechaSheet('31/31/2029')).toBeNull();
    expect(parsearFechaSheet('')).toBeNull();
  });

  it('mesesVigencia: 1 decimal, "0" si venció, "" sin fecha', () => {
    expect(mesesVigencia(new Date(2027, 3, 8), HOY)).toBe('6.0');
    expect(mesesVigencia(new Date(2026, 0, 1), HOY)).toBe('0');
    expect(mesesVigencia(null, HOY)).toBe('');
  });

  it('bloqueoPedido: Crédito, Detenido y ambos', () => {
    expect(bloqueoPedido('B', '')).toBe('Crédito');
    expect(bloqueoPedido('', 'X')).toBe('Detenido');
    expect(bloqueoPedido('B', 'X')).toBe('Detenido por ambos');
    expect(bloqueoPedido('', 'nan')).toBe('');
    expect(bloqueoPedido('', '')).toBe('');
  });
});

describe('indexarHoja', () => {
  it('indexa por Material con coincidencia exacta de encabezado (no toma "Texto Material")', () => {
    const h = indexarHoja(mkHoja('disponibilidad', 'Sheet1', [
      ['Centro', 'Texto Material', 'Material'],
      ['1001', 'CINTA', '100950'],
      ['1004', 'CINTA', '100950.0'],
    ]));
    expect(h.idxMaterial).toBe(2);
    expect(h.indice.get('100950')).toHaveLength(2);
  });

  it('Cosmopark usa CODIGO como llave', () => {
    const h = indexarHoja(mkHoja('condicion', 'Cosmopark', [['CODIGO', 'Lote'], ['471000', 'L1']]));
    expect(h.indice.get('471000')).toHaveLength(1);
  });

  it('Revision hereda el Material de la fila de arriba (celdas combinadas)', () => {
    const h = indexarHoja(mkHoja('condicion', 'Revision', [
      ['Material ', 'Texto breve de material', 'Status'],
      ['502000', 'TELA', 'Rev A'],
      ['', '', 'Rev B'],
      ['502200', 'TELA 5', 'Rev A'],
    ]));
    expect(h.indice.get('502000')).toHaveLength(2);
    expect(h.indice.get('502200')).toHaveLength(1);
  });

  it('otras hojas NO heredan Material', () => {
    const h = indexarHoja(mkHoja('condicion', 'PNC', [
      ['Material', 'Lote'],
      ['1321340', 'A'],
      ['', 'B'],
    ]));
    expect(h.indice.get('1321340')).toHaveLength(1);
  });

  it('Sustituto se busca en ambas direcciones', () => {
    const h = indexarHoja(mkHoja('condicion', 'Sustituto', [
      ['Material', 'Material sustituto', 'Texto Material'],
      ['100900', '100950', 'CINTA BLIS'],
    ]));
    expect(buscarSustitutos(h, '100900').comoMaterial).toHaveLength(1);
    expect(buscarSustitutos(h, '100950').comoSustituto).toHaveLength(1);
    expect(buscarSustitutos(h, '999')).toEqual({ comoMaterial: [], comoSustituto: [] });
  });
});

describe('vistaDisponibilidad', () => {
  const h = indexarHoja(mkHoja('disponibilidad', 'Sheet1', [
    ['Centro', 'Almacén', 'Material', 'Libre Utilización', 'Cant. en Tránsito', 'Entrega a cliente'],
    ['1001', '1030', '100950', '10', '0', '3'],
    ['1001', '1031', '100950', '2', '1', '5'],
    ['1004', '1030', '100950', '1,000', '0', '0.000'],
  ]));

  it('Libre real por fila con piso en 0, total y resumen por centro', () => {
    const v = vistaDisponibilidad(h, h.indice.get('100950') ?? []);
    expect(v.filas.map((f) => f[4])).toEqual([7, 0, 1000]);
    expect(v.pie).toEqual(['Total', '', 1012, 8, 1007, 1]);
    expect(v.porCentro).toEqual([{ centro: '1001', libre: 7 }, { centro: '1004', libre: 1000 }]);
  });
});

describe('vistaCortaCaducidad (RN-INV-001)', () => {
  const h = indexarHoja(mkHoja('condicion', 'Corta caducidad', [
    ['Centro', 'Almacén', 'Material', 'Lote', 'FeCaduc/FePreferCons', 'Libre utilización', 'Bloqueado'],
    ['1001', '1030', '100950', 'A-6M', '4/8/2027', '4', '0'],
    ['1001', '1030', '100950', 'B-30M-1030', '4/8/2029', '7', '0'],
    ['1001', '1032', '100950', 'C-30M-1032', '4/8/2029', '9', '0'],
    ['1004', '1032', '100950', 'D-3M-1032', '1/8/2027', '1', '0'],
    ['1004', '1030', '100950', 'E-sin-fecha', 'N/A', '2', '0'],
  ]));

  it('conserva VIGENCIA / ALMACEN_1032 / AMBOS, descarta el resto y avisa cuántas', () => {
    const v = vistaCortaCaducidad(h, h.indice.get('100950') ?? [], HOY);
    const porLote = Object.fromEntries(v.filas.map((f) => [f[2], f[7]]));
    expect(porLote).toEqual({ 'A-6M': 'VIGENCIA', 'C-30M-1032': 'ALMACEN_1032', 'D-3M-1032': 'AMBOS' });
    expect(v.nota).toContain('2 fila(s)');
  });

  it('ordena por lo que vence primero y formatea fecha y meses', () => {
    const v = vistaCortaCaducidad(h, h.indice.get('100950') ?? [], HOY);
    expect(v.filas[0]?.[2]).toBe('D-3M-1032');
    expect(v.filas[0]?.[3]).toBe('08/01/2027');
    expect(v.filas[0]?.[4]).toBe('3.0');
  });
});

describe('vistaConCaducidad', () => {
  it('formatea la fecha dd/mm/aaaa y agrega Meses vigencia lote', () => {
    const h = indexarHoja(mkHoja('condicion', 'PNC', [
      ['Material', 'Lote', 'Caducidad'],
      ['1321340', 'TS1', '4/8/2027'],
    ]));
    const v = vistaConCaducidad(h, h.indice.get('1321340') ?? [], HOY);
    expect(v.columnas.at(-1)).toBe('Meses vigencia lote');
    expect(v.filas[0]).toEqual(['1321340', 'TS1', '08/04/2027', '6.0']);
  });
});

describe('sugerenciasDesdeSegPedidos', () => {
  const dispo = indexarHoja(mkHoja('disponibilidad', 'Sheet1', [
    ['Centro', 'Almacén', 'Material', 'Libre Utilización', 'Cant. en Tránsito', 'Entrega a cliente'],
    ['1001', '1030', '100950', '10', '2', '3'],
    ['1001', '1031', '100950', '2', '1', '5'],
    ['1001', '1032', '100950', '9', '0', '0'],
    ['1004', '1030', '100950', '50', '0', '0'],
  ]));
  const ped = indexarHoja(mkHoja('pedidos', 'Sheet1', [
    ['Pedido', 'Fecha', 'Ped. Cte.', 'Razón Social', 'Destinatario', 'Solicitante', 'Gpo. Vdor.', 'Gpo. Cte.', 'Centro', 'Almacén', 'Material', 'Texto Material', 'Cantidad', 'Pendiente', 'Precio', 'Sts. Créd.', 'Bloqueo Ent.'],
    ['1', '11/18/2025', 'OC1', 'CLIENTE A', '10', '77', '19', '99', '1001', '1030', '100950', 'CINTA', '10', '4', '12.5', 'B', ''],
    ['2', '10/01/2026', '', 'CLIENTE B', '11', '78', '20', '1', '1004', '1030', '100950', 'CINTA', '5', '0', '12.5', '', 'X'],
  ]));

  it('inventarioDesdeDisponibilidad: Libre real por centro/almacén, por centro (1030+1031+1060) y tránsito', () => {
    const inv = inventarioDesdeDisponibilidad(dispo);
    expect(inv?.porCentroAlm.get('100950|1001|1030')).toBe(7);
    expect(inv?.porCentroAlm.get('100950|1001|1031')).toBe(0); // 2 − 5 → piso en 0
    expect(inv?.porCentro.get('100950')?.get('1001')).toBe(7); // el 1032 no suma al inventario por centro
    expect(inv?.porCentro.get('100950')?.get('1004')).toBe(50);
    expect(inv?.transito.get('100950|1001')).toBe(3);
    expect(inventarioDesdeDisponibilidad(undefined)).toBeNull();
  });

  it('arma filas con la forma de "Todas las Sugerencias", sin fuentes', () => {
    const [p1, p2] = sugerenciasDesdeSegPedidos(ped, inventarioDesdeDisponibilidad(dispo));
    expect(p1).toMatchObject({
      pedido: '1', oc: 'OC1', fecha: '18/11/2025', razonSocial: 'CLIENTE A', destinatario: '10', solicitante: '77', gpoVdor: '19', gpoCte: '99',
      centroPedido: '1001', almacen: '1030', materialBase: '100950', materialSolicitado: '100950', descripcionSolicitada: 'CINTA',
      cantidadPedido: 10, cantidadPendiente: 4, precio: 12.5, bloqueado: 'Crédito', cantTransito: 3, fuente: '', lote: '',
    });
    expect(p2?.bloqueado).toBe('Detenido');
    expect(p1?.raw['Razón Social']).toBe('CLIENTE A');
  });

  it('inventario del pedido: por almacén de SU centro y por centro', () => {
    const [p1, p2] = sugerenciasDesdeSegPedidos(ped, inventarioDesdeDisponibilidad(dispo));
    expect(p1?.invByCenter).toMatchObject({ '1030': 7, '1031': 0, '1032': 9, '1060': 0, '1001': 7, '1004': 50, '1018': 0 });
    expect(p2?.invByCenter).toMatchObject({ '1030': 50, '1031': 0, '1032': 0, '1004': 50 });
  });

  it('sin Disponibilidad sincronizada el inventario queda en 0 (no truena)', () => {
    const [p1] = sugerenciasDesdeSegPedidos(ped, null);
    expect(p1?.invByCenter['1030']).toBe(0);
    expect(p1?.cantTransito).toBe(0);
  });
});

describe('construirDetalleMaterial', () => {
  const hojas = [
    indexarHoja(mkHoja('disponibilidad', 'Sheet1', [
      ['Centro', 'Almacén', 'Material', 'Libre Utilización', 'Entrega a cliente'],
      ['1001', '1030', '100950', '10', '3'],
    ])),
    indexarHoja(mkHoja('pedidos', 'Sheet1', [['Pedido', 'Material', 'Pendiente'], ['1', '100950', '4']])),
    indexarHoja(mkHoja('condicion', 'Corta caducidad', [
      ['Centro', 'Almacén', 'Material', 'Lote', 'FeCaduc/FePreferCons', 'Libre utilización'],
      ['1001', '1030', '100950', 'LEJANO', '4/8/2029', '5'],
    ])),
    indexarHoja(mkHoja('condicion', 'Sustituto', [['Material', 'Material sustituto'], ['100900', '100950']])),
  ];

  it('arma las secciones con sus conteos', () => {
    const s = Object.fromEntries(construirDetalleMaterial(hojas, '100950', HOY).map((x) => [x.titulo, x]));
    expect(s['Disponibilidad']?.conteo).toBe(1);
    expect(s['Seg pedidos']?.conteo).toBe(1);
    // lote lejano en almacén 1030: se descarta, la sección explica por qué
    expect(s['Corta caducidad']?.conteo).toBe(0);
    expect(s['Corta caducidad']?.bloques[0]?.mensaje).toContain('1 fila(s) no se muestran');
    expect(s['Sustituto']?.bloques[0]?.subtitulo).toBe('Este material es sustituto de');
  });

  it('un material sin datos muestra "Sin coincidencias" y sin libros avisa que no están sincronizados', () => {
    const vacio = construirDetalleMaterial(hojas, '999', HOY);
    expect(vacio.every((s) => s.conteo === 0)).toBe(true);
    expect(construirDetalleMaterial([], '999', HOY)[0]?.bloques[0]?.mensaje).toBe('Libro no sincronizado.');
  });
});

describe('validarHojaCruda', () => {
  it('acepta Seg pedidos y Disponibilidad con sus columnas', () => {
    expect(validarHojaCruda(mkHoja('pedidos', 'Sheet1', [['Pedido', 'Material', 'Centro'], ['1', '2', '3']]))).toBeNull();
    expect(validarHojaCruda(mkHoja('disponibilidad', 'Sheet1', [['Centro', 'Almacén', 'Material', 'Libre Utilización'], ['1', '2', '3', '4']]))).toBeNull();
  });

  it('rechaza un libro equivocado y dice qué columnas faltan', () => {
    const msg = validarHojaCruda(mkHoja('pedidos', 'Sheet1', [['Centro', 'Almacén', 'Material', 'Libre Utilización']]));
    expect(msg).toContain('pedido');
    expect(validarHojaCruda(mkHoja('disponibilidad', 'Sheet1', [['Pedido', 'Material', 'Centro']]))).toContain('libre utilizacion');
  });

  it('Inv_Condicion no exige columnas (Lento mov puede venir solo con encabezados)', () => {
    expect(validarHojaCruda(mkHoja('condicion', 'Lento mov', [['Material']]))).toBeNull();
  });
});

describe('importe pendiente de Seg pedidos', () => {
  it('el precio sale de "$ Pendiente" ÷ Pendiente: un renglón Detenido con Precio por 10 no desvía el total', () => {
    const ped = indexarHoja(mkHoja('pedidos', 'Sheet1', [
      ['Pedido', 'Destinatario', 'Centro', 'Almacén', 'Material', 'Cantidad', 'Pendiente', '$ Pendiente', 'Precio', 'Precio1', 'Sts. Créd.', 'Bloqueo Ent.'],
      ['223545', '1', '1017', '1060', '856050', '5', '5', '12,540.00', '250.8', '2508', 'B', '30'],
      ['223546', '1', '1017', '1060', '100950', '4', '4', '50.00', '12.5', '12.5', '', ''],
      ['223547', '1', '1017', '1060', '100951', '2', '0', '0.00', '9', '9', '', ''],
    ]));
    const f = sugerenciasDesdeSegPedidos(ped, null);
    expect(f[0]?.bloqueado).toBe('Detenido por ambos');
    expect(f[0]?.precio).toBeCloseTo(2508, 6);
    const total = f.reduce((s, r) => s + r.cantidadPendiente * r.precio, 0);
    expect(total).toBeCloseTo(12540 + 50, 6);
  });
  it('sin "$ Pendiente" usa Precio1 y, sin éste, Precio', () => {
    expect(precioPendiente(5, 0, 2508, 250.8)).toBe(2508);
    expect(precioPendiente(5, 0, 0, 250.8)).toBe(250.8);
    expect(precioPendiente(0, 0, 0, 12)).toBe(12);
  });
});

describe('Seg pedidos sin agrupar', () => {
  it('dos posiciones con el mismo pedido/material/centro/almacén/destinatario siguen siendo DOS renglones', () => {
    const ped = indexarHoja(mkHoja('pedidos', 'Sheet1', [
      ['Pedido', 'Pos.', 'Destinatario', 'Centro', 'Almacén', 'Material', 'Cantidad', 'Pendiente'],
      ['189082', '10', '104974', '1017', '1060', '905472', '1', '0'],
      ['189082', '20', '104974', '1017', '1060', '905472', '1', '0'],
      ['189083', '10', '104974', '1017', '1060', '905472', '2', '1'],
    ]));
    const filas = sugerenciasDesdeSegPedidos(ped, null);
    const items = buildBOPorFila(filas, null);
    expect(items).toHaveLength(3); // 3 filas del libro → 3 renglones (buildBO daría 2)
    expect(new Set(items.map((i) => i.k)).size).toBe(3); // claves únicas
    expect(items.map((i) => i.bo.cantidadPedido)).toEqual([1, 1, 2]);
    expect(items.every((i) => i.fuentes.length === 0)).toBe(true);
  });
});

describe('Seg pedidos: renglones repetidos no se pierden', () => {
  it('dos filas con el mismo pedido, material, centro, almacén, destinatario Y posición siguen siendo dos renglones con clave distinta', () => {
    const ped = indexarHoja(mkHoja('pedidos', 'Sheet1', [
      ['Pedido', 'Pos.', 'Destinatario', 'Centro', 'Almacén', 'Material', 'Cantidad', 'Pendiente'],
      ['300', '10', '1', '1017', '1060', '905472', '5', '5'],
      ['300', '10', '1', '1017', '1060', '905472', '5', '5'],
    ]));
    const items = buildBOPorFila(sugerenciasDesdeSegPedidos(ped, null), null);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.k)).size).toBe(2);
  });
});

describe('libroSinHojas', () => {
  it('un libro listado sin ninguna pestaña (el Apps Script no encontró la hoja) cuenta como sin hojas', () => {
    expect(libroSinHojas({ hojas: [] })).toBe(true);
    expect(libroSinHojas({})).toBe(true);
    expect(libroSinHojas({ hojas: null })).toBe(true);
    expect(libroSinHojas({ hojas: [{ nombre: 'Sheet1' }] })).toBe(false);
  });
});
