// =========================================================================
// GOOGLE APPS SCRIPT - LECTURA INCREMENTAL DE CARPETA DRIVE POR CHUNKS
// =========================================================================
// Respuesta compacta: las filas viajan como arreglos planos y los nombres de
// columna se envian una sola vez (`columnas`). El cliente arma los objetos.
//
// IMPORTANTE: al editar este codigo hay que crear una NUEVA VERSION en
// Implementar > Administrar implementaciones, si no el /exec sigue sirviendo
// el codigo anterior.

// Carpeta de Drive que contiene los libros "1Q 2024", "2Q 2024", etc.
const CARPETA_ID = "1D3hAlfOLXw7jGUIbPYdm_5yGKaaehGsd";
const DEFAULT_CHUNK_SIZE = 5000;
const MAX_CHUNK_SIZE = 20000;
const CACHE_MANIFIESTO_SEG = 60;
const CACHE_MAPEO_SEG = 300;

// Libros de relacion (se leen crudos, sin transformar). El cliente los pide por
// `clave`, nunca por fileId. `hojas: null` = solo la primera hoja del libro.
// Las pestañas de Inv_Condicion son las mismas que lee el sugeridor de Python
// (FUENTES_DISPONIBLES + HOJAS_ADICIONALES); "Codigos" no se lee.
const LIBROS_RELACION = {
  disponibilidad: {
    id: "1VZ56C3OaWVG6SeJ0Ch6l9WLNlyNwokAS9q2yFssBSPY",
    hojas: null
  },
  pedidos: {
    id: "1N8t02WrkR-X7E26aGhsWPCkKmXzJRch30ZP9jvED_f0",
    hojas: null
  },
  condicion: {
    id: "14Urzz33cW-4Brva6dbKBfRNFYUfx7Z0pzrUVMsQf7nI",
    hojas: ["Corta caducidad", "Lento mov", "Cosmopark", "Sustituto", "PNC", "Caduco", "Revision", "Revision2"]
  },
  // Pedidos YBFD (entrega de comodato) y ZBRE (devolucion), export SAP. Se lee la PRIMERA pestana del libro (sin depender de su gid ni de su nombre,
  // que cambian cuando alguien recrea la pestana). Para fijar una concreta, agregar `gid: <numero>`: si ya no existe, se usa la primera.
  comodato: {
    id: "1PmPyTJGIlujBIfK2dbzReV62A3VKm6-yw9wt8L_kMNQ",
    hojas: null
  }
};

// Campos leidos de la hoja (el orden define el mapeo de columnas).
const CAMPOS = ["Fecha", "Cliente", "Material", "Descripcion", "Cantidad"];

// Columnas de salida: las filas se agrupan por Mes + Cliente + Material y la
// Cantidad se suma. El cliente termina de unir los chunks de cada libro.
const COLUMNAS_SALIDA = ["Mes", "Cliente", "Material", "Descripcion", "Cantidad"];

// Alias de encabezado (ya normalizados) por campo, y columna de respaldo
// (indice base 0) cuando ningun alias coincide: B, D, H, I, J.
const ALIAS_COLUMNAS = {
  Fecha:       { alias: ["fecha", "fecha factura", "fecha de factura"], respaldo: 3 },
  Cliente:     { alias: ["cliente", "razon social", "nombre cliente", "cliente razon social"], respaldo: 1 },
  Material:    { alias: ["material", "codigo", "codigo material"], respaldo: 7 },
  Descripcion: { alias: ["descripcion", "texto material", "descripcion material"], respaldo: 8 },
  Cantidad:    { alias: ["cantidad", "cant", "cant."], respaldo: 9 }
};

// Token compartido con la Edge Function `datos` de Supabase (docs/acceso-por-roles.md). Se guarda en Propiedades del script
// (Configuracion del proyecto > Propiedades del script > API_TOKEN), NUNCA en el codigo. Con la propiedad definida, toda llamada
// sin el token correcto se rechaza: asi la URL del /exec deja de servir a quien no pase por la funcion. Sin la propiedad, no se exige
// (solo para el periodo de migracion: defínela en cuanto la funcion este desplegada).
function _tokenValido(params) {
  var esperado = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  if (!esperado) return true;
  return String(params.token || "") === esperado;
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!_tokenValido(params)) {
      return _json({ ok: false, error: "No autorizado" });
    }
    var action = params.action || "manifest";
    var result;

    if (action === "manifest") {
      result = obtenerManifiestoCacheado(CARPETA_ID, params.nocache === "1");
    } else if (action === "chunk") {
      result = obtenerChunk(params);
    } else if (action === "relacion") {
      // Solo los libros de relacion (App_Edu "Seg. de pedidos"): no escanea la carpeta de facturacion.
      result = { ok: true, generadoEn: new Date().toISOString(), relacion: obtenerManifiestoRelacion() };
    } else if (action === "hoja") {
      result = obtenerHojaCruda(params);
    } else if (action === "fac_manifest") {
      result = obtenerManifiestoFacturacion();
    } else if (action === "fac_chunk") {
      result = obtenerChunkFacturacion(params);
    } else {
      result = { ok: false, error: "Accion no soportada: " + action };
    }

    return _json(result);
  } catch (error) {
    // Sin stack: no se expone detalle interno al cliente.
    return _json({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

// ---------------------------------------------------------------------------
// Manifiesto
// ---------------------------------------------------------------------------

function obtenerManifiestoCacheado(idCarpeta, omitirCache) {
  var cache = CacheService.getScriptCache();
  var clave = "manifest_" + idCarpeta;

  if (!omitirCache) {
    var guardado = cache.get(clave);
    if (guardado) {
      return JSON.parse(guardado);
    }
  }

  var manifiesto = obtenerManifiesto(idCarpeta);
  try {
    cache.put(clave, JSON.stringify(manifiesto), CACHE_MANIFIESTO_SEG);
  } catch (error) {
    // Cache lleno o valor muy grande: se ignora, solo se pierde la optimizacion.
  }
  return manifiesto;
}

function obtenerManifiesto(idCarpeta) {
  var carpeta = DriveApp.getFolderById(idCarpeta);
  var archivos = carpeta.getFilesByType(MimeType.GOOGLE_SHEETS);
  var libros = [];

  while (archivos.hasNext()) {
    var archivo = archivos.next();
    var periodo = _parsearPeriodo(archivo.getName());

    if (!periodo) {
      continue;
    }

    libros.push({
      id: archivo.getId(),
      nombre: archivo.getName(),
      trimestre: periodo.trimestre,
      anio: periodo.anio,
      periodo: periodo.trimestre + "Q " + periodo.anio,
      orden: periodo.anio * 10 + periodo.trimestre,
      ultimaModificacion: archivo.getLastUpdated().toISOString(),
      chunkSize: DEFAULT_CHUNK_SIZE
    });
  }

  libros.sort(function(a, b) {
    return a.orden - b.orden;
  });

  return {
    ok: true,
    carpetaId: idCarpeta,
    generadoEn: new Date().toISOString(),
    libros: libros,
    relacion: obtenerManifiestoRelacion()
  };
}

// Por cada libro de relacion: ultima modificacion y las hojas que existen
// (con su total de filas de datos). Una hoja de la lista que no existe se omite.
function obtenerManifiestoRelacion() {
  return Object.keys(LIBROS_RELACION).map(function(clave) {
    var def = LIBROS_RELACION[clave];
    // Un libro que esta cuenta no puede abrir (p. ej. sin compartir) se omite: no debe tumbar a los demas.
    try {
      var archivo = DriveApp.getFileById(def.id);
      var hojas = _hojasPermitidas(SpreadsheetApp.openById(def.id), def).map(function(hoja) {
        return { nombre: hoja.getName(), totalRows: Math.max(hoja.getLastRow() - 1, 0) };
      });

      return {
        clave: clave,
        nombre: archivo.getName(),
        ultimaModificacion: archivo.getLastUpdated().toISOString(),
        chunkSize: DEFAULT_CHUNK_SIZE,
        hojas: hojas
      };
    } catch (error) {
      return null;
    }
  }).filter(function(libro) { return libro !== null; });
}

function _hojasPermitidas(ss, def) {
  var todas = ss.getSheets();

  // Libro con una pestana concreta: se identifica por su gid (el nombre puede cambiar). Si esa pestana ya no existe (se borro o se recreo), se usa la
  // primera: devolver cero hojas dejaba el libro "sincronizado" pero vacio, sin avisar.
  if (def.gid !== undefined && def.gid !== null) {
    var concreta = todas.filter(function(hoja) {
      return hoja.getSheetId() === def.gid;
    });
    return concreta.length ? concreta : todas.slice(0, 1);
  }
  if (!def.hojas) {
    return todas.slice(0, 1);
  }
  return todas.filter(function(hoja) {
    return def.hojas.indexOf(hoja.getName()) !== -1;
  });
}

// ---------------------------------------------------------------------------
// Hoja cruda (libros de relacion): encabezados y valores tal como se ven.
// ---------------------------------------------------------------------------

function obtenerHojaCruda(params) {
  var def = LIBROS_RELACION[params.libro];

  if (!def) {
    throw new Error("Libro no soportado: " + params.libro);
  }

  var hoja = _hojasPermitidas(SpreadsheetApp.openById(def.id), def).filter(function(h) {
    return h.getName() === params.hoja;
  })[0];

  if (!hoja) {
    throw new Error("Hoja no soportada: " + params.hoja);
  }

  var offset = Math.max(parseInt(params.offset || "0", 10) || 0, 0);
  var limit = Math.min(
    Math.max(parseInt(params.limit || DEFAULT_CHUNK_SIZE, 10) || DEFAULT_CHUNK_SIZE, 1),
    MAX_CHUNK_SIZE
  );
  var ultimaColumna = Math.max(hoja.getLastColumn(), 1);
  var totalRows = Math.max(hoja.getLastRow() - 1, 0);
  var base = {
    ok: true,
    libro: params.libro,
    hoja: hoja.getName(),
    columnas: hoja.getRange(1, 1, 1, ultimaColumna).getDisplayValues()[0],
    offset: offset,
    limit: limit,
    totalRows: totalRows,
    nextOffset: null,
    rows: []
  };

  if (totalRows === 0 || offset >= totalRows) {
    return base;
  }

  var numRows = Math.min(limit, totalRows - offset);
  // getDisplayValues: fechas y numeros llegan como texto, sin reinterpretar.
  var datos = hoja.getRange(offset + 2, 1, numRows, ultimaColumna).getDisplayValues();

  // Solo se descartan las filas totalmente vacias. Las de continuacion (con
  // Material vacio pero otros datos) se conservan: Revision hereda el Material
  // de la fila de arriba en el cliente.
  base.rows = datos.filter(function(fila) {
    return !_filaVacia(fila);
  });
  base.nextOffset = offset + numRows < totalRows ? offset + numRows : null;
  return base;
}

// ---------------------------------------------------------------------------
// Chunk
// ---------------------------------------------------------------------------

function obtenerChunk(params) {
  var fileId = params.fileId;

  if (!fileId) {
    throw new Error("Falta fileId.");
  }

  var offset = Math.max(parseInt(params.offset || "0", 10) || 0, 0);
  var limit = Math.min(
    Math.max(parseInt(params.limit || DEFAULT_CHUNK_SIZE, 10) || DEFAULT_CHUNK_SIZE, 1),
    MAX_CHUNK_SIZE
  );

  var archivo = DriveApp.getFileById(fileId);

  if (!_perteneceACarpeta(archivo, CARPETA_ID)) {
    throw new Error("El archivo no pertenece a la carpeta configurada.");
  }

  var nombre = archivo.getName();
  var periodo = _parsearPeriodo(nombre);
  var etiquetaPeriodo = periodo ? periodo.trimestre + "Q " + periodo.anio : nombre;
  var base = {
    ok: true,
    fileId: fileId,
    nombre: nombre,
    periodo: etiquetaPeriodo,
    columnas: COLUMNAS_SALIDA,
    offset: offset,
    limit: limit
  };

  var ss = SpreadsheetApp.openById(fileId);
  var hoja = ss.getSheets()[0];
  var lastRow = hoja.getLastRow();
  var totalRows = Math.max(lastRow - 1, 0);

  base.totalRows = totalRows;

  if (totalRows === 0 || offset >= totalRows) {
    base.nextOffset = null;
    base.rows = [];
    return base;
  }

  var mapeo = _obtenerMapeo(hoja, fileId, archivo.getLastUpdated().getTime());
  var maxCol = Math.max.apply(null, mapeo) + 1;
  var startRow = offset + 2; // fila 1 = encabezados
  var numRows = Math.min(limit, totalRows - offset);
  var datos = hoja.getRange(startRow, 1, numRows, maxCol).getValues();
  var zona = Session.getScriptTimeZone();
  var grupos = {};
  var rows = [];

  for (var i = 0; i < datos.length; i++) {
    var fila = datos[i];

    if (_filaVacia(fila)) {
      continue;
    }

    var mes = _normalizarFecha(fila[mapeo[0]], zona).slice(0, 7);
    var cliente = _texto(fila[mapeo[1]]);
    var material = _texto(fila[mapeo[2]]);
    var clave = mes + "|¦|" + cliente + "|¦|" + material;
    var existente = grupos[clave];

    if (existente) {
      existente[4] += _numero(fila[mapeo[4]]);
      if (!existente[3]) {
        existente[3] = _texto(fila[mapeo[3]]);
      }
    } else {
      existente = [mes, cliente, material, _texto(fila[mapeo[3]]), _numero(fila[mapeo[4]])];
      grupos[clave] = existente;
      rows.push(existente);
    }
  }

  base.nextOffset = offset + numRows < totalRows ? offset + numRows : null;
  base.rows = rows;
  return base;
}

// Devuelve los indices de columna (base 0) de CAMPOS, en el mismo orden.
// Se resuelve por nombre de encabezado y se cachea por archivo + version.
function _obtenerMapeo(hoja, fileId, version) {
  var cache = CacheService.getScriptCache();
  var clave = "mapeo_" + fileId + "_" + version;
  var guardado = cache.get(clave);

  if (guardado) {
    return JSON.parse(guardado);
  }

  var ultimaColumna = Math.max(hoja.getLastColumn(), 1);
  var encabezados = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0].map(_normalizarEncabezado);
  var mapeo = CAMPOS.map(function(campo) {
    var def = ALIAS_COLUMNAS[campo];

    for (var i = 0; i < def.alias.length; i++) {
      var idx = encabezados.indexOf(def.alias[i]);
      if (idx !== -1) {
        return idx;
      }
    }
    return def.respaldo;
  });

  try {
    cache.put(clave, JSON.stringify(mapeo), CACHE_MAPEO_SEG);
  } catch (error) {
    // Ignorar: solo se pierde la optimizacion.
  }
  return mapeo;
}

// Todos los Google Sheets bajo la carpeta, incluidas las subcarpetas a cualquier profundidad.
function _listarSheetsRecursivo(idCarpeta) {
  var salida = [];
  var pendientes = [idCarpeta];
  var vistas = {};

  while (pendientes.length) {
    var id = pendientes.pop();
    if (vistas[id]) continue;
    vistas[id] = true;

    var carpeta = DriveApp.getFolderById(id);
    var archivos = carpeta.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (archivos.hasNext()) salida.push(archivos.next());

    var subs = carpeta.getFolders();
    while (subs.hasNext()) pendientes.push(subs.next().getId());
  }
  return salida;
}

// El archivo esta en la carpeta o en cualquiera de sus subcarpetas (se sube por los padres).
function _perteneceACarpeta(archivo, idCarpeta) {
  var nivel = [archivo];

  for (var profundidad = 0; profundidad < 10 && nivel.length; profundidad++) {
    var siguiente = [];
    for (var i = 0; i < nivel.length; i++) {
      var padres = nivel[i].getParents();
      while (padres.hasNext()) {
        var padre = padres.next();
        if (padre.getId() === idCarpeta) return true;
        siguiente.push(padre);
      }
    }
    nivel = siguiente;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Normalizacion
// ---------------------------------------------------------------------------

function _normalizarEncabezado(valor) {
  return String(valor == null ? "" : valor)
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function _filaVacia(fila) {
  return fila.every(function(celda) {
    return celda === "" || celda === null;
  });
}

function _texto(valor) {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

// Numero finito o 0. Acepta textos como "$ 1,234.5".
function _numero(valor) {
  if (typeof valor === "number") {
    return isFinite(valor) ? valor : 0;
  }
  if (valor === null || valor === undefined || valor === "") {
    return 0;
  }

  var limpio = String(valor).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  var n = parseFloat(limpio);
  return isFinite(n) ? n : 0;
}

// Fecha ISO yyyy-MM-dd. Los textos dd/mm/yyyy se leen dia primero y se
// validan; si el dia-primero es imposible (mes > 12) se intenta mes-primero.
function _normalizarFecha(valor, zona) {
  if (valor instanceof Date) {
    return isNaN(valor.getTime()) ? "" : Utilities.formatDate(valor, zona, "yyyy-MM-dd");
  }
  if (valor === null || valor === undefined || valor === "") {
    return "";
  }

  var texto = String(valor).trim();
  var iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (iso) {
    return _armarFechaIso(Number(iso[1]), Number(iso[2]), Number(iso[3])) || "";
  }

  var partes = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);

  if (partes) {
    var a = Number(partes[1]);
    var b = Number(partes[2]);
    var anio = Number(partes[3]);

    if (anio < 100) {
      anio += 2000;
    }
    return _armarFechaIso(anio, b, a) || _armarFechaIso(anio, a, b) || "";
  }

  return "";
}

function _armarFechaIso(anio, mes, dia) {
  var d = new Date(Date.UTC(anio, mes - 1, dia));

  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return anio + "-" + ("0" + mes).slice(-2) + "-" + ("0" + dia).slice(-2);
}

function _parsearPeriodo(nombre) {
  var match = String(nombre).match(/\b([1-4])\s*Q\s*(20\d{2})\b/i);

  if (!match) {
    match = String(nombre).match(/\bQ\s*([1-4])\s*(20\d{2})\b/i);
  }

  if (!match) {
    return null;
  }

  return {
    trimestre: parseInt(match[1], 10),
    anio: parseInt(match[2], 10)
  };
}

function _json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// FACTURACION DESDE LOS LIBROS TRIMESTRALES (App_Edu "Seg. de pedidos")
// ---------------------------------------------------------------------------
// Reemplaza las pestañas "Resumen_Fac" y "Fac_Mensual_CAM" del Sheet del reporte: ambas son la SUMA por
// mes de los libros trimestrales de la carpeta (verificado contra el reporte: mismas cantidades e importes
// en 01/2024, 03/2024 y 09/2026). El script solo agrega por bloque; el cliente une los bloques y los libros.
//
//   ?action=fac_manifest
//       -> { ok, libros: [{ id, nombre, periodo, orden, ultimaModificacion, totalRows, chunkSize }] }
//   ?action=fac_chunk&fileId=<id>&offset=0&limit=5000
//       -> { ok, columnas, rows, totalRows, nextOffset }   (filas agregadas por clave dentro del bloque)

// Bloques GRANDES: cada llamada paga un costo fijo (abrir el libro, validar la carpeta, leer encabezados) de ~3-5 s; con
// 20,000 filas por bloque son ~45 llamadas para todo el historial en vez de ~180. El tope lo marca MAX_CHUNK_SIZE.
const FAC_CHUNK_SIZE = 20000;
// El manifiesto de facturacion se reutiliza unos minutos (costaba ~25 s abrir cada libro para contar sus filas).
const FAC_CACHE_MANIFIESTO_SEG = 300;
// "Fecha Max": dia (aaaa-mm-dd) de la linea MAS RECIENTE de cada fila (cliente + centro + mes). Sin ella la fecha de una fila agregada seria solo
// el mes y "dias sin compra" quedaria desfasado hasta ~30 dias (lo usa el modulo Comodato).
// "Precio Min" / "Precio Max": el menor y el mayor precio unitario (importe / cantidad) de las LINEAS que se sumaron en cada fila. Sin ellas, al
// sumar las lineas de un cliente en el mes se perdia el precio de cada linea (y el minimo/maximo de un material salia mas alto/bajo que el real).
const FAC_COLUMNAS = ["Mes", "Solicitante", "Razon Social", "Destinatario", "Material", "Texto Material", "Centro", "Almacen", "Gpo. Cte.", "Gpo. Vdor.", "Cantidad", "Importe", "Precio Min", "Precio Max", "Fecha Max"];

// Encabezados (ya normalizados) de cada campo del libro. Coincidencia exacta.
const FAC_ALIAS = {
  fecha:        ["fecha"],
  solicitante:  ["solicitante"],
  razon:        ["razon social"],
  destinatario: ["destinatario"],
  material:     ["material"],
  texto:        ["texto material"],
  centro:       ["centro"],
  almacen:      ["almacen"],
  gpoCte:       ["grp. cliente", "gpo. cte.", "grupo cliente"],
  gpoVdor:      ["gpo. vdor.", "gpo.vdor."],
  cantidad:     ["cantidad"],
  importe:      ["importe"]
};

function obtenerManifiestoFacturacion() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get("fac_manifest_" + CARPETA_ID + "_v5");
  if (guardado) return JSON.parse(guardado);

  // Todos los Sheets de la carpeta Y de sus subcarpetas (Q1, Q2...). Un libro sin "1Q 2024" en el nombre
  // (informacion anexada de meses/anios anteriores) tambien cuenta: orden 0 = va antes de los trimestrales.
  var archivos = _listarSheetsRecursivo(CARPETA_ID);
  var libros = [];

  for (var k = 0; k < archivos.length; k++) {
    var archivo = archivos[k];
    var periodo = _parsearPeriodo(archivo.getName());

    var actualizado = archivo.getLastUpdated();
    var info = _infoLibroFacturacion(archivo.getId(), actualizado.getTime(), null);
    libros.push({
      id: archivo.getId(),
      nombre: archivo.getName(),
      periodo: periodo ? periodo.trimestre + "Q " + periodo.anio : archivo.getName(),
      orden: periodo ? periodo.anio * 10 + periodo.trimestre : 0,
      ultimaModificacion: actualizado.toISOString(),
      totalRows: info.totalRows,
      chunkSize: FAC_CHUNK_SIZE,
      conPrecios: true,
      conFechas: true
    });
  }
  libros.sort(function(a, b) { return a.orden - b.orden; });

  var resultado = { ok: true, libros: libros };
  try {
    cache.put("fac_manifest_" + CARPETA_ID + "_v5", JSON.stringify(resultado), FAC_CACHE_MANIFIESTO_SEG);
  } catch (error) {
    // Cache lleno: solo se pierde la optimizacion.
  }
  return resultado;
}

function obtenerChunkFacturacion(params) {
  var fileId = params.fileId;
  if (!fileId) throw new Error("Falta fileId.");

  // La pertenencia a la carpeta se valida una vez por libro (cache de 6 h) en vez de en cada bloque.
  var cacheFac = CacheService.getScriptCache();
  var archivo = null;
  var version = parseInt(params.v || "0", 10) || 0;
  var nombreLibro = "";
  if (!cacheFac.get("fac_ok_" + fileId) || !version) {
    archivo = DriveApp.getFileById(fileId);
    if (!_perteneceACarpeta(archivo, CARPETA_ID)) {
      throw new Error("El archivo no pertenece a la carpeta configurada.");
    }
    version = archivo.getLastUpdated().getTime();
    nombreLibro = archivo.getName();
    try { cacheFac.put("fac_ok_" + fileId, "1", 21600); } catch (error) { /* solo se pierde la optimizacion */ }
  }

  var offset = Math.max(parseInt(params.offset || "0", 10) || 0, 0);
  var limit = Math.min(Math.max(parseInt(params.limit || FAC_CHUNK_SIZE, 10) || FAC_CHUNK_SIZE, 1), MAX_CHUNK_SIZE);
  var hoja = SpreadsheetApp.openById(fileId).getSheets()[0];
  var info = _infoLibroFacturacion(fileId, version, hoja);
  var totalRows = info.totalRows;
  var base = { ok: true, fileId: fileId, nombre: nombreLibro, columnas: FAC_COLUMNAS, offset: offset, limit: limit, totalRows: totalRows, nextOffset: null, rows: [] };

  if (totalRows === 0 || offset >= totalRows) return base;

  var idx = _indicesFacturacion(hoja);
  var formato = info.formato;
  var maxCol = Math.max.apply(null, Object.keys(idx).map(function(k) { return idx[k]; })) + 1;
  var numRows = Math.min(limit, totalRows - offset);
  var datos = hoja.getRange(offset + 2, 1, numRows, maxCol).getValues();
  var zona = Session.getScriptTimeZone();
  var grupos = {};
  var rows = [];

  for (var i = 0; i < datos.length; i++) {
    var f = datos[i];
    if (_filaVacia(f)) continue;

    var mes = _mesDeFecha(f[idx.fecha], formato, zona);
    if (!mes) continue;

    var campos = [mes, _texto(f[idx.solicitante]), _texto(f[idx.razon]), _texto(f[idx.destinatario]), _texto(f[idx.material]),
      _texto(f[idx.texto]), _texto(f[idx.centro]), _texto(f[idx.almacen]), _texto(f[idx.gpoCte]), _texto(f[idx.gpoVdor])];
    // La clave incluye el texto y la razon social: una misma clave con nombres distintos se conserva aparte.
    var clave = campos.join("¦");
    var existente = grupos[clave];
    var cant = _numero(f[idx.cantidad]);
    var imp = _numero(f[idx.importe]);
    // Precio unitario de ESTA linea (solo lineas de venta: cantidad e importe positivos); 0 = sin dato.
    var unitario = cant > 0 && imp > 0 ? imp / cant : 0;
    var dia = _fechaDeFecha(f[idx.fecha], formato, zona);

    if (existente) {
      existente[10] += cant;
      existente[11] += imp;
      if (unitario > 0) {
        existente[12] = existente[12] > 0 ? Math.min(existente[12], unitario) : unitario;
        existente[13] = Math.max(existente[13], unitario);
      }
      if (dia > existente[14]) existente[14] = dia; // aaaa-mm-dd compara bien como texto
    } else {
      existente = campos.concat([cant, imp, unitario, unitario, dia]);
      grupos[clave] = existente;
      rows.push(existente);
    }
  }

  base.rows = rows;
  base.nextOffset = offset + numRows < totalRows ? offset + numRows : null;
  return base;
}

// Total de filas y formato de fecha de un libro, guardados en las propiedades del script por libro + version
// (ultima modificacion): un libro que no cambio NUNCA se vuelve a abrir ni a recorrer solo para esto. Con
// `hoja` null y sin dato guardado, abre el libro una sola vez.
function _infoLibroFacturacion(fileId, version, hoja) {
  var props = PropertiesService.getScriptProperties();
  var clave = "fac_info_" + fileId + "_" + version;
  var guardado = props.getProperty(clave);
  if (guardado) return JSON.parse(guardado);

  var h = hoja || SpreadsheetApp.openById(fileId).getSheets()[0];
  var totalRows = Math.max(h.getLastRow() - 1, 0);
  var formato = "mdy";
  if (totalRows > 0) {
    formato = _formatoFechaLibro(h, _indicesFacturacion(h).fecha, totalRows, fileId, version);
  }
  var info = { totalRows: totalRows, formato: formato };
  try {
    props.setProperty(clave, JSON.stringify(info));
  } catch (error) {
    // Sin espacio en propiedades: solo se pierde la optimizacion.
  }
  return info;
}

// Posicion (base 0) de cada campo segun el encabezado del libro; falla si falta alguno.
function _indicesFacturacion(hoja) {
  var encabezados = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0].map(_normalizarEncabezado);
  var idx = {};

  Object.keys(FAC_ALIAS).forEach(function(campo) {
    var pos = -1;
    FAC_ALIAS[campo].forEach(function(alias) {
      if (pos === -1) pos = encabezados.indexOf(alias);
    });
    if (pos === -1) throw new Error("Falta la columna '" + FAC_ALIAS[campo][0] + "' en " + hoja.getParent().getName());
    idx[campo] = pos;
  });
  return idx;
}

// Cada libro usa un formato de fecha: "dd/mm/aaaa" (1Q 2024) o "m/d/aaaa" (el resto). Se decide mirando toda
// la columna (basta un valor con primer numero > 12 o segundo > 12). Si las celdas son fechas reales no hay ambiguedad.
function _formatoFechaLibro(hoja, iFecha, totalRows, fileId, version) {
  var cache = CacheService.getScriptCache();
  var clave = "fac_fmt_" + fileId + "_" + version;
  var guardado = cache.get(clave);
  if (guardado) return guardado;

  var valores = hoja.getRange(2, iFecha + 1, totalRows, 1).getValues();
  var dmy = 0;
  var mdy = 0;
  var fechasReales = 0;

  for (var i = 0; i < valores.length; i++) {
    var v = valores[i][0];
    if (v instanceof Date) { fechasReales++; continue; }
    var p = String(v).split(/[\/\-.]/);
    if (p.length < 3) continue;
    if (Number(p[0]) > 12) dmy++;
    if (Number(p[1]) > 12) mdy++;
  }

  var formato = fechasReales > valores.length / 2 ? "fecha" : (dmy > mdy ? "dmy" : "mdy");
  try {
    cache.put(clave, formato, 21600);
  } catch (error) {
    // Ignorar: solo se pierde la optimizacion.
  }
  return formato;
}

// "MM/AAAA" de la celda de fecha, o "" si no se puede interpretar.
function _mesDeFecha(valor, formato, zona) {
  if (valor instanceof Date) {
    return isNaN(valor.getTime()) ? "" : Utilities.formatDate(valor, zona, "MM/yyyy");
  }
  var texto = String(valor == null ? "" : valor).trim();
  var iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return ("0" + Number(iso[2])).slice(-2) + "/" + iso[1];

  var p = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!p) return "";

  var mes = Number(formato === "dmy" ? p[2] : p[1]);
  var anio = Number(p[3]) < 100 ? Number(p[3]) + 2000 : Number(p[3]);
  return mes >= 1 && mes <= 12 ? ("0" + mes).slice(-2) + "/" + anio : "";
}

// "AAAA-MM-DD" de la celda de fecha, o "" si no se puede interpretar (mismas reglas de formato que _mesDeFecha).
function _fechaDeFecha(valor, formato, zona) {
  if (valor instanceof Date) {
    return isNaN(valor.getTime()) ? "" : Utilities.formatDate(valor, zona, "yyyy-MM-dd");
  }
  var texto = String(valor == null ? "" : valor).trim();
  var iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return iso[1] + "-" + ("0" + Number(iso[2])).slice(-2) + "-" + ("0" + Number(iso[3])).slice(-2);

  var p = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!p) return "";

  var mes = Number(formato === "dmy" ? p[2] : p[1]);
  var dia = Number(formato === "dmy" ? p[1] : p[2]);
  var anio = Number(p[3]) < 100 ? Number(p[3]) + 2000 : Number(p[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
  return anio + "-" + ("0" + mes).slice(-2) + "-" + ("0" + dia).slice(-2);
}
