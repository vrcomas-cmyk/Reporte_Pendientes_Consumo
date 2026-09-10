# Apps Script — leer el Sheet "Incremento de costos"

El módulo `/incremento` lee una sola pestaña (`IncrementoCostos`) de un Sheet
propio, vía un `doGet` de Apps Script de solo lectura (ver
`src/services/incrementoService.ts`). Mismo contrato de respuesta que el
catálogo (`VITE_APPSCRIPT_URL`) — **distinto** Sheet y **distinto**
deployment: cada respuesta es un array de objetos `{header: valor}`, no
arrays planos con encabezado separado (eso es solo el contrato del reporte
diario, ver `docs/apps-script-report-sheets.md`).

## 1. Columnas esperadas en la pestaña `IncrementoCostos`

```
Código | Descripcion DEGASA | Sector | Grupo Articulo |
Costo Anterior | Costo Nuevo Pieza | Costo Anterior Caja | Costo Nuevo Caja
```

Una fila por material. `mapIncrementoCosto` (`src/core/mappers.ts`) es
tolerante a variantes con/sin acento (`Descripcion`/`Descripción`).

## 2. Crear el script

1. Abre el Sheet de incremento de costos (el que ya tienes en Google Sheets).
2. Extensiones → Apps Script.
3. Pega esto:

```javascript
const SHEET_ID = 'TU_SHEET_ID_AQUI';
const TAB_NAME = 'IncrementoCostos';

function doGet(e) {
  try {
    const tab = e.parameter.tab || TAB_NAME;
    return respond(getTabAsObjects(tab));
  } catch (err) {
    return respond({ error: String(err) });
  }
}

/** Devuelve una pestaña como array de objetos `{header: valor}` — un objeto
 * por fila, encabezados tomados de la primera fila de la hoja. La pestaña es
 * chica (decenas/cientos de SKUs), así que no hace falta la optimización de
 * arrays-planos + paginación que usa el reporte diario. */
function getTabAsObjects(tabName) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
  if (!sheet) return { error: `No existe la pestaña "${tabName}"` };
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h).trim());
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    // Salta filas completamente vacías (huecos al final de la hoja).
    if (row.every((v) => v === '' || v === null)) continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j]; });
    out.push(obj);
  }
  return out;
}

function respond(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Reemplaza `TU_SHEET_ID_AQUI` con el ID del Sheet (la parte de la URL entre
   `/d/` y `/edit`).

## 3. Publicar como Web App

1. Implementar → Nueva implementación → tipo "Aplicación web".
2. Ejecutar como: **Yo** (tu cuenta, la dueña del Sheet).
3. Quién tiene acceso: **Cualquier usuario** (el endpoint no lleva
   autenticación propia — es de solo lectura, mismo criterio que el catálogo).
4. Copia la URL del deployment (`.../exec`).

## 4. Configurar el conector en el portal

- **Admin · Conectores** → fila "Apps Script · Incremento de costos" → pega
  la URL del deployment. No requiere re-deploy del front.
- Alternativa para desarrollo local: `VITE_INCREMENTO_URL` en `.env.local`
  (ver `.env.example`) — solo se usa como *fallback* cuando el conector de
  Supabase está vacío.

## 5. Qué NO cambia

- No toca el Sheet del catálogo (`VITE_APPSCRIPT_URL`) ni el del reporte
  diario (`VITE_REPORT_SHEETS_URL`) — es un tercer Sheet, un tercer
  deployment.
- El portal nunca escribe en este Sheet — el `doGet` es de solo lectura, sin
  contraparte `doPost`.
