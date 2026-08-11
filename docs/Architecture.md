# Architecture.md — Degasa Portal

> Documento de referencia para IA (Claude Code, Gemini CLI, Cursor, Codex, etc.) y desarrolladores nuevos. Parte de la serie: `Architecture.md` (este), `DependencyGraph.md`, `DataFlow.md`, `StateFlow.md`, `DomainModel.md`, `SequenceDiagrams.md`, `TechnicalDebt.md`, `ImprovementRoadmap.md`.

## 1. Qué es

Portal interno (no público) de decisiones comerciales y logísticas para inventario con **condiciones especiales** (corta caducidad, lento movimiento, calidad, material dañado). Cruza un catálogo maestro contra un reporte diario, expone el resultado en ~13 módulos de reporte/BI, y añade un módulo de acción comercial ("Oportunidades") que persiste conocimiento nuevo sobre ese cruce.

## 2. Stack

| Capa | Tecnología | Notas |
|---|---|---|
| UI | React 19 + TypeScript, Vite (rolldown), Tailwind v4 (CSS-first, `@theme inline`) | Todo el árbol de rutas es `lazy()` — solo el shell (`AppShell`/`Topbar`/`Sidebar`) es eager |
| Componentes base | Radix UI primitives + CVA (`class-variance-authority`) | `src/components/ui/*` — wrappers propios, no una librería de componentes de terceros |
| Estado cliente | Zustand (múltiples stores independientes, sin un store único) | Ver `StateFlow.md` |
| Datos remotos (mutación) | TanStack Query (`@tanstack/react-query`) | Configurado en `App.tsx`, staleTime 60s — uso limitado, la mayoría del estado remoto vive en Zustand + repositorios propios, no en Query cache |
| Persistencia local | Dexie (IndexedDB) — catálogo, análisis, caché de hojas, oportunidades/conocimiento (espejo offline) | `src/repositories/db.ts` |
| Backend | Supabase (Postgres + Auth + RLS + Edge Functions) | Auth Google OAuth + lista de invitados; sin backend propio (Node/Express) |
| Cómputo pesado | Web Worker (`src/workers/analysisWorker.ts`) | Parseo xlsx y cruce catálogo+reporte fuera del hilo principal |
| SQL analítico | DuckDB-WASM | Solo para el módulo Comodato (ejecuta `SQL_Comodato.sql` tal cual) |
| Almacenamiento de archivos | Cloudflare R2 (vía Edge Function con URL prefirmada) | Xlsx originales + Parquet de facturación acumulada |
| Fuente de datos operativa | Google Sheets vía Apps Script (`doGet`/`doPost`) | Catálogo maestro + reporte diario + hoja "DRP" |
| Gráficas | Recharts | Solo Dashboard (bundle pesado, por eso es lazy) |
| Excel | SheetJS (`xlsx`) | Lectura del xlsx manual (legado) y exportaciones |

## 3. Capas del código (`src/`)

```
core/          dominio puro — SIN React, SIN I/O, SIN fetch. Funciones que
               transforman datos ya cargados. Testeable sin montar nada.
services/      orquestación — llama APIs externas (Apps Script, Supabase,
               R2, DuckDB), invoca el worker, coordina repositorios.
repositories/  abstracción de persistencia (Dexie / Supabase) detrás de una
               interfaz — "swap sin tocar UI" (patrón repetido: Local*/Supabase*).
store/         Zustand — estado de UI y espejos en memoria de repositorios.
modules/       páginas y paneles, organizados por dominio de negocio
               (dashboard/, sugerencias/, consumo/, inventario/, resumenSin/,
               analisis/, comodato/, solicitudes/, oportunidades/, admin/, …).
components/    UI reutilizable transversal (ui/ = primitivos Radix+CVA,
               layout/, auth/, navigation/, feedback/, upload/).
workers/       Web Worker de parseo/cruce.
lib/           utilidades sin estado (formateo, texto, colores, exportXlsx…).
hooks/         hooks genéricos reutilizables (useDebouncedValue, useSort,
               useRowVirtualizer, useZoom, useKeybindings…).
```

**Regla de dependencia (no siempre impuesta por tooling, ver `DependencyGraph.md` §2):** `core/` no debería importar de `modules/` ni de `store/` — es la capa más pura. `services/` puede importar `core/` y `repositories/`. `modules/` importa de todo lo anterior.

## 4. Flujo de arranque

```
main.tsx
  └─ <StrictMode><App /></StrictMode>
       └─ QueryClientProvider
            └─ ErrorBoundary (global, sin resetKey)
                 └─ AuthGate                    ── Google OAuth + allowlist (useAuth.ts)
                      └─ BrowserRouter
                           └─ TooltipProvider
                                └─ AnalyticsProvider   ── deriva índices desde useDataStore
                                     └─ Routes (todas lazy) dentro de <AppShell/>
                                     └─ PanelHost         ── el Sheet de drill-down, global
```

`App()` hidrata en un único `useEffect` al montar: `solicitudStore`, `conocimientoStore`, `scoringWeightsStore` (todos locales/Supabase, no bloquean el primer render). `AppShell` hace un bootstrap **secuencial** propio (catálogo + último análisis + settings desde IndexedDB/Supabase) antes de arrancar el chequeo automático de Google Sheets — ver `SequenceDiagrams.md` §1.

## 5. Módulos de negocio (mapa rápido)

| Módulo | Ruta | Rol |
|---|---|---|
| Panel general | `/` | KPIs agregados + gráficas (Dashboard) |
| Hoy | `/hoy` | Radar de urgencias del día (foto, no diff) |
| Carga | `/carga` | Sincroniza catálogo + reporte diario (Google Sheets en vivo) |
| Resultados | `/resultados` | Detalle de la última corrida de análisis |
| Pedidos | `/sugerencias` | Tabla BO (deduplicación de "Todas las Sugerencias") |
| Consumo | `/consumo` | Reporte de Consumo, con ABC, dispersión de precio |
| Inventario | `/resumen-sin` | Pivote material×centro con cobertura |
| Inv Condición | `/inventario` | Tabla plana por condición |
| Análisis | `/analisis` | Ventanas de facturación, riesgo, concentración |
| **Oportunidades** | `/oportunidades` | Bandeja de trabajo + scoring + mini-CRM (único módulo que escribe conocimiento) |
| Comodato vs. Fac. | `/comodato` | DuckDB-WASM sobre xlsx + Parquet R2 |
| Solicitudes DRP | `/solicitudes` | Cola de solicitudes (local, envío automático desactivado) |
| Historial / Registros | `/historial` `/registros` | Auditoría — Supabase, solo lectura |
| Ajustes | `/ajustes` | Umbrales de negocio + columnas visibles |
| Administración | `/admin` | Roles/permisos/conectores/pesos del scoring |

Detalle módulo por módulo (qué ve, de qué fuente, qué abre cada clic) → ver el resumen técnico publicado previamente (Artifact) o `SequenceDiagrams.md` para los flujos de interacción.

## 6. Decisiones arquitectónicas notables

- **Un solo `AnalysisResult` atómico** (`useDataStore.activeAnalysis`) en vez de N stores por reporte — todo módulo de reporte lee el mismo objeto vía `useAnalytics()`, nunca duplica datos.
- **Sincronización progresiva por pestaña** (`onPartialResult`): las 4 hojas del reporte diario se aplican a medida que llegan, no se espera a las 4 (agregado recientemente al chequeo automático de `AppShell`, ya existía en la sync manual de Carga).
- **`pick()` con fallback a `previous`**: una sincronización parcial nunca borra datos de hojas no seleccionadas.
- **Panel lateral (`Sheet`) en vez de navegación de página** para todo drill-down — una sola pila (`usePanelStore.stack`), un solo `PanelHost` despachando por `panel.type`.
- **Repositorio intercambiable** (patrón `Local*`/`Supabase*` detrás de una interfaz + factory `createXRepository(backend)`) repetido en Catálogo, Reporte, Solicitudes, Oportunidad, ClienteConocimiento, Oferta.
- **Conocimiento del equipo vs. datos por dispositivo**: Solicitudes DRP es 100% local (Dexie, sin Supabase); el conocimiento de Oportunidades es Supabase-first con Dexie como caché offline — dos filosofías de persistencia coexistiendo a propósito.
- **`degasa_connectors` como key/value genérico reciclado**: URLs de Apps Script, pesos del motor de scoring — ambos en la misma tabla, sin migraciones nuevas por cada configuración.
- **Permisos "nunca lanzan"**: `permissionsService.ts` degrada a acceso irrestricto si Supabase falla, en vez de bloquear la app — trade-off deliberado de disponibilidad sobre restricción estricta.
