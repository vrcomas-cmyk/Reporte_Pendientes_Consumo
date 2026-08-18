# Módulo de Ofertas por Cliente + Mejoras a filtros, Inv Condición e Inventario

## Contexto del proyecto
Portal de reportes (React + Vite + TypeScript + Tailwind, datos vía DuckDB-WASM/Supabase/Google Sheets). Conventions del repo:
- Rutas/módulos: `/oportunidades` (Clientes, Oportunidades, Material360), `/inventario` (Inv Condición), `/resumen-sin` (Inventario), `/sugerencias`, `/consumo`, `/analisis`, `/solicitudes`.
- Tipos clave en `src/core/types.ts`: `CondicionEspecial = 'corta-caducidad' | 'lento-movimiento' | 'calidad' | 'danado' | 'normal'`, `ClienteConocimiento` (ya tiene `condicionesAceptadas: CondicionEspecial[]`), `Oferta`, `Oportunidad`.
- Existen repos de Oferta/Oportunidad/ClienteConocimiento con implementaciones `Supabase*Repository` y `Local*Repository` (interfaz + factory en `src/repositories/index.ts`). Reutilizar ese patrón.
- Componentes UI reutilizables: `ColumnVisibility`, `SavedViews` (`useSavedViews`), `ColumnFilterBar` + `ActiveFilter`, `InvGrid`, `EvolChart`, `TrendBadge`, `StatTile`, `Select`, `Dialog`, `Toaster`. Persistencia de estado con `usePersistedState`.
- Contexto de datos: `useAnalytics()` (`AnalyticsContext`) expone `rf`, `bo`, `rss`, `enrich`, `invCondicion`, `invConsolidadoCatalog`, `lotes`, `abc`, y por centro `co` (con `transito`, `pend`, `alm`), `matCondiciones(material)`, `serieMaterial(rf, material)`.
- Reglas del repo: NO agregar comentarios al código salvo que se pidan; correr build y lint antes de terminar; mantener consistencia con los componentes existentes.

## 1) NUEVO MÓDULO: «Ofertas por Cliente» (matching cliente ↔ material)

### 1.1 Pantalla principal
Nuevo módulo en el sidebar (junto a Oportunidades). Debe listar clientes con las columnas: **Solicitante, Destinatario, Razón Social, Grupo de cliente, Ejecutivo**. Solo se muestran clientes que ya existen en los demás reportes.

- La asignación de materiales aceptados es **por Destinatario** (un mismo cliente/Solicitante puede tener varias sucursales y cada una comportarse distinto). El registro/edición y el matching se hacen a nivel Destinatario.
- A cada Destinatario se le configuran **n condiciones** sobre los materiales. Una condición tiene forma: `material + reglas de aceptación`. Ejemplo real:
  - Código A → acepta con más de 3 meses de caducidad y en buen estado.
  - Código B → acepta aunque esté dañado, pero con más de X meses de caducidad.
- Las **condiciones son las fuentes de pedido** existentes: `corta-caducidad`, `lento-movimiento`, `calidad`, `danado`, `normal` (usar `CondicionEspecial`). Un mismo Destinatario puede aceptar **varias** condiciones a la vez.
- Reglas de aceptación por condición (modelo de datos a diseñar, persistir en Supabase con repos local+supabase como los existentes):
  - Estado del material (buen estado / dañado / no importa).
  - Caducidad mínima en meses (valor numérico o sin restricción).
  - Condición/fuente de pedido aceptada (corta-caducidad, PNC/calidad, lento movimiento, etc.).
  - Debe quedar claro si una regla aplica a "todas las condiciones" o solo a la condición específica marcada.

### 1.2 Carga masiva por ejecutivo
Como la mayoría de ejecutivos aceptan la misma X condición, permitir:
- Botón/acción «Traer clientes del ejecutivo N»: muestra todos los clientes (Destinatarios) de ese ejecutivo, permite colocar las condiciones que aceptan en lote y **descartar** los que no aplican (dejar sin configurar o excluir).
- No obligar a ir cliente por cliente.

### 1.3 Vista de oferta (matching visual)
Al ver un material/pedido (integrar con `Material360Page`/`MaterialHubPanel` o pantalla del módulo), detectar si el material cumple los requisitos de algún Destinatario y **mostrarlo visualmente** para ofrecerlo en ese momento:
- Indicador de "destinatarios que aceptan este material" con su condición y cumplimiento (ej. badge "Acepta · caducidad ≥ 3m · buen estado").
- Al dar clic/confirmar, generar la Oferta (reutilizar `OfertaForm`/`OfertaRepository` o la tabla de ofertas existente) sin salir del contexto.
- Priorizar/mostrar destinatarios cuyo perfil coincide con el estado real del lote/material revisado (usar `lotes` y `invCondicion` disponibles en `useAnalytics`).

### 1.4 Criterios de aceptación
- CRUD de Destinatario → reglas de material/condición, persistido (Supabase + fallback local).
- Matching automático material↔destinatario con las reglas configuradas.
- Carga por ejecutivo con descarte en lote.
- Flujo de oferta en un solo clic desde la vista de material/pedido.

## 2) Inv Condición (`/inventario`)
1. La tabla de materiales es muy pequeña: la lista debe tener **scroll vertical interno** dentro de la ventana principal para ver todas las filas (no romper el layout del resto de la página).
2. Configurar qué columnas se muestran y **guardarlo como vista** (reutilizar `ColumnVisibility` + `useSavedViews`/`SavedViews`; clave de persistencia nueva por módulo).

## 3) Inventario (`/resumen-sin`)
1. **Columnas visibles configurables + guardar vista** (mismo patrón que arriba).
2. **Tendencia contextual**: al dar clic en el inventario de un centro X, la sección «Tendencia del material» debe mostrar la tendencia de ese centro. Si el clic es sobre el material (no el centro), mostrar la tendencia general del material. Implementar filtrando la serie por centro (p. ej. consumos de ese centro en `rf`) vs. `serieMaterial(rf, material)` completo.
3. **Centro 1031**: no debe generar mensajes de «Inmovilizado», «Exceso» ni «Quiebre», porque desde ese centro casi no se factura; su función es distribuir a otros intercentros. Excluirlo de estos estados (o marcarlo siempre como distribución).
4. **Claridad de estados**: para el resto de intercentros, que cada estado sea explícito con tooltip/leyenda: qué significa «Quiebre», «Quiebre (en tránsito)», «Inmovilizado», «Exceso» (basarse en `COBERTURA_LABEL`/`quiebreMitigadoPorTransito` existentes) — mostrar definición corta al pasar el cursor y en la leyenda del filtro de cobertura.

## 4) Filtros generales (todos los reportes)
Rediseñar el sistema de filtros tipo columna para que funcione como Excel/Google Sheets:
1. En cada reporte, sobre una columna (p. ej. botón de filtro en el encabezado o menú) poder elegir esa columna y que se **desplieguen los valores posibles** de esa columna en los datos actuales.
2. El desplegable permite **escribir para buscar/sugerencias** dentro de los valores disponibles y **seleccionar uno o varios** (multi-select con checkbox, con "seleccionar todo").
3. Al hacer clic en otra parte de la ventana, el desplegable se **esconde** (sin perder los filtros ya aplicados).
4. Soportar **combinaciones**: varias columnas con varios valores a la vez (AND entre columnas, OR dentro de los valores de una columna), consistentes con los `ActiveFilter` existentes.
5. Aplicarlo a todos los reportes (Inv Condición, Inventario, Sugerencias, Consumo, Pedidos, etc.) con el mismo componente compartido para que el comportamiento sea idéntico en todos.

## 5) Definición de término
- "Fuentes de pedido / condiciones" = `corta-caducidad`, `lento-movimiento`, `calidad`, `danado`, `normal` (la lista real del negocio).
- "Solicitante/Destinatario/Razón Social/Grupo/Ejecutivo" = campos ya existentes en los reportes de clientes; tomarlos de ahí sin crear catálogos nuevos salvo que no existan.

## 6) Entregables
- Código del nuevo módulo con repos (Supabase + local), integración al sidebar y a Material360.
- Mejoras a Inv Condición, Inventario y sistema de filtros.
- Build y lint en verde.