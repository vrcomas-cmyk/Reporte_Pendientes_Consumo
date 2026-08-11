# ImprovementRoadmap.md — Plan de evolución

> Parte de la serie de documentación técnica. Síntesis de `TechnicalDebt.md` + `DependencyGraph.md` + `StateFlow.md` en un plan accionable, por horizonte. No implementar nada de aquí sin pasar antes por el proceso de producto de este proyecto (ver `CLAUDE.md`/convención de la sesión: entender el problema real, proponer, esperar aprobación).

## Cómo leer esto

Cada ítem indica **por qué** (el problema real, no la solución bonita), **impacto**, **esfuerzo**, y en qué documento de esta serie está la evidencia.

---

## Corto plazo (días — bugs y cabos sueltos, bajo riesgo)

| Ítem | Evidencia | Impacto | Esfuerzo |
|---|---|---|---|
| Ninguno pendiente conocido | `TechnicalDebt.md` §7 #1 ya se corrigió al escribir este documento | — | — |
| Diagnosticar el crecimiento del bundle principal (+400KB con Oportunidades) | `TechnicalDebt.md` §3 | Medio — tiempo de carga inicial | Bajo — auditar si `PanelHost.tsx` importa estático algo que debería ser lazy |
| Eliminar o documentar `useSearchIndex.ts` (código muerto confirmado) | `DependencyGraph.md` §4 | Bajo | Trivial |
| Unificar `ClienteConsumoTable` al mismo sistema de columnas que `SugTable`/`ConsumoTable` | `TechnicalDebt.md` §5.5 | Bajo — consistencia | Bajo, mismo patrón ya aplicado 2 veces esta sesión |
| `ResumenSinPage` sin `useMaterialPrefiltro` | `TechnicalDebt.md` §5.4 | Medio — rompe el HUB de Oportunidades hacia ese módulo | Bajo, mismo hook ya usado en 3 páginas |
| Unificar el destino de drill-down de celda de inventario (`material` vs. `celda`) entre `ResumenSinPage` e `InventarioPage` | `TechnicalDebt.md` §5.3 | Bajo — confunde, no rompe | Bajo |

## Mediano plazo (semanas — decisiones de producto + refactors moderados)

| Ítem | Evidencia | Impacto | Esfuerzo |
|---|---|---|---|
| Decidir el destino de "envío automático DRP" (¿reactivar `enviarSolicitudDRP()` o formalizar el flujo manual como el real?) | `TechnicalDebt.md` §5.1 | Alto — hoy hay código muerto haciendo like que existe un flujo que no corre | Bajo técnicamente, requiere decisión de negocio |
| Revisar la política RLS "todos escriben todo" de las 5 tablas de Oportunidades a medida que el equipo crece | `TechnicalDebt.md` §4 | Medio — gobernanza, no seguridad crítica hoy | Bajo (agregar `created_by`/política por fila si se decide restringir) |
| Partir `SugerenciasPage.tsx` (787 líneas) y `ConsumoPage.tsx` (560) en subcomponentes, siguiendo el patrón `columns.ts` ya usado | `TechnicalDebt.md` §1, `DependencyGraph.md` §5 | Medio — mantenibilidad | Alto — estado muy entrelazado (sort, filtros, columnas, exportación), alto riesgo de regresión sin buena cobertura de pruebas manuales |
| Explorar si Comodato puede dejar de depender del pipeline Python local (mover a Edge Function/Worker) | Sesiones previas, `Architecture.md` §5 | Alto si el usuario que lo arranca no está disponible | Alto — requiere reescribir el motor DuckDB/SQL fuera del navegador del usuario |
| Formalizar `AppSettings` como el lugar de toda preferencia de UI persistida (ya empezó con "Columnas visibles" esta sesión) en vez de `localStorage` disperso por hook | `StateFlow.md` §1, `Architecture.md` §6 | Bajo-medio — hoy funciona, pero mezcla "configuración del negocio" con "preferencia de UI" en el mismo tipo `AppSettings` de forma ad-hoc | Medio |

## Largo plazo (meses — escalabilidad real)

### ¿Cómo escala esto a 100 usuarios? → Bien, con matices
- **Supabase**: RLS abierta (`using(true)`) en las tablas de Oportunidades no tiene problema de rendimiento a 100 usuarios; sí es el momento de revisar gobernanza (§ mediano plazo).
- **Google Sheets como fuente operativa**: Apps Script tiene límites de ejecución (por eso ya existe paginación de 20k filas, ver `DataFlow.md` §3) — a 100 usuarios simultáneos consultando, el cuello de botella NO es el número de usuarios de la app sino cuántos disparan una sync a la vez. El guard de concurrencia (`inFlight`, un solo `syncReportSheets` compartido) ya mitiga esto — sync duplicada no es posible, todos los que llegan mientras una corre se "montan" en la misma promesa.
- **Worker**: un Web Worker por pestaña del navegador, no compartido entre usuarios — no es un cuello de botella de servidor, escala con el hardware de cada usuario individual.

### ¿Cómo escala a 1,000 usuarios? → Aquí sí hay que repensar
- **Apps Script como backend de datos operativos** deja de ser razonable — es una capa pensada para decenas de usuarios ocasionales, no cientos concurrentes. Migrar el reporte diario a una tabla Supabase con su propio pipeline de ingesta (reemplazando Apps Script) sería el cambio de mayor impacto.
- **`AnalyticsContext` sin selectores granulares** (`StateFlow.md` §2, `TechnicalDebt.md` §2.1) — con reportes más grandes (más materiales, más filas de Consumo), cada sync recalculando TODOS los índices derivados para TODOS los componentes montados se vuelve el techo real de rendimiento de la UI, independiente del número de usuarios (es un problema por-sesión-de-navegador, pero se agrava si el dataset crece junto con el número de usuarios).
- **`degasa_connectors` como key/value genérico** (URLs + pesos de scoring) empieza a mezclar demasiadas responsabilidades en una tabla sin tipar — considerar tablas dedicadas si crece a más configuraciones.

### ¿Qué módulos podrían separarse como "plugins"? (pregunta de arquitectura, no urgente)
El módulo **Oportunidades** ya está diseñado con ese nivel de aislamiento — 13/13 importadores de `conocimientoStore` viven dentro de `modules/oportunidades/` (excepto el único punto de acoplamiento intencional en `ClienteDetallePanel.tsx`, ver `DependencyGraph.md` §2). Si algún día se necesitara extraerlo a un paquete/microfrontend separado, sería el candidato natural — el resto de módulos de reporte comparten demasiado (`_shared.tsx`, `AnalyticsContext`, columnas) como para separarse sin duplicar mucho código primero.

### ¿Qué conviene reescribir? (honesto: poco)
Nada del código actual está mal escrito al punto de justificar una reescritura — la disciplina de tipos es alta (1 solo `any` en todo el repo), no hay dependencias circulares, no hay switches gigantes, y los patrones de repositorio/store están bien establecidos y se repiten consistentemente. Lo único que se acerca a "reescribir" es el par `SugerenciasPage.tsx`/`ConsumoPage.tsx` — y ahí la recomendación es **refactorizar in-place siguiendo el patrón que ya existe** (extracción de columnas, sub-componentes), no reescribir desde cero.

---

## Resumen de una línea por horizonte

- **Corto plazo:** cerrar cabos sueltos de esta sesión (bundle, `useSearchIndex`, prefiltro faltante) — todo de bajo riesgo.
- **Mediano plazo:** decisiones de producto pendientes (DRP automático, gobernanza de RLS) más un refactor de mantenibilidad de las 2 páginas más grandes.
- **Largo plazo:** el sistema aguanta 100 usuarios sin cambios estructurales; a 1,000 el cuello de botella real es Apps Script como fuente de datos operativos, no el frontend.
