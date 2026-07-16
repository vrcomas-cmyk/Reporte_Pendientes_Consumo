# Graph Report - degasa-portal  (2026-07-15)

## Corpus Check
- 68 files · ~32,627 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 524 nodes · 759 edges · 60 communities (31 shown, 29 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dfe14694`
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
- xlsx
- dialog.tsx
- chartColors.ts
- DashboardPage.tsx
- uiStore.ts
- App.tsx
- badge.tsx
- button.tsx
- tabs.tsx
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
- @radix-ui/react-dialog
- useSort.ts
- @radix-ui/react-separator
- @radix-ui/react-slot
- @radix-ui/react-tabs
- graphify
- react
- react-dom
- react-router-dom
- tailwind-merge
- framer-motion
- @tailwindcss/vite
- @tanstack/react-query
- @tanstack/react-table
- @tanstack/react-virtual
- zustand
- claude
- @radix-ui/react-progress
- recharts

## God Nodes (most connected - your core abstractions)
1. `react` - 30 edges
2. `compilerOptions` - 19 edges
3. `mesKey()` - 17 edges
4. `compilerOptions` - 15 edges
5. `ReportRepository` - 13 edges
6. `analisisVentas()` - 12 edges
7. `LocalReportRepository` - 12 edges
8. `handleProcessReport()` - 11 edges
9. `norm()` - 10 edges
10. `matchesQuery()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `exportXlsx()` --references--> `xlsx`  [EXTRACTED]
  src/lib/exportXlsx.ts → package.json
- `exportXlsxMultiSheet()` --references--> `xlsx`  [EXTRACTED]
  src/lib/exportXlsx.ts → package.json
- `readWorkbookSheets()` --references--> `xlsx`  [EXTRACTED]
  src/workers/analysisWorker.ts → package.json
- `AnalisisResult` --references--> `Serie`  [EXTRACTED]
  src/core/analisis.ts → src/core/resumenFac.ts
- `consumoEnrich()` --references--> `EnrichIndex`  [EXTRACTED]
  src/modules/analytics/helpers.ts → src/core/enrich.ts

## Import Cycles
- None detected.

## Communities (60 total, 29 thin omitted)

### Community 0 - "mappers.ts"
Cohesion: 0.13
Nodes (28): CENTERS, excelDateToIso(), mapConsumo(), mapEjecutivo(), mapInvConsolidado(), mapInvDetalle(), mapMaterial(), mapResumenFac() (+20 more)

### Community 1 - "PanelHost.tsx"
Cohesion: 0.07
Nodes (42): Analytics, AnalyticsCtx, useAnalytics(), consFor(), consumoEnrich(), consumoSerie(), consumoStatus(), consumoTend() (+34 more)

### Community 2 - "resumenFac.ts"
Cohesion: 0.09
Nodes (51): AnalisisResult, analisisVentas(), ClienteAna, kToLbl(), lastBuyK(), MatAna, norm(), num() (+43 more)

### Community 3 - "index.ts"
Cohesion: 0.06
Nodes (10): CatalogRepository, db, DegasaDb, catalogRepository, reportRepository, RepositoryBackend, LocalCatalogRepository, DEFAULT_SETTINGS (+2 more)

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
Cohesion: 0.12
Nodes (3): react, Input, Progress

### Community 8 - "analysisService.ts"
Cohesion: 0.22
Nodes (11): getWorker(), makeWorker(), nextId(), parseCatalog(), processReport(), runJob(), RunOptions, APPSCRIPT_TABS (+3 more)

### Community 9 - "resumenSin.ts"
Cohesion: 0.19
Nodes (12): ALM_INV, buildRSS(), esLento(), invGen(), norm(), num(), RSS, RSSAlmacen (+4 more)

### Community 10 - "table.tsx"
Cohesion: 0.18
Nodes (10): SortableTableHead, SortableTableHeadProps, SortDir, Table, TableBody, TableCell, TableHead, TableHeader (+2 more)

### Community 12 - "plugins"
Cohesion: 0.22
Nodes (8): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn

### Community 13 - "AppShell.tsx"
Cohesion: 0.32
Nodes (4): NAV, Sidebar(), TITLES, Topbar()

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
Cohesion: 0.09
Nodes (25): applyCatalogPriceFallback(), computeKpis(), buildEnrich(), EMPTY, normCode(), detectSheets(), normHeader(), ROLE_LABEL (+17 more)

### Community 19 - "xlsx"
Cohesion: 0.40
Nodes (4): xlsx, exportXlsx(), exportXlsxMultiSheet(), xlsx

### Community 20 - "dialog.tsx"
Cohesion: 0.33
Nodes (4): DialogContent, DialogDescription, DialogOverlay, DialogTitle

### Community 21 - "chartColors.ts"
Cohesion: 0.33
Nodes (3): CATEGORICAL_DARK, CATEGORICAL_LIGHT, SEQUENTIAL_BLUE

### Community 23 - "uiStore.ts"
Cohesion: 0.40
Nodes (3): Theme, UiState, useUiStore

### Community 25 - "badge.tsx"
Cohesion: 0.67
Nodes (3): Badge(), BadgeProps, badgeVariants

### Community 26 - "button.tsx"
Cohesion: 0.50
Nodes (3): Button, ButtonProps, buttonVariants

### Community 27 - "tabs.tsx"
Cohesion: 0.50
Nodes (3): TabsContent, TabsList, TabsTrigger

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
Cohesion: 0.22
Nodes (9): class-variance-authority, dependencies, class-variance-authority, @radix-ui/react-scroll-area, @radix-ui/react-tooltip, tailwindcss, @radix-ui/react-scroll-area, @radix-ui/react-tooltip (+1 more)

## Knowledge Gaps
- **177 isolated node(s):** `$schema`, `typescript`, `oxc`, `react/rules-of-hooks`, `warn` (+172 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `EnrichIndex` connect `resumenFac.ts` to `types.ts`, `PanelHost.tsx`?**
  _High betweenness centrality (0.284) - this node is a cross-community bridge._
- **Why does `consumoEnrich()` connect `PanelHost.tsx` to `resumenFac.ts`?**
  _High betweenness centrality (0.284) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `PanelHost.tsx`, `table.tsx`, `plugins`, `AppShell.tsx`, `sheet.tsx`, `InventarioPage.tsx`, `card.tsx`, `dialog.tsx`, `DashboardPage.tsx`, `App.tsx`, `badge.tsx`, `button.tsx`, `tabs.tsx`, `ProcessingPage.tsx`, `SugerenciasPage.tsx`, `AnalisisPage.tsx`, `ConsumoPage.tsx`, `ResultsPage.tsx`, `useSort.ts`?**
  _High betweenness centrality (0.282) - this node is a cross-community bridge._
- **What connects `$schema`, `typescript`, `oxc` to the rest of the system?**
  _177 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `mappers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12903225806451613 - nodes in this community are weakly interconnected._
- **Should `PanelHost.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0734006734006734 - nodes in this community are weakly interconnected._
- **Should `resumenFac.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08956228956228957 - nodes in this community are weakly interconnected._