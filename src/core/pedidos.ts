// ---------------------------------------------------------------------------
// pedidos.ts · Módulo "Seg. de pedidos": relación por material entre los libros
// Disponibilidad, Seg pedidos e Inv_Condicion (Google Sheets), con los cálculos
// del sugeridor de Python. Puro: sin React, sin red, sin disco.
//
// Los libros se guardan CRUDOS (valores tal como se ven en Sheets, texto) y
// aquí solo se indexan por material y se transforman al mostrarlos:
//   · Disponibilidad → Libre real = max(Libre Utilización − Entrega a cliente, 0)
//   · Corta caducidad → RN-INV-001 (vigencia ≤ 12 meses o almacén 1032) con motivo
//   · Cosmopark/PNC/Caduco → fecha dd/mm/aaaa + meses de vigencia del lote
//   · Revision/Revision2 → el Material de la fila de arriba se hereda (celdas combinadas)
//   · Bloqueo → Crédito / Detenido (motor_optimizado.py)
// ---------------------------------------------------------------------------
import { libreReal, ALMACEN_CORTA_CADUCIDAD, MESES_MAX_CORTA_CADUCIDAD } from './inventoryRules';
import type { Sugerencia } from './types';

export type LibroClave = 'disponibilidad' | 'pedidos' | 'condicion' | 'comodato';

/** Una hoja tal como llega del Apps Script (`action=hoja`): encabezados y filas en texto. */
export interface HojaCruda {
  libro: LibroClave;
  hoja: string;
  nombreLibro: string;
  /** `ultimaModificacion` del libro en Drive cuando se descargó — para saber si cambió. */
  ultimaModificacion: string;
  columnas: string[];
  rows: string[][];
  sincronizadoEn: string;
}

export interface HojaIndexada extends HojaCruda {
  /** Encabezados normalizados (sin acentos, minúsculas, espacios colapsados). */
  nombres: string[];
  idxMaterial: number;
  idxSustituto: number;
  indice: Map<string, string[][]>;
  indiceSustituto: Map<string, string[][]>;
}

export type Celda = string | number;

export interface VistaTabla {
  columnas: string[];
  filas: Celda[][];
  pie?: Celda[];
  /** Libre real sumado por centro (solo Disponibilidad). */
  porCentro?: { centro: string; libre: number }[];
  nota?: string;
}

/** Hojas de Inv_Condicion que se muestran como sección propia, en este orden. */
export const SECCIONES_CONDICION = ['Corta caducidad', 'Cosmopark', 'PNC', 'Caduco', 'Lento mov', 'Revision', 'Revision2'] as const;

/** Encabezados (normalizados) que identifican la columna de material. Coincidencia exacta:
 * "Texto Material" no debe tomarse como llave. */
const ALIAS_LLAVE_MATERIAL = ['material', 'codigo'];
const ALIAS_FECHA_CADUCIDAD = ['fecaduc/feprefercons', 'fecha caducidad', 'caducidad'];
/** Hojas con varias filas por material donde el código solo viene en la primera (celdas combinadas). */
const HOJAS_CON_HERENCIA = new Set(['Revision', 'Revision2']);
const HOJAS_CON_CADUCIDAD = new Set(['Cosmopark', 'PNC', 'Caduco']);

// ---------------------------------------------------------------------------
// Utilidades de texto, número y fecha
// ---------------------------------------------------------------------------

export function normalizarEncabezado(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Llave de material comparable entre libros: sin espacios ni sufijo ".0" (normalizar_ids). */
export function claveMaterial(valor: unknown): string {
  return String(valor ?? '').trim().replace(/\.0+$/, '');
}

/** Número de un valor mostrado en Sheets ("1,234.500", "$ 12.45"); 0 si no es número. */
export function numero(valor: unknown): number {
  const n = parseFloat(String(valor ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Orden de los números de una fecha con diagonales: mes/día/año o día/mes/año. */
export type OrdenFecha = 'mdy' | 'dmy';

const RE_FECHA_PARTES = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;

/** Orden de fechas de UNA columna a partir de sus valores inequívocos (un número mayor a 12 solo puede ser el día):
 * gana el orden con más evidencia. Sin evidencia o en empate → mes/día/año (como las muestra Sheets). Así una columna
 * dd/mm/aaaa se lee completa en ese orden, también las fechas con día ≤ 12 que por sí solas serían ambiguas. */
export function detectarOrdenFechas(valores: Iterable<unknown>): OrdenFecha {
  let dmy = 0;
  let mdy = 0;
  for (const v of valores) {
    const m = RE_FECHA_PARTES.exec(String(v ?? '').trim());
    if (!m) continue;
    if (Number(m[1]) > 12 && Number(m[2]) <= 12) dmy++;
    else if (Number(m[2]) > 12 && Number(m[1]) <= 12) mdy++;
  }
  return dmy > mdy ? 'dmy' : 'mdy';
}

/** Fecha de una celda. `orden` es el de su columna (ver `detectarOrdenFechas`); por defecto mes/día/año. Un número
 * mayor a 12 siempre se toma como día, aunque contradiga el orden de la columna. También acepta ISO. `null` si no es una fecha válida. */
export function parsearFechaSheet(valor: unknown, orden: OrdenFecha = 'mdy'): Date | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  let anio: number;
  let mes: number;
  let dia: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(texto);
  const partes = RE_FECHA_PARTES.exec(texto);

  if (iso) {
    anio = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else if (partes) {
    const a = Number(partes[1]);
    const b = Number(partes[2]);
    anio = Number(partes[3]);
    if (anio < 100) anio += 2000;
    if (a > 12) [dia, mes] = [a, b];
    else if (b > 12) [mes, dia] = [a, b];
    else [dia, mes] = orden === 'dmy' ? [a, b] : [b, a];
  } else {
    return null;
  }

  const fecha = new Date(anio, mes - 1, dia);
  const valida = fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
  return valida ? fecha : null;
}

export function formatearFecha(fecha: Date | null): string {
  if (!fecha) return '';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

/** Suma meses CALENDARIO sin desbordar el día (31 ene + 1 mes = 28/29 feb), como `relativedelta`. */
export function sumarMeses(fecha: Date, meses: number): Date {
  const destino = new Date(fecha.getFullYear(), fecha.getMonth() + meses, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(fecha.getDate(), ultimoDia));
  return destino;
}

/** calcular_meses_vigencia: días / 30.4375 con 1 decimal; "0" si ya venció; "" sin fecha. */
export function mesesVigencia(fecha: Date | null, hoy: Date = new Date()): string {
  if (!fecha) return '';
  const meses = (fecha.getTime() - inicioDeDia(hoy).getTime()) / 86_400_000 / 30.4375;
  return meses < 0 ? '0' : meses.toFixed(1);
}

export function inicioDeDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

// ---------------------------------------------------------------------------
// Indexado de hojas
// ---------------------------------------------------------------------------

/** Índice de columna por encabezado normalizado: coincidencia exacta primero y, si no hay,
 * por contenido (mismo criterio que `encontrar_columna_por_patron` del sugeridor). */
export function indiceColumna(nombres: string[], alias: string[]): number {
  for (const a of alias) {
    const i = nombres.indexOf(a);
    if (i !== -1) return i;
  }
  for (const a of alias) {
    const i = nombres.findIndex((n) => n.includes(a));
    if (i !== -1) return i;
  }
  return -1;
}

function agregar(mapa: Map<string, string[][]>, clave: string, fila: string[]): void {
  const filas = mapa.get(clave);
  if (filas) filas.push(fila);
  else mapa.set(clave, [fila]);
}

/** Indexa las filas crudas por material (y, en Sustituto, por "Material sustituto").
 * No modifica ningún dato. */
export function indexarHoja(h: HojaCruda): HojaIndexada {
  const nombres = h.columnas.map(normalizarEncabezado);
  const idxMaterial = nombres.findIndex((n) => ALIAS_LLAVE_MATERIAL.includes(n));
  let idxSustituto = nombres.indexOf('material sustituto');
  // Hoja Sustituto con el encabezado de esa columna en blanco o cambiado: es la columna justo antes de "Texto material sustituto".
  if (idxSustituto === -1 && h.hoja === 'Sustituto') {
    const iTexto = nombres.indexOf('texto material sustituto');
    if (iTexto > 0 && !ALIAS_LLAVE_MATERIAL.includes(nombres[iTexto - 1] ?? '')) idxSustituto = iTexto - 1;
  }
  const heredar = HOJAS_CON_HERENCIA.has(h.hoja);
  const indice = new Map<string, string[][]>();
  const indiceSustituto = new Map<string, string[][]>();
  let anterior = '';

  for (const fila of h.rows) {
    if (idxMaterial !== -1) {
      let clave = claveMaterial(fila[idxMaterial]);
      if (!clave && heredar) clave = anterior;
      if (clave) {
        anterior = clave;
        agregar(indice, clave, fila);
      }
    }
    if (idxSustituto !== -1) {
      const clave = claveMaterial(fila[idxSustituto]);
      if (clave) agregar(indiceSustituto, clave, fila);
    }
  }
  return { ...h, nombres, idxMaterial, idxSustituto, indice, indiceSustituto };
}

// ---------------------------------------------------------------------------
// Vistas del detalle por material
// ---------------------------------------------------------------------------

/** Hojas sin cálculo: columnas tal cual vienen (o solo las de `columnasVista`, en ese orden). */
export function vistaCruda(h: HojaIndexada, filas: string[][], columnasVista?: string[]): VistaTabla {
  const indices = columnasVista
    ? columnasVista.map((c) => h.nombres.indexOf(normalizarEncabezado(c))).filter((i) => i !== -1)
    : h.columnas.map((_, i) => i);
  return {
    columnas: indices.map((i) => h.columnas[i] ?? ''),
    filas: filas.map((f) => indices.map((i) => f[i] ?? '')),
  };
}

/** Disponibilidad: Libre real = max(Libre Utilización − Entrega a cliente, 0) por fila,
 * ordenada por centro y almacén, con total y resumen por centro. */
export function vistaDisponibilidad(h: HojaIndexada, filas: string[][]): VistaTabla {
  const iCentro = indiceColumna(h.nombres, ['centro']);
  const iAlmacen = indiceColumna(h.nombres, ['almacen']);
  const iLibre = indiceColumna(h.nombres, ['libre utilizacion']);
  const iEntrega = indiceColumna(h.nombres, ['entrega a cliente']);
  const iTransito = indiceColumna(h.nombres, ['cant. en transito', 'transito']);
  const cmp = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });

  const calculadas = filas
    .map((f) => {
      const libre = numero(f[iLibre]);
      const entrega = numero(f[iEntrega]);
      return {
        centro: String(f[iCentro] ?? ''),
        almacen: String(f[iAlmacen] ?? ''),
        libre,
        entrega,
        real: libreReal(libre, entrega),
        transito: numero(f[iTransito]),
      };
    })
    .sort((a, b) => cmp(a.centro, b.centro) || cmp(a.almacen, b.almacen));

  const suma = (campo: 'libre' | 'entrega' | 'real' | 'transito') => calculadas.reduce((t, c) => t + c[campo], 0);
  const porCentro = new Map<string, number>();
  for (const c of calculadas) porCentro.set(c.centro, (porCentro.get(c.centro) ?? 0) + c.real);

  return {
    columnas: ['Centro', 'Almacén', 'Libre Utilización', 'Entrega a cliente', 'Libre real (Libre − Entrega)', 'Cant. en Tránsito'],
    filas: calculadas.map((c) => [c.centro, c.almacen, c.libre, c.entrega, c.real, c.transito]),
    pie: ['Total', '', suma('libre'), suma('entrega'), suma('real'), suma('transito')],
    porCentro: [...porCentro.entries()].map(([centro, libre]) => ({ centro, libre })),
  };
}

/** RN-INV-001: solo lotes con vigencia ≤ 12 meses o en el almacén 1032, con su motivo (VIGENCIA /
 * ALMACEN_1032 / AMBOS). Igual que `_filtrar_corta_caducidad` del sugeridor: el límite son 12 meses
 * CALENDARIO desde hoy. (`evaluarCortaCaducidad` de inventoryRules aproxima con días/30.4375 y difiere
 * en el borde: con los archivos reales daba 603 filas contra 602 de Python.) Lo que vence primero, arriba. */
export function vistaCortaCaducidad(h: HojaIndexada, filas: string[][], hoy: Date = new Date()): VistaTabla {
  const iCentro = indiceColumna(h.nombres, ['centro']);
  const iAlmacen = indiceColumna(h.nombres, ['almacen']);
  const iLote = indiceColumna(h.nombres, ['lote']);
  const iFecha = indiceColumna(h.nombres, ALIAS_FECHA_CADUCIDAD);
  const iLibre = indiceColumna(h.nombres, ['libre utilizacion']);
  const iBloqueado = indiceColumna(h.nombres, ['bloqueado']);
  const limite = sumarMeses(inicioDeDia(hoy), MESES_MAX_CORTA_CADUCIDAD);
  const orden = detectarOrdenFechas(h.rows.map((f) => f[iFecha]));
  const aceptadas: { fecha: Date | null; celdas: Celda[] }[] = [];
  let descartadas = 0;

  for (const f of filas) {
    const fecha = parsearFechaSheet(f[iFecha], orden);
    const porVigencia = fecha !== null && fecha.getTime() <= limite.getTime();
    const porAlmacen = claveMaterial(f[iAlmacen]) === ALMACEN_CORTA_CADUCIDAD;
    if (!porVigencia && !porAlmacen) {
      descartadas++;
      continue;
    }
    const motivo = porVigencia && porAlmacen ? 'AMBOS' : porVigencia ? 'VIGENCIA' : 'ALMACEN_1032';
    aceptadas.push({
      fecha,
      celdas: [f[iCentro] ?? '', f[iAlmacen] ?? '', f[iLote] ?? '', formatearFecha(fecha), mesesVigencia(fecha, hoy), numero(f[iLibre]), f[iBloqueado] ?? '', motivo],
    });
  }
  aceptadas.sort((a, b) => (a.fecha ? a.fecha.getTime() : Infinity) - (b.fecha ? b.fecha.getTime() : Infinity));

  return {
    columnas: ['Centro', 'Almacén', 'Lote', 'Fecha de caducidad', 'Meses vigencia lote', 'Libre utilización', 'Bloqueado', 'Motivo'],
    filas: aceptadas.map((a) => a.celdas),
    nota: descartadas > 0 ? `${descartadas} fila(s) no se muestran: vigencia mayor a ${MESES_MAX_CORTA_CADUCIDAD} meses y fuera del almacén ${ALMACEN_CORTA_CADUCIDAD}.` : undefined,
  };
}

/** Cosmopark / PNC / Caduco: fecha de caducidad en dd/mm/aaaa y "Meses vigencia lote". */
export function vistaConCaducidad(h: HojaIndexada, filas: string[][], hoy: Date = new Date()): VistaTabla {
  const iFecha = indiceColumna(h.nombres, ALIAS_FECHA_CADUCIDAD);
  const base = vistaCruda(h, filas);
  if (iFecha === -1) return base;
  const orden = detectarOrdenFechas(h.rows.map((f) => f[iFecha]));

  return {
    columnas: [...base.columnas, 'Meses vigencia lote'],
    filas: filas.map((f, i) => {
      const fecha = parsearFechaSheet(f[iFecha], orden);
      const celdas = (base.filas[i] ?? []).slice();
      if (fecha) celdas[iFecha] = formatearFecha(fecha);
      return [...celdas, mesesVigencia(fecha, hoy)];
    }),
  };
}

/** Vista de una hoja de Inv_Condicion según su nombre. */
export function vistaCondicion(h: HojaIndexada, filas: string[][], hoy: Date = new Date()): VistaTabla {
  if (h.hoja === 'Corta caducidad') return vistaCortaCaducidad(h, filas, hoy);
  if (HOJAS_CON_CADUCIDAD.has(h.hoja)) return vistaConCaducidad(h, filas, hoy);
  return vistaCruda(h, filas);
}

/** Sustituto en ambas direcciones: sustitutos de `clave` y materiales a los que `clave` sustituye. */
export function buscarSustitutos(h: HojaIndexada, clave: string): { comoMaterial: string[][]; comoSustituto: string[][] } {
  return { comoMaterial: h.indice.get(clave) ?? [], comoSustituto: h.indiceSustituto.get(clave) ?? [] };
}

// ---------------------------------------------------------------------------
// Seg pedidos como filas de "Pedidos" (Sugerencia, sin fuentes)
// ---------------------------------------------------------------------------

/** Almacenes que suman al inventario "por centro" (motor_optimizado.py: `inv_filtrado_mat`). */
const ALMACENES_INV_CENTRO = new Set(['1030', '1031', '1060']);
/** Centros que el motor expone como columnas "Inv <centro>". */
const CENTROS_INV = ['1001', '1003', '1004', '1017', '1018', '1022', '1036'];
const ALMACENES_INV = ['1030', '1031', '1032', '1060'];

/** Inventario ajustado (Libre − Entrega, mínimo 0 por fila) en las tres vistas que usa el motor del sugeridor. */
export interface InventarioPedidos {
  /** `material|centro|almacén` → Libre real (inv_centro_alm). */
  porCentroAlm: Map<string, number>;
  /** material → centro → suma de 1030+1031+1060 (inv_filtrado_mat). */
  porCentro: Map<string, Map<string, number>>;
  /** `material|centro` → cantidad en tránsito, todos los almacenes (transito). */
  transito: Map<string, number>;
}

/** Arma los índices de inventario a partir de la hoja de Disponibilidad; `null` si no está sincronizada. */
export function inventarioDesdeDisponibilidad(h: HojaIndexada | undefined): InventarioPedidos | null {
  if (!h) return null;
  const iCentro = indiceColumna(h.nombres, ['centro']);
  const iAlmacen = indiceColumna(h.nombres, ['almacen']);
  const iLibre = indiceColumna(h.nombres, ['libre utilizacion']);
  const iEntrega = indiceColumna(h.nombres, ['entrega a cliente']);
  const iTransito = indiceColumna(h.nombres, ['cant. en transito', 'transito']);
  const inv: InventarioPedidos = { porCentroAlm: new Map(), porCentro: new Map(), transito: new Map() };

  for (const f of h.rows) {
    const material = claveMaterial(f[h.idxMaterial]);
    const centro = claveMaterial(f[iCentro]);
    const almacen = claveMaterial(f[iAlmacen]);
    const real = libreReal(numero(f[iLibre]), numero(f[iEntrega]));

    const k = `${material}|${centro}|${almacen}`;
    inv.porCentroAlm.set(k, (inv.porCentroAlm.get(k) ?? 0) + real);
    const kt = `${material}|${centro}`;
    inv.transito.set(kt, (inv.transito.get(kt) ?? 0) + numero(f[iTransito]));
    if (ALMACENES_INV_CENTRO.has(almacen)) {
      const porCentro = inv.porCentro.get(material) ?? new Map<string, number>();
      porCentro.set(centro, (porCentro.get(centro) ?? 0) + real);
      inv.porCentro.set(material, porCentro);
    }
  }
  return inv;
}

/** Bloqueado (motor_optimizado.py): crédito "B" y/o bloqueo de entrega. */
export function bloqueoPedido(credito: string, bloqueoEntrega: string): string {
  let bloqueado = credito.trim() === 'B' ? 'Crédito' : '';
  const entrega = bloqueoEntrega.trim();
  if (entrega !== '' && entrega.toLowerCase() !== 'nan') bloqueado = bloqueado ? 'Detenido por ambos' : 'Detenido';
  return bloqueado;
}

/** Precio unitario con el que `pendiente × precio` cuadra con la columna "$ Pendiente" del Sheet: "$ Pendiente ÷ Pendiente" y, si no hay,
 * "Precio1" (el precio por unidad; en algunos renglones "Precio" viene por 10 o por 100) y por último "Precio". */
export function precioPendiente(pendiente: number, valorPendiente: number, precio1: number, precio: number): number {
  if (pendiente > 0 && valorPendiente > 0) return valorPendiente / pendiente;
  return precio1 > 0 ? precio1 : precio;
}

/** Filas de Seg pedidos con la forma de "Todas las Sugerencias" (`Sugerencia`), SIN fuentes alternas:
 * así la misma tabla, paneles y acciones de Pedidos funcionan sobre ellas. Mismos campos que arma
 * `motor_optimizado.py`: inventario por almacén del centro del pedido, por centro, tránsito y bloqueo. */
export function sugerenciasDesdeSegPedidos(h: HojaIndexada, inv: InventarioPedidos | null): Sugerencia[] {
  const c = (alias: string[]) => indiceColumna(h.nombres, alias);
  const i = {
    pedido: c(['pedido']), oc: c(['ped. cte.']), fecha: c(['fecha']), razon: c(['razon social']), dest: c(['destinatario']),
    solic: c(['solicitante']), gpoVdor: c(['gpo. vdor.', 'gpo.vdor.', 'gpo vdor']), gpoCte: c(['gpo. cte.', 'gpo cte']),
    centro: c(['centro']), almacen: c(['almacen']), material: c(['material']), texto: c(['texto material']), cantidad: c(['cantidad']),
    pendiente: c(['pendiente']), precio: c(['precio']), precio1: c(['precio1']), valorPend: c(['$ pendiente']), credito: c(['sts. cred.']), bloqueo: c(['bloqueo ent.']),
  };
  const txt = (f: string[], idx: number) => String(f[idx] ?? '').trim();

  const orden = detectarOrdenFechas(h.rows.map((f) => f[i.fecha]));
  return h.rows.map((f) => {
    const centro = claveMaterial(f[i.centro]);
    const material = claveMaterial(f[i.material]);
    const invByCenter: Record<string, number> = {};
    for (const a of ALMACENES_INV) invByCenter[a] = inv?.porCentroAlm.get(`${material}|${centro}|${a}`) ?? 0;
    const porCentro = inv?.porCentro.get(material);
    for (const ctr of CENTROS_INV) invByCenter[ctr] = porCentro?.get(ctr) ?? 0;
    const fecha = parsearFechaSheet(f[i.fecha], orden);

    return {
      gpoCte: txt(f, i.gpoCte),
      fecha: fecha ? formatearFecha(fecha) : txt(f, i.fecha),
      oc: txt(f, i.oc),
      pedido: txt(f, i.pedido),
      gpoVdor: txt(f, i.gpoVdor),
      solicitante: txt(f, i.solic),
      destinatario: txt(f, i.dest),
      razonSocial: txt(f, i.razon),
      centroPedido: centro,
      almacen: claveMaterial(f[i.almacen]),
      materialSolicitado: material,
      materialBase: material,
      descripcionSolicitada: txt(f, i.texto),
      cantidadPedido: numero(f[i.cantidad]),
      cantidadPendiente: numero(f[i.pendiente]),
      cantidadOfertar: 0,
      precio: precioPendiente(numero(f[i.pendiente]), numero(f[i.valorPend]), numero(f[i.precio1]), numero(f[i.precio])),
      consumoPromedio: 0,
      fuente: '',
      materialSugerido: '',
      descripcionSugerida: '',
      centroSugerido: '',
      almacenSugerido: '',
      disponible: 0,
      lote: '',
      fechaCaducidad: '',
      mesesVigenciaLote: 0,
      centroInv: centro,
      mesesInventario: 0,
      promedioConsumo12M: 0,
      cantTransito: inv?.transito.get(`${material}|${centro}`) ?? 0,
      bloqueado: bloqueoPedido(txt(f, i.credito), txt(f, i.bloqueo)),
      invByCenter,
      raw: Object.fromEntries(h.columnas.map((col, idx) => [col, f[idx] ?? ''])),
    };
  });
}

// ---------------------------------------------------------------------------
// Detalle por material (contenido de la ventana emergente)
// ---------------------------------------------------------------------------

export interface BloqueDetalle {
  subtitulo?: string;
  vista?: VistaTabla;
  mensaje?: string;
}

export interface SeccionDetalle {
  titulo: string;
  /** Libro de origen (para darle color a la sección en el detalle). */
  libro?: LibroClave;
  conteo?: number;
  bloques: BloqueDetalle[];
}

/** Columnas de Seg pedidos que se muestran en el detalle de un material. */
export const COLUMNAS_SEG_PEDIDOS_DETALLE = ['Fecha', 'Pedido', 'Solicitante', 'Destinatario', 'Razón Social', 'Centro', 'Almacén', 'Cantidad', 'Pendiente', 'Ped. Cte.', 'Gpo. Vdor.'];

const SIN_COINCIDENCIAS = 'Sin coincidencias';
const NO_SINCRONIZADO = 'Libro no sincronizado.';

/** Arma las secciones del detalle de un material a partir de las hojas sincronizadas:
 * Disponibilidad, Seg pedidos, cada hoja de condición y Sustituto. */
export function construirDetalleMaterial(hojas: HojaIndexada[], material: string, hoy: Date = new Date()): SeccionDetalle[] {
  const clave = claveMaterial(material);
  const buscar = (libro: LibroClave, hoja?: string) => hojas.find((h) => h.libro === libro && (hoja === undefined || h.hoja === hoja));
  const dispo = buscar('disponibilidad');
  const secciones: SeccionDetalle[] = [];

  if (!dispo) {
    secciones.push({ titulo: 'Disponibilidad', bloques: [{ mensaje: NO_SINCRONIZADO }] });
  } else {
    const filas = dispo.indice.get(clave) ?? [];
    if (filas.length === 0) {
      secciones.push({ titulo: 'Disponibilidad', conteo: 0, bloques: [{ mensaje: SIN_COINCIDENCIAS }] });
    } else {
      const vista = vistaDisponibilidad(dispo, filas);
      secciones.push({
        titulo: 'Disponibilidad',
        conteo: filas.length,
        bloques: [
          { vista },
          { subtitulo: 'Libre real por centro', vista: { columnas: ['Centro', 'Libre real'], filas: (vista.porCentro ?? []).map((c) => [c.centro, c.libre]) } },
        ],
      });
    }
  }

  const pedidos = buscar('pedidos');
  if (!pedidos) {
    secciones.push({ titulo: 'Seg pedidos', bloques: [{ mensaje: NO_SINCRONIZADO }] });
  } else {
    const filas = pedidos.indice.get(clave) ?? [];
    secciones.push({
      titulo: 'Seg pedidos',
      conteo: filas.length,
      bloques: [filas.length ? { vista: vistaCruda(pedidos, filas, COLUMNAS_SEG_PEDIDOS_DETALLE) } : { mensaje: SIN_COINCIDENCIAS }],
    });
  }

  for (const nombre of SECCIONES_CONDICION) {
    const h = buscar('condicion', nombre);
    if (!h) continue;
    const crudas = h.indice.get(clave) ?? [];
    if (crudas.length === 0) {
      secciones.push({ titulo: nombre, conteo: 0, bloques: [{ mensaje: SIN_COINCIDENCIAS }] });
      continue;
    }
    const vista = vistaCondicion(h, crudas, hoy);
    secciones.push({
      titulo: nombre,
      conteo: vista.filas.length,
      bloques: vista.filas.length > 0 ? [{ vista }] : [{ mensaje: vista.nota ?? SIN_COINCIDENCIAS }],
    });
  }

  const sust = buscar('condicion', 'Sustituto');
  if (sust) {
    const { comoMaterial, comoSustituto } = buscarSustitutos(sust, clave);
    const bloques: BloqueDetalle[] = [];
    if (comoMaterial.length > 0) {
      bloques.push({ subtitulo: 'Sustitutos de este material', vista: vistaCruda(sust, comoMaterial) });
      const vistos = new Set<string>();
      for (const fila of comoMaterial) {
        const codigo = claveMaterial(fila[sust.idxSustituto]);
        if (!codigo || vistos.has(codigo)) continue;
        vistos.add(codigo);
        const filasDispo = dispo?.indice.get(codigo) ?? [];
        bloques.push(
          filasDispo.length > 0 && dispo
            ? { subtitulo: `Disponibilidad del sustituto ${codigo}`, vista: vistaDisponibilidad(dispo, filasDispo) }
            : { subtitulo: `Disponibilidad del sustituto ${codigo}`, mensaje: SIN_COINCIDENCIAS },
        );
      }
    }
    if (comoSustituto.length > 0) bloques.push({ subtitulo: 'Este material es sustituto de', vista: vistaCruda(sust, comoSustituto) });
    secciones.push({
      titulo: 'Sustituto',
      conteo: comoMaterial.length + comoSustituto.length,
      bloques: bloques.length ? bloques : [{ mensaje: SIN_COINCIDENCIAS }],
    });
  }

  return secciones.map((s) => ({ ...s, libro: s.titulo === 'Disponibilidad' ? 'disponibilidad' as const : s.titulo === 'Seg pedidos' ? 'pedidos' as const : 'condicion' as const }));
}

// ---------------------------------------------------------------------------
// Fuentes (los 3 libros de Google Sheets) y validación de esquema
// ---------------------------------------------------------------------------

export const FUENTES_PEDIDOS: { clave: LibroClave; etiqueta: string }[] = [
  { clave: 'pedidos', etiqueta: 'Seg pedidos' },
  { clave: 'disponibilidad', etiqueta: 'Disponibilidad' },
  { clave: 'condicion', etiqueta: 'Inv_Condicion' },
  { clave: 'comodato', etiqueta: 'Comodato (YBFD/ZBRE)' },
];

/** Los libros que alimentan Seg. de pedidos e inventarios. El de comodato se baja aparte (Carga o el módulo Comodato (libros)): es una hoja grande que ellos no usan. */
export const LIBROS_BASE_PEDIDOS: LibroClave[] = ['pedidos', 'disponibilidad', 'condicion'];

/** Columnas mínimas (alias normalizados) sin las que una hoja de datos no sirve. */
const COLUMNAS_REQUERIDAS: Partial<Record<LibroClave, string[][]>> = {
  pedidos: [['pedido'], ['material'], ['centro']],
  disponibilidad: [['centro'], ['material'], ['libre utilizacion']],
  comodato: [['solicitante'], ['clase doc.ventas'], ['material']],
};

/** Devuelve un mensaje si la hoja descargada no tiene la forma esperada (p. ej. un libro equivocado o una
 * respuesta rara del script), o `null` si está bien. Evita reemplazar datos buenos con basura. */
export function validarHojaCruda(h: HojaCruda): string | null {
  const requeridas = COLUMNAS_REQUERIDAS[h.libro];
  if (!requeridas) return null;
  const nombres = h.columnas.map(normalizarEncabezado);
  const faltan = requeridas.filter((alias) => !alias.some((a) => nombres.some((n) => n === a || n.includes(a)))).map((alias) => alias[0]);
  return faltan.length ? `"${h.nombreLibro}" no tiene las columnas esperadas (${faltan.join(', ')}).` : null;
}
