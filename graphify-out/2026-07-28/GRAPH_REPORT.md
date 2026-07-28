# Graph Report - Reporte_Pendientes_Consumo  (2026-07-27)

## Corpus Check
- 160 files · ~72,560 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 930 nodes · 1474 edges · 96 communities (50 shown, 46 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `588b5ff4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- mappers.ts
- PanelHost.tsx
- resumenFac.ts
- index.ts
- compilerOptions
- devDependencies
- compilerOptions
- react
- analysisService.ts
- resumenSin.ts
- table.tsx
- clsx
- plugins
- AppShell.tsx
- sheet.tsx
- InventarioPage.tsx
- card.tsx
- types.ts
- utils.ts
- dialog.tsx
- chartColors.ts
- DashboardPage.tsx
- uiStore.ts
- App.tsx
- badge.tsx
- button.tsx
- UploadPage.tsx
- ProcessingPage.tsx
- SugerenciasPage.tsx
- dataStore.ts
- panelStore.ts
- AnalisisPage.tsx
- ConsumoPage.tsx
- ResultsPage.tsx
- React + TypeScript + Vite
- tsconfig.json
- dependencies
- dexie
- reportSheetsSyncStore.ts
- analysisWorker.ts
- xlsx
- roleDetection.ts
- supabaseClient.ts
- dexie
- ui/index.ts
- class-variance-authority
- mappers.ts
- mappers.ts
- framer-motion
- resumenSin.ts
- @radix-ui/react-dialog
- @radix-ui/react-progress
- @radix-ui/react-scroll-area
- @radix-ui/react-separator
- @radix-ui/react-slot
- @radix-ui/react-tabs
- @radix-ui/react-tooltip
- react
- react-dom
- react-router-dom
- recharts
- solicitudService.ts
- tailwindcss
- @tailwindcss/vite
- @tanstack/react-query
- @tanstack/react-table
- @tanstack/react-virtual
- zustand
- toastStore.ts
- useSort.ts
- repositories/index.ts
- SolicitudRepository
- SupabaseReportRepository
- Toaster.tsx
- useAuth.ts
- enrich.ts
- Apps Script — escribir solicitudes en la pestaña "DRP"
- SolicitarDialog.tsx
- buildAnalysisResult.test.ts
- SolicitarContextMenu.tsx
- SolicitudesPage.tsx
- @radix-ui/react-dialog
- solicitudStore.ts
- EmptyState.tsx
- text.ts
- ResultsPage.tsx
- @duckdb/duckdb-wasm
- commandPaletteStore.ts
- db.ts
- react
- dexie

## God Nodes (most connected - your core abstractions)
1. `react` - 63 edges
2. `compilerOptions` - 19 edges
3. `buildAnalysisResult()` - 16 edges
4. `mesKey()` - 16 edges
5. `Analytics` - 15 edges
6. `ReportRepository` - 15 edges
7. `compilerOptions` - 15 edges
8. `Section()` - 13 edges
9. `LocalReportRepository` - 13 edges
10. `matchesQuery()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `exportXlsx()` --references--> `xlsx`  [EXTRACTED]
  src/lib/exportXlsx.ts → package.json
- `exportXlsxMultiSheet()` --references--> `xlsx`  [EXTRACTED]
  src/lib/exportXlsx.ts → package.json
- `parseFirstSheet()` --references--> `xlsx`  [EXTRACTED]
  src/services/comodatoService.ts → package.json
- `peekReportSheets()` --references--> `xlsx`  [EXTRACTED]
  src/services/reportPeek.ts → package.json
- `extraerHojas()` --references--> `xlsx`  [EXTRACTED]
  src/modules/generar/GenerarReportePage.tsx → package.json

## Import Cycles
- None detected.

## Communities (96 total, 46 thin omitted)

### Community 0 - "mappers.ts"
Cohesion: 0.50
Nodes (3): TabsContent, TabsList, TabsTrigger

### Community 1 - "PanelHost.tsx"
Cohesion: 0.06
Nodes (66): Analytics, AnalyticsCtx, useAnalytics(), consFor(), consumoEnrich(), consumoSerie(), consumoStatus(), consumoTend() (+58 more)

### Community 2 - "resumenFac.ts"
Cohesion: 0.07
Nodes (50): BOItem, buildBO(), hasFuente(), keyOf(), AnalisisResult, analisisVentas(), ClienteAna, kToLbl() (+42 more)

### Community 4 - "compilerOptions"
Cohesion: 0.08
Nodes (25): DOM, DOM.Iterable, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly (+17 more)

### Community 5 - "devDependencies"
Cohesion: 0.06
Nodes (30): happy-dom, oxlint, devDependencies, happy-dom, oxlint, @types/node, @types/react, @types/react-dom (+22 more)

### Community 6 - "compilerOptions"
Cohesion: 0.09
Nodes (20): node, vite.config.ts, vitest/config, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module (+12 more)

### Community 7 - "react"
Cohesion: 0.06
Nodes (4): react, Input, Progress, columns

### Community 8 - "analysisService.ts"
Cohesion: 0.16
Nodes (15): buildFromSheetsInWorker(), BuildFromSheetsParams, getWorker(), makeWorker(), nextId(), parseCatalog(), processReport(), runJob() (+7 more)

### Community 9 - "resumenSin.ts"
Cohesion: 0.21
Nodes (14): checkForReportSheetsUpdate(), fetchReportSheetsMeta(), fetchReportSheetTab(), progressListeners, readSyncMeta(), REPORT_SHEET_ROLES, REPORT_SHEETS_URL, REPORT_TABS (+6 more)

### Community 10 - "table.tsx"
Cohesion: 0.18
Nodes (10): SortableTableHead, SortableTableHeadProps, SortDir, Table, TableBody, TableCell, TableHead, TableHeader (+2 more)

### Community 11 - "clsx"
Cohesion: 0.13
Nodes (8): ErrorBoundary, Props, State, NAV, Sidebar(), SidebarProps, TITLES, Topbar()

### Community 12 - "plugins"
Cohesion: 0.12
Nodes (15): plugins, rules, no-floating-promises, react/exhaustive-deps, react/jsx-key, react/no-array-index-key, react/only-export-components, react/rules-of-hooks (+7 more)

### Community 13 - "AppShell.tsx"
Cohesion: 0.06
Nodes (33): allRes, buildRF_mat(), bundle, conn, conn2, __dirname, DIST, duckdb (+25 more)

### Community 14 - "sheet.tsx"
Cohesion: 0.25
Nodes (6): SheetContent, SheetContentProps, SheetDescription, SheetOverlay, SheetTitle, sheetVariants

### Community 15 - "InventarioPage.tsx"
Cohesion: 0.43
Nodes (7): CENTERS, InventarioPage(), readAdmin(), readHidden(), rowKey(), writeAdmin(), writeHidden()

### Community 16 - "card.tsx"
Cohesion: 0.29
Nodes (6): Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle

### Community 17 - "types.ts"
Cohesion: 0.06
Nodes (62): applyCatalogPriceFallback(), buildHeatmap(), computeKpis(), condKey(), detectInconsistencies(), monthlyInvoicing(), topEjecutivos(), topMateriales() (+54 more)

### Community 20 - "dialog.tsx"
Cohesion: 0.33
Nodes (4): DialogContent, DialogDescription, DialogOverlay, DialogTitle

### Community 21 - "chartColors.ts"
Cohesion: 0.33
Nodes (3): CATEGORICAL_DARK, CATEGORICAL_LIGHT, SEQUENTIAL_BLUE

### Community 23 - "uiStore.ts"
Cohesion: 0.40
Nodes (3): Theme, UiState, useUiStore

### Community 24 - "App.tsx"
Cohesion: 0.11
Nodes (15): AnalisisPage, ComodatoPage, ConsumoPage, GenerarReportePage, HistoryPage, InventarioPage, LogsPage, ProcessingPage (+7 more)

### Community 25 - "badge.tsx"
Cohesion: 0.67
Nodes (3): Badge(), BadgeProps, badgeVariants

### Community 26 - "button.tsx"
Cohesion: 0.50
Nodes (3): Button, ButtonProps, buttonVariants

### Community 28 - "ProcessingPage.tsx"
Cohesion: 0.67
Nodes (3): PHASE_LABEL, PHASES, ProcessingPage()

### Community 29 - "SugerenciasPage.tsx"
Cohesion: 0.40
Nodes (3): BORow, INV_COLS, RawRow

### Community 31 - "panelStore.ts"
Cohesion: 0.38
Nodes (4): Panel, PanelState, sample, usePanelStore

### Community 34 - "ResultsPage.tsx"
Cohesion: 0.29
Nodes (6): 1. Crear el script, 2. Desplegar, 3. Configurar el portal, 4. Probar, 5. Sync incremental (delta), Apps Script — leer el reporte diario desde Google Sheets

### Community 35 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the Oxlint configuration, React Compiler, React + TypeScript + Vite

### Community 37 - "dependencies"
Cohesion: 0.29
Nodes (7): clsx, @duckdb/duckdb-wasm, dependencies, clsx, @duckdb/duckdb-wasm, tailwind-merge, tailwind-merge

### Community 41 - "xlsx"
Cohesion: 0.12
Nodes (31): ComodatoResult, ejecutivosZonaRowsFromCatalog(), materialesRowsFromCatalog(), parseFirstSheet(), runComodatoAnalysis(), SeguimientoRow, arrowRowsToPlain(), flattenNested() (+23 more)

### Community 43 - "supabaseClient.ts"
Cohesion: 0.50
Nodes (3): key, supabase, url

### Community 46 - "class-variance-authority"
Cohesion: 0.14
Nodes (16): CheatsheetDialog(), CheatsheetDialogProps, SHORTCUTS, Cmd, CommandPalette(), PAGES, strip(), useCommands() (+8 more)

### Community 48 - "mappers.ts"
Cohesion: 0.10
Nodes (23): xlsx, exportXlsx(), exportXlsxMultiSheet(), extraerHojas(), FileKey, FUENTES_DISPONIBLES, GenerarReportePage(), SHEETS_PARA_GOOGLE (+15 more)

### Community 49 - "framer-motion"
Cohesion: 0.29
Nodes (6): Anti-patterns to avoid, Degasa portal — optimization workflow, Forcing functions, Hot-path map (where time/memory goes), Lookup order (graphify-first), Optimization ideas already in flight

### Community 51 - "@radix-ui/react-dialog"
Cohesion: 0.18
Nodes (5): LocalReportRepository, rehydrateRaw(), ROLE_TO_TAB, zipOne(), getAllCachedTabs()

### Community 59 - "react"
Cohesion: 0.36
Nodes (6): encodeSnapshot(), EncodeSnapshotOptions, isQuotaExceeded(), putSnapshot(), quotaExceededMessage(), stripKeyFromArray()

### Community 60 - "react-dom"
Cohesion: 0.48
Nodes (6): logError(), logEvent(), logInfo(), LogLevel, logRejection(), logWarn()

### Community 63 - "solicitudService.ts"
Cohesion: 0.16
Nodes (12): EnrichIndex, DRP_SHEET_ID, DRP_TOKEN, DRP_WEBHOOK_URL, enviarSolicitudDRP(), buildFromInvDetalle(), buildFromInventarioCentro(), buildFromResumenSin() (+4 more)

### Community 70 - "toastStore.ts"
Cohesion: 0.32
Nodes (4): Toast, ToastLevel, ToastState, useToastStore

### Community 72 - "repositories/index.ts"
Cohesion: 0.15
Nodes (7): decodeSnapshot(), CatalogRepository, catalogRepository, reportRepository, RepositoryBackend, solicitudRepository, LocalCatalogRepository

### Community 73 - "SolicitudRepository"
Cohesion: 0.18
Nodes (3): db, LocalSolicitudRepository, SolicitudRepository

### Community 74 - "SupabaseReportRepository"
Cohesion: 0.40
Nodes (4): ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator

### Community 79 - "Apps Script — escribir solicitudes en la pestaña "DRP""
Cohesion: 0.33
Nodes (5): 1. Crear el script, 2. Desplegar, 3. Configurar el portal, 4. Probar, Apps Script — escribir solicitudes en la pestaña "DRP"

### Community 89 - "text.ts"
Cohesion: 0.80
Nodes (3): norm(), num(), numLoose()

### Community 94 - "db.ts"
Cohesion: 0.25
Nodes (3): DegasaDb, SheetsCacheRow, SnapshotRow

## Knowledge Gaps
- **322 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+317 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **46 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `mappers.ts`, `PanelHost.tsx`, `table.tsx`, `clsx`, `plugins`, `sheet.tsx`, `InventarioPage.tsx`, `card.tsx`, `dialog.tsx`, `DashboardPage.tsx`, `App.tsx`, `badge.tsx`, `button.tsx`, `ProcessingPage.tsx`, `SugerenciasPage.tsx`, `AnalisisPage.tsx`, `ConsumoPage.tsx`, `class-variance-authority`, `mappers.ts`, `@radix-ui/react-progress`, `SupabaseReportRepository`, `Toaster.tsx`, `useAuth.ts`, `LocalReportRepository`, `SolicitarDialog.tsx`, `SolicitarContextMenu.tsx`, `SolicitudesPage.tsx`, `EmptyState.tsx`?**
  _High betweenness centrality (0.302) - this node is a cross-community bridge._
- **Why does `xlsx` connect `mappers.ts` to `xlsx`, `dependencies`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `buildAnalysisResult()` (e.g. with `mapConsumo()` and `mapInvConsolidado()`) actually correct?**
  _`buildAnalysisResult()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _322 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PanelHost.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06464776632302406 - nodes in this community are weakly interconnected._
- **Should `resumenFac.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07130333138515488 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._