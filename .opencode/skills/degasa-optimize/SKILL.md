---
name: degasa-optimize
description: Use when optimizing performance, memory, or data-loading speed in the Reporte Pendientes Consumo portal (React + Vite + Dexie + DuckDB-WASM + Apps Script). Triggers on keywords like "optimizar", "rapido", "carga lenta", "sync", "Google Sheets", "Apps Script", "memoize", "delta", "parquet", "IndexedDB". Encodes the graphify-first lookup convention, the build+lint gate, and the running list of optimization ideas already started in this codebase.
---

# Degasa portal — optimization workflow

This skill encodes the conventions to follow when improving performance of this
React + Vite + Dexie + DuckDB-WASM + Apps Script portal (`Reporte_Pendientes_Consumo`).

## Lookup order (graphify-first)

Per `CLAUDE.md`, this project ships a knowledge graph at `graphify-out/`. Before
opening source files for a non-trivial optimization question, prefer:

1. `graphify query "<question>"` — scoped subgraph, far cheaper than raw grep.
2. `graphify path "<symbol A>" "<symbol B>"` — relationship between two symbols.
3. `graphify explain "<concept>"` — focused concept explanation.
4. Read `graphify-out/GRAPH_REPORT.md` only when the above don't surface enough.
5. Fall back to `Glob`/`Grep` for narrow, single-symbol lookups.

After modifying code, run `graphify update .` (AST-only, no API cost) to keep
the graph current — the next query then reflects the change.

## Forcing functions

Before declaring an optimization done:

- `npm run build` — Vite + tsc type-check. Must finish with `✓ built in Ns`.
  Type errors fail the build and stay loud — never silence them.
- `npm run lint` — oxlint. Returns warnings (pre-existing, mostly React
  hooks/array-key noise); a NEW warning in a file you touched is a regression.
  Filter with: `npm run lint 2>&1 | Select-String -Pattern "<your-file>"`.
- `graphify update .` after the code change so the next session sees it.

There is no `npm run typecheck` script — `npm run build` IS the type-check gate.

## Hot-path map (where time/memory goes)

These are the files that dominate sync/processing cost on this codebase:

- `docs/apps-script-report-sheets.md` — the deployed Apps Script source.
  Changes here must be re-deployed (Implementar → Gestionar implementaciones →
  nueva versión) before the portal sees them; the URL `/exec` is stable.
- `src/services/reportSheetsService.ts` — client side of the sync: `?meta=1`
  cheap check, four-tab `?tab=` parallel fetch, dense `{headers, rows}` shape
  intentionally not zipped on the main thread.
- `src/workers/analysisWorker.ts` — Web Worker; owns the `zipRows` of dense
  rows to `{header: value}` objects inside the worker (not the main thread).
- `src/core/buildAnalysisResult.ts` — pure cross-reference + KPI. Contains the
  memoized-derivatives path: `maybePrev(role)` short-circuits computed surfaces
  (kpis, heatmap, inconsistencies, top*, monthly) when their input roles were
  not re-synced this time.
- `src/core/analysis.ts` — `computeKpis`, `topMateriales`, `topEjecutivos`,
  `monthlyInvoicing`, `buildHeatmap`, `detectInconsistencies`. The final
  comment notes DuckDB-WASM as the next step past ~100k rows.
- `src/repositories/db.ts` — Dexie v4: `catalog`, `analyses`, `solicitudes`,
  `sheetsCache` (delta-sync dense-rows cache). Bump the version when adding
  stores; the upgrade callback can be a noop if no rows need rewriting.
- `src/repositories/blobCodec.ts` — `encodeSnapshot({stripField:'raw'})` strips
  `raw` from every row of every array before Parquet encoding (roughly halves
  snapshot size). `decodeSnapshot` does NOT rehydrate; `rawRehydrate.ts` does.
- `src/repositories/rawRehydrate.ts` — best-effort rehydrate of `raw` on
  restore by zipping the `sheetsCache` dense rows back into `{header: value}`.
- `src/repositories/sheetsCache.ts` — per-tab dense `{headers, rows, rowCount}`
  cache; the delta sync appends to it.
- `src/core/mappers.ts` — pure row mappers; preserve order (rehydrate relies on
  a 1:1 correspondence between the typed array and the dense cache).

## Optimization ideas already in flight

Do not re-implement these; check the current state before continuing:

1. **Memoize derived surfaces by selected role** — DONE in
   `buildAnalysisResult.ts` (`maybePrev`). Skips recalculation when the role
   feeding a surface was not re-synced.
2. **Apps Script `?offset=&limit=` pagination + delta sync** — DONE on the
   script side and in `reportSheetsService.ts`. `'Sincronización completa'`
   button in UploadPage forces a full re-fetch (handles the rare edit-in-place
   case the delta scheme can't detect).
3. **Move header×row zip into the worker** — DONE (`zipRows` in
   `analysisWorker.ts`); main thread only sees dense `{headers, rows}`.
4. **Strip `raw` from persisted snapshots** — DONE in
   `LocalReportRepository.saveAnalysis` via `encodeSnapshot({stripField:'raw'})`
   and rehydrated from `sheetsCache` on restore.
5. **Defer auto-check past first paint** — DONE in
   `AppShell.startReportSheetsWatch` (`setTimeout(check, 0)` on mount,
   prompt on visibility regain).

Still-open ideas (consider for the next round):

- Cache HTTP / ETag (Apps Script can't emit custom headers, but you can lean
  harder on `?meta=1` per-tab and skip the body when unchanged).
- Lazy / column-aware mappers — `mapSugerencia` materializes ~30 fields; only
  ~5 feed the KPI path. A lite mapper for the sync hot path would cut both the
  zip cost and the structured-clone payload to the worker. **INVESTIGATION
  DONE**: nearly every typed field IS read by some page/UI (SugerenciasPage,
  ResultsPage, analytics panels). A lite mapper without those fields would
  break pages. Marked as NOT worth it for this codebase as-is; revisit only if
  page reads move behind a lazy accessor / `raw` proxy.
- DuckDB-WASM for `computeKpis`/`buildHeatmap`/`detectInconsistencies` once row
  counts pass ~100k (the `analysis.ts` closing comment already flags this).
  BEFORE implementing: add JS-vs-DuckDB parity tests against `analysis.ts`
  (NULLs, `gpoCte=''` vs null, COALESCE on precioOferta), and gate behind
  `VITE_USE_DUCKDB_AGGR` opt-in. The first attempt (Sept 2024) wrote
  `src/core/analysisDuckDB.ts` with un SQL surface that didn't compile (phony
  `UNIX(EPOCH_MS)`, `to_json`, `json_each` DuckDB-wasm APIs) — deleted as
  unshippable. The right sequence: parity tests first, then write SQL.
- `requestIdleCallback` for the AppShell auto-check, so it doesn't compete with
  initial render. **DONE** (`startReportSheetsWatch` in `AppShell.tsx` now
  defers the first `check()` with `setTimeout(check, 0)`; visibility regain
  still fires promptly).
- Worker pool (2–4 workers) — one tab per worker in real parallel.

## Anti-patterns to avoid

- Don't zip `{headers, rows}` into objects on the main thread for the Sheets
  path — that was the pre-optimization shape and it measurably costs an O(n)
  walk + a structured-clone of the whole object graph.
- Don't persist `raw` to IndexedDB; it roughly doubles Parquet snapshot size
  and the cache can rehydrate it on restore.
- Don't add a `npm run typecheck` script — `npm run build` already runs `tsc -b`
  and is the established gate.
- Don't use `&&` to chain build/lint on the Windows PowerShell host — use
  `cmd1; if ($?) { cmd2 }` (see the bash tool description in this repo).
- Never skip the deploy step in `docs/apps-script-report-sheets.md` when you
  edit the script — the URL stays the same but the new code only takes effect
  after a new deployment version.
