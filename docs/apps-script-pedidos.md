# Apps Script — módulo "Seg. de pedidos"

El módulo `/seg-pedidos` es la **misma página de Pedidos** (columnas, filtros, paneles, selección y exportación)
alimentada por tres libros de Google Sheets leídos **crudos** (sin transformar) vía un `doGet` de solo lectura
(ver `src/services/pedidosService.ts`):

| Clave | Libro | Hojas que se sirven |
|---|---|---|
| `pedidos` | Seg pedidos (`1N8t02Wr…`) | la primera hoja |
| `disponibilidad` | Disponibilidad (`1VZ56C3O…`) | la primera hoja |
| `condicion` | Inv_Condicion (`14Urzz33…`) | Corta caducidad, Lento mov, Cosmopark, Sustituto, PNC, Caduco, Revision, Revision2 |

Son las mismas pestañas que lee el sugeridor de Python (`FUENTES_DISPONIBLES` + `HOJAS_ADICIONALES`);
`Codigos` no se sirve. Una hoja de la lista que no exista (p. ej. `Caduco`) simplemente se omite.

**Distinto** Apps Script del catálogo (`VITE_APPSCRIPT_URL`), y del incremento (`VITE_INCREMENTO_URL`). El reporte diario ya no se usa en la app.

## 1. Crear el script

> **Usa un proyecto de Apps Script SEPARADO** (o, si reutilizas el del prototipo de facturación, reemplaza su
> `backend.gs` —que ya incluye esta acción— en lugar de pegar este archivo aparte). Dos archivos en el mismo
> proyecto que declaran las mismas constantes (`DEFAULT_CHUNK_SIZE`, `LIBROS_RELACION`…) o `doGet` rompen el
> script: la URL `/exec` devuelve una página HTML de error y el navegador lo muestra como "bloqueado por CORS"
> aunque CORS no sea el problema. Para diagnosticar, abre `/exec?action=relacion` directo en el navegador: debe
> verse JSON, no una página de error.

1. Entra a <https://script.google.com> → **Nuevo proyecto**.
2. Pega el contenido de [`docs/apps-script-pedidos.gs`](./apps-script-pedidos.gs).
3. Revisa que los IDs de `LIBROS_RELACION` sean los de tus 3 libros.

## 2. Desplegar

1. **Implementar → Nueva implementación → Aplicación web**.
2. *Ejecutar como*: tú. *Quién tiene acceso*: el mismo criterio que los otros scripts de la app. La cuenta con la
   que se ejecuta debe poder abrir los 3 libros.
3. Copia la URL `/exec`.
4. **Cada vez que edites el código**: Implementar → Administrar implementaciones → editar → *Nueva versión*.

## 3. Configurar la app

- En **Admin · Conectores** (clave `pedidos_sheets_url`), o
- en `.env.local`: `VITE_PEDIDOS_URL=https://script.google.com/macros/s/…/exec` (respaldo si el conector está
  vacío o Supabase no responde).

La migración `supabase/migrations/0014_seg_pedidos.sql` registra el módulo y el conector en Supabase. **No se
ejecuta sola**; aplícala cuando se decida publicar. Mientras tanto un admin ve todos los módulos.

## 4. Contrato

```
GET ?action=relacion
→ { ok, generadoEn, relacion: [{ clave, nombre, ultimaModificacion, chunkSize,
                                  hojas: [{ nombre, totalRows }] }] }

GET ?action=hoja&libro=<clave>&hoja=<nombre>&offset=0&limit=5000
→ { ok, libro, hoja, columnas: string[], offset, limit, totalRows, nextOffset, rows: string[][] }
```

- Los valores van como **texto tal como se ven en Sheets** (`getDisplayValues`); las fechas `mes/día/año`
  (p. ej. `11/15/2029`) se interpretan en `src/core/pedidos.ts`.
- Se descartan solo las filas totalmente vacías. Las de continuación (Material vacío, otros datos) se
  conservan: **Revision/Revision2** heredan el Material de la fila de arriba (celdas combinadas) al indexar.
- Páginas de 5,000 filas, 3 peticiones en paralelo, 3 reintentos con backoff.

## 5. Qué hace la app con esto

- **Sincronizar** (botón): **borra** lo descargado y vuelve a traer **completos** los 3 libros. Cada libro
  reemplaza al anterior solo cuando llegó completo y con las columnas esperadas; si falla (script roto, libro
  equivocado), se conservan los datos anteriores de ese libro y se avisa.
- **Al abrir el módulo**: consulta `?action=relacion` y descarga solo los libros cuya `ultimaModificacion` en
  Drive cambió (como mucho cada 10 minutos). Los datos se guardan crudos en IndexedDB (`pedidosCache`) para
  pintar al instante.
- **Sin motor de cálculo tipo Python**: solo relaciones por material y las reglas que ya se manejan:
  - Disponibilidad → **Libre real = max(Libre Utilización − Entrega a cliente, 0)** por fila, con total y
    resumen por centro.
  - Corta caducidad → solo vigencia ≤ 12 meses calendario o almacén 1032, con motivo (VIGENCIA /
    ALMACEN_1032 / AMBOS), igual que `_filtrar_corta_caducidad`.
  - Cosmopark / PNC / Caduco → fecha dd/mm/aaaa y "Meses vigencia lote".
  - Revision / Revision2 → el Material de la fila de arriba se hereda.
  - Bloqueo del pedido → Crédito (`Sts. Créd.` = B) y/o Detenido (`Bloqueo Ent.`).
  - Inv 1030/1031/1032/1060 de cada pedido = Libre real del **centro del pedido**; Inv por centro =
    1030+1031+1060 de cada centro y tránsito por centro/material.
- Las filas de Seg pedidos se convierten a la forma de "Todas las Sugerencias" (`sugerenciasDesdeSegPedidos`,
  sin fuentes) y pasan por el mismo `buildBO`; por eso Consumo, Estado, Tendencia, Sector, Ejecutivo y los
  paneles de detalle funcionan igual. `SugerenciasPage` recibe `modo="seg"` (llaves de filtros/columnas
  propias: `segPedidos.*`).

### Inv con Condición (`/inv-con-condicion`)

El mismo módulo Inv Condición armado desde el libro Inv_Condicion: **una fila por material × condición**.

- **Corta caducidad**: la hoja "Corta caducidad" trae el detalle de TODOS los lotes de todos los centros y almacenes. Un lote
  es corta caducidad si `Libre utilización ≥ 1` **y** (almacén `1032` y/o vigencia ≤ 12 meses calendario; motivo
  VIGENCIA / ALMACEN_1032 / AMBOS). El inventario por centro es la suma de `Libre utilización` de esos lotes, esté en el
  almacén que esté. Los lotes con Libre 0 y `Bloqueado ≥ 1` se conservan (`lotesBloqueados`) para mostrarlos después
  como opción en el detalle de Inventario · Disponibilidad.
- **Revision**: UNA fila por material con sus N `Status` juntos; inventario por centro = Libre real (Libre − Entrega) de
  Disponibilidad en 1030+1031+1060. Un material con lotes de corta caducidad tiene además OTRA fila (Corta caducidad).
- **Sustituto**: relación 1:1 material → sustituto; el inventario es el del sustituto (1030+1031+1060).
- **PNC**: inventario = `Cantidad` de la hoja PNC por centro (con su `Condicion` en el texto).
- No se incluyen Cosmopark, Caduco ni Lento mov; la hoja Revision2 no se usa.

### Inventario · Disponibilidad (`/inv-disponibilidad`)

El mismo módulo Inventario (pivot Material x Centro) alimentado por los libros crudos, sin la hoja "Resumen Sin
  Sugerencias": inventario = **Libre Utilización − Entrega a cliente** (piso 0 por fila) de Disponibilidad, pendiente
de Seg pedidos (pendiente > 0) y consumo de `Fac_Mensual_CAM` (promedio de los 12 meses cerrados). Una fila por
material/centro/almacén; sus paneles de detalle leen esos mismos datos (`rssFuenteStore`).

## 6. Facturación desde los libros trimestrales (reemplaza Resumen_Fac y Fac_Mensual_CAM)

El mismo Apps Script también lee los libros trimestrales de la carpeta de Drive (`CARPETA_ID`: "1Q 2024",
"2Q 2024"… "4Q 2026") y la app los usa **en lugar de** las pestañas `Resumen_Fac` y `Fac_Mensual_CAM` del Sheet
del reporte diario (ya retirado). Solo aplica si hay URL del Apps Script configurada (`VITE_PEDIDOS_URL` / conector).

- Acciones: `?action=fac_manifest` (libros con su `ultimaModificacion`) y
  `?action=fac_chunk&fileId=<id>&offset=0&limit=20000&v=<ms de ultimaModificacion>` (filas agregadas por clave dentro del bloque; `v` evita consultas a Drive en cada bloque).
- **Verificado contra el reporte**: ambas pestañas son la SUMA por mes de las facturas de los libros. Cantidad e
  importe coinciden exactamente en 01/2024 (3,146,191 / $162,568,265), 03/2024 (3,611,610 / $172,838,068) y
  09/2026 (6,980,037 / $251,376,583), tanto en `Resumen_Fac` como en `Fac_Mensual_CAM`.
- **Fechas**: cada libro usa un formato (`dd/mm/aaaa` en 1Q 2024, `m/d/aaaa` en el resto). El script lo detecta
  mirando toda la columna; si las celdas son fechas reales no hay ambigüedad.
- `Resumen_Fac` se arma por mes + solicitante + destinatario + material + centro (+ grupos) y
  `Fac_Mensual_CAM` por mes + centro + almacén + material, con **los mismos encabezados** que el reporte
  (`core/facturacionLibros.ts`); por eso `buildAnalysisResult`, los mappers y todas las pantallas (Consumo, ABC,
  Estado, Tendencia…) funcionan sin cambios. Las combinaciones que quedan en **cero neto** se omiten (el reporte
  omite además unas pocas más; las sumas por mes no cambian).
- **Descarga incremental**: cada libro se guarda ya agregado en IndexedDB (`facturacionLibros`) y solo se vuelve
  a bajar si su `ultimaModificacion` cambió; los trimestres viejos no cambian, así que el sync diario solo trae el
  trimestre en curso. La primera vez baja todos (≈ 4 bloques de 20,000 filas por trimestre; la primera vez el manifiesto tarda más porque el script cuenta filas y detecta el formato de fecha de cada libro, luego queda guardado por versión).
- Si un libro falla y hay copia anterior se usa esa copia (se registra el aviso); sin copia anterior el sync de
  `Resumen_Fac` falla en vez de entregar totales incompletos.

## 7. Qué NO cambia (todavía)

- Las pestañas **Todas las Sugerencias** y **Resumen Sin Sugerencias** del reporte (`1OULG…`): Pedidos e
  Inventario siguen leyendo de ahí. La intención es que, más adelante, esas pantallas pasen a leer de los 3 libros
  de Seg. de pedidos.
- La tabla `sheetsCache` (esta es otra: `pedidosCache`; la facturación usa `facturacionLibros`).
- El módulo `/sugerencias` ("Pedidos").

## 7. Comodato (YBFD/ZBRE)

El libro `comodato` (export SAP de pedidos YBFD y ZBRE) se lee de su **primera pestaña**, sin depender de un gid ni de un nombre: así no se rompe si alguien
recrea la pestaña. Si en `LIBROS_RELACION.comodato` se agrega un `gid` y esa pestaña ya no existe, el script usa la primera en vez de devolver el libro
sin hojas. Si aun así el manifiesto lista el libro con `hojas: []`, la app lo avisa en Carga («no encontró ninguna pestaña para este libro») en lugar de
dejarlo en «Pendiente» sin explicación.
