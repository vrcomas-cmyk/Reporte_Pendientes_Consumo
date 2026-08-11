# DomainModel.md — Entidades de negocio

> Parte de la serie de documentación técnica. Ver `Architecture.md` para el mapa general.

Cada entidad indica: **forma** (tipo TypeScript y archivo), **quién la genera**, **quién la modifica**, **quién la consume**.

---

## Material

No es una entidad con tabla propia — es la **clave de unión** (`material`/`materialBase`, código SAP) entre casi todo. Su descripción/precio/sector vienen del catálogo (`Material` en `core/types.ts`), enriquecidos vía `EnrichIndex` (`core/enrich.ts`).

```
Material (catálogo)
 ├─ Inventario (InvConsolidadoRow, InvDetalleRow)     — a.invCondicion, a.lotes
 ├─ Pedidos (Sugerencia → BOItem)                     — a.bo
 ├─ Consumo (ConsumoRow)                               — a.result.consumo
 ├─ Precio (EnrichIndex.matPrecioOferta + por condición)
 ├─ Ventas históricas (ResumenFacRow → RFIndex.mat)    — a.rf
 ├─ Oportunidad (fase Oportunidades)                   — conocimientoStore.oportunidades
 ├─ Compatibilidad con clientes (ScoreResult[])         — core/scoring.ts (calculado, no persistido)
 ├─ Observaciones (Observacion, material opcional)      — conocimientoStore.observaciones
 └─ Materiales relacionados (co-compra)                 — core/oportunidad.ts:materialesRelacionados (calculado)
```

- **Genera:** `catalogService.ts` (sync del catálogo) + cada hoja del reporte diario trae su propia referencia al material.
- **Modifica:** nadie — es de solo lectura desde la app; el ERP/SAP es la fuente de verdad real.
- **Consume:** prácticamente todos los módulos.

## Pedido / BO (Backorder)

```ts
// core/types.ts
Sugerencia { pedido, oc, materialBase, materialSugerido, destinatario,
             cantidadPendiente, precio, fuente, lote, fechaCaducidad, ... }

// core/buildBO.ts — derivado, NO persistido
BOItem { bo: Sugerencia /* fila origen, sin Fuente */,
         fuentes: Sugerencia[] /* filas alternas, con Fuente */,
         k, serie, consumoProm, status, tend, cons }
```

- **Genera:** hoja "Todas las Sugerencias" del reporte diario → `buildBO()` agrupa por `Pedido|MaterialBase|Centro|Almacén|Destinatario`.
- **Modifica:** nadie en la app — es un derivado puro, se recalcula en cada análisis.
- **Consume:** `SugerenciasPage`, `HoyPage`, `AnalisisPage`, `SugTable` (paneles), motor de scoring de Oportunidades (`pedido-abierto`).
- **Relación con Solicitud:** un `BOItem`/`Sugerencia` puede originar una `SolicitudDRP` vía `buildFromSugerencia()`.

## Cliente

No hay tabla `Cliente` en el catálogo — el eje de negocio es **solicitante** (código de cliente comercial) y **destinatario** (punto de entrega/envío), ambos strings normalizados. `ClienteConocimiento` (Oportunidades) es la primera entidad que trata al cliente como algo con estado propio.

```
Cliente (solicitante / destinatario)
 ├─ Consumo (ConsumoRow[] por destinatario)
 ├─ Pedidos (BOItem[] por destinatario)
 ├─ Facturación histórica (RFIndex.solic / RFIndex.dest)
 ├─ Clasificación ABC (AbcResult.classByCliente, por solicitante)
 ├─ CRM (ClienteConocimiento)               — módulo Oportunidades
 ├─ Ofertas (Oferta[])                       — módulo Oportunidades
 ├─ Observaciones (Observacion[])            — módulo Oportunidades
 ├─ Timeline (Interaccion[])                 — módulo Oportunidades
 └─ Panel `clienteDetalle` / `clienteConocimiento`
```

```ts
// core/types.ts — módulo Oportunidades, fase 2-3
ClienteConocimiento { dest, razonSocial, condicionesAceptadas[], caducidadMinimaDias,
                       descuentoHabitualPct, contactoNombre/Telefono/Correo, canalPreferido,
                       notasComerciales, tiempoRespuestaPromDias?, tasaAceptacion?,
                       actualizadoEn, actualizadoPor }
Observacion { dest, material?, texto, creadoEn, creadoPor }
Oferta { oportunidadId?, dest, razonSocial, material, lote?, condicion, fechaCaducidad,
         cantidadOfertada, cantidadAceptada?, precioOfertado, precioLista?,
         fechaOferta, fechaRespuesta?, resultado, motivoRechazo?, comentario, creadoPor }
Interaccion { dest, oportunidadId?, material?, tipo, resumen, fecha, creadoPor }
```

- **Genera:** `ClienteConocimiento`/`Observacion` — el usuario, desde la Ficha del panel `clienteConocimiento`. `Oferta` — el usuario, desde "Ofertar". `Interaccion` — **automático**, cada mutación de Oportunidad/Oferta empuja una (no depende de que el usuario la escriba).
- **Modifica:** `useConocimientoStore.upsertCliente/addObservacion/addOferta/registrarResultado`.
- **Consume:** `core/scoring.ts` (criterios `acepta-caducidad`, `acepta-condicion`, `descuento-viable`, `acepto-condicionado`, `rechazo-reciente`), `ClienteFicha`, `Timeline`, `OfertaForm`.
- **Persistencia:** Supabase (`degasa_clientes_conocimiento`, `degasa_observaciones`, `degasa_ofertas`, `degasa_interacciones`) con espejo Dexie.

## Oportunidad

```ts
// core/types.ts — módulo Oportunidades, fase 1
Oportunidad { material, descripcion, lote?, centro?, condicion, cantidadDisponible /*snapshot*/,
              fechaCaducidad, precioOferta, estado, responsable, prioridad,
              creadaEn, actualizadaEn, cerradaEn?, cantidadColocada, notas }
// estado: nueva → en-analisis → contactando → negociacion →
//         colocada-parcial | colocada-total | sin-interesados | campana-agresiva
```

```
Oportunidad
 ├─ Material (1:1 — más lote/condición específicos)
 ├─ Clientes sugeridos (ScoreResult[], calculado en caliente, no persistido)
 ├─ Ofertas (Oferta[], vía oportunidadId)
 ├─ Interacciones/Timeline (Interaccion[], vía oportunidadId)
 └─ Panel `oportunidad`
```

- **Genera:** `buildOportunidadesCandidatas()` (core/oportunidad.ts) sugiere candidatas cruzando `a.lotes` × `a.invCondicion`; el usuario confirma "Crear" → `conocimientoStore.addOportunidad`.
- **Modifica:** `setEstado()` (drag&drop o select) — marca `cerradaEn` al llegar a estado terminal.
- **Consume:** `OportunidadTray`/`OportunidadListView` (bandeja), `MaterialHubPanel`, KPI "Colocación 90d".
- **Persistencia:** Supabase (`degasa_oportunidades`) + Dexie.

## Solicitud DRP

```ts
// core/types.ts
SolicitudDRP { fechaSolicitud, centroOrigen, almacenOrigen, centroDestino, almacenDestino,
               codigo, descripcion, cantidad, um, lote, fechaCaducidad, comentarios, pedidos,
               origen /* sugerencias|inventario|resumenSin|consumo */, sourceKey, sync, sentAt?, error? }
```

- **Genera:** cualquiera de las 4 páginas de reporte, vía sus `buildFromX()` en `solicitudService.ts`, abriendo `SolicitarDialog`.
- **Modifica:** `useSolicitudStore.add/update/remove`. **Envío automático desactivado** (`DRP_AUTO_SEND=false`) — hoy queda en `sync:'pendiente'` hasta exportar/pegar manual.
- **Consume:** `SolicitudesPage`, badge "ya solicitada" en las 4 páginas de origen (`sourceKeys` para O(1) lookup).
- **Persistencia:** 100% Dexie local, **sin** backend Supabase — a diferencia de todo lo demás en Oportunidades.

## AnalysisResult (el "documento" central)

```ts
// core/types.ts
AnalysisResult { fileName, processedAt, durationMs, rowCount, sheetsDetected,
                 sugerencias[], resumenSinSugerencias[], consumo[], resumenFac[],
                 inventarioCondicion[], lotesCortaCaducidad[], kpis,
                 topMateriales[], topEjecutivos[], monthlyInvoicing[], heatmap[], inconsistencies[] }
```

- **Genera:** `buildAnalysisResult()` (worker), a partir del cruce catálogo + reporte diario.
- **Modifica:** nunca in-place — cada sync produce un objeto nuevo (`pick()` decide qué hereda de `previous`).
- **Consume:** `useDataStore.activeAnalysis` → `AnalyticsContext` deriva TODO lo demás (`RFIndex`, `BOItem[]`, `RSSIndex`, `AbcResult`, `PrecioDispersionEntry[]`) — ningún componente lee `AnalysisResult` directo, siempre vía `useAnalytics()`.
- **Persistencia:** Dexie (`analyses`, Parquet-encoded) + Supabase `degasa_history`/`degasa_logs` (metadata, no el dataset completo).

## CatalogSnapshot

```ts
CatalogSnapshot { fileName, loadedAt, ejecutivos[], materiales[], invConsolidado[], invDetalle[] }
```

- **Genera:** `catalogService.ts` desde Apps Script (4 hojas fijas).
- **Consume:** `EnrichIndex` (joins O(1) material→sector/precio/UM, ejecutivo→nombre).

## Relaciones cruzadas (resumen)

```
Material ─┬─ Inventario ─── Pedido ─── Solicitud DRP
          ├─ Consumo ────── Cliente ── ClienteConocimiento ── Oferta ── Interaccion
          ├─ Oportunidad ───┘
          └─ Score(Material, Cliente) — calculado, nunca persistido
```
