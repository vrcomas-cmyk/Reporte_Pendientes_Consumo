// Módulo "Comodato (libros)": el mismo análisis de Comodato (SQL_Comodato.sql, DuckDB) pero alimentado por los libros nuevos —el libro de
// YBFD/ZBRE de Google Sheets y la facturación de los libros de Drive— en lugar de un Excel subido a mano y del acumulado de R2.
// Corre en una instancia de DuckDB PROPIA y su propia copia del script (SQL_Comodato_Libros.sql), así el módulo original queda intacto
// y se pueden comparar los resultados.
import { crearDbAislada, loadRowsAsTable, runScript, arrowRowsToPlain } from './duckdbService';
import { clientesDelLibro, hojaAFilas, resumenFacAFilasFacturacion, type HojaTabular } from '@/core/comodatoLibros';
import type { Material, Ejecutivo, ResumenFacRow } from '@/core/types';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { ComodatoResult, SeguimientoRow } from './comodatoService';
import sqlComodatoLibros from '@/core/sql/SQL_Comodato_Libros.sql?raw';

/** Hoy en aaaa-mm-dd (hora local): el script lo recibe como literal porque este DuckDB-wasm no resuelve CURRENT_DATE en operaciones de fecha. */
function hoyIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Zona / Ejecutivo / Gpo Cte / Grupo Cliente del catálogo (lo que lee `stg_ejecutivos`). */
function ejecutivosZonaRows(rows: Ejecutivo[]): Record<string, unknown>[] {
  return rows.map((e) => ({ Zona: e.zona, Ejecutivo: e.ejecutivo, 'Gpo Cte': e.gpoCte, 'Grupo Cliente': e.grupoCliente }));
}

/** Costo y agrupación de los materiales del catálogo (lo que lee `stg_materiales`; todo lo del catálogo se asume activo). */
function materialesRows(rows: Material[]): Record<string, unknown>[] {
  return rows.map((m) => ({ codigo_detalle: m.material, codigo_grupo: m.grupoArticulos, codigo_subgrupo: m.descrGrupoArt, Costo: m.costo, activo: true }));
}

/** Lee una vista con las columnas DECIMAL (NUMERIC del SQL) convertidas a DOUBLE: Arrow las entrega como enteros SIN escala (12,000.00 llegaría como
 * 1200000) y el tablero necesita números normales. */
export async function consultarVista(conn: AsyncDuckDBConnection, vista: string) {
  const cols = arrowRowsToPlain<{ column_name: string; data_type: string }>(
    await conn.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${vista}'`),
  );
  const decimales = cols.filter((c) => /^DECIMAL/i.test(c.data_type)).map((c) => `CAST("${c.column_name}" AS DOUBLE) AS "${c.column_name}"`);
  return conn.query(decimales.length ? `SELECT * REPLACE (${decimales.join(', ')}) FROM ${vista}` : `SELECT * FROM ${vista}`);
}

export interface EntradaComodatoLibros {
  /** Hoja del libro de comodato (YBFD/ZBRE), tal como se sincronizó. */
  hoja: HojaTabular;
  /** Facturación de los libros de Drive (ya agregada por mes). */
  resumenFac: readonly ResumenFacRow[];
  materiales: Material[];
  ejecutivos: Ejecutivo[];
}

export interface ResultadoComodatoLibros extends ComodatoResult {
  /** Filas de facturación que entraron al análisis y cuántas traían fecha de la última línea (el resto usa el día 1 del mes). */
  facturacionFilas: number;
  facturacionConFecha: number;
}

export async function runComodatoLibros({ hoja, resumenFac, materiales, ejecutivos }: EntradaComodatoLibros): Promise<ResultadoComodatoLibros> {
  const movimientos = hojaAFilas(hoja);
  if (!movimientos.length) throw new Error('El libro de comodato no trae filas.');
  const facturacion = resumenFacAFilasFacturacion(resumenFac, clientesDelLibro(hoja));
  if (!facturacion.length) throw new Error('No hay facturación de los libros de Drive para estos clientes. Sincroniza la facturación en Carga.');

  const db = await crearDbAislada();
  try {
    const conn = await db.connect();
    try {
      await loadRowsAsTable(db, conn, 'mm_ybfd_zbre', movimientos);
      await loadRowsAsTable(db, conn, 'ejecutivos_zona', ejecutivosZonaRows(ejecutivos));
      await loadRowsAsTable(db, conn, 'c_materiales', materialesRows(materiales));
      await loadRowsAsTable(db, conn, 'facturacion', facturacion);

      await runScript(conn, sqlComodatoLibros.replace(/__HOY__/g, hoyIso()));

      // Una consulta a la vez: es la misma conexión.
      const seg = await consultarVista(conn, 'v_seguimiento_360');
      const tend = await consultarVista(conn, 'v_direccion_tendencia');
      const bolsas = await consultarVista(conn, 'v_bolsas_resumen');
      return {
        seguimiento360: arrowRowsToPlain<SeguimientoRow>(seg),
        direccionTendencia: arrowRowsToPlain<SeguimientoRow>(tend),
        bolsasResumen: arrowRowsToPlain<SeguimientoRow>(bolsas),
        facturacionFilas: facturacion.length,
        facturacionConFecha: resumenFac.filter((r) => !!r.fechaMax).length,
      };
    } finally {
      await conn.close();
    }
  } finally {
    await db.terminate();
  }
}
