// ---------------------------------------------------------------------------
// comparativoPeriodos.ts · Comparativo del periodo A contra el periodo B (mes vs mes, trimestre vs trimestre, año vs año o un rango libre),
// por Gerencia (de marca), Sector, Grupo de artículo o Material, con el precio mínimo / máximo / promedio de cada material en cada periodo.
// Puro: sale de las series mensuales por material de la facturación (`RFIndex.mat`).
// Precios: el PROMEDIO del periodo es importe ÷ cantidad de todo el periodo. El MÍNIMO y el MÁXIMO son los de las LÍNEAS facturadas: el Apps Script
// nuevo entrega, en cada fila (cliente + centro + mes), el menor y el mayor precio unitario de las líneas que sumó (`precioMin` / `precioMax`).
// Con el script anterior solo existe el precio promedio de cada fila, y el mínimo / máximo salen de ahí (pueden quedar por encima / debajo del real).
// ---------------------------------------------------------------------------
import { normCode, type EnrichIndex } from './enrich';
import { esMesValido, mesCanon, mesKey, type RFIndex, type Serie } from './resumenFac';
import { norm, num } from '@/lib/text';

export type Granularidad = 'mes' | 'trimestre' | 'anio' | 'rango';
export type NivelComparativo = 'gerente' | 'sector' | 'grupo' | 'material';

/** Periodo como rango de meses "mm/aaaa" (ambos extremos incluidos). */
export interface Periodo { desde: string; hasta: string }

export interface OpcionPeriodo extends Periodo {
  valor: string;
  etiqueta: string;
  /** Para ordenar (mesKey del último mes). */
  k: number;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const mm = (m: number): string => String(m).padStart(2, '0');

export const valorPeriodo = (p: Periodo): string => `${p.desde}|${p.hasta}`;
export const etiquetaPeriodo = (p: Periodo): string => (p.desde === p.hasta ? p.desde : `${p.desde} – ${p.hasta}`);

/** "mm/aaaa" desplazado `n` meses (negativo = hacia atrás). */
export function desplazarMes(mes: string, n: number): string {
  const k = mesKey(mes) + n;
  const y = Math.floor((k - 1) / 12);
  return `${mm(((k - 1) % 12) + 1)}/${y}`;
}

/** Mismo periodo desplazado `n` meses (p. ej. -12 = el mismo periodo del año anterior). */
export const desplazarPeriodo = (p: Periodo, n: number): Periodo => ({ desde: desplazarMes(p.desde, n), hasta: desplazarMes(p.hasta, n) });

/** Cuántos meses abarca el periodo. */
export const mesesDelPeriodo = (p: Periodo): number => Math.max(0, mesKey(p.hasta) - mesKey(p.desde) + 1);

/** Periodo inmediato anterior, del mismo largo (el mes anterior, el trimestre anterior, el año anterior…). */
export const periodoAnterior = (p: Periodo): Periodo => desplazarPeriodo(p, -mesesDelPeriodo(p));

/** Opciones de mes / trimestre / año que tienen datos, del más reciente al más antiguo. */
export function opcionesPeriodo(gran: Exclude<Granularidad, 'rango'>, meses: readonly string[]): OpcionPeriodo[] {
  const m = new Map<string, OpcionPeriodo>();
  for (const mes of meses) {
    const [ms, ys] = mes.split('/');
    const mn = +(ms ?? 0);
    const y = +(ys ?? 0);
    if (!mn || !y) continue;
    let p: Periodo;
    let etiqueta: string;
    if (gran === 'mes') { p = { desde: `${mm(mn)}/${y}`, hasta: `${mm(mn)}/${y}` }; etiqueta = `${MESES[mn - 1]} ${y}`; }
    else if (gran === 'trimestre') {
      const q = Math.ceil(mn / 3);
      p = { desde: `${mm(q * 3 - 2)}/${y}`, hasta: `${mm(q * 3)}/${y}` };
      etiqueta = `T${q} ${y}`;
    } else { p = { desde: `01/${y}`, hasta: `12/${y}` }; etiqueta = `${y}`; }
    const valor = valorPeriodo(p);
    if (!m.has(valor)) m.set(valor, { ...p, valor, etiqueta, k: mesKey(p.hasta) });
  }
  return [...m.values()].sort((a, b) => b.k - a.k);
}

// ---- agregación ---------------------------------------------------------------------------------------------------------------------

export interface PrecioStats {
  /** Importe ÷ cantidad de todos los meses con venta del periodo. */
  prom: number;
  /** Menor / mayor precio unitario de una fila de facturación (cliente + centro + mes) del periodo. */
  min: number;
  max: number;
  /** Mes ("mm/aaaa") en que se dio el mínimo / el máximo ('' sin ventas). */
  mesMin: string;
  mesMax: string;
  /** De dónde salió el mínimo / el máximo (cliente y centro), para poder verificarlo. */
  refMin: string;
  refMax: string;
  /** Meses con venta que entraron al cálculo. */
  meses: number;
}
export interface Agg { imp: number; cant: number; precio: PrecioStats }

const PRECIO_VACIO: PrecioStats = { prom: 0, min: 0, max: 0, mesMin: '', mesMax: '', refMin: '', refMax: '', meses: 0 };

/** Menor y mayor precio unitario de las filas de UN material en UN mes, y de quién salieron. */
export interface Extremo { min: number; minRef: string; max: number; maxRef: string }
export type ExtremosMaterial = Map<string, Extremo>; // mes "mm/aaaa" → extremos
const extremosCache = new WeakMap<RFIndex, Map<string, ExtremosMaterial>>();

/** Extremos de precio por material y mes, de las filas de la facturación. Se arma UNA vez por índice (una pasada por las filas). */
export function extremosDePrecio(rf: RFIndex): Map<string, ExtremosMaterial> {
  const hit = extremosCache.get(rf);
  if (hit) return hit;
  const out = new Map<string, ExtremosMaterial>();
  for (const r of rf.rows) {
    const cant = num(r.cantidadFacturada);
    const imp = num(r.importeFacturado);
    if (!(cant > 0) || !(imp > 0)) continue;
    const mes = mesCanon(r.mesAno);
    if (!esMesValido(mes)) continue;
    const mat = norm(r.material);
    if (!mat) continue;
    const u = imp / cant;
    // Con los libros nuevos la fila trae el menor / mayor precio de las líneas que sumó; si no, el promedio de la fila.
    const uMin = r.precioMin && r.precioMin > 0 ? r.precioMin : u;
    const uMax = r.precioMax && r.precioMax > 0 ? r.precioMax : u;
    let porMes = out.get(mat);
    if (!porMes) { porMes = new Map(); out.set(mat, porMes); }
    const e = porMes.get(mes);
    const ref = () => `${norm(r.razonSocial) || norm(r.destinatario)} · centro ${norm(r.centro) || '—'}`;
    if (!e) porMes.set(mes, { min: uMin, minRef: ref(), max: uMax, maxRef: ref() });
    else {
      if (uMin < e.min) { e.min = uMin; e.minRef = ref(); }
      if (uMax > e.max) { e.max = uMax; e.maxRef = ref(); }
    }
  }
  extremosCache.set(rf, out);
  return out;
}

/** Venta, cantidad y precios de UNA serie mensual dentro del periodo. */
export function agregarSerie(serie: Serie | undefined, p: Periodo, extremos?: ExtremosMaterial): Agg {
  const lo = mesKey(p.desde);
  const hi = mesKey(p.hasta);
  let imp = 0;
  let cant = 0;
  let impP = 0;
  let cantP = 0;
  let min = 0;
  let max = 0;
  let mesMin = '';
  let mesMax = '';
  let refMin = '';
  let refMax = '';
  let meses = 0;
  for (const pt of serie ?? []) {
    const k = mesKey(pt.mes);
    if (k < lo || k > hi) continue;
    imp += pt.imp;
    cant += pt.cant;
    if (pt.cant > 0 && pt.imp > 0) {
      const u = pt.imp / pt.cant;
      impP += pt.imp;
      cantP += pt.cant;
      if (meses === 0 || u < min) { min = u; mesMin = pt.mes; }
      if (meses === 0 || u > max) { max = u; mesMax = pt.mes; }
      meses++;
    }
  }
  if (meses && extremos) {
    // Mínimo y máximo de las filas (cliente + centro + mes) dentro del periodo.
    let hay = false;
    for (const [mes, e] of extremos) {
      const k = mesKey(mes);
      if (k < lo || k > hi) continue;
      if (!hay || e.min < min) { min = e.min; mesMin = mes; refMin = e.minRef; }
      if (!hay || e.max > max) { max = e.max; mesMax = mes; refMax = e.maxRef; }
      hay = true;
    }
  }
  return { imp, cant, precio: meses ? { prom: impP / cantP, min, max, mesMin, mesMax, refMin, refMax, meses } : PRECIO_VACIO };
}

export const variacionPct = (a: number, b: number): number => (a ? ((b - a) / Math.abs(a)) * 100 : b ? 100 : 0);

export interface FilaComparativo {
  clave: string;
  descripcion: string;
  materiales: number;
  a: { imp: number; cant: number };
  b: { imp: number; cant: number };
  dImp: number;
  dImpPct: number;
  dCant: number;
  dCantPct: number;
  /** Solo en el nivel Material. */
  precios?: { a: PrecioStats; b: PrecioStats; dPromPct: number };
}

export interface Ruta { gerente?: string; sector?: string; grupo?: string }

export interface ResultadoComparativo {
  filas: FilaComparativo[];
  total: { a: { imp: number; cant: number }; b: { imp: number; cant: number } };
  materiales: number;
  /** Códigos pegados que no tienen venta en ninguno de los dos periodos. */
  faltantes: string[];
}

const claveMat = (m: unknown): string => normCode(m).toUpperCase();

/** Compara A contra B agrupando por `nivel`. Con `A` en `null` solo se ve el periodo B (sin comparación: A queda en ceros). `ruta` acota por los niveles superiores ya elegidos; `pegados` acota a esos materiales. */
export function compararPeriodos(
  rf: RFIndex,
  enrich: EnrichIndex,
  A: Periodo | null,
  B: Periodo,
  nivel: NivelComparativo,
  ruta: Ruta = {},
  pegados: readonly string[] = [],
): ResultadoComparativo {
  const set = pegados.length ? new Set(pegados.map(claveMat)) : null;
  const gerenteCache = new Map<string, string>();
  const gerenteDe = (sector: string): string => {
    let g = gerenteCache.get(sector);
    if (g === undefined) { g = enrich.gerentes.find((x) => enrich.sectorDeGerente(sector, x)) ?? ''; gerenteCache.set(sector, g); }
    return g || 'Sin gerente';
  };
  const extremos = extremosDePrecio(rf);
  const grupos = new Map<string, { fila: FilaComparativo; mats: number }>();
  const total = { a: { imp: 0, cant: 0 }, b: { imp: 0, cant: 0 } };
  const vistos = new Set<string>();
  let materiales = 0;

  for (const [mat, serie] of rf.mat) {
    const ck = claveMat(mat);
    if (set && !set.has(ck)) continue;
    const sector = enrich.matSector(mat) || 'Sin sector';
    const grupo = enrich.matGrupo(mat) || 'Sin grupo';
    const gerente = gerenteDe(sector);
    if (ruta.gerente && gerente !== ruta.gerente) continue;
    if (ruta.sector && sector !== ruta.sector) continue;
    if (ruta.grupo && grupo !== ruta.grupo) continue;
    const ext = extremos.get(mat);
    const a = A ? agregarSerie(serie, A, ext) : { imp: 0, cant: 0, precio: PRECIO_VACIO };
    const b = agregarSerie(serie, B, ext);
    if (!a.imp && !a.cant && !b.imp && !b.cant) continue;
    vistos.add(ck);
    materiales++;
    total.a.imp += a.imp; total.a.cant += a.cant; total.b.imp += b.imp; total.b.cant += b.cant;

    const clave = nivel === 'gerente' ? gerente : nivel === 'sector' ? sector : nivel === 'grupo' ? grupo : mat;
    let g = grupos.get(clave);
    if (!g) {
      g = {
        mats: 0,
        fila: { clave, descripcion: nivel === 'material' ? enrich.matTexto(mat) || rf.matTexto.get(mat) || '' : '', materiales: 0, a: { imp: 0, cant: 0 }, b: { imp: 0, cant: 0 }, dImp: 0, dImpPct: 0, dCant: 0, dCantPct: 0 },
      };
      grupos.set(clave, g);
    }
    g.fila.materiales++;
    g.fila.a.imp += a.imp; g.fila.a.cant += a.cant; g.fila.b.imp += b.imp; g.fila.b.cant += b.cant;
    if (nivel === 'material') g.fila.precios = { a: a.precio, b: b.precio, dPromPct: a.precio.prom ? variacionPct(a.precio.prom, b.precio.prom) : 0 };
  }

  const filas = [...grupos.values()].map(({ fila }) => ({
    ...fila,
    dImp: fila.b.imp - fila.a.imp,
    dImpPct: variacionPct(fila.a.imp, fila.b.imp),
    dCant: fila.b.cant - fila.a.cant,
    dCantPct: variacionPct(fila.a.cant, fila.b.cant),
  }));
  filas.sort((x, y) => Math.abs(y.dImp) - Math.abs(x.dImp));
  const faltantes = set ? pegados.filter((c) => !vistos.has(claveMat(c))) : [];
  return { filas, total, materiales, faltantes };
}

// ---- un solo periodo (sin comparar) ------------------------------------------------------------------------------------------------------

/** Año en curso: de enero del último año con datos hasta el último mes con datos. */
export function periodoAnioEnCurso(meses: readonly string[]): Periodo | null {
  if (!meses.length) return null;
  const ult = [...meses].sort((x, y) => mesKey(x) - mesKey(y))[meses.length - 1]!;
  return { desde: `01/${ult.split('/')[1]}`, hasta: ult };
}

/** Los últimos `n` meses CERRADOS: el mes en curso (el de `hoy`) no cuenta, porque su venta está incompleta. */
export function ultimosMesesCerrados(meses: readonly string[], n: number, hoy: Date = new Date()): Periodo | null {
  const hoyKey = hoy.getFullYear() * 12 + hoy.getMonth() + 1;
  const cerrados = meses.filter((m) => mesKey(m) < hoyKey).sort((x, y) => mesKey(x) - mesKey(y));
  const hasta = cerrados[cerrados.length - 1];
  return hasta ? { desde: desplazarMes(hasta, -(n - 1)), hasta } : null;
}

export interface MesMaterial { mes: string; cant: number; imp: number; /** Importe ÷ cantidad del mes (0 si no hubo venta). */ precio: number }

/** Mes a mes de UN material dentro del periodo, con todos los meses del rango (los sin venta en cero). */
export function serieMensualMaterial(rf: RFIndex, material: string, p: Periodo): MesMaterial[] {
  const serie = rf.mat.get(material) ?? [];
  const porMes = new Map(serie.map((pt) => [mesKey(pt.mes), pt]));
  const out: MesMaterial[] = [];
  for (let k = mesKey(p.desde); k <= mesKey(p.hasta) && out.length < 600; k++) {
    const mes = `${mm(((k - 1) % 12) + 1)}/${Math.floor((k - 1) / 12)}`;
    const pt = porMes.get(k);
    const cant = pt?.cant ?? 0;
    const imp = pt?.imp ?? 0;
    out.push({ mes, cant, imp, precio: cant > 0 && imp > 0 ? imp / cant : 0 });
  }
  return out;
}
