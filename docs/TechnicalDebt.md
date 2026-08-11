# TechnicalDebt.md — Deuda técnica priorizada

> Parte de la serie de documentación técnica. **Nota de método:** la investigación de dependencias (`DependencyGraph.md`) se completó con grep real sobre todo el repo. La investigación de deuda técnica dedicada (renders, O(n²), RLS, `any`, a11y) **falló a mitad de camino por límite de gasto de la sesión** — lo marcado ✅ abajo lo verifiqué yo mismo con grep directo después; lo marcado 🔶 es razonado a partir del código ya leído en esta y sesiones previas, no confirmado exhaustivamente con herramienta — trátalo como hipótesis a validar, no como hecho cerrado.

## 1. Archivos que deberían partirse (✅ tamaño verificado)

| Archivo | Líneas | Por qué |
|---|---|---|
| `modules/sugerencias/SugerenciasPage.tsx` | 787 | Dos tablas completas (agrupado/desagrupado) con su propio `sortAcc`, columnas, exportación — cada una podría ser su propio componente. Candidato #1 del repo. |
| `modules/consumo/ConsumoPage.tsx` | 560 | KPIs + comparativos + dispersión de precios + tabla de grupos + tabla principal, todo en un componente. |
| `modules/admin/AdminPage.tsx` | 425 | 5 tabs (Usuarios/Roles/Overrides/Conectores/Compatibilidad), cada uno ya es una función interna — candidato natural a 5 archivos. |
| `modules/analisis/AnalisisPage.tsx` | 418 | Similar patrón a Consumo. |
| `modules/inventario/InventarioPage.tsx` | 408 | Tabla con columnas sticky calculadas a mano + modo admin + widget de lotes por vencer. |

**Contraste:** `modules/oportunidades/panels/MaterialHubPanel.tsx` (242 líneas, 8 tabs) es más grande en superficie funcional pero más chico en líneas — la extracción de `columns.ts` y la reutilización de `_shared.tsx` esta sesión ya evitó que creciera como los anteriores. Mismo patrón de extracción aplicaría a `SugerenciasPage`/`ConsumoPage`.

## 2. Render / re-render (🔶 razonado desde `StateFlow.md`, no medido con Profiler)

1. **`AnalyticsContext` no tiene selectores granulares** — el `value` completo se memoiza en `[result, catalog]`; cualquier módulo que llame `useAnalytics()` re-renderiza en cada sync, use o no `rf`/`rss`/`abc`. Con 11 importadores directos + los 13 paneles (indirecto vía `PanelHost`), una sync de Consumo (la hoja más pesada, ~80k filas) fuerza recalcular TODOS los índices derivados (`buildRF`, `buildBO`, `buildRSS`, `buildAbc`, `buildPrecioDispersion`) sin importar qué página esté abierta. **Esto es intencional y documentado** (comentario en `AnalyticsContext.tsx`) pero es el techo de rendimiento del sistema si el reporte crece.
2. **`OportunidadPanel.tsx:13`** (✅ verificado con grep) — `useConocimientoStore((s) => s.oportunidades.find(...))` inline sin `useMemo`. Mismo patrón que se corrigió en `NotasMaterial`/`ObservacionesList`/`Timeline`/`ClienteConocimientoPanel` esta sesión, **pero este archivo quedó fuera** de esa corrección. `.find()` es más barato que `.filter()` (no crea array), pero sigue devolviendo una referencia nueva si el store notifica por cualquier motivo no relacionado.
3. **Ningún otro `Store((s) => s.x.filter/map(` inline sin memo fuera de `modules/oportunidades/`** (✅ verificado con grep dirigido sobre dashboard/, analisis/, consumo/, sugerencias/, inventario/, resumenSin/, comodato/, solicitudes/, components/) — el resto del código no repite el patrón que causó el bug de "Maximum update depth exceeded" de la sesión anterior.
4. **`clientesByDest` se recalcula completo** (`byDest(clientes, ofertas)`) en cada `upsertCliente`/`addOferta`/`registrarResultado` — O(clientes × ofertas). Barato con decenas de fichas; a revisar si el CRM crece a cientos/miles.

## 3. Bundle (✅ medido — build de esta sesión)

Chunk principal `dist/assets/index-*.js`: **~1.47 MB / 458 KB gzip** — supera el umbral de advertencia de Vite (500KB). Chunks pesados identificados y ya lazy por ruta: `duckdb-eh.wasm` (35.9MB, solo Comodato), `xlsx` (421KB, Carga/exportaciones), `duckdbService` (192KB), `supabaseClient` (204KB — este SÍ está en el flujo crítico, no se puede diferir mucho), `repositories` (111KB). El crecimiento del chunk principal a lo largo de esta sesión (de ~1.05MB a ~1.47MB) coincide con la adición del módulo Oportunidades completo — sugiere que **parte de Oportunidades no está tan lazy-loaded como debería** (revisar si `PanelHost.tsx` importando estáticamente los paneles de `oportunidades/panels/` los saca del code-splitting por ruta).

## 4. Seguridad (✅ verificado)

- **RLS por tabla** (7 migraciones, `supabase/migrations/0002`–`0007`):
  - `degasa_roles`/`degasa_modules`/`degasa_permissions`/`degasa_connectors`: lectura abierta a cualquier `authenticated`, escritura solo `degasa_is_admin()`.
  - `degasa_allowed_users`: lectura abierta, insert/update/delete solo admin.
  - `degasa_oportunidades`/`degasa_interacciones`/`degasa_clientes_conocimiento`/`degasa_observaciones`/`degasa_ofertas`: **`for all ... using (true) with check (true)`** — cualquier usuario autenticado (invitado) puede leer Y escribir, sin aislamiento por usuario. Es una decisión deliberada ("conocimiento del equipo, no por usuario") documentada en los comentarios de las migraciones — pero vale la pena confirmar que sigue siendo la intención a medida que el equipo crece: hoy cualquier vendedor puede borrar/editar la ficha de cualquier otro.
- **Sin secretos hardcodeados** en `src/` (`grep -rniE "sk_live|service_role|BEGIN PRIVATE KEY"` → 0 resultados).
- **`supabaseClient.ts`** usa exclusivamente `VITE_SUPABASE_ANON_KEY` — confirmado, no hay `service_role` en el cliente.
- **`any` explícito**: exactamente **1 uso en todo el repo** (`PanelHost.tsx:24`, `Partial<Record<Panel['type'], FC<any>>>`) — deliberado y comentado (el dispatcher necesita `any` para que cada rama acepte su `Extract<Panel,...>` propio sin sobrecargar la firma). Nivel de disciplina de tipos notablemente alto para un repo de este tamaño.

## 5. Fricciones funcionales conocidas (de sesiones anteriores, siguen vigentes)

1. **Envío automático de DRP desactivado** (`DRP_AUTO_SEND = false` en `solicitudService.ts`) — el flujo real es exportar a Excel y pegar a mano en el Sheet.
2. **Comodato depende de un pipeline Python externo** que el usuario debe arrancar en su propia máquina — sin backend siempre-disponible.
3. **Inconsistencia de drill-down**: Inventario (`ResumenSinPage`) abre el panel `celda` (conserva centro) desde una celda; Inv Condición (`InventarioPage`) abre `material` (pierde el centro) desde la acción visualmente equivalente.
4. **`ResumenSinPage` sin `useMaterialPrefiltro`** — rompe el HUB de Oportunidades al navegar ahí con `?material=`.
5. **`ClienteConsumoTable`** (tercera variante de tabla de consumo, solo en `clienteDetalle`) quedó fuera de la unificación de columnas de esta sesión — sigue con 6 columnas fijas, sin relación con `useColumnVisibility`.
6. **`useSearchIndex.ts`** (✅ verificado, cero importadores) — código muerto, candidato a eliminar o documentar por qué se conserva.

## 6. Qué NO es deuda (verificado, para no perseguir fantasmas)

- **Cero dependencias circulares** `core/` ↔ `modules/`/`store/`.
- **Cero marcadores TODO/FIXME/XXX/@deprecated** en todo el repo.
- **Cero switches gigantes** — el más grande son las 9 factories `create*Repository` en `repositories/index.ts`, 2 ramas cada una, patrón repetido a propósito.
- **Sin duplicación real** de tablas de consumo, debounce, o uso de `localStorage` — los casos que parecían duplicados (verificados con grep dirigido) resultaron ser usos legítimos de propósito distinto.

## 7. Prioridad sugerida (impacto × esfuerzo)

| # | Ítem | Impacto | Esfuerzo | Por qué este orden |
|---|---|---|---|---|
| 1 | Memoizar `OportunidadPanel.tsx:13` | Bajo (bug ya no crítico, pero mismo patrón que causó uno) | Trivial | Cerrar el único cabo suelto del bug de renders de la sesión anterior |
| 2 | Confirmar por qué el bundle principal creció ~400KB con Oportunidades | Medio (tiempo de carga inicial) | Bajo (auditoría de imports) | Barato de diagnosticar, alto valor si hay un import no-lazy fácil de arreglar |
| 3 | Partir `SugerenciasPage.tsx`/`ConsumoPage.tsx` en subcomponentes | Medio (mantenibilidad) | Alto (787+560 líneas con estado entrelazado) | Alto riesgo de regresión — solo si se va a tocar esa página de todos modos |
| 4 | Selectores granulares en `AnalyticsContext` | Alto a escala (100+ usuarios con reportes grandes) | Alto (repensar el Context) | Ver `ImprovementRoadmap.md` — no urge hoy, urge si el reporte diario crece 3-5× |
| 5 | Revisar RLS "todos escriben todo" de Oportunidades | Medio (gobernanza de datos, no explota nada hoy) | Bajo (agregar `created_by`/política por fila si se decide) | Depende de una decisión de negocio, no técnica |
