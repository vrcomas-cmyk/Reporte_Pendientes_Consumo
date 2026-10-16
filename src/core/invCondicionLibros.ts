// ---------------------------------------------------------------------------
// invCondicionLibros.ts · Módulo "Inv con Condición" armado desde el libro Inv_Condicion de Google Sheets (hojas
// Corta caducidad, Revision, Sustituto y PNC) y Disponibilidad. Puro: sin React, sin red, sin disco. Solo
// clasificaciones y relaciones por material/centro — sin motor de cálculo tipo sugeridor.
//
// Una fila (`InvConsolidadoRow`) por MATERIAL × CONDICIÓN:
//   · Corta caducidad → hoja de LOTES (todos los lotes de todos los centros/almacenes). Un lote lo es si
//                       Libre utilización ≥ 1 y (almacén 1032 y/o vigencia ≤ 12 meses calendario). El inventario
//                       por centro es la suma de Libre utilización de esos lotes, esté en el almacén que esté.
//   · Revision        → UNA fila por material con sus N Status juntos ("Liz/Lento mov"); inventario por centro = Libre real
//                       (Libre utilización − Entrega a cliente) de Disponibilidad en 1030+1031+1060.
//   · Sustituto       → NO genera filas: es una relación material → sustituto (`sustituciones`) que se muestra en el detalle.
//   · PNC             → material de la hoja PNC (a menudo fuera de sistema): inventario = Cantidad de la hoja.
// Los lotes con Libre = 0 pero Bloqueado ≥ 1 no se descartan (`lotesBloqueados`) para mostrarlos después como
// opción en el detalle de Inventario · Disponibilidad.
// ---------------------------------------------------------------------------
import { ALMACEN_CORTA_CADUCIDAD, libreReal, MESES_MAX_CORTA_CADUCIDAD } from './inventoryRules';
import { claveMaterial, formatearFecha, indiceColumna, inicioDeDia, normalizarEncabezado, detectarOrdenFechas, numero, parsearFechaSheet, sumarMeses, type HojaIndexada } from './pedidos';
import { CENTERS, type InvConsolidadoRow, type InvDetalleRow } from './types';

export type MotivoLote = 'VIGENCIA' | 'ALMACEN_1032' | 'AMBOS';

export const CONDICION_CORTA_CADUCIDAD = 'Corta caducidad';
export const CONDICION_PNC = 'PNC';
/** Almacenes cuyo inventario cuenta para Revision y Sustituto (como en el sugeridor). */
const ALMACENES_NORMAL = ['1030', '1031', '1060'];
/** Centros del libro de Disponibilidad: los de CENTERS más el 1031 (que no es columna de las tablas). */
const CENTROS_LIBROS = [...CENTERS, '1031'];

/** Inventario de un material en un centro/almacén. */
export interface InvAlmacenCentro { centro: string; almacen: string; cantidad: number }

/** Columnas de la hoja PNC que se muestran al ver sus lotes (en este orden; las que la hoja no traiga se omiten). */
export const COLUMNAS_PNC = ['Centro', 'Almacén', 'Material', 'Texto breve de material', 'Cantidad Inicial', 'Lote', 'UM', 'Caducidad', 'UBICACIÓN', 'Descontar', 'Cantidad', 'Condicion'];

/** Lotes de una condición distinta de Corta caducidad (hoy PNC), con las columnas tal como las trae su hoja. */
export interface DetalleLotesCondicion {
  columnas: string[];
  filas: { material: string; centro: string; celdas: string[] }[];
}

/** Un lote de la hoja "Corta caducidad" (que trae TODOS los lotes, no solo los de corta caducidad). */
export interface LoteCondicion {
  material: string;
  textoBreve: string;
  centro: string;
  almacen: string;
  lote: string;
  /** `aaaa-mm-dd`, o `null` si la celda no es una fecha. */
  fechaCaducidad: string | null;
  fecha: Date | null;
  /** Libre utilización del lote. */
  libre: number;
  transito: number;
  bloqueado: number;
  /** Por qué es corta caducidad; `null` si no lo es. */
  motivo: MotivoLote | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDe = (f: Date | null): string | null => (f ? `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}` : null);

/** Regla de corta caducidad por LOTE: Libre utilización ≥ 1 y (almacén 1032 y/o vigencia ≤ 12 meses calendario,
 * igual que `_filtrar_corta_caducidad` del sugeridor). Un lote en 1030 con <12 m lo es; uno en 1032 con 30 m también. */
export function clasificarLote(l: { libre: number; almacen: string; fecha: Date | null }, hoy: Date = new Date()): MotivoLote | null {
  if (l.libre < 1) return null;
  const limite = sumarMeses(inicioDeDia(hoy), MESES_MAX_CORTA_CADUCIDAD);
  const porVigencia = l.fecha !== null && l.fecha.getTime() <= limite.getTime();
  const porAlmacen = l.almacen === ALMACEN_CORTA_CADUCIDAD;
  if (porVigencia && porAlmacen) return 'AMBOS';
  if (porVigencia) return 'VIGENCIA';
  return porAlmacen ? 'ALMACEN_1032' : null;
}

/** Todos los lotes de la hoja "Corta caducidad", cada uno con su clasificación. Nada se descarta. */
export function parsearLotes(h: HojaIndexada, hoy: Date = new Date()): LoteCondicion[] {
  const n = h.nombres;
  const [iCentro, iAlm, iLote, iFecha, iLibre, iTransito, iBloq, iTexto] = [
    indiceColumna(n, ['centro']), indiceColumna(n, ['almacen']), indiceColumna(n, ['lote']),
    indiceColumna(n, ['fecaduc/feprefercons', 'fecha caducidad', 'caducidad']), indiceColumna(n, ['libre utilizacion']),
    indiceColumna(n, ['trans./trasl.', 'trasl']), indiceColumna(n, ['bloqueado']), indiceColumna(n, ['texto breve de material', 'texto breve']),
  ];
  const orden = detectarOrdenFechas(h.rows.map((f) => f[iFecha]));
  return h.rows.flatMap((f) => {
    const material = claveMaterial(f[h.idxMaterial]);
    if (!material) return [];
    const fecha = parsearFechaSheet(f[iFecha], orden);
    const lote: LoteCondicion = {
      material,
      textoBreve: String(f[iTexto] ?? '').trim(),
      centro: claveMaterial(f[iCentro]),
      almacen: claveMaterial(f[iAlm]),
      lote: String(f[iLote] ?? '').trim(),
      fechaCaducidad: isoDe(fecha),
      fecha,
      libre: numero(f[iLibre]),
      transito: numero(f[iTransito]),
      bloqueado: numero(f[iBloq]),
      motivo: null,
    };
    lote.motivo = clasificarLote(lote, hoy);
    return [lote];
  });
}

/** Lotes sin inventario libre pero bloqueados (Bloqueado ≥ 1): no son corta caducidad, pero se conservan para
 * mostrarlos más adelante como opción en el detalle de Inventario · Disponibilidad. */
export const lotesBloqueados = (lotes: LoteCondicion[]): LoteCondicion[] => lotes.filter((l) => l.libre < 1 && l.bloqueado >= 1);

/** Lotes de corta caducidad con la forma de `InvDetalleRow` (para "Lotes por vencer" y los paneles). */
export function lotesDeCondicion(lotes: LoteCondicion[]): InvDetalleRow[] {
  return lotes
    .filter((l) => l.motivo !== null)
    .map((l) => ({ material: l.material, textoBreve: l.textoBreve, centro: l.centro, almacen: l.almacen, lote: l.lote, fechaCaducidad: l.fechaCaducidad, cantidadDisp: l.libre }));
}

// ---------------------------------------------------------------------------
// Filas por material × condición
// ---------------------------------------------------------------------------

export interface OpcionesFilas {
  hoy?: Date;
  /** Datos del catálogo, si están disponibles (si no, las filas quedan sin sector/grupo/precio). */
  sectorDe?: (material: string) => string;
  grupoDe?: (material: string) => string;
  precioDe?: (material: string) => number;
}

/** Libre real y tránsito de Disponibilidad por material|centro|almacén. */
function indexarDisponibilidad(h: HojaIndexada | undefined): { libre: Map<string, number>; transito: Map<string, number>; libreMaterial: Map<string, number> } {
  const libre = new Map<string, number>();
  const transito = new Map<string, number>();
  /** Libre real 1030+1031+1060 de un material sumando TODOS los centros (también el 1031). */
  const libreMaterial = new Map<string, number>();
  if (!h) return { libre, transito, libreMaterial };
  const [iCentro, iAlm, iLibre, iEntrega, iTransito] = [
    indiceColumna(h.nombres, ['centro']), indiceColumna(h.nombres, ['almacen']), indiceColumna(h.nombres, ['libre utilizacion']),
    indiceColumna(h.nombres, ['entrega a cliente']), indiceColumna(h.nombres, ['cant. en transito', 'transito']),
  ];
  for (const f of h.rows) {
    const k = `${claveMaterial(f[h.idxMaterial])}|${claveMaterial(f[iCentro])}|${claveMaterial(f[iAlm])}`;
    libre.set(k, (libre.get(k) ?? 0) + libreReal(numero(f[iLibre]), numero(f[iEntrega])));
    transito.set(k, (transito.get(k) ?? 0) + numero(f[iTransito]));
    const alm = claveMaterial(f[iAlm]);
    if (ALMACENES_NORMAL.includes(alm)) {
      const m = claveMaterial(f[h.idxMaterial]);
      libreMaterial.set(m, (libreMaterial.get(m) ?? 0) + libreReal(numero(f[iLibre]), numero(f[iEntrega])));
    }
  }
  return { libre, transito, libreMaterial };
}

const sumaAlmacenes = (m: Map<string, number>, material: string, centro: string): number =>
  ALMACENES_NORMAL.reduce((s, a) => s + (m.get(`${material}|${centro}|${a}`) ?? 0), 0);

const vacioPorCentro = (): Record<string, number> => Object.fromEntries(CENTERS.map((c) => [c, 0]));

function armarFila(
  condicion: string,
  material: string,
  textoBreve: string,
  invByCenter: Record<string, number>,
  transitoByCenter: Record<string, number>,
  disponible31_30: number,
  disponible31_32: number,
  o: OpcionesFilas,
  detalle = '',
  invTotal?: number,
): InvConsolidadoRow {
  const invSuma = CENTERS.reduce((s, c) => s + (invByCenter[c] ?? 0), 0);
  const precio = o.precioDe?.(material) ?? 0;
  return {
    sector: o.sectorDe?.(material) ?? '',
    grupo: o.grupoDe?.(material) ?? '',
    condicion,
    ...(detalle ? { detalle } : {}),
    ...(invTotal !== undefined ? { invTotal } : {}),
    material,
    textoBreve,
    disponible31_30,
    disponible31_32,
    invByCenter,
    transitoByCenter,
    invSuma,
    precioOferta: precio,
    importeInventario: precio * invSuma,
  };
}

/** Una fila por material × condición con el inventario por centro; ver el encabezado del archivo. */
export function filasInvCondicion(hojas: HojaIndexada[], o: OpcionesFilas = {}): { filas: InvConsolidadoRow[]; lotes: LoteCondicion[]; detalle: Record<string, DetalleLotesCondicion>; sustituciones: Sustitucion[]; invRevision: Record<string, InvAlmacenCentro[]> } {
  const hoy = o.hoy ?? new Date();
  const hoja = (nombre: string) => hojas.find((h) => h.libro === 'condicion' && h.hoja === nombre);
  const dispo = hojas.find((h) => h.libro === 'disponibilidad');
  const { libre, transito, libreMaterial } = indexarDisponibilidad(dispo);
  const filas: InvConsolidadoRow[] = [];
  const detalle: Record<string, DetalleLotesCondicion> = {};
  /** Libre real por centro/almacén (1030/1031/1060, incluido el centro 1031) de los materiales en Revision. */
  const invRevision: Record<string, InvAlmacenCentro[]> = {};

  // --- Corta caducidad: lotes clasificados, inventario = suma de Libre utilización por centro -----------------
  const hojaLotes = hoja('Corta caducidad');
  const lotes = hojaLotes ? parsearLotes(hojaLotes, hoy) : [];
  const porMaterial = new Map<string, LoteCondicion[]>();
  for (const l of lotes) if (l.motivo) porMaterial.set(l.material, [...(porMaterial.get(l.material) ?? []), l]);
  for (const [material, ls] of porMaterial) {
    const inv = vacioPorCentro();
    const tr = vacioPorCentro();
    let disp31_32 = 0;
    let total = 0;
    for (const l of ls) {
      total += l.libre; // todos los centros y almacenes, también el centro 1031
      if (l.centro in inv) { inv[l.centro] = (inv[l.centro] ?? 0) + l.libre; tr[l.centro] = (tr[l.centro] ?? 0) + l.transito; }
      if (l.centro === '1031') disp31_32 += l.libre;
    }
    filas.push(armarFila(CONDICION_CORTA_CADUCIDAD, material, ls.find((l) => l.textoBreve)?.textoBreve ?? '', inv, tr, 0, disp31_32, o, '', total));
  }

  // --- Revision: una fila por material con sus Status juntos; Libre real 1030+1031+1060 ---------------------------
  const hojaRev = hoja('Revision');
  if (hojaRev) {
    const iStatus = indiceColumna(hojaRev.nombres, ['status', 'estatus', 'estado']);
    const iTexto = indiceColumna(hojaRev.nombres, ['texto breve de material', 'texto breve', 'descripcion']);
    for (const [material, fs] of hojaRev.indice) {
      const statuses = [...new Set(fs.map((f) => String(f[iStatus] ?? '').trim()).filter(Boolean))];
      const inv = vacioPorCentro();
      const tr = vacioPorCentro();
      for (const c of CENTERS) { inv[c] = sumaAlmacenes(libre, material, c); tr[c] = sumaAlmacenes(transito, material, c); }
      const texto = fs.map((f) => String(f[iTexto] ?? '').trim()).find(Boolean) ?? '';
      invRevision[material] = CENTROS_LIBROS.flatMap((c) => ALMACENES_NORMAL.map((al) => ({ centro: c, almacen: al, cantidad: libre.get(`${material}|${c}|${al}`) ?? 0 }))).filter((x) => x.cantidad > 0);
      filas.push(armarFila(statuses.length ? statuses.join('/') : '(sin status)', material, texto, inv, tr, libre.get(`${material}|1031|1030`) ?? 0, 0, o, '', libreMaterial.get(material) ?? 0));
    }
  }

  // --- Sustituto: NO es una fila; es una relación material → sustituto (1:1) con el inventario del sustituto ---------
  const sustituciones: Sustitucion[] = [];
  const hojaSust = hoja('Sustituto');
  if (hojaSust && hojaSust.idxSustituto !== -1) {
    const iTexto = indiceColumna(hojaSust.nombres, ['texto material']);
    const iTextoSust = indiceColumna(hojaSust.nombres, ['texto material sustituto']);
    for (const f of hojaSust.rows) {
      const material = claveMaterial(f[hojaSust.idxMaterial]);
      const sustituto = claveMaterial(f[hojaSust.idxSustituto]);
      if (!material || !sustituto || material === sustituto) continue; // un material no es sustituto de sí mismo
      const inv = vacioPorCentro();
      const tr = vacioPorCentro();
      for (const c of CENTERS) { inv[c] = sumaAlmacenes(libre, sustituto, c); tr[c] = sumaAlmacenes(transito, sustituto, c); }
      const invOrig = vacioPorCentro();
      for (const c of CENTERS) invOrig[c] = sumaAlmacenes(libre, material, c);
      sustituciones.push({ material, textoMaterial: String(f[iTexto] ?? '').trim(), sustituto, textoSustituto: String(f[iTextoSust] ?? '').trim(), invByCenter: inv, transitoByCenter: tr, invTotal: libreMaterial.get(sustituto) ?? 0, invByCenterMaterial: invOrig, invTotalMaterial: libreMaterial.get(material) ?? 0 });
    }
  }

  // --- PNC: inventario = Cantidad de la hoja (cualquier almacén); el centro 1031 va a Disp 31·32 --------------------------------------------------------------
  const hojaPnc = hoja('PNC');
  if (hojaPnc) {
    const [iCentro, iCant, iCond, iTexto] = [
      indiceColumna(hojaPnc.nombres, ['centro']), indiceColumna(hojaPnc.nombres, ['cantidad']),
      indiceColumna(hojaPnc.nombres, ['condicion']), indiceColumna(hojaPnc.nombres, ['texto breve de material', 'texto breve']),
    ];
    for (const [material, fs] of hojaPnc.indice) {
      const inv = vacioPorCentro();
      // PNC: el material puede estar en CUALQUIER almacén, así que NO se aplican las reglas de almacén (1030/1031/1032/1060): el
      // inventario es la Cantidad de la hoja. Lo del centro 1031 (que no es una columna por centro) va a "Disp 31·32".
      let disp31_32 = 0;
      let total = 0;
      for (const f of fs) {
        const c = claveMaterial(f[iCentro]);
        const cant = numero(f[iCant]);
        total += cant;
        if (c in inv) inv[c] = (inv[c] ?? 0) + cant;
        if (c === '1031') disp31_32 += cant;
      }
      const motivos = [...new Set(fs.map((f) => String(f[iCond] ?? '').trim()).filter(Boolean))];
      const texto = fs.map((f) => String(f[iTexto] ?? '').trim()).find(Boolean) ?? '';
      // La condición (motivo del PNC) va APARTE: en `detalle`, no pegada al material y su descripción.
      filas.push(armarFila(CONDICION_PNC, material, texto, inv, vacioPorCentro(), 0, disp31_32, o, motivos.join(', '), total));
    }

    // Lotes del PNC con sus columnas (Centro, Almacén, Material, Texto breve, Cantidad Inicial, Lote, UM, Caducidad, UBICACIÓN,
    // Descontar, Cantidad, Condicion) para verlos al dar clic en el inventario de un PNC.
    const cols = COLUMNAS_PNC.map((c) => ({ c, i: hojaPnc.nombres.indexOf(normalizarEncabezado(c)) })).filter((x) => x.i !== -1);
    const iCad = cols.find((x) => x.c === 'Caducidad')?.i ?? -1;
    const ordenPnc = detectarOrdenFechas(hojaPnc.rows.map((f) => f[iCad]));
    detalle[CONDICION_PNC] = {
      columnas: cols.map((x) => x.c),
      filas: hojaPnc.rows.flatMap((f) => {
        const material = claveMaterial(f[hojaPnc.idxMaterial]);
        if (!material) return [];
        const celdas = cols.map(({ c, i }) => (c === 'Caducidad' ? formatearFecha(parsearFechaSheet(f[i], ordenPnc)) || String(f[i] ?? '').trim() : String(f[i] ?? '').trim()));
        return [{ material, centro: claveMaterial(f[iCentro]), celdas }];
      }),
    };
  }

  filas.sort((a, b) => a.condicion.localeCompare(b.condicion, 'es') || a.material.localeCompare(b.material, 'es', { numeric: true }));
  return { filas, lotes, detalle, sustituciones, invRevision };
}

/** Relación 1:1 de la hoja Sustituto; el inventario es el del SUSTITUTO (Libre real 1030+1031+1060). */
export interface Sustitucion {
  material: string;
  textoMaterial: string;
  sustituto: string;
  textoSustituto: string;
  invByCenter: Record<string, number>;
  transitoByCenter: Record<string, number>;
  /** Libre real 1030+1031+1060 del sustituto en TODOS los centros (incluido el 1031). */
  invTotal: number;
  /** Lo mismo del material ORIGINAL (la relación es bilateral: el sustituto también puede ofrecerse en cambio del original). */
  invByCenterMaterial: Record<string, number>;
  invTotalMaterial: number;
}

/** Una condición (fuente) de un material ofertable, con su inventario por centro. */
export interface FuenteOferta {
  /** 'Sustituto', 'Corta caducidad', los Status de Revision (unidos) o 'PNC'. */
  tipo: string;
  detalle?: string;
  invByCenter: Record<string, number>;
  invSuma: number;
}

/** Un material ofertable; si tiene más de una condición se identifican juntas (p. ej. "Sustituto/Corta caducidad"). */
export interface OpcionOferta {
  material: string;
  textoBreve: string;
  tipo: string;
  fuentes: FuenteOferta[];
  /** Suma general (1030+1031+1060) de Sustituto/Revision; si solo tiene otras condiciones, la de esas. */
  invSuma: number;
  tieneCortaCaducidad: boolean;
}

/** Materiales ofertables en cambio de `material`: el sustituto, más el propio material (y el sustituto) bajo otras condiciones. Uno por material. */
export function opcionesDeOferta(material: string, filas: InvConsolidadoRow[], sustituciones: Sustitucion[]): OpcionOferta[] {
  const m = claveMaterial(material);
  const porMaterial = new Map<string, { texto: string; fuentes: FuenteOferta[] }>();
  const agregar = (mat: string, texto: string, f: FuenteOferta) => {
    const e = porMaterial.get(mat) ?? { texto, fuentes: [] };
    if (!e.texto) e.texto = texto;
    e.fuentes.push(f);
    porMaterial.set(mat, e);
  };
  const deFila = (f: InvConsolidadoRow): FuenteOferta => ({ tipo: f.condicion, ...(f.detalle ? { detalle: f.detalle } : {}), invByCenter: f.invByCenter, invSuma: f.invTotal ?? f.invSuma });
  // Relación bilateral: el material se sustituye por su "Material sustituto" y este por el "Material".
  const vistos = new Set<string>();
  for (const s of sustituciones) {
    const otro = s.material === m ? s.sustituto : s.sustituto === m ? s.material : '';
    if (!otro || otro === m || vistos.has(otro)) continue;
    vistos.add(otro);
    if (s.material === m) {
      agregar(s.sustituto, s.textoSustituto, { tipo: 'Sustituto', invByCenter: s.invByCenter, invSuma: s.invTotal });
      for (const f of filas) if (f.material === s.sustituto) agregar(f.material, f.textoBreve, deFila(f));
    } else if (s.sustituto === m) {
      agregar(s.material, s.textoMaterial, { tipo: 'Sustituto', invByCenter: s.invByCenterMaterial, invSuma: s.invTotalMaterial });
      for (const f of filas) if (f.material === s.material) agregar(f.material, f.textoBreve, deFila(f));
    }
  }
  for (const f of filas) if (f.material === m) agregar(f.material, f.textoBreve, deFila(f));
  return [...porMaterial].map(([mat, e]) => {
    const general = e.fuentes.filter((f) => f.tipo !== CONDICION_CORTA_CADUCIDAD);
    return {
      material: mat, textoBreve: e.texto, tipo: e.fuentes.map((f) => f.tipo).join('/'), fuentes: e.fuentes,
      invSuma: (general.length ? general : e.fuentes).reduce((a, f) => a + f.invSuma, 0),
      tieneCortaCaducidad: e.fuentes.some((f) => f.tipo === CONDICION_CORTA_CADUCIDAD),
    };
  });
}

/** Material → texto de su condición Revision (los Status unidos con "/", p. ej. "Liz/Lento mov"). Solo los materiales que están en la pestaña
 * Revision: Corta caducidad y PNC son otras condiciones y NO cuentan. */
export function indiceRevision(filas: readonly InvConsolidadoRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of filas) {
    if (f.condicion === CONDICION_CORTA_CADUCIDAD || f.condicion === CONDICION_PNC) continue;
    if (!m.has(f.material)) m.set(f.material, f.condicion);
  }
  return m;
}

/** Lo que hace OFERTABLE a un material en Seg. de pedidos: lotes de Corta caducidad con existencia, estar en la pestaña Revision o tener un
 * sustituto con inventario. Se arma UNA vez (índices por material); la tabla principal y el detalle del pedido usan el mismo criterio. */
export interface LotePnc { centro: string; cantidad: number }

export interface ContextoOfertables {
  lotes: Map<string, InvDetalleRow[]>;
  /** Lotes en PNC por material (con su centro: respetan "Considerar centros"). */
  pnc: Map<string, LotePnc[]>;
  revision: Map<string, string>;
  sustitutos: Map<string, RelSustituto[]>;
}

/** Lotes de la hoja PNC con existencia, por material (columnas `Cantidad`; el centro viene en cada fila). */
export function lotesPncPorMaterial(detalle: DetalleLotesCondicion | undefined): Map<string, LotePnc[]> {
  const m = new Map<string, LotePnc[]>();
  const iCant = detalle?.columnas.indexOf('Cantidad') ?? -1;
  if (!detalle || iCant < 0) return m;
  for (const f of detalle.filas) {
    const cantidad = numero(f.celdas[iCant] ?? '');
    if (!(cantidad > 0)) continue;
    const material = claveMaterial(f.material);
    const lista = m.get(material);
    const lote = { centro: f.centro, cantidad };
    if (lista) lista.push(lote); else m.set(material, [lote]);
  }
  return m;
}

export function contextoOfertables(lotesCorta: readonly InvDetalleRow[], revision: Map<string, string>, sustituciones: Sustitucion[], detallePnc?: DetalleLotesCondicion): ContextoOfertables {
  const lotes = new Map<string, InvDetalleRow[]>();
  for (const l of lotesCorta) {
    if (!(l.cantidadDisp > 0)) continue;
    const m = claveMaterial(l.material);
    const lista = lotes.get(m);
    if (lista) lista.push(l); else lotes.set(m, [l]);
  }
  return { lotes, pnc: lotesPncPorMaterial(detallePnc), revision, sustitutos: indiceSustitutos(sustituciones) };
}

export interface Ofertable {
  /** Lotes de Corta caducidad con existencia que pasan el filtro de centros. */
  corta: { n: number; cantidad: number };
  /** Lotes en PNC con existencia que pasan el filtro de centros. */
  pnc: { n: number; cantidad: number };
  /** Status de la pestaña Revision ("Liz/Lento mov") o ''. */
  revision: string;
  /** Sustitutos con inventario. */
  sustitutos: number;
  tiene: boolean;
}

/** `pasaCentro`: el mismo filtro "Considerar centros" del detalle (siempre pasan el centro del pedido y los lotes sin centro). */
export function ofertablesDeMaterial(material: string, ctx: ContextoOfertables, pasaCentro: (centro: string) => boolean): Ofertable {
  const m = claveMaterial(material);
  let n = 0;
  let cantidad = 0;
  for (const l of ctx.lotes.get(m) ?? []) {
    if (!pasaCentro(l.centro)) continue;
    n++;
    cantidad += l.cantidadDisp;
  }
  let nPnc = 0;
  let cantPnc = 0;
  for (const l of ctx.pnc.get(m) ?? []) {
    if (!pasaCentro(l.centro)) continue;
    nPnc++;
    cantPnc += l.cantidad;
  }
  const revision = ctx.revision.get(m) ?? '';
  const sustitutos = (ctx.sustitutos.get(m) ?? []).filter((s) => s.invTotal > 0).length;
  return { corta: { n, cantidad }, pnc: { n: nPnc, cantidad: cantPnc }, revision, sustitutos, tiene: n > 0 || nPnc > 0 || !!revision || sustitutos > 0 };
}

/** Explicación corta de por qué es ofertable (para títulos y exportación). */
export function textoOfertable(o: Ofertable): string {
  const p: string[] = [];
  if (o.corta.n) p.push(`Corta caducidad (${o.corta.n} lote${o.corta.n === 1 ? '' : 's'})`);
  if (o.pnc.n) p.push(`PNC (${o.pnc.n} lote${o.pnc.n === 1 ? '' : 's'})`);
  if (o.revision) p.push(`Revisión: ${o.revision}`);
  if (o.sustitutos) p.push(`Sustituto (${o.sustitutos})`);
  return p.join(' · ');
}

/** Un material relacionado por la hoja Sustituto, con su inventario (1030+1031+1060, todos los centros). */
export interface RelSustituto { material: string; texto: string; invTotal: number }

/** Índice SIMÉTRICO por pares: cada renglón A=B vale en ambos sentidos (A tiene a B y B tiene a A); no es transitivo
 * (si A=B y A=C, B y C NO son sustitutos entre sí). Sin duplicados ni auto-relaciones. */
export function indiceSustitutos(sustituciones: Sustitucion[]): Map<string, RelSustituto[]> {
  const m = new Map<string, RelSustituto[]>();
  const poner = (de: string, r: RelSustituto) => {
    const l = m.get(de) ?? [];
    if (!l.some((x) => x.material === r.material)) l.push(r);
    m.set(de, l);
  };
  for (const s of sustituciones) {
    if (s.material === s.sustituto) continue;
    poner(s.material, { material: s.sustituto, texto: s.textoSustituto, invTotal: s.invTotal });
    poner(s.sustituto, { material: s.material, texto: s.textoMaterial, invTotal: s.invTotalMaterial });
  }
  return m;
}

/** Una fila del desglose de un material: una por lote/centro/condición. */
export interface FilaCondicionMaterial {
  condicion: string;
  centro: string;
  almacen: string;
  lote: string;
  /** ISO yyyy-mm-dd o ''. */
  caducidad: string;
  cantidad: number;
  detalle: string;
  /** Solo en Sustituto: el material sustituto. */
  relacionado?: { material: string; texto: string };
}

const ORDEN_CONDICION = [CONDICION_CORTA_CADUCIDAD, CONDICION_PNC];

/** dd/mm/aaaa (como sale en el detalle de PNC) → ISO; otra cosa → ''. */
const isoDeDmy = (s: string): string => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : '';
};

/** Desglose de UN material con todas sus condiciones, una fila por lote/centro/condición: Corta caducidad (lotes), PNC (lotes con su
 * condición), Revision (centro/almacén con su Status) y Sustituto (el material sustituto). */
export function condicionesDeMaterial(
  material: string,
  d: {
    filas: InvConsolidadoRow[];
    lotes: { material: string; centro: string; almacen: string; lote: string; fechaCaducidad: string | null; cantidadDisp: number }[];
    detalle: Record<string, DetalleLotesCondicion>;
    sustituciones: Sustitucion[];
    invRevision: Record<string, InvAlmacenCentro[]>;
  },
): FilaCondicionMaterial[] {
  const m = claveMaterial(material);
  const out: FilaCondicionMaterial[] = [];
  for (const l of d.lotes) {
    if (l.material !== m) continue;
    out.push({ condicion: CONDICION_CORTA_CADUCIDAD, centro: l.centro, almacen: l.almacen, lote: l.lote, caducidad: l.fechaCaducidad ?? '', cantidad: l.cantidadDisp, detalle: '' });
  }
  const pnc = d.detalle[CONDICION_PNC];
  if (pnc) {
    const ix = (c: string) => pnc.columnas.indexOf(c);
    const [iCen, iAlm, iLote, iCad, iCant, iCond] = ['Centro', 'Almacén', 'Lote', 'Caducidad', 'Cantidad', 'Condicion'].map(ix);
    const celda = (cs: string[], i: number | undefined) => (i === undefined || i < 0 ? '' : cs[i] ?? '');
    for (const f of pnc.filas) {
      if (f.material !== m) continue;
      const cond = celda(f.celdas, iCond);
      out.push({
        condicion: CONDICION_PNC, centro: celda(f.celdas, iCen), almacen: celda(f.celdas, iAlm), lote: celda(f.celdas, iLote),
        caducidad: isoDeDmy(celda(f.celdas, iCad)), cantidad: numero(celda(f.celdas, iCant)), detalle: cond,
      });
    }
  }
  const rev = d.filas.find((f) => f.material === m && f.condicion !== CONDICION_CORTA_CADUCIDAD && f.condicion !== CONDICION_PNC);
  if (rev) {
    for (const x of d.invRevision[m] ?? []) out.push({ condicion: rev.condicion, centro: x.centro, almacen: x.almacen, lote: '', caducidad: '', cantidad: x.cantidad, detalle: '' });
  }
  const vistosSust = new Set<string>();
  for (const s of d.sustituciones) {
    const otro = s.material === m ? s.sustituto : s.sustituto === m ? s.material : '';
    if (!otro || otro === m || vistosSust.has(otro)) continue;
    vistosSust.add(otro);
    if (s.material === m) out.push({ condicion: 'Sustituto', centro: '', almacen: '', lote: '', caducidad: '', cantidad: s.invTotal, detalle: '', relacionado: { material: s.sustituto, texto: s.textoSustituto } });
    else if (s.sustituto === m) out.push({ condicion: 'Sustituto', centro: '', almacen: '', lote: '', caducidad: '', cantidad: s.invTotalMaterial, detalle: '', relacionado: { material: s.material, texto: s.textoMaterial } });
  }
  const rango = (c: string) => { const i = ORDEN_CONDICION.indexOf(c); return i === -1 ? (c === 'Sustituto' ? 99 : 50) : i; };
  return out.sort((a, b) => rango(a.condicion) - rango(b.condicion) || a.centro.localeCompare(b.centro) || a.almacen.localeCompare(b.almacen) || a.lote.localeCompare(b.lote));
}
