# Graph Report - Reporte_Pendientes_Consumo  (2026-07-19)

## Corpus Check
- 91 files · ~46,945 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 683 nodes · 994 edges · 74 communities (39 shown, 35 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1231a81f`
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
- lucide-react
- analysisWorker.ts
- xlsx
- roleDetection.ts
- supabaseClient.ts
- dexie
- authService.ts
- class-variance-authority
- mappers.ts
- analysisWorker.ts
- framer-motion
- lucide-react
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
- tailwind-merge
- tailwindcss
- @tailwindcss/vite
- @tanstack/react-query
- @tanstack/react-table
- @tanstack/react-virtual
- zustand
- GenerarReportePage.tsx
- useSort.ts
- GenerarReportePage.tsx
- roleDetection.ts

## God Nodes (most connected - your core abstractions)
1. `react` - 39 edges
2. `compilerOptions` - 19 edges
3. `mesKey()` - 17 edges
4. `ReportRepository` - 15 edges
5. `compilerOptions` - 15 edges
6. `LocalReportRepository` - 13 edges
7. `handleProcessReport()` - 13 edges
8. `analisisVentas()` - 12 edges
9. `SupabaseReportRepository` - 12 edges
10. `norm()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `exportXlsx()` --references--> `xlsx`  [EXTRACTED]
  src/lib/exportXlsx.ts → package.json
- `exportXlsxMultiSheet()` --references--> `xlsx`  [EXTRACTED]
  src/lib/exportXlsx.ts → package.json
- `extraerHojas()` --references--> `xlsx`  [EXTRACTED]
  src/modules/generar/GenerarReportePage.tsx → package.json
- `parseFirstSheet()` --references--> `xlsx`  [EXTRACTED]
  src/services/comodatoService.ts → package.json
- `peekReportSheets()` --references--> `xlsx`  [EXTRACTED]
  src/services/reportPeek.ts → package.json

## Import Cycles
- None detected.

## Communities (74 total, 35 thin omitted)

### Community 0 - "mappers.ts"
Cohesion: 0.50
Nodes (3): TabsContent, TabsList, TabsTrigger

### Community 1 - "PanelHost.tsx"
Cohesion: 0.07
Nodes (48): Analytics, AnalyticsCtx, useAnalytics(), consFor(), consumoEnrich(), consumoSerie(), consumoStatus(), consumoTend() (+40 more)

### Community 2 - "resumenFac.ts"
Cohesion: 0.09
Nodes (51): AnalisisResult, analisisVentas(), ClienteAna, kToLbl(), lastBuyK(), MatAna, norm(), num() (+43 more)

### Community 3 - "index.ts"
Cohesion: 0.05
Nodes (16): decodeSnapshot(), encodeSnapshot(), CatalogRepository, db, DegasaDb, SnapshotRow, catalogRepository, reportRepository (+8 more)

### Community 4 - "compilerOptions"
Cohesion: 0.08
Nodes (25): DOM, ./src/*, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx (+17 more)

### Community 5 - "devDependencies"
Cohesion: 0.08
Nodes (24): oxlint, devDependencies, oxlint, @types/node, @types/react, @types/react-dom, typescript, vite (+16 more)

### Community 6 - "compilerOptions"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 7 - "react"
Cohesion: 0.08
Nodes (3): react, Input, Progress

### Community 8 - "analysisService.ts"
Cohesion: 0.17
Nodes (13): getWorker(), makeWorker(), nextId(), parseCatalog(), processReport(), runJob(), RunOptions, APPSCRIPT_TABS (+5 more)

### Community 9 - "resumenSin.ts"
Cohesion: 0.19
Nodes (12): ALM_INV, buildRSS(), esLento(), invGen(), norm(), num(), RSS, RSSAlmacen (+4 more)

### Community 10 - "table.tsx"
Cohesion: 0.18
Nodes (10): SortableTableHead, SortableTableHeadProps, SortDir, Table, TableBody, TableCell, TableHead, TableHeader (+2 more)

### Community 11 - "clsx"
Cohesion: 0.14
Nodes (7): ErrorBoundary, Props, State, NAV, Sidebar(), TITLES, Topbar()

### Community 12 - "plugins"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

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
Cohesion: 0.10
Nodes (22): applyCatalogPriceFallback(), computeKpis(), condKey(), buildEnrich(), EMPTY, normCode(), AnalysisResult, AppSettings (+14 more)

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
Cohesion: 0.12
Nodes (14): AnalisisPage, ComodatoPage, ConsumoPage, GenerarReportePage, HistoryPage, InventarioPage, LogsPage, ProcessingPage (+6 more)

### Community 25 - "badge.tsx"
Cohesion: 0.67
Nodes (3): Badge(), BadgeProps, badgeVariants

### Community 26 - "button.tsx"
Cohesion: 0.50
Nodes (3): Button, ButtonProps, buttonVariants

### Community 28 - "ProcessingPage.tsx"
Cohesion: 0.67
Nodes (3): PHASE_LABEL, PHASES, ProcessingPage()

### Community 30 - "dataStore.ts"
Cohesion: 0.50
Nodes (3): DataState, DEFAULT_SETTINGS, useDataStore

### Community 31 - "panelStore.ts"
Cohesion: 0.50
Nodes (3): Panel, PanelState, usePanelStore

### Community 35 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the Oxlint configuration, React Compiler, React + TypeScript + Vite

### Community 37 - "dependencies"
Cohesion: 0.29
Nodes (7): class-variance-authority, claude, dependencies, class-variance-authority, claude, @supabase/supabase-js, @supabase/supabase-js

### Community 41 - "xlsx"
Cohesion: 0.14
Nodes (27): ComodatoResult, ejecutivosZonaRowsFromCatalog(), materialesRowsFromCatalog(), parseFirstSheet(), runComodatoAnalysis(), SeguimientoRow, getDb(), loadRowsAsTable() (+19 more)

### Community 43 - "supabaseClient.ts"
Cohesion: 0.50
Nodes (3): key, supabase, url

### Community 47 - "mappers.ts"
Cohesion: 0.18
Nodes (19): CENTERS, excelDateToIso(), mapConsumo(), mapEjecutivo(), mapInvConsolidado(), mapInvDetalle(), mapMaterial(), mapResumenFac() (+11 more)

### Community 48 - "analysisWorker.ts"
Cohesion: 0.29
Nodes (10): cancelled, findSheetByRole(), firstRowHeaders(), fixRange(), handleParseCatalog(), post(), progress(), readWorkbookSheets() (+2 more)

### Community 70 - "GenerarReportePage.tsx"
Cohesion: 0.25
Nodes (6): xlsx, exportXlsx(), exportXlsxMultiSheet(), peekReportSheets(), ReportSheetInfo, xlsx

### Community 72 - "GenerarReportePage.tsx"
Cohesion: 0.33
Nodes (5): extraerHojas(), FileKey, FUENTES_DISPONIBLES, GenerarReportePage(), SHEETS_PARA_GOOGLE

### Community 73 - "roleDetection.ts"
Cohesion: 0.50
Nodes (4): normHeader(), ROLE_LABEL, roleOf(), SheetRole

## Knowledge Gaps
- **248 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+243 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `mappers.ts`, `PanelHost.tsx`, `table.tsx`, `clsx`, `plugins`, `sheet.tsx`, `InventarioPage.tsx`, `card.tsx`, `dialog.tsx`, `DashboardPage.tsx`, `App.tsx`, `badge.tsx`, `button.tsx`, `UploadPage.tsx`, `ProcessingPage.tsx`, `SugerenciasPage.tsx`, `AnalisisPage.tsx`, `ConsumoPage.tsx`, `ResultsPage.tsx`, `authService.ts`, `useSort.ts`, `GenerarReportePage.tsx`?**
  _High betweenness centrality (0.308) - this node is a cross-community bridge._
- **Why does `xlsx` connect `GenerarReportePage.tsx` to `dependencies`, `GenerarReportePage.tsx`, `xlsx`, `mappers.ts`, `analysisWorker.ts`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `extraerHojas()` connect `GenerarReportePage.tsx` to `GenerarReportePage.tsx`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _248 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PanelHost.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06557377049180328 - nodes in this community are weakly interconnected._
- **Should `resumenFac.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08956228956228957 - nodes in this community are weakly interconnected._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05141242937853107 - nodes in this community are weakly interconnected._