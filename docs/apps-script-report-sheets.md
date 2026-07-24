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
    if (e.parameter.tab) return respond(getTabRows(e.parameter.tab));
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

/** Devuelve una pestaña como `{ headers, rows }` — encabezados una sola vez y
 * cada fila como array plano (NO como objeto por fila). Para una hoja grande
 * como "Reporte de Consumo" (~80k filas), repetir los encabezados en cada
 * fila infla el JSON varias veces su tamaño real y hace más lento tanto el
 * `JSON.stringify` aquí como la transferencia y el `JSON.parse` del lado del
 * portal. El portal reconstruye los objetos `{header: valor}` del lado del
 * cliente, que es barato comparado con generar/transmitir ese JSON inflado. */
function getTabRows(tabName) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
  if (!sheet) return { error: `No existe la pestaña "${tabName}"` };
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { headers: [], rows: [] };
  return { headers: values[0], rows: values.slice(1) };
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
