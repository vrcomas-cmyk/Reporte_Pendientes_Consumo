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

## 8. Snapshot nocturno para "Reporte de Consumo" y "Resumen_Fac"

Pedido del usuario (2026-08-14): "Todas las Sugerencias" y "Resumen Sin
Sugerencias" deben verse **al instante** (siguen por la vía de este doc, en
vivo). "Reporte de Consumo" y "Resumen_Fac" toleran sincronizarse **una vez
al día por la noche** — son las dos pestañas pesadas (~80k y ~488k filas) y
la razón de los ~98 requests en serie que documenta §5-§7.

En vez de que el navegador de cada usuario baje esas 488k filas por Apps
Script cada vez que abre el portal, un **disparador de tiempo de Apps
Script** (corre en la nube de Google, sin depender de que ningún equipo esté
encendido) exporta ambas pestañas a CSV comprimido y las sube a Cloudflare
R2 cada madrugada. El portal (`src/services/reportSnapshotService.ts`) baja
primero un manifiesto de ~1 KB (`snapshots/manifest.json`); si hay una
versión fresca (menos de `SNAPSHOT_MAX_AGE_MS` = 30 h,
`reportSheetsService.ts`), descarga el `.csv.gz` (unos pocos MB) en vez de
hacer las ~98 páginas en vivo. Si no hay snapshot, está viejo, o falla la
descarga, cae automáticamente a la vía en vivo de este documento — **nunca
se pierde funcionalidad**, solo se pierde la ganancia de velocidad ese día.
Un botón "Actualizar Consumo/Resumen_Fac en vivo" en Carga fuerza la vía en
vivo aunque el snapshot esté fresco (`SyncReportSheetsParams.liveOverride`).

### 8.1 Variables de entorno / secrets nuevos

En el proyecto de **Supabase** (Edge Function `r2-presign`), agrega un
secret:

```
supabase secrets set SNAPSHOT_UPLOAD_SECRET=<genera-un-valor-largo-al-azar>
```

Ese mismo valor va también en el Apps Script (`SNAPSHOT_SECRET` en el paso
8.2) y en ningún otro lado — es lo que le permite a Apps Script subir
archivos a R2 sin tener una sesión de usuario de Supabase. `R2_ENDPOINT` /
`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` ya existían para
`r2Service.ts`; el snapshot los reutiliza, solo bajo el prefijo `snapshots/`.

### 8.2 Apps Script — función de exportación + disparador

En el **mismo proyecto de Apps Script** del paso 1 (mismo Sheet, mismo
`SHEET_ID`), agrega esto al final del script:

```javascript
// --- Snapshot nocturno: Reporte de Consumo + Resumen_Fac -> R2 (CSV.gz) ---
const SNAPSHOT_FN_URL = 'https://<tu-proyecto>.supabase.co/functions/v1/r2-presign';
const SNAPSHOT_SECRET = '<el-mismo-valor-de-SNAPSHOT_UPLOAD_SECRET>';
const SNAPSHOT_TABS = ['Reporte de Consumo', 'Resumen_Fac'];
// Filas por parte ANTES de comprimir. Resumen_Fac (~488k filas) sale en ~5
// partes de 100k — evita acercarse al límite de memoria/tiempo de ejecución
// de una sola llamada de Apps Script (mismo problema que motivó la
// paginación de §6, aplicado aquí a la exportación en vez de a la lectura).
const SNAPSHOT_CHUNK_ROWS = 100000;

function exportSnapshot() {
  const version = Utilities.formatDate(new Date(), 'America/Mexico_City', "yyyyMMdd'T'HHmmss");
  const manifestTabs = [];
  SNAPSHOT_TABS.forEach(function (tabName) {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const totalDataRows = Math.max(0, lastRow - 1);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const safeTab = tabName.replace(/[^\w.-]+/g, '_');
    const parts = [];
    if (totalDataRows > 0) {
      for (let start = 0; start < totalDataRows; start += SNAPSHOT_CHUNK_ROWS) {
        const numRows = Math.min(SNAPSHOT_CHUNK_ROWS, totalDataRows - start);
        const values = sheet.getRange(start + 2, 1, numRows, lastCol).getValues();
        const csv = toCsv(headers, values);
        const key = 'snapshots/' + safeTab + '/' + version + '/part-' + String(parts.length).padStart(3, '0') + '.csv.gz';
        uploadSnapshotPart(key, csv, true);
        parts.push(key);
      }
    }
    manifestTabs.push({ tab: tabName, version: version, rowCount: totalDataRows, generatedAt: new Date().toISOString(), parts: parts });
  });
  uploadSnapshotPart('snapshots/manifest.json', JSON.stringify({ tabs: manifestTabs }), false);
}

function toCsv(headers, values) {
  function esc(v) {
    if (v instanceof Date) v = v.toISOString();
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const lines = [headers.map(esc).join(',')];
  values.forEach(function (row) { lines.push(row.map(esc).join(',')); });
  return lines.join('\n');
}

function uploadSnapshotPart(key, text, gzip) {
  const blob = Utilities.newBlob(text, gzip ? 'text/csv' : 'application/json');
  const payload = gzip ? Utilities.gzip(blob) : blob;
  const contentType = gzip ? 'application/gzip' : 'application/json';
  const presignRes = UrlFetchApp.fetch(SNAPSHOT_FN_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-snapshot-secret': SNAPSHOT_SECRET },
    payload: JSON.stringify({ mode: 'snapshot-upload', key: key, contentType: contentType }),
    muteHttpExceptions: true,
  });
  const presign = JSON.parse(presignRes.getContentText());
  if (!presign.url) throw new Error('No se pudo presignar ' + key + ': ' + presignRes.getContentText());
  const putRes = UrlFetchApp.fetch(presign.url, {
    method: 'put',
    contentType: contentType,
    payload: payload.getBytes(),
    muteHttpExceptions: true,
  });
  if (putRes.getResponseCode() >= 300) throw new Error('Falló la subida de ' + key + ': ' + putRes.getResponseCode());
}
```

Reemplaza `SNAPSHOT_FN_URL` con la URL real de tu Edge Function (Supabase →
Project Settings → Edge Functions, o simplemente
`https://<project-ref>.supabase.co/functions/v1/r2-presign`) y `SNAPSHOT_SECRET`
con el mismo valor de `SNAPSHOT_UPLOAD_SECRET` del paso 8.1. **No requiere
volver a desplegar el Web App** (`doGet`) — esta función corre por
disparador, no por HTTP.

**Prueba manual antes de programar el disparador:** en el editor de Apps
Script, selecciona `exportSnapshot` en el menú de funciones y dale "Ejecutar".
Revisa el bucket de R2: deben aparecer `snapshots/Reporte_de_Consumo/.../part-000.csv.gz`
(y siguientes), `snapshots/Resumen_Fac/.../part-000.csv.gz` (varias partes), y
`snapshots/manifest.json`.

**Programar el disparador:**
1. En el editor de Apps Script → ícono de reloj (Disparadores) en la barra
   lateral izquierda.
2. "+ Añadir disparador".
3. Función: `exportSnapshot` · Fuente del evento: "Basado en tiempo" ·
   Tipo de disparador: "Temporizador diario" · horario: **2 – 3 a. m.**
   (antes de que el equipo empiece a abrir el portal en la mañana).
4. Guardar.

Un fallo del disparador (cuota de Apps Script, R2 caído, etc.) no requiere
intervención inmediata: el portal detecta que el manifiesto no se refrescó
(pasadas las `SNAPSHOT_MAX_AGE_MS` = 30 h) y cae solo a la vía en vivo al
día siguiente. Revisa **Ejecuciones** en el editor de Apps Script si quieres
confirmar que corrió bien.

### 8.3 Qué NO cambia

- `getTabRows`/`getMeta` (§1) siguen exactamente igual — la vía en vivo
  sigue existiendo íntegra, como respaldo y como override manual.
- El formato que llega al worker (`{ headers, rows, rowCount }`) es idéntico
  venga de donde venga — `src/services/duckdbService.ts` (`csvGzToTabRows`)
  decodifica el CSV a esa misma forma, así que `buildFromSheetsInWorker`,
  `sheetsCache` y `buildAnalysisResult` no distinguen la fuente.
- `sheetsCache` (IndexedDB) sigue recibiendo lo que llegue, sea por snapshot
  o en vivo — sigue sirviendo para rellenar roles no seleccionados en una
  sync parcial.

## 9. Respaldo "solo mes corriente" para Resumen_Fac (sin desplegar el snapshot)

Pedido del usuario (2026-08-17): mientras el snapshot nocturno (§8) no esté
desplegado — o si un día falla — "Resumen_Fac" seguía yéndose por la
descarga completa de §1/§6 (~488k filas, ~99 páginas), que en la práctica
sigue topando con el 404 intermitente de Google incluso con reintentos
(§ comentario de `TAB_FETCH_RETRIES` en `reportSheetsService.ts`).

**La idea:** en vez de traer las 488k filas, traer solo las del mes en curso
(columna **"Mes y año"**, formato `MM/AAAA` — la misma que usa
`mesKey()` en `src/core/resumenFac.ts`) y fusionarlas, del lado del portal,
sobre lo último que ya haya en `sheetsCache` de ese equipo (de una sync
completa anterior, un snapshot, o incluso una sync parcial que quedó
guardada tras un 404 — ver §"Reanudación por página" en
`reportSheetsService.ts`). Con ~488k filas repartidas en ~12 meses, eso son
del orden de 30-45 mil filas por request — bien por debajo de lo que
dispara el 404, y exactamente lo que de negocio importa mantener al día
(las filas de meses cerrados no cambian).

**Esto NO es el esquema delta que §5 documenta como abandonado.** Aquél
filtraba por *posición* (offset/fila) asumiendo que lo nuevo se concentra al
final — falso, medido. Esto filtra por *valor* de una columna de fecha real
(el mes de la factura), sin importar en qué posición de la hoja esté esa
fila.

**Filtrado del lado de Apps Script vía `QUERY`**, para no leer la hoja
completa tampoco ahí: se escribe la fórmula en una hoja auxiliar oculta, se
fuerza el recálculo con `SpreadsheetApp.flush()`, se lee el resultado ya
filtrado, y se limpia la hoja auxiliar.

Agrega esto al **mismo script del paso 1** (no al del snapshot §8):

```javascript
// --- Filtro server-side por columna=valor (usado por "Resumen_Fac" / mes corriente) ---
function getTabRowsFiltered(tabName, filterCol, filterVal) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return { error: `No existe la pestaña "${tabName}"` };
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colIdx = headers.indexOf(filterCol);
  if (colIdx === -1) return { error: `No existe la columna "${filterCol}" en "${tabName}"` };
  if (lastRow < 2) return { headers: headers, rows: [], rowCount: 0 };

  const colLetter = columnToLetter(colIdx + 1);
  const srcRange = "'" + tabName + "'!A2:" + columnToLetter(lastCol) + lastRow;
  const escapedVal = String(filterVal).replace(/'/g, "\\'");
  const formula = '=QUERY(' + srcRange + ', "select * where ' + colLetter + " = '" + escapedVal + '\'", 0)';

  const scratchName = '__filter_scratch__';
  let scratch = ss.getSheetByName(scratchName);
  if (!scratch) scratch = ss.insertSheet(scratchName);
  scratch.hideSheet();
  scratch.clearContents();
  scratch.getRange(1, 1).setFormula(formula);
  SpreadsheetApp.flush(); // fuerza el recálculo antes de leer
  const numRows = scratch.getLastRow();
  const numCols = scratch.getLastColumn();
  const rows = numRows > 0 ? scratch.getRange(1, 1, numRows, numCols).getValues() : [];
  scratch.clearContents();

  return { headers: headers, rows: rows, rowCount: rows.length };
}

function columnToLetter(col) {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}
```

Y modifica el `doGet` del paso 1 para enrutar hacia ahí cuando vienen
`filterCol`/`filterVal`:

```javascript
function doGet(e) {
  try {
    if (e.parameter.meta) return respond(getMeta());
    if (e.parameter.tab) {
      if (e.parameter.filterCol && e.parameter.filterVal) {
        return respond(getTabRowsFiltered(e.parameter.tab, e.parameter.filterCol, e.parameter.filterVal));
      }
      const offset = e.parameter.offset ? Math.max(0, parseInt(e.parameter.offset, 10) || 0) : 0;
      const limit = e.parameter.limit ? Math.max(1, parseInt(e.parameter.limit, 10) || 0) : 0;
      return respond(getTabRows(e.parameter.tab, offset, limit));
    }
    return respond({ error: 'Falta el parámetro ?tab= o ?meta=1' });
  } catch (err) {
    return respond({ error: String(err) });
  }
}
```

**Sí requiere volver a desplegar una nueva versión** (a diferencia de §6):
Implementar → Gestionar implementaciones → lápiz → Versión: Nueva versión →
Implementar. La URL `/exec` no cambia.

**Cómo lo usa el portal:** `processTabInner` en `reportSheetsService.ts`
intenta, en este orden, para `resumenFac`: (1) el snapshot nocturno si
existe y está fresco (§8); (2) si no, y si ya hay algo en `sheetsCache` de
ese equipo, pide solo el mes corriente vía `getTabRowsFiltered` y lo
fusiona (reemplazando las filas de ese mes, dejando el resto tal cual);
(3) si tampoco hay nada en caché para fusionar, cae a la descarga completa
de siempre (§1/§6) — que sigue existiendo, para el primer sync en un equipo
nuevo o tras "Sincronización completa".

**Limitación conocida:** la primera vez que un equipo sincroniza
"Resumen_Fac" (caché vacía) no hay nada sobre qué fusionar, así que ese
primer sync sigue siendo la descarga completa y puede toparse con el mismo
404. Una vez que un sync completo (aunque sea parcial, vía la reanudación
por página) deja algo en caché, los siguientes sync ya usan la vía rápida.
Desplegar el snapshot nocturno (§8) resuelve esto de raíz, incluso para un
equipo que nunca ha sincronizado.
