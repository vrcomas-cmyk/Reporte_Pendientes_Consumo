# Apps Script — catálogo maestro ("Ejecutivos y materiales (Sync)")

El portal lee el **catálogo maestro** (5 pestañas: `Ejecutivos`, `Materiales`,
`InvConsolidado`, `InvDetalle`, `GERENCIA DE MARCA`) de un libro Google Sheets
"Sync" (cuyas pestañas se alimentan con fórmulas `IMPORTRANGE`) a través de un
`doGet` de Apps Script, **de solo lectura y sin autenticación**. La URL del
despliegue se configura en Admin → Conectores (`appscript_catalog_url`) o en
`VITE_APPSCRIPT_URL` como respaldo.

Distinto de:
- el script del reporte diario → `docs/apps-script-report-sheets.md`
- el `doPost` de DRP → `docs/apps-script-drp.md`
- el de incremento de costos → `docs/apps-script-incremento.md`

Consumidor en el portal: `src/services/catalogService.ts`
(`syncCatalogFromAppScript`, `fetchCatalogMeta`, `checkForCatalogUpdate`) y el
disparador automático en `src/components/layout/AppShell.tsx`.

## Contrato con el portal

| Petición | Respuesta | La usa |
|---|---|---|
| `?tab=<Pestaña>` | Arreglo JSON de objetos `[{Encabezado: valor}, …]` (valores ya calculados, `getDisplayValues`) | `fetchAppScriptTab` (timeout 45 s, 1 reintento) |
| `?tab=<Pestaña>&nocache=1` | Igual, saltando la caché de 5 min | (manual / depuración) |
| `?meta=1` | `{ "modifiedTime": "<última modificación>#<huella>" }` | `fetchCatalogMeta` — el portal solo compara si el texto **cambió** |
| Error | `{ "error": "…" }` | el portal lo convierte en excepción |

Si el script **no** implementa `?meta=1`, el portal sigue funcionando: refresca
el catálogo solo cuando el guardado local tiene más de 30 min
(`FALLBACK_MAX_AGE_MS` en `catalogService.ts`).

### Por qué `modifiedTime` lleva una huella

El libro Sync se alimenta con `IMPORTRANGE`. Cuando cambia el libro **origen**,
los valores del Sync se recalculan, pero la fecha "última modificación" de
Drive del Sync **no siempre se actualiza**. Por eso `?meta=1` devuelve
`fechaDrive#md5(contenido de las 5 pestañas)`: la huella sí detecta cambios de
valores aunque Drive no mueva la fecha. El portal trata el valor como texto
opaco, así que el nombre del campo se mantiene por compatibilidad con el
script del reporte.

Como la huella se calcula sobre la misma caché de 5 min que sirve las
pestañas, un cambio en el Sheet puede tardar hasta ~5 min en reflejarse
(`CACHE_SEG`), y la revisión del portal también respeta un mínimo de 5 min
entre consultas (`MIN_RECHECK_MS`). Mantén ambos valores alineados.

## Script completo

Extensiones → Apps Script del libro Sync → pega esto → Implementar → Nueva
implementación → Aplicación web (ejecutar como: yo · acceso: cualquiera). Si
actualizas un despliegue existente, usa "Gestionar implementaciones → Editar →
Nueva versión" para conservar la URL.

```javascript
/**
 * API DEGASA — libro único "Ejecutivos y materiales(Sync)"
 * Reemplazo de opensheet/gviz. Devuelve una pestaña como arreglo de objetos:
 *   [{Encabezado: valor, ...}, ...]
 *
 * Usa getDisplayValues(), así que entrega los VALORES ya calculados por las
 * fórmulas IMPORTRANGE (no las fórmulas ni #REF!).
 *
 * Uso:
 *   ?tab=Ejecutivos
 *   ?tab=Materiales
 *   ?tab=InvConsolidado
 *   ?tab=InvDetalle
 *   ?tab=GERENCIA DE MARCA
 *   ?meta=1                (NUEVO: huella de cambios, barata, para el portal)
 *   (agrega &nocache=1 para saltar la caché de 5 min)
 */
const SHEET_ID  = '1AeDp_J7sC3PcM1duP3iXKd-VVtWm7g3d3HiSeoKdFTY'; // libro Sync
const CACHE_SEG = 300;   // segundos que se sirve desde caché (5 min)

// Pestañas permitidas (todo el portal se alimenta de estas 5)
const TABS_OK = ['Ejecutivos', 'Materiales', 'InvConsolidado', 'InvDetalle', 'GERENCIA DE MARCA'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  const nocache = p.nocache === '1';

  // NUEVO: huella de cambios — el portal la consulta antes de bajar todo.
  if (p.meta) {
    try {
      return salida(getMeta(nocache));
    } catch (err) {
      return salida({ error: String(err) });
    }
  }

  const tab = p.tab || '';
  if (TABS_OK.indexOf(tab) === -1) {
    return salida({ error: 'Pestaña no permitida', tab: tab, permitidas: TABS_OK });
  }
  try {
    const json = nocache ? leerHoja(tab) : leerConCache(tab);
    return salidaTexto(json);   // ya viene como string JSON
  } catch (err) {
    return salida({ error: String(err) });
  }
}

/**
 * NUEVO. Devuelve { modifiedTime: "<fecha Drive>#<md5 del contenido>" }.
 * - fecha Drive: última modificación del libro Sync (puede NO moverse cuando
 *   solo cambian los valores traídos por IMPORTRANGE).
 * - md5: huella del contenido de las pestañas, leído por la misma caché de
 *   5 min que sirve ?tab=, así que consultarla seguido es barato.
 * El portal solo compara si el texto cambió respecto a la última vez.
 */
function getMeta(nocache) {
  const fecha = DriveApp.getFileById(SHEET_ID).getLastUpdated().toISOString();
  let todo = '';
  TABS_OK.forEach(function (tab) {
    try {
      todo += tab + ':' + (nocache ? leerHoja(tab) : leerConCache(tab)) + '\n';
    } catch (err) {
      todo += tab + ':ERR\n';  // una pestaña caída no debe tumbar la huella
    }
  });
  return { modifiedTime: fecha + '#' + md5(todo) };
}

function md5(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');
}

/** Lee la hoja y la convierte en arreglo de objetos (mismo formato que opensheet). */
function leerHoja(tab) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tab);
  if (!sh) throw new Error('No existe la pestaña ' + tab);
  const valores = sh.getDataRange().getDisplayValues(); // texto tal cual lo ves (valores calculados)
  if (valores.length < 2) return '[]';
  const heads = valores[0].map(h => String(h).trim());
  const filas = [];
  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i];
    // saltar filas totalmente vacías
    if (fila.every(c => c === '' || c === null)) continue;
    // saltar la fila "JOIN(...)" de ayuda si apareciera vacía en encabezados
    const obj = {};
    for (let j = 0; j < heads.length; j++) {
      if (heads[j] === '') continue;
      obj[heads[j]] = fila[j];
    }
    filas.push(obj);
  }
  return JSON.stringify(filas);
}

/**
 * Caché con troceado: CacheService limita ~100KB por llave,
 * así que partimos el JSON en pedazos por pestaña.
 */
function leerConCache(tab) {
  const cache = CacheService.getScriptCache();
  const meta = cache.get('meta_' + tab);
  if (meta) {
    const n = parseInt(meta, 10);
    const llaves = [];
    for (let i = 0; i < n; i++) llaves.push(tab + '_' + i);
    const partes = cache.getAll(llaves);
    let ok = true, txt = '';
    for (let i = 0; i < n; i++) {
      const p = partes[tab + '_' + i];
      if (p == null) { ok = false; break; }
      txt += p;
    }
    if (ok && txt) return txt;
  }
  // No había caché válida: leer y guardar troceado
  const json = leerHoja(tab);
  const trozos = trocear(json, 95000);
  const guardar = {};
  trozos.forEach((t, i) => { guardar[tab + '_' + i] = t; });
  cache.putAll(guardar, CACHE_SEG);
  cache.put('meta_' + tab, String(trozos.length), CACHE_SEG);
  return json;
}

function trocear(str, tam) {
  const out = [];
  for (let i = 0; i < str.length; i += tam) out.push(str.substring(i, i + tam));
  return out.length ? out : [''];
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function salidaTexto(jsonString) {
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Cambios respecto al script original

1. **`?meta=1` nuevo** (`getMeta` + `md5`) para que el portal detecte cambios sin
   descargar las pestañas. Es lo único que el portal necesita para sincronizar
   solo y pronto.
2. **`GERENCIA DE MARCA` documentada** en el encabezado y en el comentario de
   `TABS_OK` (el portal ya la leía; el comentario decía "4 pestañas").
3. `doGet` lee los parámetros una sola vez (`p`) — sin cambio de comportamiento.
4. `leerHoja`, `leerConCache`, `trocear`, `salida` y `salidaTexto` quedan
   **idénticos** al original.

## Probar

Con la URL de la implementación (`<URL>`):

```
<URL>?meta=1                     → {"modifiedTime":"2026-…Z#3f2a…"}
<URL>?tab=Materiales             → [{"Material":"…","Descr. Grupo de Art.":"…",…}]
<URL>?tab=Materiales&nocache=1   → igual, sin caché
```

Edita un valor en el libro origen, espera unos minutos (o usa `&nocache=1`) y
confirma que la parte después de `#` en `?meta=1` cambió.

## Notas y límites

- **Sin autenticación:** cualquiera con la URL puede leer el catálogo (incluye
  costos de `Materiales`). Mantén la URL solo en Admin → Conectores / `.env`.
- **Límites de CacheService:** 100 KB por llave (por eso se trocea a 95 000),
  y la caché total del script es limitada; si alguna pestaña crece mucho
  (p. ej. `InvDetalle`), las más grandes pueden no quedar en caché y se leerán
  del Sheet en cada petición (más lento, pero correcto).
- **Primera consulta tras expirar la caché** lee hasta 5 pestañas del Sheet
  (varios segundos); por eso el portal usa 45 s de timeout por pestaña.
- **Esquema esperado por el portal** (encabezados exactos): ver
  `src/core/mappers.ts` — por ejemplo `Materiales` necesita `Material`,
  `Descr. Sector`, `Descr. Grupo de Art.`. Si un encabezado cambia de texto, el
  campo llega vacío y aparece como "(sin grupo)" / "(sin sector)".
