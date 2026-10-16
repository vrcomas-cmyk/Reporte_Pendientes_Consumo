import { describe, it, expect } from 'vitest';
import { agregarFilas, almacenPorGrupoCliente, firmaLibros, construirTabsFacturacion, construirTabsFacturacionGen, datosFacturacionGen, COLUMNAS_FAC, filasDeBloque, type FilaFac } from './facturacionLibros';
import { mapFacMensualCam, mapResumenFac } from './mappers';
import { roleOf } from './roleDetection';

const f = (mes: string, solic: string, dest: string, material: string, centro: string, almacen: string, cant: number, imp: number, extra: Partial<{ razon: string; texto: string; gpoCte: string; gpoVdor: string }> = {}): FilaFac =>
  [mes, solic, extra.razon ?? 'CLIENTE A', dest, material, extra.texto ?? 'CINTA', centro, almacen, extra.gpoCte ?? '15', extra.gpoVdor ?? '24', cant, imp];

describe('filasDeBloque', () => {
  it('valida las columnas y convierte cantidad/importe a número', () => {
    const filas = filasDeBloque(COLUMNAS_FAC, [['09/2026', '1', 'A', '2', '100950', 'CINTA', '1018', '1031', '15', '24', '36', 4635.5]]);
    expect(filas[0]?.[10]).toBe(36);
    expect(filas[0]?.[11]).toBe(4635.5);
  });

  it('rechaza un script desactualizado (columnas distintas) en vez de aceptar filas mal alineadas', () => {
    expect(() => filasDeBloque(['Mes', 'Cliente', 'Material', 'Descripcion', 'Cantidad'], [])).toThrow(/Columnas inesperadas/);
  });
});

describe('agregarFilas', () => {
  it('suma las filas con la misma clave y deja separadas las distintas', () => {
    const r = agregarFilas([f('09/2026', '1', '2', '100950', '1018', '1031', 10, 100), f('09/2026', '1', '2', '100950', '1018', '1031', -4, -40), f('09/2026', '1', '2', '100900', '1018', '1031', 1, 5)]);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x[4] === '100950')?.slice(10)).toEqual([6, 60]);
  });

  it('quita el ruido de punto flotante al sumar', () => {
    const r = agregarFilas([f('09/2026', '1', '2', '1', '1018', '1031', 0.1, 0.1), f('09/2026', '1', '2', '1', '1018', '1031', 0.2, 0.2)]);
    expect(r[0]?.[10]).toBe(0.3);
  });
});

describe('construirTabsFacturacion', () => {
  const libros = [
    [f('08/2026', '1', '2', '100950', '1018', '1031', 10, 100), f('08/2026', '1', '2', '100950', '1018', '1032', 5, 50)],
    [f('09/2026', '1', '2', '100950', '1018', '1031', 7, 70), f('09/2026', '9', '9', '555', '1001', '1030', 3, 30), f('09/2026', '1', '2', '777', '1018', '1031', 4, 40), f('09/2026', '1', '2', '777', '1018', '1031', -4, -40)],
  ];
  const { resumenFac, facMensualCam } = construirTabsFacturacion(libros);

  it('Resumen_Fac suma por mes/solicitante/destinatario/material/centro (une almacenes) y omite el neto cero', () => {
    const agosto = resumenFac.rows.find((r) => r[6] === '08/2026');
    expect(agosto?.[7]).toBe(15); // 10 + 5 de los dos almacenes
    expect(agosto?.[8]).toBe(150);
    expect(resumenFac.rows.some((r) => r[4] === '777')).toBe(false); // +4 −4 → neto cero
    expect(resumenFac.rowCount).toBe(resumenFac.rows.length);
  });

  it('Fac_Mensual_CAM suma por mes/centro/almacén/material y trae Periodo', () => {
    expect(facMensualCam.rows.filter((r) => r[5] === '08/2026')).toHaveLength(2); // 1031 y 1032 por separado
    expect(facMensualCam.rows[0]?.[4]).toBe('2026-08-01T00:00:00.000Z');
  });

  it('el total del mes coincide en ambas pestañas (cantidad e importe)', () => {
    const suma = (rows: (string | number)[][], iC: number, iI: number, mes: string, iM: number): number[] =>
      rows.filter((r) => r[iM] === mes).reduce<number[]>((a, r) => [(a[0] ?? 0) + Number(r[iC]), (a[1] ?? 0) + Number(r[iI])], [0, 0]);
    expect(suma(resumenFac.rows, 7, 8, '09/2026', 6)).toEqual(suma(facMensualCam.rows, 6, 7, '09/2026', 5));
  });

  it('las pestañas tienen los encabezados que esperan los mappers y la detección de rol', () => {
    expect(roleOf(resumenFac.headers)).toBe('resumenFac');
    expect(roleOf(facMensualCam.headers)).toBe('facMensualCam');
    const headers = resumenFac.headers;
    const fila = Object.fromEntries(headers.map((h, i) => [h, resumenFac.rows[0]?.[i]]));
    expect(mapResumenFac(fila)).toMatchObject({ material: '100950', mesAno: '08/2026', cantidadFacturada: 15, importeFacturado: 150, centro: '1018', gpoCte: '15', gpoVdor: '24' });
    const filaCam = Object.fromEntries(facMensualCam.headers.map((h, i) => [h, facMensualCam.rows[0]?.[i]]));
    expect(mapFacMensualCam(filaCam)).toMatchObject({ centro: '1018', mesAno: '08/2026' });
  });
});

describe('almacén en blanco → por grupo de cliente', () => {
  it('Hospitales 1031, Gobierno 1060 y el resto 1030', () => {
    expect(almacenPorGrupoCliente('19')).toBe('1031');
    expect(almacenPorGrupoCliente('18')).toBe('1060');
    expect(almacenPorGrupoCliente('34')).toBe('1030'); // Gobierno descentralizado NO es 1060
    expect(almacenPorGrupoCliente('15')).toBe('1030');
    expect(almacenPorGrupoCliente('')).toBe('1030');
  });

  const libro = [
    f('09/2026', '1', 'D1', 'M1', '1018', '', 10, 100, { gpoCte: '19' }), // hospital sin almacén → 1031
    f('09/2026', '2', 'D2', 'M1', '1018', '', 5, 50, { gpoCte: '18' }),   // gobierno sin almacén → 1060
    f('09/2026', '3', 'D3', 'M1', '1018', '', 3, 30, { gpoCte: '15' }),   // distribuidor sin almacén → 1030
    f('09/2026', '4', 'D4', 'M1', '1018', '1032', 2, 20, { gpoCte: '19' }), // con almacén: se respeta (venta especial)
    f('09/2026', '5', 'D5', 'M1', '1018', '1030', 7, 70, { gpoCte: '15' }), // con almacén: suma a la misma llave que el relleno de arriba
  ];
  const tabs = construirTabsFacturacion([agregarFilas(libro)]);
  const cam = tabs.facMensualCam.rows.map((r) => ({ alm: String(r[1]), cant: Number(r[6]), imp: Number(r[7]) }));

  it('asigna el almacén, respeta el informado y junta lo que cae en la misma llave', () => {
    expect(cam.find((r) => r.alm === '1031')).toMatchObject({ cant: 10, imp: 100 });
    expect(cam.find((r) => r.alm === '1060')).toMatchObject({ cant: 5, imp: 50 });
    expect(cam.find((r) => r.alm === '1032')).toMatchObject({ cant: 2, imp: 20 });
    expect(cam.find((r) => r.alm === '1030')).toMatchObject({ cant: 10, imp: 100 }); // 3 asignado + 7 informado
    expect(cam).toHaveLength(4);
  });
  it('cuenta los renglones asignados y no toca Resumen_Fac ni los totales', () => {
    expect(tabs.almacenesAsignados).toEqual({ renglones: 3, importe: 180 });
    expect(tabs.resumenFac.rowCount).toBe(5);
    expect(cam.reduce((s, r) => s + r.imp, 0)).toBe(270);
  });
});

describe('construcción por tramos = de golpe', () => {
  const libro = Array.from({ length: 20000 }, (_, i) => f(`${String((i % 12) + 1).padStart(2, '0')}/2026`, `S${i % 9}`, `D${i % 17}`, `M${i % 23}`, `10${i % 4}`, i % 5 === 0 ? '' : '1030', (i % 7) + 1, ((i % 11) + 1) * 10, { gpoCte: `${15 + (i % 5)}` }));
  const tabs = construirTabsFacturacion([agregarFilas(libro)]);

  it('construirTabsFacturacionGen cede el paso y da las mismas pestañas', () => {
    const g = construirTabsFacturacionGen([agregarFilas(libro)]);
    let cesiones = 0;
    let paso = g.next();
    while (!paso.done) { cesiones++; paso = g.next(); }
    expect(cesiones).toBeGreaterThan(0);
    expect(paso.value).toEqual(tabs);
  });

  it('datosFacturacionGen arma las mismas filas que el mapeo de cada pestaña con sus encabezados', () => {
    const g = datosFacturacionGen(tabs);
    let paso = g.next();
    while (!paso.done) paso = g.next();
    const datos = paso.value;
    const viejoRf = tabs.resumenFac.rows.map((r) => mapResumenFac(Object.fromEntries(tabs.resumenFac.headers.map((h, i) => [h, r[i]]))));
    const viejoCam = tabs.facMensualCam.rows.map((r) => mapFacMensualCam(Object.fromEntries(tabs.facMensualCam.headers.map((h, i) => [h, r[i]]))));
    expect(datos.resumenFac).toEqual(viejoRf);
    expect(datos.facMensualCam).toEqual(viejoCam);
    expect(datos.almacenesAsignados).toEqual(tabs.almacenesAsignados);
  });
});

describe('firmaLibros', () => {
  const a = { nombre: '2Q 2026', modificado: 'm1', filas: 10 };
  const b = { nombre: '3Q 2026', modificado: 'm2', filas: 20 };
  it('no depende del orden de los libros', () => {
    expect(firmaLibros([a, b], 1)).toBe(firmaLibros([b, a], 1));
  });
  it('cambia si un libro cambia de fecha, de filas, si falta uno o si cambia la versión del formato', () => {
    const base = firmaLibros([a, b], 1);
    expect(firmaLibros([a, { ...b, modificado: 'm3' }], 1)).not.toBe(base);
    expect(firmaLibros([a, { ...b, filas: 21 }], 1)).not.toBe(base);
    expect(firmaLibros([a], 1)).not.toBe(base);
    expect(firmaLibros([a, b], 2)).not.toBe(base);
  });
});

describe('precio mínimo / máximo de las líneas (Apps Script nuevo)', () => {
  const conPrecios = (mes: string, dest: string, cant: number, imp: number, pmin: number, pmax: number): FilaFac => [mes, '1', 'CLIENTE A', dest, '102000', 'CINTA', '1018', '1031', '15', '24', cant, imp, pmin, pmax];

  it('filasDeBloque acepta las 14 columnas y conserva el precio mínimo y máximo', () => {
    const filas = filasDeBloque([...COLUMNAS_FAC, 'Precio Min', 'Precio Max'], [['09/2026', '1', 'A', '2', '102000', 'CINTA', '1018', '1031', '15', '24', '30', 1900, '61.15', '65']]);
    expect(filas[0]?.slice(10)).toEqual([30, 1900, 61.15, 65]);
  });
  it('agregarFilas junta bloques: el mínimo es el menor, el máximo el mayor y el 0 (sin dato) no cuenta', () => {
    const r = agregarFilas([conPrecios('09/2026', '2', 10, 650, 65, 65), conPrecios('09/2026', '2', 10, 611.5, 61.15, 61.15), conPrecios('09/2026', '2', 5, 0, 0, 0)]);
    expect(r).toHaveLength(1);
    expect(r[0]!.slice(10)).toEqual([25, 1261.5, 61.15, 65]);
  });
  it('construirTabsFacturacion pasa el precio mínimo / máximo a Resumen_Fac y al ResumenFacRow', () => {
    const tabs = construirTabsFacturacion([[conPrecios('09/2026', '2', 10, 650, 65, 65)], [conPrecios('09/2026', '2', 10, 611.5, 61.15, 61.15)]]);
    const fila = Object.fromEntries(tabs.resumenFac.headers.map((h, i) => [h, tabs.resumenFac.rows[0]?.[i]]));
    const row = mapResumenFac(fila);
    expect(row.cantidadFacturada).toBe(20);
    expect(row.precioMin).toBe(61.15);
    expect(row.precioMax).toBe(65);
  });
  it('sin el script nuevo (12 columnas) todo sigue igual y el precio queda en 0 (sin dato)', () => {
    const tabs = construirTabsFacturacion([[f('09/2026', '1', '2', '100950', '1018', '1031', 10, 100)]]);
    const row = mapResumenFac(Object.fromEntries(tabs.resumenFac.headers.map((h, i) => [h, tabs.resumenFac.rows[0]?.[i]])));
    expect(row.precioMin).toBe(0);
  });
});

describe('día de la línea más reciente (Fecha Max)', () => {
  const conFecha = (mes: string, cant: number, imp: number, fecha: string): FilaFac => [mes, '1', 'CLIENTE A', '2', '1330130', 'BOLSA', '1018', '1031', '15', '24', cant, imp, 0, 0, fecha];

  it('filasDeBloque acepta las 15 columnas y conserva la fecha', () => {
    const cols = [...COLUMNAS_FAC, 'Precio Min', 'Precio Max', 'Fecha Max'];
    const filas = filasDeBloque(cols, [['09/2026', '1', 'A', '2', '1330130', 'BOLSA', '1018', '1031', '15', '24', '3', 30, 10, 10, '2026-09-18']]);
    expect(filas[0]?.[14]).toBe('2026-09-18');
  });
  it('agregarFilas y construirTabsFacturacion se quedan con la fecha mayor', () => {
    const r = agregarFilas([conFecha('09/2026', 1, 10, '2026-09-03'), conFecha('09/2026', 1, 10, '2026-09-18'), conFecha('09/2026', 1, 10, '2026-09-11')]);
    expect(r).toHaveLength(1);
    expect(r[0]![14]).toBe('2026-09-18');
    const tabs = construirTabsFacturacion([[conFecha('09/2026', 1, 10, '2026-09-05')], [conFecha('09/2026', 1, 10, '2026-09-25')]]);
    const row = mapResumenFac(Object.fromEntries(tabs.resumenFac.headers.map((h, i) => [h, tabs.resumenFac.rows[0]?.[i]])));
    expect(row.fechaMax).toBe('2026-09-25');
  });
  it('sin el script más nuevo (12 o 14 columnas) la fecha queda vacía', () => {
    const tabs = construirTabsFacturacion([[f('09/2026', '1', '2', '100950', '1018', '1031', 10, 100)]]);
    const row = mapResumenFac(Object.fromEntries(tabs.resumenFac.headers.map((h, i) => [h, tabs.resumenFac.rows[0]?.[i]])));
    expect(row.fechaMax ?? '').toBe('');
  });
});
