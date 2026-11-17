// ---------------------------------------------------------------------------
// comercial.ts · Commercial intelligence computed entirely from Resumen_Fac
// monthly series. Pure port of analisisVentas() from legacy js/analisis.js.
// ---------------------------------------------------------------------------
import { mesKey, mesAnterior, hoyMes, type RFIndex, type Serie } from './resumenFac';
import type { BOItem } from './buildBO';
import type { EnrichIndex } from './enrich';
import { norm, num } from '@/lib/text';

const refK = () => mesKey(mesAnterior(hoyMes()));
const sumRange = (serie: Serie, kIni: number, kFin: number) => {
  let t = 0;
  for (const s of serie || []) {
    const k = mesKey(s.mes);
    if (k >= kIni && k <= kFin) t += s.imp;
  }
  return t;
};
const lastBuyK = (serie: Serie) => {
  let mx = 0;
  for (const s of serie || []) if (s.imp > 0) { const k = mesKey(s.mes); if (k > mx) mx = k; }
  return mx;
};
const qLabelDe = (k: number) => `Q${Math.floor(((k - 1) % 12) / 3) + 1} ${Math.floor((k - 1) / 12)}`;
const kToLbl = (k: number) => {
  const y = Math.floor((k - 1) / 12);
  const m = ((k - 1) % 12) + 1;
  return String(m).padStart(2, '0') + '/' + y;
};

export interface ClienteAna {
  code: string; razon: string; ejec: string; grupo: string;
  i12: number; a3: number; p3: number; last: number; compras: number; sinComprar: number; base?: number;
}
export interface MatAna { code: string; texto: string; a3: number; p3: number; i12: number; }
export interface SectorAna {
  sector: string; a3: number; p3: number; i12: number;
  grupos: Map<string, { grupo: string; a3: number; p3: number; i12: number }>;
}

/** Contra qué se comparan los últimos 3 meses: los 3 meses INMEDIATOS anteriores (sensible a la estacionalidad: un cierre de año contra un verano engaña) o los
 * MISMOS 3 meses del año anterior (lo que un director de ventas suele querer). */
export type BaseComparacion = 'previos' | 'anio';

/** Efecto de cada material en el cambio de ventas entre dos ventanas (ver `puenteVentas`). */
export interface PuenteMaterial { code: string; texto: string; base: number; actual: number; volumen: number; precio: number; delta: number }
export interface PuenteVentas {
  base: number;
  actual: number;
  /** Cambio de importe explicado por vender más o menos unidades al precio de la ventana base (incluye la mezcla entre materiales). */
  volumen: number;
  /** Cambio de importe explicado por el cambio de precio medio de cada material, sobre las unidades actuales. */
  precio: number;
  /** Materiales que no se vendían en la ventana base (o venían con cantidad no positiva) y ahora sí. */
  nuevos: number;
  /** Materiales que se vendían y ya no. */
  perdidos: number;
  /** Casos con cantidades no positivas en ambas ventanas (devoluciones, notas de crédito): se muestran aparte para que la suma cuadre. */
  otros: number;
  delta: number;
  top: PuenteMaterial[];
}

export interface ResumenLista { n: number; /** Suma de (últ. 3m − base) de TODOS los de la lista, no solo del top mostrado. */ delta: number }

export interface AnalisisResult {
  serieTotal: Serie;
  crecen: ClienteAna[];
  caen: ClienteAna[];
  riesgo: ClienteAna[];
  matSuben: MatAna[];
  matCaen: MatAna[];
  sectores: SectorAna[];
  conc: { top5: number; top10: number; total12: number; nClientes: number };
  ops: { total: number; bloq: number; top: { pedido: string; razon: string; imp: number; mat: string; bloqueado: boolean }[] };
  /** Cuántos cumplen cada criterio EN TOTAL (las tablas solo muestran el top 12) y cuánto importe mueven. */
  resumen: { crecen: ResumenLista; caen: ResumenLista; riesgo: { n: number; base: number }; matSuben: ResumenLista; matCaen: ResumenLista };
  /** Cambio de ventas de los últimos 3 meses contra la base elegida, separado en volumen / precio / nuevos / perdidos. */
  puente: PuenteVentas;
  baseComparacion: BaseComparacion;
  kpi: {
    mesPrevImp: number; mesPrevAnt: number;
    /** Trimestre en curso con SOLO sus meses ya cerrados, contra esos mismos meses del año anterior (antes se comparaba el mes parcial contra un mes completo). */
    qImp: number; qAnt: number; qMeses: number; qLabel: string;
    /** Año a la fecha (enero → último mes cerrado) contra el mismo tramo del año anterior. */
    ytdImp: number; ytdAnt: number; ytdMeses: number; ytdAnio: number;
    activos3m: number; refLbl: string;
    /** Mes de corte (último mes del periodo), en la escala `mesKey`. */
    refK: number;
    /** El PERIODO elegido (por omisión, los últimos 3 meses cerrados) contra su base de comparación, con las ventas ya filtradas. */
    periodo: { n: number; desdeK: number; hastaK: number; desdeLbl: string; hastaLbl: string; actual: number; base: number; baseDesdeLbl: string; baseHastaLbl: string };
  };
}

/** Filtros opcionales sobre las mismas fuentes (Resumen_Fac + Sugerencias) que
 * alimentan todo el análisis — se aplican ANTES de agregar, así que clientes,
 * materiales, sectores y oportunidades quedan consistentemente acotados
 * (no solo las tablas que muestran esos campos). */
export interface AnalisisFilters {
  ejecutivo?: string;
  grupoCliente?: string;
  /** Multi-select de grupo de cliente — si viene con al menos un valor, GANA
   * sobre `grupoCliente` (single-select, usado por Análisis/Incremento).
   * Permite elegir uno, varios o "casi todos" los grupos. */
  grupoClientes?: string[];
  sector?: string;
  grupoArticulo?: string;
  /** Multi-select de material (código) — acota a esos materiales. Análisis
   * Directivo; vacío/ausente = sin filtro. */
  materiales?: string[];
  /** Multi-select de sector — si trae algún valor, GANA sobre `sector`. */
  sectores?: string[];
  /** Multi-select de grupo de artículo — si trae algún valor, GANA sobre `grupoArticulo`. */
  gruposArticulo?: string[];
  /** Gerente de marca: acota a los sectores a su cargo (pestaña GERENCIA DE MARCA). */
  gerente?: string;
  /** Base de comparación del periodo (por omisión, el periodo inmediato anterior). */
  base?: BaseComparacion;
  /** Multi-select de ejecutivo (nombre) — si trae algún valor, GANA sobre `ejecutivo`. */
  ejecutivos?: string[];
  /** Multi-select de las dimensiones de ventas del ejecutivo (catálogo): «Sin dato» cuando el ejecutivo no las tiene. */
  gerenciasVentas?: string[];
  gerentesVentas?: string[];
  canalesVentas?: string[];
  oficinasVentas?: string[];
  /** Multi-select de cliente (código de solicitante). */
  clientes?: string[];
  /** PERIODO analizado, 'mm/aaaa'. `hasta` es el mes de corte (por omisión, el último mes cerrado con datos; nunca pasa del último mes con datos) y
   * `desde` fija cuántos meses abarca (por omisión, 3). El periodo se compara contra la base elegida con el mismo número de meses. */
  desde?: string;
  hasta?: string;
}

/** Predicados de los 4 filtros de Análisis (`AnalisisFilters`), compartidos
 * entre `analisisVentas` y cualquier otro índice que deba respetar los
 * mismos filtros (p.ej. la clasificación ABC/Pareto en `abc.ts`, que por sí
 * sola no sabe nada de estos filtros) — un solo lugar decide qué material o
 * qué cliente "pasa", para que ambos queden consistentes. */
export function buildAnalisisPredicates(
  rf: RFIndex,
  enrich: EnrichIndex,
  filters?: AnalisisFilters,
): { matPasa: (m: string) => boolean; clientePasa: (c: string) => boolean } {
  const materialesSet = filters?.materiales?.length ? new Set(filters.materiales) : null;
  const sectoresSet = filters?.sectores?.length ? new Set(filters.sectores) : null;
  const gruposArtSet = filters?.gruposArticulo?.length ? new Set(filters.gruposArticulo) : null;
  const matPasa = (m: string) => {
    if (materialesSet && !materialesSet.has(m)) return false;
    if (filters?.gerente && !enrich.sectorDeGerente(enrich.matSector(m), filters.gerente)) return false;
    if (sectoresSet) { if (!sectoresSet.has(enrich.matSector(m) || '(sin sector)')) return false; }
    else if (filters?.sector && (enrich.matSector(m) || '(sin sector)') !== filters.sector) return false;
    if (gruposArtSet) { if (!gruposArtSet.has(enrich.matGrupo(m) || '(sin grupo)')) return false; }
    else if (filters?.grupoArticulo && (enrich.matGrupo(m) || '(sin grupo)') !== filters.grupoArticulo) return false;
    return true;
  };
  const ejecDe = (c: string) => enrich.ejecutivoNombre(rf.solicGpoV.get(c) || '') || '';
  const grupoDe = (c: string) => enrich.grupoCliente(rf.solicGpoC.get(c) || '') || (rf.solicGpoC.get(c) || '');
  const grupoClientesSet = filters?.grupoClientes?.length ? new Set(filters.grupoClientes) : null;
  const ejecutivosSet = filters?.ejecutivos?.length ? new Set(filters.ejecutivos) : null;
  const gerenciasSet = filters?.gerenciasVentas?.length ? new Set(filters.gerenciasVentas) : null;
  const gerentesVSet = filters?.gerentesVentas?.length ? new Set(filters.gerentesVentas) : null;
  const canalesSet = filters?.canalesVentas?.length ? new Set(filters.canalesVentas) : null;
  const oficinasSet = filters?.oficinasVentas?.length ? new Set(filters.oficinasVentas) : null;
  const clientesSet = filters?.clientes?.length ? new Set(filters.clientes) : null;
  const atributos = (c: string) => enrich.ejecutivoAtributos(rf.solicGpoV.get(c) || '');
  const clientePasa = (c: string) => {
    if (clientesSet && !clientesSet.has(c)) return false;
    if (ejecutivosSet) { if (!ejecutivosSet.has(ejecDe(c))) return false; }
    else if (filters?.ejecutivo && ejecDe(c) !== filters.ejecutivo) return false;
    if (gerenciasSet || gerentesVSet || canalesSet || oficinasSet) {
      const at = atributos(c);
      if (gerenciasSet && !gerenciasSet.has(at.gerenciaVentas || 'Sin dato')) return false;
      if (gerentesVSet && !gerentesVSet.has(at.gerenteVentas || 'Sin dato')) return false;
      if (canalesSet && !canalesSet.has(at.canalVentas || 'Sin dato')) return false;
      if (oficinasSet && !oficinasSet.has(at.oficinaVentas || 'Sin dato')) return false;
    }
    if (grupoClientesSet) { if (!grupoClientesSet.has(grupoDe(c) || '(sin grupo)')) return false; }
    else if (filters?.grupoCliente && grupoDe(c) !== filters.grupoCliente) return false;
    return true;
  };
  return { matPasa, clientePasa };
}

/** ¿Hay algún filtro que dependa de QUIÉN compró (no de qué material)? Si sí,
 * `rf.mat` (ya agregado por todos los clientes) no sirve y hay que reconstruir
 * las series por material sumando solo a los clientes que pasan el filtro. */
export function hayFiltroCliente(filters: AnalisisFilters): boolean {
  return !!(filters.ejecutivo || filters.grupoCliente || filters.grupoClientes?.length || filters.ejecutivos?.length || filters.gerenciasVentas?.length || filters.gerentesVentas?.length || filters.canalesVentas?.length || filters.oficinasVentas?.length || filters.clientes?.length);
}

/** ¿Hay CUALQUIER filtro activo (material o cliente)? Sin filtros, los totales
 * salen directo de `rf.total` (suma de todas las filas de Resumen_Fac). */
export function hayFiltroAnalisis(filters?: AnalisisFilters): boolean {
  return !!(filters && (filters.ejecutivo || filters.grupoCliente || filters.grupoClientes?.length || filters.sector || filters.grupoArticulo || filters.materiales?.length || filters.sectores?.length || filters.gruposArticulo?.length || filters.gerente || filters.ejecutivos?.length || filters.gerenciasVentas?.length || filters.gerentesVentas?.length || filters.canalesVentas?.length || filters.oficinasVentas?.length || filters.clientes?.length));
}

/** Series mensuales POR MATERIAL respetando TODOS los filtros: sin filtro de
 * cliente devuelve `rf.mat` tal cual (rápido, como antes); con filtro de
 * cliente (Grupo cliente / Ejecutivo) recorre `rf.solicMats` sumando solo los
 * clientes que pasan `clientePasa` y los materiales que pasan `matPasa`. Así
 * Venta, Margen, curvas anuales y serie mensual reaccionan a Grupo cliente. */
export function matSeriesFiltradas(
  rf: RFIndex, filters: AnalisisFilters, matPasa: (m: string) => boolean, clientePasa: (c: string) => boolean,
): Map<string, Serie> {
  if (!hayFiltroCliente(filters)) return rf.mat;
  const acc = new Map<string, Map<string, { mes: string; cant: number; imp: number }>>();
  rf.solicMats.forEach((porMat, code) => {
    if (!clientePasa(code)) return;
    porMat.forEach((serie, m) => {
      if (!matPasa(m)) return;
      let mm = acc.get(m);
      if (!mm) { mm = new Map(); acc.set(m, mm); }
      for (const p of serie) {
        const o = mm.get(p.mes) ?? { mes: p.mes, cant: 0, imp: 0 };
        o.cant += p.cant; o.imp += p.imp;
        mm.set(p.mes, o);
      }
    });
  });
  const out = new Map<string, Serie>();
  acc.forEach((mm, m) => out.set(m, [...mm.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes))));
  return out;
}

/** Puente de ventas entre la ventana actual [R-2, R] y la base elegida. Por material: Δ importe = Δ cantidad × precio base (volumen) + Δ precio × cantidad actual (precio);
 * la suma de todas las piezas es EXACTAMENTE actual − base. */
export function puenteVentas(matSeries: Map<string, Serie>, matPasa: (m: string) => boolean, textoDe: (m: string) => string, R: number, base: BaseComparacion, n = 3): PuenteVentas {
  const [bIni, bFin] = base === 'anio' ? [R - n + 1 - 12, R - 12] : [R - 2 * n + 1, R - n];
  const sum = (serie: Serie, kIni: number, kFin: number) => {
    let cant = 0, imp = 0;
    for (const s of serie || []) { const k = mesKey(s.mes); if (k >= kIni && k <= kFin) { cant += s.cant; imp += s.imp; } }
    return { cant, imp };
  };
  const out: PuenteVentas = { base: 0, actual: 0, volumen: 0, precio: 0, nuevos: 0, perdidos: 0, otros: 0, delta: 0, top: [] };
  const filas: PuenteMaterial[] = [];
  matSeries.forEach((serie, m) => {
    if (!matPasa(m)) return;
    const A = sum(serie, R - n + 1, R);
    const P = sum(serie, bIni, bFin);
    if (!A.imp && !P.imp && !A.cant && !P.cant) return;
    out.base += P.imp;
    out.actual += A.imp;
    let volumen = 0, precio = 0;
    if (P.cant > 0 && A.cant > 0) {
      const pP = P.imp / P.cant;
      volumen = (A.cant - P.cant) * pP;
      precio = A.imp - P.imp - volumen; // = (pA − pP) × cantA; se obtiene por diferencia para que la suma cuadre al centavo
      out.volumen += volumen;
      out.precio += precio;
    } else if (A.cant > 0 && P.cant <= 0) out.nuevos += A.imp - P.imp;
    else if (P.cant > 0 && A.cant <= 0) out.perdidos += A.imp - P.imp;
    else out.otros += A.imp - P.imp;
    filas.push({ code: m, texto: textoDe(m), base: P.imp, actual: A.imp, volumen, precio, delta: A.imp - P.imp });
  });
  out.delta = out.actual - out.base;
  out.top = filas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
  return out;
}

/** Último mes CERRADO con datos (escala `mesKey`): el mes anterior a hoy, o antes si la carga se quedó atrás (con datos viejos las ventanas quedaban vacías y todo salía en 0). */
export function mesCorteDefault(rf: RFIndex): number {
  const dataK = rf.curmes ? mesKey(rf.curmes) : 0;
  return dataK > 0 ? Math.min(refK(), dataK) : refK();
}

export function analisisVentas(rf: RFIndex | null, bo: BOItem[], enrich: EnrichIndex, filters?: AnalisisFilters): AnalisisResult | null {
  if (!rf) return null;
  const R0 = mesCorteDefault(rf);
  const dataK = rf.curmes ? mesKey(rf.curmes) : R0;
  const hoyK = mesKey(hoyMes());
  // Mes de corte elegido (nunca después del último mes con datos) y cuántos meses abarca el periodo (por omisión 3).
  const hastaK = filters?.hasta ? mesKey(filters.hasta) : 0;
  const R = hastaK > 0 ? Math.min(hastaK, dataK || hastaK) : R0;
  const desdeK = filters?.desde ? mesKey(filters.desde) : 0;
  const n = desdeK > 0 ? Math.max(1, R - desdeK + 1) : 3;
  // «Hoy» relativo al corte: con el corte por omisión es hoy; con un corte pasado, los meses sin comprar se miden desde ese corte.
  const corteK = R + (hoyK - R0);
  const baseComp: BaseComparacion = filters?.base === 'anio' ? 'anio' : 'previos';
  const a3 = (s: Serie) => sumRange(s, R - n + 1, R);
  const p3 = (s: Serie) => (baseComp === 'anio' ? sumRange(s, R - n + 1 - 12, R - 12) : sumRange(s, R - 2 * n + 1, R - n));
  const imp12 = (s: Serie) => sumRange(s, R - 11, R);

  const { matPasa, clientePasa } = buildAnalisisPredicates(rf, enrich, filters);

  // Series por material respetando TAMBIÉN los filtros de cliente (Ejecutivo /
  // Grupo cliente); sin ellos devuelve `rf.mat` tal cual.
  const matSeries = matSeriesFiltradas(rf, filters ?? {}, matPasa, clientePasa);

  const tot = new Map<number, { cant: number; imp: number }>();
  matSeries.forEach((serie, m) => {
    if (!matPasa(m)) return;
    serie.forEach((x) => {
      const k = mesKey(x.mes);
      const o = tot.get(k) || { cant: 0, imp: 0 };
      o.cant += x.cant;
      o.imp += x.imp;
      tot.set(k, o);
    });
  });
  const serieTotal: Serie = hayFiltroAnalisis(filters)
    ? [...tot.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, v]) => ({ mes: kToLbl(k), cant: v.cant, imp: v.imp }))
    : rf.total.map((p) => ({ ...p })); // suma directa de Resumen_Fac, incluye filas sin material

  const ejecDe = (c: string) => enrich.ejecutivoNombre(rf.solicGpoV.get(c) || '') || '';
  const grupoDe = (c: string) => enrich.grupoCliente(rf.solicGpoC.get(c) || '') || (rf.solicGpoC.get(c) || '');
  const clientes: ClienteAna[] = [];
  rf.solic.forEach((serie, s) => {
    if (!clientePasa(s)) return;
    const i12 = imp12(serie);
    const last = lastBuyK(serie);
    if (!i12 && !last) return;
    const compras = (serie || []).filter((x) => x.imp > 0).length;
    clientes.push({
      code: s, razon: rf.solicRazon.get(s) || '', ejec: ejecDe(s), grupo: grupoDe(s),
      i12, a3: a3(serie), p3: p3(serie), last, compras, sinComprar: last ? corteK - last : 999,
    });
  });
  const conBase = clientes.filter((c) => c.p3 > 0 || c.a3 > 0);
  const crecenTodos = conBase.filter((c) => c.a3 > c.p3 * 1.15).sort((a, b) => b.a3 - b.p3 - (a.a3 - a.p3));
  const caenTodos = conBase.filter((c) => c.p3 > 0 && c.a3 < c.p3 * 0.85).sort((a, b) => b.p3 - b.a3 - (a.p3 - a.a3));
  const riesgoTodos = clientes
    .filter((c) => c.compras >= 3 && c.sinComprar >= 3 && c.sinComprar <= 24)
    .map((c) => ({ ...c, base: sumRange(rf.solic.get(c.code) || [], c.last - 11, c.last) }))
    .sort((a, b) => (b.base || 0) - (a.base || 0));
  const crecen = crecenTodos.slice(0, 12);
  const caen = caenTodos.slice(0, 12);
  const riesgo = riesgoTodos.slice(0, 12);

  const mats: MatAna[] = [];
  matSeries.forEach((serie, m) => {
    if (!matPasa(m)) return;
    const A = a3(serie);
    const P = p3(serie);
    if (A || P) mats.push({ code: m, texto: rf.matTexto.get(m) || '', a3: A, p3: P, i12: imp12(serie) });
  });
  const matSubenTodos = mats.filter((x) => x.a3 > x.p3 * 1.15).sort((a, b) => b.a3 - b.p3 - (a.a3 - a.p3));
  const matCaenTodos = mats.filter((x) => x.p3 > 0 && x.a3 < x.p3 * 0.85).sort((a, b) => b.p3 - b.a3 - (a.p3 - a.a3));
  const matSuben = matSubenTodos.slice(0, 12);
  const matCaen = matCaenTodos.slice(0, 12);
  const lista = (l: { a3: number; p3: number }[]): ResumenLista => ({ n: l.length, delta: l.reduce((s, x) => s + (x.a3 - x.p3), 0) });

  const secMap = new Map<string, SectorAna>();
  matSeries.forEach((serie, m) => {
    if (!matPasa(m)) return;
    const A = a3(serie);
    const P = p3(serie);
    const I = imp12(serie);
    if (!A && !P && !I) return;
    const sec = enrich.matSector(m) || '(sin sector)';
    const gru = enrich.matGrupo(m) || '(sin grupo)';
    let so = secMap.get(sec);
    if (!so) {
      so = { sector: sec, a3: 0, p3: 0, i12: 0, grupos: new Map() };
      secMap.set(sec, so);
    }
    so.a3 += A;
    so.p3 += P;
    so.i12 += I;
    let go = so.grupos.get(gru);
    if (!go) {
      go = { grupo: gru, a3: 0, p3: 0, i12: 0 };
      so.grupos.set(gru, go);
    }
    go.a3 += A;
    go.p3 += P;
    go.i12 += I;
  });
  const sectores = [...secMap.values()].filter((s) => s.i12 > 0).sort((a, b) => b.i12 - a.i12);

  const ordered = clientes.filter((c) => c.i12 > 0).sort((a, b) => b.i12 - a.i12);
  const total12 = ordered.reduce((a, c) => a + c.i12, 0);
  const share = (n: number) => (total12 ? ordered.slice(0, n).reduce((a, c) => a + c.i12, 0) / total12 : 0);

  let opTotal = 0;
  let opBloq = 0;
  const opTop: { pedido: string; razon: string; imp: number; mat: string; bloqueado: boolean }[] = [];
  bo.forEach((it) => {
    const b = it.bo;
    if (filters?.ejecutivo && (enrich.ejecutivoNombre(b.gpoVdor) || '') !== filters.ejecutivo) return;
    if (filters?.grupoCliente && (enrich.grupoCliente(b.gpoCte) || norm(b.gpoCte)) !== filters.grupoCliente) return;
    if (!matPasa(b.materialBase)) return;
    const impPend = num(b.cantidadPendiente) * num(b.precio);
    const bloqueado = !!norm(b.bloqueado);
    opTotal += impPend;
    if (bloqueado) opBloq += impPend;
    if (it.fuentes && it.fuentes.length) {
      opTop.push({ pedido: norm(b.pedido), razon: norm(b.razonSocial), imp: impPend, mat: norm(b.materialBase), bloqueado });
    }
  });
  opTop.sort((a, b) => b.imp - a.imp);

  const mesPrevImp = sumRange(serieTotal, R, R);
  const mesPrevAnt = sumRange(serieTotal, R - 12, R - 12);
  // Trimestre del mes en curso: solo sus meses CERRADOS (≤ R) contra los mismos meses del año anterior. Antes se sumaba el mes parcial contra el mes completo
  // del año anterior y el trimestre siempre parecía caer.
  const q0 = Math.floor(((hoyK - 1) % 12) / 3) * 3 + 1 + Math.floor((hoyK - 1) / 12) * 12;
  const qMeses = Math.max(0, Math.min(R, q0 + 2) - q0 + 1);
  const qImp = qMeses ? sumRange(serieTotal, q0, q0 + qMeses - 1) : 0;
  const qAnt = qMeses ? sumRange(serieTotal, q0 - 12, q0 + qMeses - 1 - 12) : 0;
  const ene = Math.floor((R - 1) / 12) * 12 + 1;
  const ytdMeses = R - ene + 1;
  const ytdImp = sumRange(serieTotal, ene, R);
  const ytdAnt = sumRange(serieTotal, ene - 12, R - 12);
  const activos3m = clientes.filter((c) => c.sinComprar <= 3).length;

  return {
    serieTotal, crecen, caen, riesgo, matSuben, matCaen, sectores,
    conc: { top5: share(5), top10: share(10), total12, nClientes: ordered.length },
    ops: { total: opTotal, bloq: opBloq, top: opTop.slice(0, 30) },
    resumen: { crecen: lista(crecenTodos), caen: lista(caenTodos), riesgo: { n: riesgoTodos.length, base: riesgoTodos.reduce((s, c) => s + (c.base || 0), 0) }, matSuben: lista(matSubenTodos), matCaen: lista(matCaenTodos) },
    puente: puenteVentas(matSeries, matPasa, (m) => rf.matTexto.get(m) || '', R, baseComp, n),
    baseComparacion: baseComp,
    kpi: {
      mesPrevImp, mesPrevAnt, qImp, qAnt, qMeses, qLabel: qLabelDe(q0), ytdImp, ytdAnt, ytdMeses, ytdAnio: Math.floor((R - 1) / 12), activos3m, refLbl: kToLbl(R), refK: R,
      periodo: {
        n, desdeK: R - n + 1, hastaK: R, desdeLbl: kToLbl(R - n + 1), hastaLbl: kToLbl(R),
        actual: sumRange(serieTotal, R - n + 1, R),
        base: baseComp === 'anio' ? sumRange(serieTotal, R - n + 1 - 12, R - 12) : sumRange(serieTotal, R - 2 * n + 1, R - n),
        baseDesdeLbl: kToLbl(baseComp === 'anio' ? R - n + 1 - 12 : R - 2 * n + 1), baseHastaLbl: kToLbl(baseComp === 'anio' ? R - 12 : R - n),
      },
    },
  };
}
