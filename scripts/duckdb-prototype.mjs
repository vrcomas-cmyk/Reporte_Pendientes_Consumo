// Prototipo: valida que DuckDB (bindings de Node, mismo motor SQL que
// duckdb-wasm en el navegador) reproduce el resultado de buildRF()/
// serieMaterial() en src/core/resumenFac.ts, y compara tiempos contra la
// implementación JS actual sobre un dataset sintético del tamaño de
// "Consumo" (~80k filas).
//
// Uso: node scripts/duckdb-prototype.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'node_modules', '@duckdb', 'duckdb-wasm', 'dist');

// ---------------------------------------------------------------------------
// 1. Generar datos sintéticos con la misma forma que ResumenFacRow.
// ---------------------------------------------------------------------------
const N_ROWS = 80_000;
const N_MATERIALES = 400;
const N_DEST = 600;
const N_SOLIC = 150;
const MESES = [];
for (let y = 2024; y <= 2026; y++) for (let m = 1; m <= 12; m++) MESES.push(`${String(m).padStart(2, '0')}/${y}`);

function synthRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const mat = `MAT${(i % N_MATERIALES).toString().padStart(4, '0')}`;
    const dest = `D${(i * 7 % N_DEST).toString().padStart(4, '0')}`;
    const solic = `S${(i * 13 % N_SOLIC).toString().padStart(4, '0')}`;
    const mes = MESES[i % MESES.length];
    rows.push({
      solicitante: solic,
      razonSocial: `Cliente ${solic}`,
      destinatario: dest,
      material: mat,
      textoMaterial: `Descripción ${mat}`,
      mesAno: mes,
      cantidadFacturada: (i % 50) + 1,
      importeFacturado: ((i % 50) + 1) * (10 + (i % 37)),
      centro: `C${(i % 10).toString().padStart(3, '0')}`,
      gpoVdor: `GV${i % 8}`,
      gpoCte: `GC${i % 6}`,
    });
  }
  return rows;
}

const rows = synthRows(N_ROWS);
console.log(`Dataset sintético: ${rows.length} filas, ${N_MATERIALES} materiales, ${N_DEST} destinatarios`);

// ---------------------------------------------------------------------------
// 2. JS actual: buildRF (agregación por material) — copiado del core para
//    que el script corra standalone en Node, sin depender de la app.
// ---------------------------------------------------------------------------
const norm = (v) => (v == null ? '' : String(v)).trim();
const num = (v) => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};
const mesKey = (m) => {
  const x = norm(m).split('/');
  return x.length === 2 ? +x[1] * 12 + +x[0] : 0;
};

function buildRF_mat(rowsIn) {
  const mat = new Map();
  const add = (key, mes, c, i) => {
    if (!key) return;
    let mm = mat.get(key);
    if (!mm) { mm = new Map(); mat.set(key, mm); }
    const cur = mm.get(mes) || { mes, cant: 0, imp: 0 };
    cur.cant += c; cur.imp += i;
    mm.set(mes, cur);
  };
  for (const r of rowsIn) {
    const mes = norm(r.mesAno);
    if (!mes) continue;
    add(norm(r.material), mes, num(r.cantidadFacturada), num(r.importeFacturado));
  }
  const out = new Map();
  mat.forEach((mm, k) => out.set(k, [...mm.values()].sort((a, b) => mesKey(a.mes) - mesKey(b.mes))));
  return out;
}

const t0 = performance.now();
const jsMat = buildRF_mat(rows);
const jsSerieSample = jsMat.get('MAT0007') || [];
const t1 = performance.now();
console.log(`\nJS (buildRF equivalente, TODOS los ${N_MATERIALES} materiales) — ${(t1 - t0).toFixed(1)} ms`);
console.log('serieMaterial("MAT0007") JS   ->', jsSerieSample.slice(0, 3), `... (${jsSerieSample.length} meses)`);

// ---------------------------------------------------------------------------
// 3. DuckDB: misma agregación vía SQL (bindings síncronos de Node).
// ---------------------------------------------------------------------------
const bundle = {
  mvp: {
    mainModule: path.join(DIST, 'duckdb-mvp.wasm'),
    mainWorker: path.join(DIST, 'duckdb-node-mvp.worker.cjs'),
  },
  eh: {
    mainModule: path.join(DIST, 'duckdb-eh.wasm'),
    mainWorker: path.join(DIST, 'duckdb-node-eh.worker.cjs'),
  },
};
const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
const db = await duckdb.createDuckDB(bundle, logger, duckdb.DEFAULT_RUNTIME);
await db.instantiate(() => {});
const conn = db.connect();

const t2 = performance.now();
db.registerFileText('rf.json', JSON.stringify(rows));
conn.insertJSONFromPath('rf.json', { name: 'rf' });
const t3 = performance.now();

const res = conn.query(`
  SELECT material, mesAno AS mes,
         SUM(cantidadFacturada) AS cant,
         SUM(importeFacturado) AS imp
  FROM rf
  WHERE material = 'MAT0007'
  GROUP BY material, mesAno
  ORDER BY CAST(split_part(mesAno, '/', 2) AS INT) * 12 + CAST(split_part(mesAno, '/', 1) AS INT)
`);
const t4 = performance.now();
const duckSerie = res.toArray().map((r) => ({ mes: r.mes, cant: Number(r.cant), imp: Number(r.imp) }));

console.log(`\nDuckDB — carga (registro + insert de ${N_ROWS} filas JSON): ${(t3 - t2).toFixed(1)} ms`);
console.log(`DuckDB — query serieMaterial("MAT0007"): ${(t4 - t3).toFixed(1)} ms`);
console.log('serieMaterial("MAT0007") DuckDB ->', duckSerie.slice(0, 3), `... (${duckSerie.length} meses)`);

// Groupby completo (equivalente a construir TODO rf.mat, los N_MATERIALES materiales).
const t5 = performance.now();
const allRes = conn.query(`
  SELECT material, mesAno AS mes, SUM(cantidadFacturada) AS cant, SUM(importeFacturado) AS imp
  FROM rf GROUP BY material, mesAno
`);
const t6 = performance.now();
console.log(`DuckDB — groupby completo (equivalente a rf.mat, ${N_MATERIALES} materiales): ${(t6 - t5).toFixed(1)} ms, ${allRes.numRows} filas resultado`);

// Paridad: comparar serie completa JS vs DuckDB para MAT0007.
const parity = jsSerieSample.length === duckSerie.length &&
  jsSerieSample.every((p, idx) => p.mes === duckSerie[idx].mes && p.cant === duckSerie[idx].cant && p.imp === duckSerie[idx].imp);
console.log(`\nParidad JS vs DuckDB para MAT0007: ${parity ? 'OK ✔' : 'DIFIERE ✘'}`);

// ---------------------------------------------------------------------------
// 4. Parquet: exportar la tabla ya cargada a Parquet, y medir cuánto tarda
//    cargar DESDE Parquet en una conexión nueva — es el formato real que
//    usaríamos en producción (subir el .parquet a R2 en vez del xlsx crudo,
//    o convertir on-the-fly al leerlo).
// ---------------------------------------------------------------------------
const parquetPath = path.join(__dirname, '..', 'graphify-out', '_rf_prototype.parquet');
const t7 = performance.now();
conn.query(`COPY rf TO 'rf.parquet' (FORMAT PARQUET)`);
const parquetBuf = db.copyFileToBuffer('rf.parquet');
const t8 = performance.now();
console.log(`\nExportar tabla a Parquet: ${(t8 - t7).toFixed(1)} ms, ${(parquetBuf.byteLength / 1024).toFixed(0)} KB`);
const { writeFileSync } = await import('node:fs');
writeFileSync(parquetPath, Buffer.from(parquetBuf));
console.log(`Escrito a disco real para la prueba de navegador: ${parquetPath}`);

conn.close();

// Nueva conexión "fría" que solo ve el Parquet (simula abrir la app y cargar
// el archivo ya convertido, sin el JSON de por medio).
const conn2 = db.connect();
const t9 = performance.now();
db.registerFileBuffer('rf2.parquet', parquetBuf);
conn2.query(`CREATE VIEW rf2 AS SELECT * FROM parquet_scan('rf2.parquet')`);
const t10 = performance.now();
const parqRes = conn2.query(`
  SELECT material, mesAno AS mes, SUM(cantidadFacturada) AS cant, SUM(importeFacturado) AS imp
  FROM rf2 GROUP BY material, mesAno
`);
const t11 = performance.now();
console.log(`Parquet — registrar + crear vista: ${(t10 - t9).toFixed(1)} ms`);
console.log(`Parquet — groupby completo (mismo que arriba): ${(t11 - t10).toFixed(1)} ms, ${parqRes.numRows} filas resultado`);
console.log(`Parquet — TOTAL carga+query desde archivo: ${(t11 - t9).toFixed(1)} ms  (vs JSON: ${(t3 - t2 + (t6 - t5)).toFixed(1)} ms)`);

conn2.close();
