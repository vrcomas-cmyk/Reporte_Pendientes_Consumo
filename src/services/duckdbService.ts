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

/** Marker column carrying the list of fields that were flattened to JSON
 * strings on write, so the read side knows which ones to parse back. Its
 * value is identical in every row (Parquet dictionary-encodes it to ~nothing).
 * Blobs written before this existed simply lack the column and decode as-is. */
const NESTED_KEYS_COL = '__nested_keys';

/** Nested objects (`raw`, `invByCenter`) hold whatever the source sheet had,
 * so the same field can be a number in one row and a string in another
 * (e.g. `raw.Pedidos`: numeric order numbers, but '' for blank cells because
 * sheet_to_json uses defval: ''). DuckDB's JSON reader infers the struct
 * schema from a sample of the first rows and then hard-fails on the first
 * value that doesn't fit ("Expected number or null, got string").
 * Encoding those subobjects as JSON strings sidesteps the inference entirely
 * and round-trips the values unchanged. */
function flattenNested(rows: unknown[]): unknown[] {
  const nested = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const [k, v] of Object.entries(row)) {
      if (v !== null && typeof v === 'object') nested.add(k);
    }
  }
  if (!nested.size) return rows;
  const keys = [...nested];
  const marker = JSON.stringify(keys);
  return rows.map((row) => {
    const out = { ...(row as Record<string, unknown>) };
    for (const k of keys) {
      if (k in out && out[k] !== null && out[k] !== undefined) out[k] = JSON.stringify(out[k]);
    }
    out[NESTED_KEYS_COL] = marker;
    return out;
  });
}

/** Inverse of {@link flattenNested}. Mutates and returns `rows`. */
function restoreNested(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const marker = rows[0]?.[NESTED_KEYS_COL];
  if (typeof marker !== 'string') return rows;
  let keys: string[];
  try {
    keys = JSON.parse(marker) as string[];
  } catch {
    return rows;
  }
  for (const row of rows) {
    delete row[NESTED_KEYS_COL];
    for (const k of keys) {
      const v = row[k];
      if (typeof v !== 'string') continue;
      try {
        row[k] = JSON.parse(v);
      } catch {
        /* not ours after all — leave the string in place */
      }
    }
  }
  return rows;
}

/** Serializes an array of flat rows to Parquet bytes. */
export async function rowsToParquet(rows: unknown[]): Promise<Uint8Array> {
  if (!rows.length) return new Uint8Array();
  const db = await getDb();
  const conn = await db.connect();
  const table = `t${tableSeq++}`;
  const file = `${table}.json`;
  try {
    await db.registerFileText(file, JSON.stringify(flattenNested(rows)));
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

/** Arrow's `StructRow.toJSON()` is shallow: it returns a plain object, but
 * each value is still whatever the type visitor produced — a nested
 * `StructRow` proxy for structs, a `Vector` for lists, a `bigint` for
 * BIGINT (which every COUNT/SUM in SQL_Comodato.sql yields). Those proxies
 * are not structured-cloneable, so a result that reaches `postMessage`
 * (the catalog handed to the analysis worker) or IndexedDB dies with
 * "[object Row] could not be cloned"; the bigints break arithmetic and
 * JSON.stringify. Convert the whole tree to plain JS once, at the boundary.
 *
 * Detection is duck-typed on purpose — apache-arrow is only a transitive
 * dependency of duckdb-wasm, so we don't import its classes to instanceof
 * against. `toJSON()` is the one method Vector, StructRow and MapRow all
 * expose, and each returns a plain array/object we can then recurse into. */
function toPlain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return v;
  // BIGINT -> number, which is what every consumer of these rows expects.
  // Beyond 2^53 that would silently corrupt the value, so keep those as text.
  if (t === 'bigint') {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : String(v);
  }
  // Date and binary clone natively — and Date must be checked before the
  // toJSON branch below, which would otherwise flatten it to a string.
  if (v instanceof Date || v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return v;
  if (Array.isArray(v)) return v.map(toPlain);
  const maybeArrow = v as { toJSON?: () => unknown };
  if (typeof maybeArrow.toJSON === 'function') return toPlain(maybeArrow.toJSON());
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, val]) => [String(k), toPlain(val)]));
  if (v instanceof Set) return [...v].map(toPlain);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as object)) out[k] = toPlain(val);
  return out;
}

/** Converts an Arrow query result into plain, structured-cloneable rows.
 * Every read out of DuckDB must go through this. */
export function arrowRowsToPlain<T = Record<string, unknown>>(res: {
  toArray: () => unknown[];
}): T[] {
  return res.toArray().map((r) => toPlain(r) as T);
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
    return restoreNested(arrowRowsToPlain(res)) as T[];
  } finally {
    await conn.close();
    await db.dropFile(file).catch(() => {});
  }
}
