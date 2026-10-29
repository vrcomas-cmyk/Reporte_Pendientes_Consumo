// @vitest-environment node
// Corre SQL_Comodato_Libros.sql con el MISMO DuckDB-wasm que usa el navegador (build para Node) y datos de ejemplo: así un cambio al SQL que el motor
// no entienda (p. ej. operaciones de fecha con CURRENT_DATE) se detecta aquí y no en pantalla.
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { F } from '../comodatoTablero';

interface Conn { query(sql: string): { toArray(): { toJSON(): Record<string, unknown> }[] } }
interface Db { registerFileText(n: string, t: string): void; connect(): Conn & { insertJSONFromPath(f: string, o: { name: string }): void } }

const require = createRequire(import.meta.url);
const DIST = path.resolve(process.cwd(), 'node_modules/@duckdb/duckdb-wasm/dist');

const hoy = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const haceDias = (n: number) => new Date(hoy.getTime() - n * 86_400_000);
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

let filas: Record<string, Record<string, unknown>[]> = {};

/** Igual que `consultarVista` del servicio: DECIMAL → DOUBLE. */
function leer(conn: Conn, vista: string): Record<string, unknown>[] {
  const cols = conn.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${vista}'`).toArray().map((r) => r.toJSON());
  const dec = cols.filter((c) => /^DECIMAL/i.test(String(c.data_type))).map((c) => `CAST("${String(c.column_name)}" AS DOUBLE) AS "${String(c.column_name)}"`);
  return conn.query(dec.length ? `SELECT * REPLACE (${dec.join(', ')}) FROM ${vista}` : `SELECT * FROM ${vista}`).toArray().map((r) => r.toJSON());
}

beforeAll(async () => {
  const duckdb = require(path.join(DIST, 'duckdb-node-blocking.cjs')) as {
    createDuckDB(b: unknown, l: unknown, r: unknown): Promise<Db & { instantiate(cb: () => void): Promise<void> }>;
    VoidLogger: new () => unknown;
    NODE_RUNTIME: unknown;
  };
  const db = await duckdb.createDuckDB(
    { mvp: { mainModule: path.join(DIST, 'duckdb-mvp.wasm'), mainWorker: '' }, eh: { mainModule: path.join(DIST, 'duckdb-eh.wasm'), mainWorker: '' } },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate(() => undefined);
  const conn = db.connect();
  let n = 0;
  const cargar = (tabla: string, rows: unknown[]) => {
    const f = `${tabla}_${n++}.json`;
    db.registerFileText(f, JSON.stringify(rows));
    conn.insertJSONFromPath(f, { name: tabla });
  };
  const ybfd = (cli: string, mat: string, clase: string, cant: string, fecha: Date | null, campoFecha: 'Creado el3' | 'Creado el' = 'Creado el3') => ({
    Solicitante: cli, Nombre1: `Cliente ${cli}`, Material: mat, 'Denominación': 'EQUIPO', 'Clase doc.ventas': clase, Cantidad: clase === 'YBFD' ? cant : '0', 'Cantidad de pedido': cant,
    'Creado el3': campoFecha === 'Creado el3' && fecha ? dmy(fecha) : null, 'Creado el': campoFecha === 'Creado el' && fecha ? dmy(fecha) : null, 'Motivo de rechazo': null,
  });
  cargar('mm_ybfd_zbre', [
    ybfd('100', '1331100', 'YBFD', '2', haceDias(200)), ybfd('100', '1331060', 'YBFD', '2', haceDias(200)), ybfd('100', '1331070', 'YBFD', '1', haceDias(200)),
    ybfd('200', '1331120', 'YBFD', '3', haceDias(400)), ybfd('200', '1331120', 'ZBRE', '1', haceDias(100), 'Creado el'),
  ]);
  const fac = (cli: string, mat: string, dias: number, cant: number, imp: number, zona: string, grp: string) => ({
    Solicitante: cli, 'Razón Social': `Cliente ${cli}`, Material: mat, 'Texto Material': 'BOLSA', Fecha: iso(haceDias(dias)), 'Gpo. Vdor.': zona, 'Grp. Cliente': grp,
    Factura: `${iso(haceDias(dias)).slice(0, 7)}|${cli}|${mat}`, Cantidad: cant, Importe: imp,
  });
  cargar('facturacion', [
    fac('100', '1330130', 10, 50, 5000, '2', '19'), fac('100', '1330130', 40, 40, 4000, '2', '19'), fac('100', '1330130', 130, 30, 3000, '2', '19'),
    fac('200', '1330150', 300, 10, 1500, '101', '18'),
    fac('300', '1330170', 20, 5, 700, '0', '34'), // bolsas SIN comodato
  ]);
  cargar('ejecutivos_zona', [
    { Zona: '2', Ejecutivo: 'Ana', 'Gpo Cte': '19', 'Grupo Cliente': 'Hospitales' }, { Zona: '101', Ejecutivo: 'Luis', 'Gpo Cte': '18', 'Grupo Cliente': 'Gobierno' },
    { Zona: '0', Ejecutivo: 'Vacante X', 'Gpo Cte': '34', 'Grupo Cliente': 'Otros' },
  ]);
  const mat = (codigo: string, costo: number) => ({ codigo_detalle: codigo, codigo_grupo: 'G', codigo_subgrupo: 'S', Costo: costo, activo: true });
  cargar('c_materiales', [mat('1331100', 1000), mat('1331120', 1500), mat('1331060', 100), mat('1331070', 300), mat('1330130', 60), mat('1330150', 80), mat('1330170', 90)]);

  const sql = readFileSync(path.resolve(process.cwd(), 'src/core/sql/SQL_Comodato_Libros.sql'), 'utf8').replace(/\r\n/g, '\n').replace(/__HOY__/g, iso(hoy));
  const sentencias = sql.split(/;\s*\n/g).map((s) => s.trim()).filter((s) => s.replace(/--.*$/gm, '').trim().length > 0);
  for (const s of sentencias) conn.query(s);

  filas = { seg: leer(conn, 'v_seguimiento_360'), tend: leer(conn, 'v_direccion_tendencia'), bolsas: leer(conn, 'v_bolsas_resumen') };
}, 60_000);

describe('SQL_Comodato_Libros.sql en DuckDB-wasm', () => {
  const fila = (cli: string, equipo: string) => filas.seg!.find((r) => r.cliente === cli && r.material_comodato === equipo)!;

  it('el script completo corre y las tres vistas traen filas', () => {
    expect(filas.seg!.length).toBeGreaterThan(0);
    expect(filas.tend!.length).toBeGreaterThan(0);
    expect(filas.bolsas!.length).toBeGreaterThan(0);
  });
  it('un canister: piezas, inversión, facturación, margen, ROI, días sin compra, estatus, zona y ejecutivo (números reales, no DECIMAL sin escala)', () => {
    const r = fila('100', '1331100');
    expect(r).toMatchObject({ cantidad_comodato: 2, inversion_comodato: 2000, bolsas_facturadas: 120, facturacion_total: 12000, margen_total: 4800, status_actividad: 'Activo', Zona: '002', Ejecutivo: 'Ana', 'Grupo de cliente': 'Hospitales', 'Sin comodato asignado': 'No' });
    expect(r.roi).toBeCloseTo(2.4);
    expect(Number(r.dias_sin_compra)).toBe(10);
  });
  it('placa y carro salen como complementarios', () => {
    expect(fila('100', '1331060').status_actividad).toBe('Complementario');
    expect(fila('100', '1331070').status_actividad).toBe('Complementario');
  });
  it('bolsas de un cliente sin comodato: "Factura sin comodato"', () => {
    const r = filas.seg!.find((x) => x.cliente === '300')!;
    expect(r['Sin comodato asignado']).toBe('Sí');
    expect(r.rentable).toBe('Factura sin comodato');
  });
  it('una devolución ZBRE con solo "Creado el" resta del comodato vigente', () => {
    expect(fila('200', '1331120').cantidad_comodato).toBe(2); // 3 entregados − 1 devuelto
  });
  it('cobertura: toda columna que lee el tablero existe en las vistas del SQL', () => {
    const seg = new Set(Object.keys(filas.seg![0]!));
    const faltan = Object.values(F).filter((c) => !seg.has(c));
    expect(faltan).toEqual([]);
    const tend = new Set(Object.keys(filas.tend![0]!));
    expect(['cliente', 'codigo_equipo', 'periodo', 'piezas_netas_mes', 'bolsas_mes', 'importe_mes', 'margen_mes'].filter((c) => !tend.has(c))).toEqual([]);
    const bol = new Set(Object.keys(filas.bolsas![0]!));
    expect(['descripcion_consumible', 'codigo_consumible', 'codigo_equipo', 'descripcion_equipo', 'num_clientes', 'bolsas_facturadas', 'importe_vendido', 'margen_total', 'pct_margen', 'precio_prom_bolsa'].filter((c) => !bol.has(c))).toEqual([]);
  });
  it('el ranking por bolsa y la serie mensual traen importes con escala correcta', () => {
    expect(filas.bolsas!.find((b) => b.codigo_consumible === '1330130')!.importe_vendido).toBe(12000);
    expect(filas.tend!.some((t) => Number(t.importe_mes) === 5000)).toBe(true);
  });
});
