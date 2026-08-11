# Apps Script — leer el reporte diario desde Google Sheets

El portal lee 4 pestañas ("Todas las Sugerencias", "Resumen Sin Sugerencias",
"Reporte de Consumo", "Resumen_Fac") del Sheet
`1OULGx8ZWdSR1w9JIPrccW3ci_-MZeQ5DckNjo2pSk_c` vía un `doGet` de Apps Script
(ver `src/services/reportSheetsService.ts`). Es de **solo lectura** — distinto
del script del catálogo (`VITE_APPSCRIPT_URL`, otro spreadsheet) y del `doPost`
de DRP (`docs/apps-script-drp.md`).

## 1. Crear el script

1. Abre el Sheet `1OULGx8ZWdSR1w9JIPrccW3ci_-MZeQ5DckNjo2pSk_c`.
2. Extensiones → Apps Script.
3. Pega esto:

```javascript
const SHEET_ID = '1OULGx8ZWdSR1w9JIPrccW3ci_-MZeQ5DckNjo2pSk_c';

function doGet(e) {
  try {
    if (e.parameter.meta) return respond(getMeta());
    if (e.parameter.tab) {
      const offset = e.parameter.offset ? Math.max(0, parseInt(e.parameter.offset, 10) || 0) : 0;
      const limit = e.parameter.limit ? Math.max(1, parseInt(e.parameter.limit, 10) || 0) : 0;
      return respond(getTabRows(e.parameter.tab, offset, limit));
    }
    return respond({ error: 'Falta el parámetro ?tab= o ?meta=1' });
  } catch (err) {
    return respond({ error: String(err) });
  }
}

/** Fecha de última modificación de TODO el spreadsheet (no por pestaña) —
 * barata de consultar, no requiere leer ninguna fila. El portal la usa para
 * decidir si vale la pena traer las 4 pestañas completas. */
function getMeta() {
  const file = DriveApp.getFileById(SHEET_ID);
  return { modifiedTime: file.getLastUpdated().toISOString() };
}

/** Devuelve una pestaña como `{ headers, rows, rowCount }` — encabezados una
 * sola vez y cada fila como array plano (NO como objeto por fila). Para una
 * hoja grande como "Reporte de Consumo" (~80k filas), repetir los encabezados
 * en cada fila infla el JSON varias veces su tamaño real y hace más lento
 * tanto el `JSON.stringify` aquí como la transferencia y el `JSON.parse` del
 * lado del portal. El portal reconstruye los objetos `{header: valor}` del
 * lado del cliente (dentro del Web Worker), que es barato comparado con
 * generar/transmitir ese JSON inflado.
 *
 * Soporta paginación opcional con `?offset=` y `?limit=` (basados en filas de
 * datos, sin contar el encabezado) — el portal las usa solo para trocear una
 * pestaña grande en páginas de `TAB_PAGE_SIZE` dentro de UNA sync completa
 * (ver §6), NO para saltarse filas ya sincronizadas: ese modo delta se probó
 * y se abandonó por incorrecto (ver §5). Sin parámetros, devuelve todas las
 * filas (comportamiento original). */
function getTabRows(tabName, offset, limit) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
  if (!sheet) return { error: `No existe la pestaña "${tabName}"` };
  const lastRow = sheet.getLastRow();
  const totalDataRows = Math.max(0, lastRow - 1); // sin contar encabezado
  if (totalDataRows === 0) return { headers: [], rows: [], rowCount: 0 };

  // Encabezado siempre se devuelve (una fila, barato).
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (offset > 0 && offset < totalDataRows) {
    // Modo delta: leer solo desde offset+2 hasta el final (offset+1 fila de
    // datos corresponde a la fila sheet offset+2, ya que la 1 es headers).
    const startDataRow = offset + 2;
    const remaining = totalDataRows - offset;
    const numRows = limit > 0 ? Math.min(limit, remaining) : remaining;
    const rows = sheet.getRange(startDataRow, 1, numRows, headers.length).getValues();
    return { headers, rows, rowCount: totalDataRows };
  }
  if (offset >= totalDataRows) {
    // No hay filas nuevas desde offset (elrowCount no creció desde la última
    // sync). Devolver vacío en vez de error para que el portal simplemente no
    // agrege nada.
    return { headers, rows: [], rowCount: totalDataRows };
  }

  // offset === 0 (sin paginación): leer todo. Se respeta limit si vino.
  const numRows = limit > 0 ? Math.min(limit, totalDataRows) : totalDataRows;
  const rows = sheet.getRange(2, 1, numRows, headers.length).getValues();
  return { headers, rows, rowCount: totalDataRows };
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 2. Desplegar

1. Implementar → Nueva implementación → tipo **Aplicación web**.
2. Ejecutar como: **Yo** (tu cuenta, la que tiene acceso al Sheet).
3. Quién tiene acceso: **Cualquier usuario** (es de solo lectura; no expone
   nada que el portal no muestre ya).
4. La primera vez pedirá autorizar el scope de Drive (lo usa `getMeta()`) —
   acéptalo.
5. Copia la URL `.../exec`.

**Si ya tenías una implementación** (por ejemplo, cambiaste `getTabRows` al
formato `{headers, rows}`): editar el código NO actualiza la URL en vivo —
tienes que ir a **Implementar → Gestionar implementaciones → lápiz (editar) →
Versión: Nueva versión → Implementar**. La URL `/exec` no cambia, así que no
hace falta tocar `VITE_REPORT_SHEETS_URL` de nuevo.

**Rendimiento:** confirma que el proyecto usa el runtime **V8** (Configuración
del proyecto → "Habilitar runtime de Chrome V8" — viene activado por defecto
en proyectos nuevos). En proyectos viejos migrados de Rhino puede seguir
desactivado y la ejecución es notablemente más lenta.

## 3. Configurar el portal

En `.env.local` (o `.env`):

```
VITE_REPORT_SHEETS_URL=<la URL /exec del paso anterior>
```

## 4. Probar

En Carga → card "Reporte diario · Google Sheets" → botón "Sincronizar ahora"
con las 4 pestañas marcadas. Debe llenar Sugerencias/Resumen Sin Sug./Consumo/
Análisis igual que subiendo el `.xlsx` a mano. Edita una celda en el Sheet,
cambia de pestaña del navegador y vuelve — debe re-sincronizar sola y mostrar
un aviso.

Si no despliegas este script, la carga manual de `.xlsx` sigue funcionando
exactamente igual — esta sync es un camino adicional, no un reemplazo.

## 5. Por qué las 4 pestañas siempre se traen completas (historia del delta)

Versiones anteriores de este sync usaban un esquema delta: el portal
guardaba el número de filas ya sincronizadas por pestaña
(IndexedDB `sheetsCache`) y en cada sync pedía solo `offset=<lastRowCount>`
en adelante, concatenando las filas nuevas al final — rápido para una hoja
de ~80k filas, pero **incorrecto**, y quedó abandonado. Se documenta aquí
para que nadie lo reintroduzca sin volver a medir.

**El bug:** el esquema asumía append-only — que la hoja solo crece por
abajo. Falso para estas pestañas: "Todas las Sugerencias" y
"Resumen Sin Sugerencias" son salida de fórmulas vivas (QUERY/FILTER) donde
un registro puede desaparecer (ya se cubrió, ya no aplica) mientras el
`rowCount` total se mantiene igual o crece porque entran registros nuevos
al mismo tiempo. El delta solo reaccionaba si el `rowCount` **bajaba** —
un total igual o mayor con contenido distinto por dentro pasaba
inadvertido y el registro viejo quedaba viviendo en el caché para siempre.
Ese era el síntoma reportado: "sincronizo pero sigo viendo datos de
reportes anteriores".

Medido contra tres snapshots reales del reporte (28-jul → 03-ago 2026):
"Resumen Sin Sugerencias" pasó de 6,473 a 6,488 filas (creció 15) pero por
dentro se fueron 130 registros, entraron 145 y solo 860 de 6,488 filas
quedaron idénticas — el `rowCount` no delató nada.

**El primer intento de fix** trató "Todas las Sugerencias",
"Resumen Sin Sugerencias" y "Resumen_Fac" como siempre-completas (son
pestañas chicas, no vale la pena arriesgar datos obsoletos por banda) y
dejó "Reporte de Consumo" en modo delta con una ventana de las últimas
15,000 filas re-pedidas y reemplazadas en cada sync, bajo la suposición de
que los cambios de facturación caen en las filas recientes.

**Esa suposición era falsa.** Comparando el mismo par de snapshots
(83,248 → 83,847 filas de Consumo), de 16,825 cambios significativos por
fila (excluyendo la columna `Meses ult fac - Fecha act`, que cambia sola
cada día por ser un delta contra la fecha actual — ruido puro, no dato de
negocio) **solo el 21.7% caía en las últimas 15,000 filas**, y el decil
con más cambios era el **primero** de la hoja (38.9%), no el último.
Cualquier ventana parcial —de cola o de cualquier otro tipo, sin una firma
por fila del lado del Apps Script— deja la mayoría de los cambios sin
detectar.

**Estado actual:** las 4 pestañas se piden completas (`offset=0`) en cada
sync — no hay caché delta activo. El parámetro `forceFull` de
`syncReportSheets` ya no cambia qué se pide (todo se pide igual); solo
sigue limpiando `sheetsCache`, que hoy únicamente sirve para rellenar
pestañas que el usuario **no** seleccionó en una sync parcial (checklist de
roles en Carga) con la última copia completa conocida.

**After Apple V8:** el `?offset=`/`?limit=` en Apps Script usa
`getRange(startRow, 1, numRows, cols)` en vez de `getDataRange().getValues()`
— sigue siendo relevante para la paginación en páginas de 20,000 filas
(§6), aunque ya no para saltarse filas ya sincronizadas.

## 6. Paginación por chunks (`?limit=`)

El `getTabRows` de arriba ya acepta `?limit=` desde el paso 1 (junto con
`?offset=`), pero el portal antes nunca lo mandaba: pedía "todo desde offset
hasta el final" en una sola llamada. Para una sync en frío de "Reporte de
Consumo" (~80k filas, sin caché todavía) eso es un solo `getValues()` +
`JSON.stringify()` gigante dentro de UNA ejecución de Apps Script — lento, y
con riesgo real de toparse con el límite de tiempo de ejecución de Apps
Script (el síntoma de "se tarda mucho y no carga").

Ahora `reportSheetsService.ts` pide cada pestaña en páginas de 20,000 filas
(`TAB_PAGE_SIZE`), acumulando hasta llegar al `rowCount` reportado. **No
requiere volver a desplegar el script** — como ya soporta `limit`, el cliente
simplemente empezó a usarlo. Si por alguna razón el script desplegado es una
versión vieja que ignora `limit` (antes de este doc), el loop del cliente
sigue funcionando igual: recibe todo en la primera "página" y se detiene ahí,
solo sin el beneficio de repartir la carga en ejecuciones más chicas.

## 7. Prioridad de carga entre pestañas

Pedido del usuario (2026-08-07): al sincronizar, lo más urgente para el
trabajo diario debe aparecer primero, y "Resumen_Fac" —la pestaña más
pesada— siempre debe quedar al final:

1. **Pedidos** — `sugerencias` ("Todas las Sugerencias")
2. **Inventario** — `resumenSinSugerencias` ("Resumen Sin Sugerencias")
3. **Consumo** — `reporteConsumo` ("Reporte de Consumo")
4. **Resumen_Fac** — `resumenFac`, siempre al final, sin importar qué tan
   rápido termine (es la única con volumen suficiente para justificarlo —
   ver §5/§6).

Implementado en `ROLE_PRIORITY` (`reportSheetsService.ts`), que reordena
`roles` antes de descargar. La descarga sigue siendo en paralelo (no
secuencial estricto, para no perder el tiempo total de sync) pero en **dos
olas**: todo lo que no sea `resumenFac` se pide junto primero (cada pestaña
se pinta apenas llega, vía `onPartialResult`), y `resumenFac` arranca recién
cuando esa ola termina.

**Nota sobre "Inv Condicion" (InvConsolidado/InvDetalle):** esas dos NO
pasan por esta tubería de 4 pestañas — son del catálogo (`VITE_APPSCRIPT_URL`,
otro spreadsheet, otra sincronización). Si se agrega ahí una prioridad
equivalente, documentarlo aparte junto al script del catálogo.

**Regla a futuro:** cualquier pestaña nueva que entre a `REPORT_TABS` (si
llega otro reporte tan pesado como Resumen_Fac, o más liviano) debe agregarse
a `ROLE_PRIORITY` **antes** de `resumenFac` — Resumen_Fac (o su equivalente
más pesado) se queda al final por definición.
