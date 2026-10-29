// ---------------------------------------------------------------------------
// accesoDatos.ts · Política de acceso a datos que aplica la Edge Function `datos` ANTES de responder al navegador.
// Puro (sin Deno ni Supabase): lo prueba vitest desde src/core/accesoDatos.test.ts.
//
// Principio: lo que el servidor no manda, el navegador no lo puede mostrar, copiar ni descargar. Todo lo no listado como visible se vacía (default-deny)
// para los renglones de OTRAS zonas; las columnas de costo se vacían para quien no ve costos.
// ---------------------------------------------------------------------------

export interface PoliticaDatos {
  /** Admin o rol sin restricciones: la respuesta pasa tal cual. */
  sinRestriccion: boolean;
  /** Solo ve su(s) zona(s) completa(s); lo de otras zonas llega recortado. */
  restringirZona: boolean;
  /** Zonas del usuario (códigos normalizados con `normCode`). */
  zonas: string[];
  verCosto: boolean;
  /** Con `false`, los pedidos/facturación de otras zonas llegan sin precio ni importe (y la facturación sin cliente). */
  verPrecioOtrasZonas: boolean;
  /** Condiciones que puede ver (null = todas). */
  condicionesPermitidas: string[] | null;
  /** Tope de meses de caducidad por condición (null = sin tope). */
  caducidadMaxMeses: Record<string, number> | null;
  /** Ve la regla «almacén 1032 con más de 12 meses = Corta caducidad». */
  verReglaCC1032: boolean;
}

export const POLITICA_ABIERTA: PoliticaDatos = {
  sinRestriccion: true, restringirZona: false, zonas: [], verCosto: true, verPrecioOtrasZonas: true,
  condicionesPermitidas: null, caducidadMaxMeses: null, verReglaCC1032: true,
};

export interface FilaRol {
  is_admin?: boolean | null;
  restringir_zona?: boolean | null;
  ver_costo?: boolean | null;
  ver_precio_otras_zonas?: boolean | null;
  condiciones_permitidas?: string[] | null;
  caducidad_max_meses?: Record<string, number> | null;
  ver_regla_cc_1032?: boolean | null;
}
export interface OverrideUsuario {
  restringirZona?: boolean; verCosto?: boolean; verPrecioOtrasZonas?: boolean;
  condicionesPermitidas?: string[] | null; caducidadMaxMeses?: Record<string, number> | null; verReglaCC1032?: boolean;
}

/** Política efectiva: rol + override del usuario (el override gana). Sin rol o admin = sin restricción (igual que el resto de la app). */
export function politicaDe(rol: FilaRol | null, override: OverrideUsuario | null, zonas: string[]): PoliticaDatos {
  if (!rol || rol.is_admin) return POLITICA_ABIERTA;
  const o = override ?? {};
  const p: PoliticaDatos = {
    sinRestriccion: false,
    restringirZona: o.restringirZona ?? rol.restringir_zona ?? false,
    zonas,
    verCosto: o.verCosto ?? rol.ver_costo ?? true,
    verPrecioOtrasZonas: o.verPrecioOtrasZonas ?? rol.ver_precio_otras_zonas ?? true,
    condicionesPermitidas: o.condicionesPermitidas !== undefined ? o.condicionesPermitidas : (rol.condiciones_permitidas ?? null),
    caducidadMaxMeses: o.caducidadMaxMeses !== undefined ? o.caducidadMaxMeses : (rol.caducidad_max_meses ?? null),
    verReglaCC1032: o.verReglaCC1032 ?? rol.ver_regla_cc_1032 ?? true,
  };
  const hayLimite = p.restringirZona || !p.verCosto || !p.verPrecioOtrasZonas || p.condicionesPermitidas !== null
    || (p.caducidadMaxMeses !== null && Object.values(p.caducidadMaxMeses).some((m) => m > 0)) || !p.verReglaCC1032;
  return { ...p, sinRestriccion: !hayLimite };
}

// ---- Normalización ---------------------------------------------------------------------------------------------------------------------
export const normTxt = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Igual que `normCode` de src/core/enrich.ts: "002" → "2", "2.0" → "2"; texto tal cual en minúsculas. */
export function normCode(v: unknown): string {
  let s = String(v ?? '').trim();
  if (s === '') return '';
  s = s.replace(/^(-?\d+)\.0+$/, '$1');
  if (/^-?\d+$/.test(s)) {
    const neg = s[0] === '-';
    const d = (neg ? s.slice(1) : s).replace(/^0+(?=\d)/, '');
    return (neg ? '-' : '') + (d === '' ? '0' : d);
  }
  return s.toLowerCase();
}

// ---- Zonas ----------------------------------------------------------------------------------------------------------------------------
export interface MapaZonas {
  /** Zona (normalizada) del «Gpo. Vdor.» de un renglón (acepta zona o código de oficina de ventas); '' si no se conoce. */
  zonaDe: (gpoVdor: unknown) => string;
  /** Zonas cuyo ejecutivo tiene ese correo. */
  zonasDeCorreo: (correo: string) => string[];
}

/** Construye el mapa desde la pestaña «Ejecutivos» del catálogo (mismas claves que `buildEnrich`: Zona, Cod Of Vtas, Correo Electrónico). */
export function mapaZonas(ejecutivos: readonly Record<string, unknown>[]): MapaZonas {
  const get = (r: Record<string, unknown>, clave: string): unknown => {
    for (const k of Object.keys(r)) if (normTxt(k) === clave) return r[k];
    return '';
  };
  const zonaDeClave = new Map<string, string>();
  const correos = new Map<string, Set<string>>();
  for (const e of ejecutivos) {
    const zk = normCode(get(e, 'zona')) || normCode(get(e, 'cod of vtas'));
    if (!zk) continue;
    if (!zonaDeClave.has(zk)) zonaDeClave.set(zk, zk);
    const ck = normCode(get(e, 'cod of vtas'));
    if (ck && !zonaDeClave.has(ck)) zonaDeClave.set(ck, zk);
    for (const c of String(get(e, 'correo electronico') ?? '').split(/[;,\s]+/)) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) continue;
      const k = c.toLowerCase();
      const set = correos.get(k) ?? new Set<string>();
      set.add(zk);
      correos.set(k, set);
    }
  }
  return {
    zonaDe: (v) => zonaDeClave.get(normCode(v)) ?? '',
    zonasDeCorreo: (c) => [...(correos.get(c.trim().toLowerCase()) ?? [])],
  };
}

// ---- Fechas / caducidad ---------------------------------------------------------------------------------------------------------------
type Orden = 'mdy' | 'dmy';
export function detectarOrden(valores: Iterable<unknown>): Orden {
  let dmy = false; let mdy = false;
  for (const v of valores) {
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(String(v ?? '').trim());
    if (!m) continue;
    if (+m[1]! > 12) dmy = true;
    if (+m[2]! > 12) mdy = true;
  }
  return dmy && !mdy ? 'dmy' : 'mdy';
}
export function parseFecha(v: unknown, orden: Orden): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
  if (!m) return null;
  const [a, b] = [+m[1]!, +m[2]!];
  const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!;
  const d = orden === 'dmy' ? new Date(y, b - 1, a) : new Date(y, a - 1, b);
  return Number.isNaN(d.getTime()) ? null : d;
}
const mesesHasta = (f: Date, hoy: Date): number => (f.getTime() - hoy.getTime()) / 86_400_000 / 30.4375;
export const MESES_REGLA_1032 = 12;
export const ALMACEN_REGLA = '1032';

// ---- Condiciones ----------------------------------------------------------------------------------------------------------------------
/** Partes permitidas de una condición («Liz/Lento mov»); `null` si no queda ninguna. Sin lista = tal cual. */
export function condicionVisible(texto: string, permitidas: readonly string[] | null): string | null {
  if (permitidas === null) return texto;
  const set = new Set(permitidas.map(normTxt));
  const partes = texto.split('/').map((t) => t.trim()).filter(Boolean).filter((p) => set.has(normTxt(p)));
  return partes.length ? partes.join('/') : null;
}
const topeDe = (p: PoliticaDatos, condicion: string): number | null => {
  const maximos = p.caducidadMaxMeses;
  if (!maximos) return null;
  const topes = condicion.split('/').map((c) => c.trim()).filter(Boolean).map((c) => {
    const k = Object.keys(maximos).find((x) => normTxt(x) === normTxt(c));
    const m = k === undefined ? 0 : maximos[k]!;
    return m > 0 ? m : null;
  });
  // Basta una parte sin tope para no limitar (misma regla que el Excel por ejecutivo).
  return topes.length && topes.every((t) => t !== null) ? Math.max(...(topes as number[])) : null;
};

// ---- Tablas {columnas, rows} -----------------------------------------------------------------------------------------------------------
export type Fila = unknown[];
export interface Hoja { columnas: string[]; rows: Fila[] }

const idxDe = (columnas: readonly string[], ...alias: string[]): number => {
  const set = new Set(alias.map(normTxt));
  return columnas.findIndex((c) => set.has(normTxt(c)));
};
const esCosto = (nombre: string): boolean => /costo|margen/.test(normTxt(nombre));

/** Vacía las columnas de costo (en arreglos de filas). */
function vaciarCostos(h: Hoja): Hoja {
  const ix = new Set(h.columnas.map((c, i) => (esCosto(c) ? i : -1)).filter((i) => i >= 0));
  if (!ix.size) return h;
  return { columnas: h.columnas, rows: h.rows.map((f) => f.map((v, i) => (ix.has(i) ? '' : v))) };
}

/** Deja solo las columnas permitidas (por nombre normalizado) y vacía el resto. */
function soloColumnas(h: Hoja, permitidas: ReadonlySet<string>): (f: Fila) => Fila {
  const dejar = h.columnas.map((c) => permitidas.has(normTxt(c)));
  return (f) => f.map((v, i) => (dejar[i] ? v : ''));
}

const COLS_PEDIDO_AJENO = new Set(['pedido', 'fecha', 'razon social', 'solicitante', 'destinatario', 'centro', 'almacen', 'material', 'texto material', 'cantidad', 'pendiente', 'sts. cred.', 'bloqueo ent.', 'gpo. vdor.', 'gpo.vdor.']);
// Facturación de otras zonas: ni cliente ni importe; la cantidad sí, para que el promedio de consumo de un material siga completo.
const COLS_FAC_AJENO = new Set(['mes', 'material', 'texto material', 'centro', 'almacen', 'gpo. vdor.', 'cantidad', 'fecha max']);

const COL_FECHA_CAD = ['fechacaducidad', 'fecha caducidad', 'fecha de caducidad', 'caducidad'];

/** Quita (o recorta) lo que la política no permite ver en una hoja cruda del libro de pedidos / disponibilidad / condición. */
export function filtrarHoja(libro: string, nombreHoja: string, h: Hoja, p: PoliticaDatos, zonaDe: (v: unknown) => string, hoy: Date = new Date()): Hoja {
  if (p.sinRestriccion) return h;
  let out: Hoja = h;
  if (!p.verCosto) out = vaciarCostos(out);
  // Comodato (export SAP YBFD/ZBRE) trae clientes de todas las zonas: quien ve solo su zona recibe únicamente los renglones de su zona. Sin una columna de
  // zona (Gpo. Vdor.) no hay forma segura de separarlos, así que no recibe nada (falla cerrado).
  if (libro === 'comodato' && p.restringirZona) {
    const iZona = idxDe(h.columnas, 'gpo. vdor.', 'gpo.vdor.', 'gpo vdor', 'grupo de vendedores', 'grupo vendedor');
    const propias = new Set(p.zonas);
    return { columnas: out.columnas, rows: iZona < 0 ? [] : out.rows.filter((f) => propias.has(zonaDe(f[iZona]))) };
  }

  if (libro === 'condicion') {
    // La pestaña ES la condición (Corta caducidad, PNC, Sustituto…): sin permiso, vacía; con tope de caducidad, solo los lotes que vencen antes.
    // Excepción: «Revision» (y «Revision2») junta varias condiciones en la columna Status (Lento mov, Revision Liz, Marcas propias…): ahí se filtra
    // renglón por renglón, igual que las arma «Inv con Condición». Un renglón con varios Status («A/B») queda con los permitidos.
    if (condicionVisible(nombreHoja, p.condicionesPermitidas) === null) {
      const iStatus = idxDe(h.columnas, 'status', 'estatus', 'estado');
      if (!/^revision/.test(normTxt(nombreHoja)) || iStatus < 0) return { columnas: h.columnas, rows: [] };
      out = {
        columnas: out.columnas,
        rows: out.rows.flatMap((f) => {
          const vis = condicionVisible(String(f[iStatus] ?? ''), p.condicionesPermitidas);
          return vis === null ? [] : [f.map((v, i) => (i === iStatus ? vis : v))];
        }),
      };
    }
    const tope = topeDe(p, nombreHoja);
    const iFecha = idxDe(h.columnas, ...COL_FECHA_CAD);
    if (tope !== null && iFecha >= 0) {
      const orden = detectarOrden(out.rows.map((f) => f[iFecha]));
      out = { columnas: out.columnas, rows: out.rows.filter((f) => { const d = parseFecha(f[iFecha], orden); return !d || mesesHasta(d, hoy) < tope; }) };
    }
  }

  if (!p.verReglaCC1032) out = sinReglaCC1032(out, hoy);

  if (libro === 'pedidos' && p.restringirZona && !p.verPrecioOtrasZonas) {
    const iZona = idxDe(h.columnas, 'gpo. vdor.', 'gpo.vdor.', 'gpo vdor');
    const recortar = soloColumnas(out, COLS_PEDIDO_AJENO);
    const propias = new Set(p.zonas);
    out = { columnas: out.columnas, rows: out.rows.map((f) => (iZona >= 0 && propias.has(zonaDe(f[iZona])) ? f : recortar(f))) };
  }
  return out;
}

/** Quita los lotes del almacén 1032 con más de 12 meses de vigencia: solo son «corta caducidad» por la regla del almacén. */
function sinReglaCC1032(h: Hoja, hoy: Date): Hoja {
  const iAlm = idxDe(h.columnas, 'almacen');
  const iFecha = idxDe(h.columnas, ...COL_FECHA_CAD);
  if (iAlm < 0 || iFecha < 0) return h;
  const orden = detectarOrden(h.rows.map((f) => f[iFecha]));
  return {
    columnas: h.columnas,
    rows: h.rows.filter((f) => {
      if (String(f[iAlm] ?? '').trim() !== ALMACEN_REGLA) return true;
      const d = parseFecha(f[iFecha], orden);
      return !d || mesesHasta(d, hoy) <= MESES_REGLA_1032;
    }),
  };
}

/** Un bloque de facturación (`fac_chunk`): los renglones de otras zonas llegan sin cliente ni importe. */
export function filtrarFacturacion(h: Hoja, p: PoliticaDatos, zonaDe: (v: unknown) => string): Hoja {
  if (p.sinRestriccion) return h;
  let out = h;
  if (!p.verCosto) out = vaciarCostos(out);
  if (p.restringirZona && !p.verPrecioOtrasZonas) {
    const iZona = idxDe(h.columnas, 'gpo. vdor.', 'gpo.vdor.', 'gpo vdor');
    const recortar = soloColumnas(out, COLS_FAC_AJENO);
    const propias = new Set(p.zonas);
    out = { columnas: out.columnas, rows: out.rows.map((f) => (iZona >= 0 && propias.has(zonaDe(f[iZona])) ? f : recortar(f))) };
  }
  return out;
}

// ---- Catálogo (pestañas como arreglos de objetos) --------------------------------------------------------------------------------------
export function filtrarPestanaCatalogo(tab: string, rows: Record<string, unknown>[], p: PoliticaDatos, hoy: Date = new Date()): Record<string, unknown>[] {
  if (p.sinRestriccion) return rows;
  let out = rows;
  if (!p.verCosto) out = out.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, esCosto(k) ? '' : v])));
  const valor = (r: Record<string, unknown>, ...alias: string[]): string => {
    const k = Object.keys(r).find((x) => alias.map(normTxt).includes(normTxt(x)));
    return k === undefined ? '' : String(r[k] ?? '');
  };
  if (normTxt(tab) === normTxt('InvConsolidado') && p.condicionesPermitidas !== null) {
    out = out.flatMap((r) => {
      const kc = Object.keys(r).find((x) => normTxt(x) === 'condicion');
      if (kc === undefined) return [r];
      const txt = String(r[kc] ?? '');
      if (!txt.trim()) return [r];
      const vis = condicionVisible(txt, p.condicionesPermitidas);
      return vis === null ? [] : [{ ...r, [kc]: vis }];
    });
  }
  if (normTxt(tab) === normTxt('InvDetalle') && !p.verReglaCC1032) {
    const orden = detectarOrden(out.map((r) => valor(r, ...COL_FECHA_CAD)));
    out = out.filter((r) => {
      if (valor(r, 'almacen').trim() !== ALMACEN_REGLA) return true;
      const d = parseFecha(valor(r, ...COL_FECHA_CAD), orden);
      return !d || mesesHasta(d, hoy) <= MESES_REGLA_1032;
    });
  }
  return out;
}

/** El manifiesto `relacion`: sin las pestañas de condición que no puede ver. */
export function filtrarRelacion(relacion: unknown[], p: PoliticaDatos): unknown[] {
  if (p.sinRestriccion || p.condicionesPermitidas === null) return relacion;
  return relacion.map((libro) => {
    const l = libro as { clave?: string; hojas?: unknown };
    if (l.clave !== 'condicion' || !Array.isArray(l.hojas)) return libro;
    return { ...l, hojas: l.hojas.filter((h) => condicionVisible(typeof h === 'string' ? h : String((h as { nombre?: unknown }).nombre ?? ''), p.condicionesPermitidas) !== null) };
  });
}

/** Conectores que NO tienen filtro propio: un usuario restringido no los recibe (default-deny). */
export const CONECTORES_SIN_FILTRO = new Set(['incremento_costos_url']);
