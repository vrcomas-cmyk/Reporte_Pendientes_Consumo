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
 * datos, sin contar el encabezado). El portal usa `offset` para pedir solo las
 * filas nuevas desde la última sync (append-only) y `rowCount` para detectar
 * si el número total creció, disminuyó (reemplazo → forzar sync completa) o
 * se mantuvo (posible edición → el usuario puede forzar sync completa
 * manualmente). Sin parámetros, devuelve todas las filas (comportamiento
 * original). */
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

## 5. Sync incremental (delta)

A partir de la versión paginada del script anterior, el portal guarda el
número de filas ya sincronizadas por pestaña en `localStorage`
(`report-sheets-tab-meta`). En cada sync:

- Si el rowCount actual del Sheet es **mayor** que el guardado: pide solo
  desde `offset=<lastRowCount>` y concatena las filas nuevas al final del
  análisis existente (modo append-only, mucho más rápido para 80k filas).
- Si es **menor** (se borraron filas / se reemplazó la pestaña): forzar
  sync completa de esa pestaña.
- Si es **igual**: no pedir las filas de esa pestaña (no cambió) — la
  memoización de derivados de `buildAnalysisResult` evita recomputar.

**Limitación:** este esquema asume append-only. Si el usuario **edita**
una celda de una fila ya existente (sin agregar nuevas filas → rowCount
igual), el cambio NO se detecta automáticamente. Para esos casos existe el
botón **"Sincronización completa"** (forceFull) en la card de Carga, que
ignora `lastRowCount` y vuelve a pedir las 4 pestañas enteras. Recomendado
correrlo de vez en cuando o si se detectan datos sospechosos.

**After Apple V8:** el `?offset=` en Apps Script usa `getRange(startRow, 1,
numRows, cols)` en vez de `getDataRange().getValues()` — la lectura de
rango parcial es proporcional a las filas pedidas, no a las totales de la
hoja, así que pedir 100 filas nuevas cuesta ~100/80000 de lo que costaría
pedirlas todas.

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
