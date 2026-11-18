/**
 * Funciones del PORTAL para el Apps Script «Envíos en transmisión» (el que ya tienes publicado). Se pega como un ARCHIVO NUEVO dentro del MISMO proyecto
 * (p. ej. «portal.gs»): no se publica otro script ni cambia la URL. Mira docs/apps-script-envios.md.
 *
 * El script original no tiene autenticación. Estas funciones SÍ: solo responden si llega el token del portal (propiedad PORTAL_TOKEN) y solo las llama la función
 * `envios` de Supabase, que antes valida al usuario y su permiso. Las acciones originales de la página siguen igual (y siguen abiertas, como hoy).
 *
 * Único cambio en el código original (en `despacharRuta`, al final del switch): la rama `default` pasa a delegar en esta función —
 *     default: respuesta = portalDespachar(p);
 * (antes: default: respuesta = { exito: false, mensaje: 'Acción no válida: ' + p.action };). `portalDespachar` devuelve ese mismo mensaje para toda acción que no sea «portal_…».
 *
 * ÚNICA propiedad del script (Configuración del proyecto → Propiedades del script); nunca va en el código ni en el navegador:
 *   PORTAL_TOKEN   secreto largo y aleatorio (≥ 24 caracteres); el MISMO valor que el secret ENVIOS_APPS_TOKEN de Supabase.
 *
 * Los libros de transmisión (URL y pestañas a leer) y el libro histórico YA NO se configuran aquí: los administra un admin desde la app (Administración → Envíos),
 * y la función `envios` se los pasa a este script en cada llamada. Cambiar de mes o agregar un libro no requiere tocar el script.
 *
 * Acciones (por POST, con {token, usuario, action, ...}); las manda la función `envios`, nunca el navegador:
 *   portal_tx_indice     (recibe libros: [{url, pestanas: [..] | null}])   → { exito, indice: { <pedido normalizado>: [{ d: delivery, n: nº transmisión, f: fecha 'dd/mm/aaaa', p: pestaña }] }, revisadas, errores[] }
 *                        «pestanas» null = TODAS las pestañas que tengan «Pedido SAP» y «Delivery» (las de facturación se omiten solas; los meses nuevos entran solos).
 *   portal_tx_historial  (recibe deliverys: [..] e histUrl)                → { exito, historial: { <delivery normalizado>: [{ m: material, l: lote }] } }
 *   portal_tx_pestanas   (recibe url)                                      → { exito, nombre, pestanas: [{ nombre, transmision: bool, filas }] }   (para elegir pestañas en la app)
 *
 * Todos los nombres de este archivo llevan prefijo `portal` / `_portal` / `_p` para no chocar con los del script original.
 */

var PORTAL_HOJA_HIST = 'Envio en transmision';
var PORTAL_CACHE_INDICE = 'portal_tx_indice_v1';
var PORTAL_CACHE_SEG = 300; // el índice se reutiliza 5 min para no releer los libros en cada pantalla

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Entrada (la llama `despacharRuta` en su rama default)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
function portalDespachar(p) {
  var accion = String((p && p.action) || '');
  // Cualquier acción que no sea del portal se responde igual que antes del cambio.
  if (accion.indexOf('portal_') !== 0) return { exito: false, mensaje: 'Acción no válida: ' + accion };
  try {
    if (!_portalTokenValido(p.token)) return { exito: false, mensaje: 'No autorizado.' };
    switch (accion) {
      case 'portal_tx_indice':    return _portalTxIndice(p.libros);
      case 'portal_tx_historial': return _portalTxHistorial(p.deliverys, p.histUrl);
      case 'portal_tx_pestanas':  return _portalTxPestanas(p.url);
      default:                    return { exito: false, mensaje: 'Acción no válida: ' + accion };
    }
  } catch (err) {
    // Mensaje genérico hacia afuera; el detalle queda en el registro de ejecuciones del script.
    console.error(err && err.stack ? err.stack : err);
    return { exito: false, mensaje: _portalMensajePublico(err) };
  }
}

/** Solo se muestran al usuario los errores que escribimos a propósito; cualquier otro (permisos, cuotas, etc.) sale genérico. */
function _portalMensajePublico(err) {
  var m = String((err && err.message) || '');
  return /^\[pub\]/.test(m) ? m.replace(/^\[pub\]\s*/, '') : 'No se pudo completar la operación.';
}
function _portalPub(texto) { return new Error('[pub] ' + texto); }

/** Compara el token sin cortar en el primer carácter distinto (evita pistas por tiempo de respuesta). */
function _portalTokenValido(token) {
  var esperado = PropertiesService.getScriptProperties().getProperty('PORTAL_TOKEN');
  if (!esperado || esperado.length < 24) throw _portalPub('Falta configurar PORTAL_TOKEN en el script (mínimo 24 caracteres).');
  var t = String(token || '');
  var diff = t.length === esperado.length ? 0 : 1;
  for (var i = 0; i < esperado.length; i++) diff |= (t.charCodeAt(i) || 0) ^ esperado.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
function _pNormHeader(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
/** Clave de comparación de pedidos / entregas / materiales: sin espacios, sin ceros a la izquierda, en minúsculas (la misma que usa la app). */
function _pClave(s) { return String(s == null ? '' : s).trim().replace(/^0+/, '').toLowerCase(); }
function _pTxt(s) { return String(s == null ? '' : s).trim(); }
function _pProp(nombre) { return PropertiesService.getScriptProperties().getProperty(nombre) || ''; }

function _pAbrir(url) {
  try { return SpreadsheetApp.openByUrl(url); } catch (e) { return null; }
}

/** Una columna completa (sin el encabezado) como texto visible. */
function _pColumna(hoja, indice0, filas) {
  return hoja.getRange(2, indice0 + 1, filas, 1).getDisplayValues();
}

// Caché por bloques: CacheService limita cada valor a ~100 KB y el índice puede pasarse.
function _pCachePoner(clave, obj, seg) {
  try {
    var c = CacheService.getScriptCache();
    var s = JSON.stringify(obj), n = Math.ceil(s.length / 90000) || 1, m = {};
    m[clave + '_n'] = String(n);
    for (var i = 0; i < n; i++) m[clave + '_' + i] = s.substr(i * 90000, 90000);
    c.putAll(m, seg);
  } catch (e) { /* la caché es una optimización; si falla, se relee */ }
}
function _pCacheLeer(clave) {
  try {
    var c = CacheService.getScriptCache(), n = parseInt(c.get(clave + '_n') || '0', 10);
    if (!n) return null;
    var llaves = [];
    for (var i = 0; i < n; i++) llaves.push(clave + '_' + i);
    var m = c.getAll(llaves), s = '';
    for (var j = 0; j < n; j++) { var t = m[clave + '_' + j]; if (t == null) return null; s += t; }
    return JSON.parse(s);
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// TRANSMISIÓN
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
/** Columnas de una pestaña de transmisión, POR ENCABEZADO (la app original usaba posiciones fijas en una parte y encabezados en otra). `enc` ya viene normalizado.
 *  «#»: algunos meses traen la fecha en la 2.ª columna y el número en la 1.ª (el título de «#» a veces trae errores de captura). */
function _portalTxColumnas(enc) {
  var primero = function (re) { for (var i = 0; i < enc.length; i++) if (re.test(enc[i])) return i; return -1; };
  var c = { fecha: primero(/^fecha t/), pedido: primero(/^pedido sap/), deliv: primero(/^del/) };  // «Delivery» y también «Delviery»
  c.num = c.fecha === 1 ? 0 : primero(/^#$/);
  return c;
}

/** Huella de un texto (MD5 en hexadecimal): la caché del índice se identifica por la configuración de libros/pestañas, así cambiarla desde la app no sirve datos viejos. */
function _pHash(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(texto)).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Pestañas de un libro de Google Sheets (para que un administrador elija cuáles leer desde la app). `transmision` = tiene «Pedido SAP» y «Delivery»; las demás
 *  (facturación, notas…) se muestran pero no se marcan. */
function _portalTxPestanas(url) {
  var libro = _pAbrir(String(url || ''));
  if (!libro) throw _portalPub('No se pudo abrir el libro. Comparte el libro con la cuenta dueña del script y revisa la URL.');
  var pestanas = libro.getSheets().map(function (h) {
    var lc = h.getLastColumn(), lr = h.getLastRow();
    var enc = lc > 0 && lr >= 1 ? h.getRange(1, 1, 1, lc).getDisplayValues()[0].map(_pNormHeader) : [];
    var c = _portalTxColumnas(enc);
    return { nombre: h.getName(), transmision: c.pedido >= 0 && c.deliv >= 0, filas: Math.max(lr - 1, 0) };
  });
  return { exito: true, nombre: libro.getName(), pestanas: pestanas };
}

/** Índice de pedidos en transmisión: pedido normalizado → [{ d, n, f, p }]. Sin razón social ni importes (solo lo que Seg. de pedidos necesita para marcar).
 *  `libros` viene de la app (Administración → Envíos): [{ url, pestanas: [..] | null }]; null = todas las pestañas de transmisión. */
function _portalTxIndice(libros) {
  if (!Array.isArray(libros) || !libros.length) throw _portalPub('Transmisión sin configurar: agrega los libros en Administración → Envíos.');
  libros = libros.filter(function (l) { return l && l.url; });
  var claveCache = PORTAL_CACHE_INDICE + '_' + _pHash(JSON.stringify(libros));
  var guardado = _pCacheLeer(claveCache);
  if (guardado) { guardado.deCache = true; guardado.exito = true; return guardado; }

  var indice = {}, revisadas = 0, errores = [];
  libros.forEach(function (l) {
    var libro = _pAbrir(l.url);
    if (!libro) { errores.push('No se pudo abrir un libro de transmisión.'); return; }
    var permitidas = null;
    if (Array.isArray(l.pestanas) && l.pestanas.length) { permitidas = {}; l.pestanas.forEach(function (n) { permitidas[String(n)] = true; }); }

    libro.getSheets().forEach(function (h) {
      var nombre = h.getName(), lc = h.getLastColumn(), lr = h.getLastRow();
      if ((permitidas && !permitidas[nombre]) || lc < 5 || lr < 2) return;
      var enc = h.getRange(1, 1, 1, lc).getDisplayValues()[0].map(_pNormHeader);
      var c = _portalTxColumnas(enc);
      if (c.pedido < 0 || c.deliv < 0) return;          // no es una pestaña de transmisión (p. ej. facturación)
      revisadas++;

      var filas = lr - 1;
      var ped = _pColumna(h, c.pedido, filas), del = _pColumna(h, c.deliv, filas);
      var fec = c.fecha >= 0 ? _pColumna(h, c.fecha, filas) : null;
      var num = c.num >= 0 ? _pColumna(h, c.num, filas) : null;
      for (var i = 0; i < filas; i++) {
        var k = _pClave(ped[i][0]), d = _pTxt(del[i][0]);
        if (!k || !d) continue;
        var lista = indice[k] || (indice[k] = []);
        if (lista.some(function (x) { return x.d === d; })) continue;     // una entrega, una vez por pedido
        lista.push({ d: d, n: num ? _pTxt(num[i][0]) : '', f: fec ? _pTxt(fec[i][0]) : '', p: nombre });
      }
    });
  });

  var r = { exito: true, indice: indice, revisadas: revisadas, errores: errores, generadoEn: new Date().toISOString(), deCache: false };
  if (!errores.length) _pCachePoner(claveCache, r, PORTAL_CACHE_SEG);   // un resultado parcial no se guarda
  return r;
}

/** Del histórico «Envio en transmision»: material y lote de cada entrega pedida. Es lo ÚNICO que permite decir qué materiales van en una entrega en transmisión
 *  (las pestañas de transmisión no traen material). */
function _portalTxHistorial(deliverys, histUrl) {
  if (!Array.isArray(deliverys) || !deliverys.length) throw _portalPub('Faltan las entregas.');
  var buscadas = {};
  deliverys.slice(0, 3000).forEach(function (d) { var k = _pClave(d); if (k) buscadas[k] = true; });

  var url = String(histUrl || '');
  if (!url) throw _portalPub('Falta el libro histórico: agrégalo en Administración → Envíos.');
  var libro = _pAbrir(url);
  if (!libro) throw _portalPub('No se pudo abrir el libro histórico.');
  var h = libro.getSheetByName(PORTAL_HOJA_HIST);
  var out = {};
  if (!h || h.getLastRow() < 2) return { exito: true, historial: out };

  var lc = h.getLastColumn(), lr = h.getLastRow();
  var enc = h.getRange(1, 1, 1, lc).getDisplayValues()[0].map(_pNormHeader);
  var ixDel = enc.findIndex(function (x) { return /^deliver|^entrega/.test(x); });
  var ixMat = enc.indexOf('material');
  var ixLote = enc.indexOf('lote');
  if (ixDel < 0 || ixMat < 0) throw _portalPub('El histórico no trae las columnas Deliverys y Material.');

  var filas = lr - 1;
  var del = _pColumna(h, ixDel, filas), mat = _pColumna(h, ixMat, filas), lote = ixLote >= 0 ? _pColumna(h, ixLote, filas) : null;
  for (var i = 0; i < filas; i++) {
    var k = _pClave(del[i][0]);
    if (!k || !buscadas[k]) continue;
    var m = _pTxt(mat[i][0]);
    if (!m) continue;
    var l = lote ? _pTxt(lote[i][0]) : '';
    var lista = out[k] || (out[k] = []);
    if (!lista.some(function (x) { return x.m === m && x.l === l; })) lista.push({ m: m, l: l });
  }
  return { exito: true, historial: out };
}
