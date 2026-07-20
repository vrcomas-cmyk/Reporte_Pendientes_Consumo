// DuckDB-wasm usado como motor de (de)serialización: convierte arrays de
// filas <-> Parquet. No es el almacén persistente en sí (eso lo sigue
// haciendo Dexie/IndexedDB, ver repositories/DuckDbBlobStore.ts) — solo
// comprime lo que se guarda ahí, que es lo que realmente pega contra el
// límite de IndexedDB (JSON de ~80k filas vs. el mismo dato en Parquet).
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbWorkerEh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

export async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const worker = new Worker(duckdbWorkerEh);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(duckdbWasmEh);
      return db;
    })();
  }
  return dbPromise;
}

let tableSeq = 0;

/** Serializes an array of flat rows to Parquet bytes. */
export async function rowsToParquet(rows: unknown[]): Promise<Uint8Array> {
  if (!rows.length) return new Uint8Array();
  const db = await getDb();
  const conn = await db.connect();
  const table = `t${tableSeq++}`;
  const file = `${table}.json`;
  try {
    await db.registerFileText(file, JSON.stringify(rows));
    await conn.insertJSONFromPath(file, { name: table });
    await conn.query(`COPY ${table} TO '${table}.parquet' (FORMAT PARQUET)`);
    return await db.copyFileToBuffer(`${table}.parquet`);
  } finally {
    await conn.close();
    await db.dropFiles([file, `${table}.parquet`]).catch(() => {});
  }
}

/** Loads an array of flat rows as a table on an existing (caller-owned)
 * connection — used for multi-table sessions (e.g. módulo Comodato) where
 * several tables must coexist so a SQL script can JOIN across them. */
export async function loadRowsAsTable(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  tableName: string,
  rows: unknown[],
): Promise<void> {
  const file = `${tableName}_${tableSeq++}.json`;
  await db.registerFileText(file, JSON.stringify(rows));
  await conn.insertJSONFromPath(file, { name: tableName });
  await db.dropFile(file).catch(() => {});
}

/** Runs a multi-statement .sql script sequentially (DuckDB-wasm's `query()`
 * expects one statement per call). Splits on `;` at end-of-line, which is
 * how SQL_Comodato.sql is formatted — every statement ends its own line. */
export async function runScript(conn: duckdb.AsyncDuckDBConnection, script: string): Promise<void> {
  const statements = script
    .split(/;\s*\n/g)
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, '').trim().length > 0);
  for (const stmt of statements) {
    await conn.query(stmt);
  }
}

/** Reads Parquet bytes back into an array of plain row objects. */
export async function parquetToRows<T = Record<string, unknown>>(buf: Uint8Array): Promise<T[]> {
  if (!buf.length) return [];
  const db = await getDb();
  const conn = await db.connect();
  const table = `t${tableSeq++}`;
  const file = `${table}.parquet`;
  try {
    await db.registerFileBuffer(file, buf);
    const res = await conn.query(`SELECT * FROM parquet_scan('${file}')`);
    return res.toArray().map((r) => r.toJSON() as T);
  } finally {
    await conn.close();
    await db.dropFile(file).catch(() => {});
  }
}
