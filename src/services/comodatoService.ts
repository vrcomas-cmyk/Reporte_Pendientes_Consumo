// Corre SQL_Comodato.sql (proyecto Comodato_vs_Fac_Medivac) tal cual, sin
// reescribirlo — mismo dialecto DuckDB al que ya migramos en fase 3. Carga 4
// tablas: 1 nueva (mm_ybfd_zbre, subida por el usuario), y 3 derivadas de
// datos que la app ya tiene — facturacion ← acumulado real de R2 (mismo
// archivo "Facturación", no el resumenFac agregado — ese no trae número de
// factura ni fecha real por línea), c_materiales ← catálogo materiales,
// ejecutivos_zona ← catálogo ejecutivos.
import * as XLSX from 'xlsx';
import { getDb, loadRowsAsTable, runScript } from './duckdbService';
import { descargarFacturacionParquet } from './facturacionService';
import type { Material, Ejecutivo } from '@/core/types';
import sqlComodato from '@/core/sql/SQL_Comodato.sql?raw';

/** Parses the first sheet of an xlsx file into row objects, headers as-is —
 * SQL_Comodato.sql expects the raw SAP export column names verbatim
 * ("Solicitante", "Clase doc.ventas", "Creado el3", ...), so no remapping. */
async function parseFirstSheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

/** ejecutivos_zona necesita solo Zona/Ejecutivo/Gpo Cte/Grupo Cliente
 * (stg_ejecutivos, SQL_Comodato.sql) — las mismas 4 que ya trae el catálogo
 * "Ejecutivos" del AppScript. Sin archivo nuevo que subir. */
function ejecutivosZonaRowsFromCatalog(rows: Ejecutivo[]): Record<string, unknown>[] {
  return rows.map((e) => ({
    Zona: e.zona,
    Ejecutivo: e.ejecutivo,
    'Gpo Cte': e.gpoCte,
    'Grupo Cliente': e.grupoCliente,
  }));
}

/** c_materiales solo aporta costo + agrupación al script; el catálogo no
 * distingue "activo", así que todo lo que ya está en el catálogo se asume
 * activo (no hay una bandera equivalente que mapear). */
function materialesRowsFromCatalog(rows: Material[]): Record<string, unknown>[] {
  return rows.map((m) => ({
    codigo_detalle: m.material,
    codigo_grupo: m.grupoArticulos,
    codigo_subgrupo: m.descrGrupoArt,
    Costo: m.costo,
    activo: true,
  }));
}

export interface SeguimientoRow extends Record<string, unknown> {
  cliente: string;
  razon_social: string;
  material_comodato: string;
}

export interface ComodatoResult {
  seguimiento360: SeguimientoRow[];
  direccionTendencia: Record<string, unknown>[];
  bolsasResumen: Record<string, unknown>[];
}

export async function runComodatoAnalysis(
  mmYbfdZbreFile: File,
  materiales: Material[],
  ejecutivos: Ejecutivo[],
): Promise<ComodatoResult> {
  const [mmYbfdZbreRows, facturacionParquet] = await Promise.all([
    parseFirstSheet(mmYbfdZbreFile),
    descargarFacturacionParquet(),
  ]);

  const db = await getDb();
  const conn = await db.connect();
  try {
    await loadRowsAsTable(db, conn, 'mm_ybfd_zbre', mmYbfdZbreRows);
    await loadRowsAsTable(db, conn, 'ejecutivos_zona', ejecutivosZonaRowsFromCatalog(ejecutivos));
    await loadRowsAsTable(db, conn, 'c_materiales', materialesRowsFromCatalog(materiales));

    await db.registerFileBuffer('facturacion_acumulada.parquet', facturacionParquet);
    await conn.query(`CREATE OR REPLACE VIEW facturacion AS SELECT * FROM parquet_scan('facturacion_acumulada.parquet')`);

    await runScript(conn, sqlComodato);

    const [seg, tend, bolsas] = await Promise.all([
      conn.query('SELECT * FROM v_seguimiento_360'),
      conn.query('SELECT * FROM v_direccion_tendencia'),
      conn.query('SELECT * FROM v_bolsas_resumen'),
    ]);
    return {
      seguimiento360: seg.toArray().map((r) => r.toJSON() as SeguimientoRow),
      direccionTendencia: tend.toArray().map((r) => r.toJSON()),
      bolsasResumen: bolsas.toArray().map((r) => r.toJSON()),
    };
  } finally {
    await conn.close();
  }
}
