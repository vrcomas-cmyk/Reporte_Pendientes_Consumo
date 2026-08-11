# DataFlow.md — De Google Sheets/Supabase a la UI

> Parte de la serie de documentación técnica. Este documento traza el **flujo de datos**; `SequenceDiagrams.md` traza el **flujo de eventos** (qué dispara qué función, en orden).

## 1. Las dos fuentes y el cruce

```mermaid
flowchart TD
    subgraph Fuentes externas
        AS1["Apps Script · Catálogo<br/>(Ejecutivos/Materiales/Inv)"]
        AS2["Apps Script · Reporte diario<br/>(4 hojas, doGet)"]
    end

    AS1 -->|"catalogService.ts<br/>syncCatalogFromAppScript()"| CAT["CatalogSnapshot"]
    AS2 -->|"reportSheetsService.ts<br/>syncReportSheets() — fetch PARALELO<br/>+ paginado 20k filas"| TABS["4 TabRows densos<br/>{headers, rows[][]}"]

    TABS -->|"postMessage al Worker"| W["analysisWorker.ts<br/>build-from-sheets"]
    CAT -->|"postMessage al Worker"| W
    W -->|"buildAnalysisResult()<br/>pick() + memoización"| AR["AnalysisResult"]

    CAT -->|setCatalog| DS["useDataStore"]
    AR -->|"setActiveAnalysis()<br/>× 4 (una por hoja, onPartialResult)<br/>+ 1 final"| DS

    DS -->|"useMemo([result, catalog])"| AC["AnalyticsContext"]
    AC --> UI["Toda página/panel de reporte"]
```

## 2. Persistencia — quién escribe dónde

```mermaid
flowchart LR
    subgraph Dexie [IndexedDB — por dispositivo]
        D1[catalog]
        D2[analyses — Parquet-encoded]
        D3[solicitudes]
        D4[sheetsCache — delta de hojas]
        D5["oportunidades / interacciones /<br/>clientesConocimiento / observaciones /<br/>ofertas — CACHÉ, no fuente de verdad"]
    end

    subgraph Supabase [Postgres — del equipo]
        S1["degasa_history / degasa_logs"]
        S2[degasa_settings]
        S3["degasa_roles / modules / permissions / connectors"]
        S4["degasa_oportunidades / interacciones /<br/>clientes_conocimiento / observaciones / ofertas<br/>— FUENTE DE VERDAD"]
    end

    subgraph R2 [Cloudflare R2]
        R1["xlsx originales"]
        R2p["facturacion.parquet (acumulado, fusión incremental)"]
    end

    App["reportRepository (Local/Supabase, swap por factory)"] --> D1 & D2 & S1 & S2
    App2["solicitudRepository (SIEMPRE local)"] --> D3
    App3["oportunidadRepository / clienteConocimientoRepository /<br/>ofertaRepository (Supabase-first, Dexie de respaldo)"] --> S4
    App3 -.->|"espejo tras cada mutación exitosa;<br/>fallback de LECTURA si Supabase falla"| D5
    Upload["reportService.ts"] --> R1
    Comodato["facturacionService.ts"] --> R2p
```

**Regla que vale la pena memorizar:** hay **dos filosofías de persistencia distintas conviviendo a propósito** —
- Solicitudes DRP: **local-only**, sin Supabase — es información por dispositivo, no del equipo.
- Conocimiento de Oportunidades (ficha de cliente, ofertas, oportunidades): **Supabase-first** — es del equipo, Dexie es solo caché para que la bandeja no se quede en blanco offline.

## 3. Sincronización progresiva (por qué "Pedidos" puede aparecer antes que "Consumo")

```mermaid
sequenceDiagram
    participant U as Usuario / AppShell (auto)
    participant Svc as reportSheetsService
    participant AS as Apps Script
    participant W as Worker
    participant DS as useDataStore

    par 4 fetches en paralelo
        Svc->>AS: GET ?tab=Todas las Sugerencias
        Svc->>AS: GET ?tab=Resumen Sin Sugerencias
        Svc->>AS: GET ?tab=Reporte de Consumo (paginado, ~80k filas)
        Svc->>AS: GET ?tab=Resumen_Fac
    end
    AS-->>Svc: Pedidos llega primero (hoja chica)
    Svc->>W: build-from-sheets (snapshot SOLO Pedidos, resto = previous)
    W-->>Svc: AnalysisResult parcial
    Svc-->>DS: onPartialResult(parcial) → setActiveAnalysis
    Note over DS: Pedidos ya visible en la UI

    AS-->>Svc: Consumo llega (la más lenta, ~80k filas)
    Svc->>W: build-from-sheets (snapshot Pedidos+Consumo)
    W-->>Svc: AnalysisResult parcial 2
    Svc-->>DS: onPartialResult(parcial 2)

    Note over Svc: partialChain serializa estos builds —<br/>dos hojas llegando muy juntas no disparan<br/>builds del worker superpuestos
    AS-->>Svc: las 2 restantes llegan
    Svc->>W: build-from-sheets (snapshot completo)
    W-->>Svc: AnalysisResult final
    Svc-->>DS: setActiveAnalysis(final) — resultado autoritativo
```

Esto corre tanto en la sync manual (botón "Sincronizar ahora" en Carga) como en el chequeo automático de `AppShell` al abrir/enfocar la pestaña (conectado en esta misma sesión de trabajo — antes solo la sync manual tenía `onPartialResult`).

## 4. `pick()` — por qué una sync parcial nunca borra datos

```mermaid
flowchart LR
    Sel["selectedRoles = ['sugerencias']<br/>(solo Pedidos, en una re-sync selectiva)"]
    Prev["previous: AnalysisResult<br/>(el que ya estaba en pantalla)"]
    Sel --> Pick["pick(role)"]
    Prev --> Pick
    Pick -->|"role EN selectedRoles"| Fresh["usa el dato recién llegado"]
    Pick -->|"role NO EN selectedRoles"| Old["conserva previous[role] tal cual"]
    Fresh --> Result[AnalysisResult nuevo]
    Old --> Result
```

Aplica tanto a las 4 hojas del reporte diario como a las superficies derivadas memoizadas (KPIs, heatmap) — si ninguna hoja que las alimenta cambió, se reutiliza el valor de `previous` sin recalcular.

## 5. El cruce catálogo + reporte (dentro del Worker)

```mermaid
flowchart TD
    Rows["Filas crudas de las 8 hojas<br/>(4 catálogo + 4 reporte)"] --> Detect["findSheetByRole()<br/>identifica por FIRMA de headers,<br/>no por nombre de hoja"]
    Detect --> Build["buildAnalysisResult()"]
    Build --> Fallback["applyCatalogPriceFallback()<br/>precio por (material,condición) → material"]
    Build --> KPIs["computeKpis() — DashboardKpis"]
    Build --> Bloq["computeBloqueados() — agrupado por motivo real"]
    Build --> Top["topMateriales / topEjecutivos<br/>(siembra ejecutivos del catálogo en 0)"]
    Build --> Heat["buildHeatmap() — sector × centro"]
    Build --> Inc["detectInconsistencies() — cap 200"]
    Fallback --> AR2[AnalysisResult]
    KPIs --> AR2
    Bloq --> AR2
    Top --> AR2
    Heat --> AR2
    Inc --> AR2
```

## 6. Derivados calculados en caliente (nunca persistidos)

Estos NO viven en `AnalysisResult` ni en ningún store — se recalculan cada vez que se necesitan, sobre datos ya cargados:

| Derivado | Función | Usado por |
|---|---|---|
| `BOItem[]` (deduplicación de pedidos) | `core/buildBO.ts` | Pedidos, Hoy, paneles `sugDetalle`/`pedido` |
| `RFIndex` (series mensuales) | `core/resumenFac.ts` | Análisis, ABC, scoring de Oportunidades |
| `RSSIndex` (pivote material×centro) | `core/resumenSin.ts` | Inventario |
| `AbcResult` (clasificación 80/20) | `core/abc.ts` | Consumo, Sugerencias, scoring |
| `PrecioDispersionEntry[]` | `core/precios.ts` | Consumo |
| `ScoreResult[]` (compatibilidad cliente↔material) | `core/scoring.ts` | Compatibilidad (Oportunidades) — **nunca se persiste el score**, solo la decisión final (Oportunidad/Oferta) |
| `OportunidadCandidata[]` | `core/oportunidad.ts` | Bandeja de Oportunidades (sugerencias antes de "Crear") |
