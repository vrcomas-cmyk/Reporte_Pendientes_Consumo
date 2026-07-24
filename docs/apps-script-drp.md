# Apps Script — escribir solicitudes en la pestaña "DRP"

El portal envía cada solicitud con un `POST` (ver `src/services/drpService.ts`) a un
Web App de Google Apps Script. Este documento trae el script a desplegar y los
pasos de configuración.

## 1. Crear el script

1. Abre el Sheet `AeDp_J7sC3PcM1duP3iXKd-VVtWm7g3d3HiSeoKdFTY` (el que tiene la
   pestaña **DRP**).
2. Extensiones → Apps Script.
3. Si ya existe un script para el catálogo (`VITE_APPSCRIPT_URL`), puedes agregar
   `doPost` a ese mismo proyecto — no hace falta uno nuevo.
4. Pega esto (ajusta `SCRIPT_TOKEN` por un valor propio):

```javascript
const SCRIPT_TOKEN = 'cambia-este-token'; // debe coincidir con VITE_DRP_TOKEN

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== SCRIPT_TOKEN) {
      return respond({ error: 'Token inválido' });
    }
    const ss = SpreadsheetApp.openById(body.sheetId);
    const sheet = ss.getSheetByName(body.tab);
    if (!sheet) return respond({ error: `No existe la pestaña "${body.tab}"` });

    // Mapea por nombre de columna (fila 1 = encabezados) en vez de por
    // posición fija: así, si alguien reordena columnas en el Sheet, o si el
    // portal deja de enviar alguna, la fila igual cae en su columna correcta.
    // No. UD / Delivery / Estatus quedan vacías a propósito — las llenan las
    // fórmulas de esa hoja.
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = headers.map((h) => (h in body.row ? body.row[h] : ''));
    sheet.appendRow(row);

    return respond({ ok: true });
  } catch (err) {
    return respond({ error: String(err) });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 2. Desplegar

1. Implementar → Nueva implementación → tipo **Aplicación web**.
2. Ejecutar como: **Yo** (tu cuenta, la que tiene acceso al Sheet).
3. Quién tiene acceso: **Cualquier usuario** (el `doPost` valida el token, así
   que no requiere login de Google del portal).
4. Copia la URL `.../exec` que te da.

## 3. Configurar el portal

En `.env.local` (o `.env`):

```
VITE_DRP_WEBHOOK_URL=<la URL /exec del paso anterior>
VITE_DRP_TOKEN=<el mismo valor que pusiste en SCRIPT_TOKEN>
VITE_DRP_SHEET_ID=AeDp_J7sC3PcM1duP3iXKd-VVtWm7g3d3HiSeoKdFTY
```

Las tres son obligatorias — `drpService.ts` revisa que estén las tres antes de
enviar (si falta `VITE_DRP_SHEET_ID` tira un error aunque la URL y el token
estén bien).

## 4. Probar

Desde cualquiera de los reportes (Sugerencias, Inventario, Resumen Sin Sug.,
Consumo), marca "Solicitar" en una fila y confirma. Debe aparecer un renglón
nuevo en la pestaña **DRP**, con Fecha solicitud/Centro Origen/.../Pedidos
llenas y **Estatus, No. UD, Delivery vacías** (las llenan tus fórmulas).

Si prefieres no desplegar este script, usa el botón "Exportar a Excel" en
`/solicitudes` para pegar las solicitudes manualmente.
