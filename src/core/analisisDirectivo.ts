// ---------------------------------------------------------------------------
// analisisDirectivo.ts · Fase 1 del módulo "Análisis Directivo": Finanzas
// (venta/margen) y Clientes (altas/recuperación/penetración/deterioro),
// comparando dos periodos mm/aaaa elegidos por el usuario, filtrable por
// Gerente de marca/sector/grupo de artículo/ejecutivo (mismos `AnalisisFilters`
// que ya usa /analisis e /incremento — ver `buildAnalisisPredicates`).
//
// Margen es APROXIMADO: se aplica el costo VIGENTE del catálogo
// (`enrich.matCosto`) a cualquier mes histórico, porque no hay histórico de
// costo. Se etiqueta así en la UI a propósito — nunca ocultar esa salvedad.
// ---------------------------------------------------------------------------
import type { RFIndex, Serie } from './resumenFac';
import { mesKey, hoyMes } from './resumenFac';
import type { EnrichIndex } from './enrich';
import { buildAnalisisPredicates, type AnalisisFilters, type ClienteAna } from './comercial';
import type { BOItem } from './buildBO';
import { buildPeriodo, type PeriodoAnalisis } from './incremento';
import { norm } from '@/lib/text';

export type { PeriodoAnalisis };
export { buildPeriodo };

export interface Totales {
  imp: number;
  cant: number;
  /** Margen aproximado: imp − costoVigente × cant. Solo suma materiales con costo > 0 en `margenCubre`. */
  margen: number;
  /** Importe facturado de materiales SIN costo en catálogo — para no maquillar el margen con huecos silenciosos. */
  impSinCosto: number;
}

const ZERO: Totales = { imp: 0, cant: 0, margen: 0, impSinCosto: 0 };

function sumaSerieEnRango(serie: Serie, periodo: PeriodoAnalisis): { imp: number; cant: number } {
  let imp = 0, cant = 0;
  for (const p of serie) {
    const k = mesKey(p.mes);
    if (k >= periodo.kIni && k <= periodo.kFin) { imp += p.imp; cant += p.cant; }
  }
  return { imp, cant };
}

/** ¿Hay algún filtro que dependa de QUIÉN compró (no de qué material)? Si sí,
 * `rf.mat` (ya agregado por todos los clientes) no sirve y hay que reconstruir
 * las series por material sumando solo a los clientes que pasan el filtro. */
function hayFiltroCliente(filters: AnalisisFilters): boolean {
  return !!(filters.ejecutivo || filters.grupoCliente || filters.grupoClientes?.length);
}

/** Series mensuales POR MATERIAL respetando TODOS los filtros: sin filtro de
 * cliente devuelve `rf.mat` tal cual (rápido, como antes); con filtro de
 * cliente (Grupo cliente / Ejecutivo) recorre `rf.solicMats` sumando solo los
 * clientes que pasan `clientePasa` y los materiales que pasan `matPasa`. Así
 * Venta, Margen, curvas anuales y serie mensual reaccionan a Grupo cliente. */
function matSeriesFiltradas(
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

export interface SectorComparado {
  sector: string;
  a: Totales;
  b: Totales;
}

export interface GerenteComparado {
  gerente: string;
  a: Totales;
  b: Totales;
}

export interface ClienteMovimiento extends Pick<ClienteAna, 'code' | 'razon' | 'ejec' | 'grupo'> {
  /** Facturado en el periodo A (0 para altas/recuperados). */
  impA: number;
  /** Facturado en el periodo B (0 para bajas). */
  impB: number;
}

/** "Puente" de venta A → B: cuánto del cambio se explica por cada movimiento
 * de clientes. `ventaA + altas + recuperados + crecimiento + decrecimiento +
 * bajas + otros = ventaB` SIEMPRE (`otros` absorbe lo facturado a materiales
 * sin solicitante, normalmente 0), así el gráfico de cascada siempre cuadra
 * con las tarjetas de Finanzas. `decrecimiento` y `bajas` son negativos. */
export interface PuenteVenta {
  ventaA: number;
  altas: number;
  recuperados: number;
  crecimiento: number;
  decrecimiento: number;
  bajas: number;
  otros: number;
  ventaB: number;
}

/** Composición de la cartera al pasar de A a B. Retenidos = activos en ambos. */
export interface Cartera {
  activosA: number;
  activosB: number;
  retenidos: number;
  retenidosCrecen: number;
  retenidosCaen: number;
  altas: number;
  recuperados: number;
  bajas: number;
  /** retenidos ÷ activosA (null si no había clientes activos en A). */
  retencionPct: number | null;
  /** bajas ÷ activosA. */
  bajaPct: number | null;
}

export interface ClienteTop extends ClienteMovimiento {
  /** impB ÷ venta total B de los clientes. */
  share: number;
  /** Etiqueta del movimiento: alta / recuperado / retenido. */
  estado: 'alta' | 'recuperado' | 'retenido';
}

export interface EjecutivoComparado {
  ejecutivo: string;
  a: number;
  b: number;
  activosB: number;
  altas: number;
  recuperados: number;
  bajas: number;
}

export interface AnalisisDirectivoResult {
  periodoA: PeriodoAnalisis;
  periodoB: PeriodoAnalisis;
  totalA: Totales;
  totalB: Totales;
  porSector: SectorComparado[];
  porGerente: GerenteComparado[];
  porGrupoCliente: GrupoClienteComparado[];
  /** Listas COMPLETAS (sin tope), mayor importe primero. Altas/recuperados por `impB`, bajas por `impA`. */
  altas: ClienteMovimiento[];
  recuperados: ClienteMovimiento[];
  /** Activos en A que ya no compraron en B (con los filtros aplicados). */
  bajas: ClienteMovimiento[];
  puente: PuenteVenta;
  cartera: Cartera;
  /** Los 10 clientes con más venta en B — concentración de la cartera. */
  topClientes: ClienteTop[];
  /** % de la venta B que concentran los 10 primeros. */
  concentracionTop10: number;
  porEjecutivo: EjecutivoComparado[];
  /** Universo = clientes con al menos una compra histórica en `rf`; activos = con compra en el periodo. */
  penetracion: { activosA: number; activosB: number; universo: number };
  /** Clientes en riesgo de deterioro — respeta TODOS los filtros, ordenados por `total` desc. */
  deterioro: ClienteDeterioro[];
}

export interface ClienteDeterioro {
  code: string;
  razon: string;
  ejec: string;
  grupo: string;
  /** Meses desde su última compra (de los materiales que pasan el filtro) hasta hoy. */
  sinComprar: number;
  /** "mm/aaaa" de la última compra. */
  ultimaCompra: string;
  /** Facturado en los 12 meses que terminan en su última compra. */
  total: number;
  /** total ÷ 12. */
  promMensual: number;
}

const kToLbl = (k: number): string => {
  const y = Math.floor((k - 1) / 12);
  const m = ((k - 1) % 12) + 1;
  return String(m).padStart(2, '0') + '/' + y;
};

/** Clientes en riesgo de deterioro. Mismo criterio que `analisisVentas().riesgo`
 * (≥3 meses con compra y entre 3 y 24 meses sin comprar respecto a hoy) pero
 * calculado sobre las series del cliente RESTRINGIDAS a los materiales que
 * pasan el filtro (sector/grupo de artículo/gerente) — `analisisVentas` usa la
 * serie total del cliente, por eso esos filtros no lo movían — y sin el tope
 * de 12 filas. `total` = facturado en los 12 meses previos a su última compra
 * (lo que "valía" el cliente antes de dejar de comprar), `promMensual` =
 * total ÷ 12. Orden: mayor total primero. */
function deterioroClientes(
  rf: RFIndex, enrich: EnrichIndex, matPasa: (m: string) => boolean, clientePasa: (c: string) => boolean,
): ClienteDeterioro[] {
  const hoyK = mesKey(hoyMes());
  const out: ClienteDeterioro[] = [];
  rf.solicMats.forEach((porMat, code) => {
    if (!clientePasa(code)) return;
    const porMes = new Map<number, number>();
    porMat.forEach((serie, m) => {
      if (!matPasa(m)) return;
      for (const p of serie) {
        if (p.imp <= 0) continue;
        const k = mesKey(p.mes);
        if (!k) continue;
        porMes.set(k, (porMes.get(k) || 0) + p.imp);
      }
    });
    if (porMes.size < 3) return;
    const last = Math.max(...porMes.keys());
    const sinComprar = hoyK - last;
    if (sinComprar < 3 || sinComprar > 24) return;
    let total = 0;
    porMes.forEach((imp, k) => { if (k >= last - 11 && k <= last) total += imp; });
    out.push({
      code, razon: rf.solicRazon.get(code) || '',
      ejec: enrich.ejecutivoNombre(rf.solicGpoV.get(code) || '') || '',
      grupo: enrich.grupoCliente(rf.solicGpoC.get(code) || '') || (rf.solicGpoC.get(code) || ''),
      sinComprar, ultimaCompra: kToLbl(last), total, promMensual: total / 12,
    });
  });
  return out.sort((x, y) => y.total - x.total);
}

export interface GrupoClienteComparado {
  grupo: string;
  a: Totales;
  b: Totales;
}

function addTotales(t: Totales, add: { imp: number; cant: number }, costo: number): Totales {
  const margen = costo > 0 ? add.imp - costo * add.cant : 0;
  return {
    imp: t.imp + add.imp,
    cant: t.cant + add.cant,
    margen: t.margen + margen,
    impSinCosto: t.impSinCosto + (costo > 0 ? 0 : add.imp),
  };
}

/** Suma dos `Totales` ya calculados (a diferencia de `addTotales`, que suma
 * un `{imp,cant}` crudo aplicándole el costo de un material) — para agregar
 * el total ya calculado POR CLIENTE al total de su grupo de cliente. */
function mergeTotales(t: Totales, add: Totales): Totales {
  return { imp: t.imp + add.imp, cant: t.cant + add.cant, margen: t.margen + add.margen, impSinCosto: t.impSinCosto + add.impSinCosto };
}

export function analisisDirectivo(
  rf: RFIndex | null,
  _bo: BOItem[],
  enrich: EnrichIndex,
  filters: AnalisisFilters,
  periodoA: PeriodoAnalisis,
  periodoB: PeriodoAnalisis,
): AnalisisDirectivoResult | null {
  if (!rf) return null;
  const { matPasa, clientePasa } = buildAnalisisPredicates(rf, enrich, filters);

  let totalA: Totales = ZERO, totalB: Totales = ZERO;
  const secA = new Map<string, Totales>(), secB = new Map<string, Totales>();
  const gerA = new Map<string, Totales>(), gerB = new Map<string, Totales>();

  matSeriesFiltradas(rf, filters, matPasa, clientePasa).forEach((serie, m) => {
    if (!matPasa(m)) return;
    const costo = enrich.matCosto(m);
    const sumA = sumaSerieEnRango(serie, periodoA);
    const sumB = sumaSerieEnRango(serie, periodoB);
    if (!sumA.imp && !sumB.imp) return;
    totalA = addTotales(totalA, sumA, costo);
    totalB = addTotales(totalB, sumB, costo);

    const sector = enrich.matSector(m) || '(sin sector)';
    secA.set(sector, addTotales(secA.get(sector) || ZERO, sumA, costo));
    secB.set(sector, addTotales(secB.get(sector) || ZERO, sumB, costo));

    for (const g of enrich.gerentes) {
      if (!enrich.sectorDeGerente(sector, g)) continue;
      gerA.set(g, addTotales(gerA.get(g) || ZERO, sumA, costo));
      gerB.set(g, addTotales(gerB.get(g) || ZERO, sumB, costo));
    }
  });

  const porSector: SectorComparado[] = [...new Set([...secA.keys(), ...secB.keys()])]
    .map((sector) => ({ sector, a: secA.get(sector) || ZERO, b: secB.get(sector) || ZERO }))
    .sort((x, y) => (y.b.imp - y.a.imp) - (x.b.imp - x.a.imp));
  const porGerente: GerenteComparado[] = [...new Set([...gerA.keys(), ...gerB.keys()])]
    .map((gerente) => ({ gerente, a: gerA.get(gerente) || ZERO, b: gerB.get(gerente) || ZERO }))
    .sort((x, y) => y.b.imp - x.b.imp);

  // Clientes: altas/recuperación/penetración, restringido a los materiales
  // que pasan el filtro (gerente/sector/grupoArticulo) vía `solicMats` — a
  // diferencia de Finanzas (que usa `rf.mat`, ya agregado por TODOS los
  // clientes), aquí sí hace falta el detalle por cliente.
  let universo = 0, activosA = 0, activosB = 0;
  const altas: ClienteMovimiento[] = [];
  const recuperados: ClienteMovimiento[] = [];
  const bajas: ClienteMovimiento[] = [];
  const retenidosTop: ClienteMovimiento[] = [];
  let retenidos = 0, retenidosCrecen = 0, retenidosCaen = 0, crecimiento = 0, decrecimiento = 0;
  const grpA = new Map<string, Totales>(), grpB = new Map<string, Totales>();
  const ejec = new Map<string, EjecutivoComparado>();
  rf.solic.forEach((_serieTotal, code) => {
    if (!clientePasa(code)) return;
    const porMaterial = rf.solicMats.get(code);
    if (!porMaterial || !porMaterial.size) return;
    universo++;
    // Serie combinada del cliente (todos sus meses, para saber cuándo fue su
    // primera compra) + totales por periodo con margen (por material, para
    // aplicar el costo correcto de cada uno) — solo materiales que pasan el filtro.
    const porMes = new Map<string, { cant: number; imp: number }>();
    let totA: Totales = ZERO, totB: Totales = ZERO;
    let algo = false;
    porMaterial.forEach((serie, m) => {
      if (!matPasa(m)) return;
      for (const p of serie) {
        if (p.imp <= 0) continue;
        algo = true;
        const o = porMes.get(p.mes) || { cant: 0, imp: 0 };
        o.cant += p.cant; o.imp += p.imp;
        porMes.set(p.mes, o);
      }
      const costo = enrich.matCosto(m);
      totA = addTotales(totA, sumaSerieEnRango(serie, periodoA), costo);
      totB = addTotales(totB, sumaSerieEnRango(serie, periodoB), costo);
    });
    if (!algo) { universo--; return; }
    const keys = [...porMes.keys()].map(mesKey);
    const activoEnA = totA.imp > 0;
    const activoEnB = totB.imp > 0;
    if (activoEnA) activosA++;
    if (activoEnB) activosB++;

    const grupo = enrich.grupoCliente(rf.solicGpoC.get(code) || '') || (rf.solicGpoC.get(code) || '') || '(sin grupo)';
    grpA.set(grupo, mergeTotales(grpA.get(grupo) || ZERO, totA));
    grpB.set(grupo, mergeTotales(grpB.get(grupo) || ZERO, totB));

    const ejecutivo = enrich.ejecutivoNombre(rf.solicGpoV.get(code) || '') || '(sin ejecutivo)';
    const eo = ejec.get(ejecutivo) ?? { ejecutivo, a: 0, b: 0, activosB: 0, altas: 0, recuperados: 0, bajas: 0 };
    eo.a += totA.imp; eo.b += totB.imp;
    if (activoEnB) eo.activosB++;
    ejec.set(ejecutivo, eo);

    if (!activoEnA && !activoEnB) return;

    const movimiento: ClienteMovimiento = {
      code, razon: rf.solicRazon.get(code) || '', ejec: ejecutivo === '(sin ejecutivo)' ? '' : ejecutivo, grupo,
      impA: totA.imp, impB: totB.imp,
    };
    if (activoEnA && !activoEnB) { bajas.push(movimiento); eo.bajas++; return; }
    if (activoEnA && activoEnB) {
      retenidos++;
      const d = totB.imp - totA.imp;
      if (d > 0) { retenidosCrecen++; crecimiento += d; } else if (d < 0) { retenidosCaen++; decrecimiento += d; }
      retenidosTop.push(movimiento);
      return;
    }
    // Activo solo en B: alta si nunca había comprado antes de B, recuperado si ya era cliente.
    const primeraCompra = Math.min(...keys);
    if (primeraCompra >= periodoB.kIni) { altas.push(movimiento); eo.altas++; }
    else { recuperados.push(movimiento); eo.recuperados++; }
  });
  altas.sort((x, y) => y.impB - x.impB);
  recuperados.sort((x, y) => y.impB - x.impB);
  bajas.sort((x, y) => y.impA - x.impA);
  const porGrupoCliente: GrupoClienteComparado[] = [...new Set([...grpA.keys(), ...grpB.keys()])]
    .map((grupo) => ({ grupo, a: grpA.get(grupo) || ZERO, b: grpB.get(grupo) || ZERO }))
    .sort((x, y) => y.b.imp - x.b.imp);
  const porEjecutivo = [...ejec.values()].filter((e) => e.a || e.b).sort((x, y) => y.b - x.b);

  const sumaImpB = (l: ClienteMovimiento[]) => l.reduce((t, c) => t + c.impB, 0);
  const bajasImpA = bajas.reduce((t, c) => t + c.impA, 0);
  const cambioTotal = totalB.imp - totalA.imp;
  const componentes = sumaImpB(altas) + sumaImpB(recuperados) + crecimiento + decrecimiento - bajasImpA;
  const puente: PuenteVenta = {
    ventaA: totalA.imp, altas: sumaImpB(altas), recuperados: sumaImpB(recuperados),
    crecimiento, decrecimiento, bajas: -bajasImpA,
    // Lo que no se explica por clientes (ventas sin solicitante); ~0 salvo datos incompletos.
    otros: Math.abs(cambioTotal - componentes) < 0.5 ? 0 : cambioTotal - componentes,
    ventaB: totalB.imp,
  };
  const cartera: Cartera = {
    activosA, activosB, retenidos, retenidosCrecen, retenidosCaen,
    altas: altas.length, recuperados: recuperados.length, bajas: bajas.length,
    retencionPct: activosA ? (retenidos / activosA) * 100 : null,
    bajaPct: activosA ? (bajas.length / activosA) * 100 : null,
  };

  const todosActivosB: ClienteTop[] = [
    ...altas.map((c) => ({ ...c, estado: 'alta' as const })),
    ...recuperados.map((c) => ({ ...c, estado: 'recuperado' as const })),
    ...retenidosTop.map((c) => ({ ...c, estado: 'retenido' as const })),
  ].map((c) => ({ ...c, share: 0 })).sort((x, y) => y.impB - x.impB);
  const ventaBActivos = todosActivosB.reduce((t, c) => t + c.impB, 0);
  const topClientes = todosActivosB.slice(0, 10).map((c) => ({ ...c, share: ventaBActivos ? (c.impB / ventaBActivos) * 100 : 0 }));
  const concentracionTop10 = topClientes.reduce((t, c) => t + c.share, 0);

  const deterioro = deterioroClientes(rf, enrich, matPasa, clientePasa);

  return {
    periodoA, periodoB, totalA, totalB, porSector, porGerente, porGrupoCliente,
    altas, recuperados, bajas, puente, cartera, topClientes, concentracionTop10, porEjecutivo,
    penetracion: { activosA, activosB, universo },
    deterioro,
  };
}

const MES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface MesAnual {
  mesNum: number; // 1-12
  label: string; // "Ene"
  /** null antes de que arranque el año o si el mes es proyección pura sin dato base. */
  imp: number | null;
  margen: number | null;
  /** true en los meses de proyección (línea punteada) — el año sigue en curso y no hay dato real todavía. */
  esProyeccion: boolean;
}

export interface AnioComparado {
  anio: number;
  meses: MesAnual[];
  /** Promedio mensual de los meses CON dato real — la base de la proyección. */
  promedioImpReal: number;
  promedioMargenReal: number;
  esAnioEnCurso: boolean;
}

/** Evolución mensual (Ene–Dic) de venta y margen aproximado para un año
 * completo, respetando el filtro de material (sector/grupo/gerente) —
 * mismo `matPasa` que Finanzas. Si `anio` es el año del mes más reciente en
 * `rf` (`curmes`) y todavía faltan meses por cerrar, esos meses se llenan con
 * el promedio de los meses ya reales (`esProyeccion: true`) para poder
 * dibujar la línea punteada de "cómo se espera que quede" el año. */
export function serieAnualComparada(rf: RFIndex, enrich: EnrichIndex, filters: AnalisisFilters, anio: number): AnioComparado {
  const { matPasa, clientePasa } = buildAnalisisPredicates(rf, enrich, filters);
  const impPorMes = new Array(13).fill(0) as number[]; // índice 1-12
  const margenPorMes = new Array(13).fill(0) as number[];
  const conDato = new Array(13).fill(false) as boolean[];
  matSeriesFiltradas(rf, filters, matPasa, clientePasa).forEach((serie, m) => {
    if (!matPasa(m)) return;
    const costo = enrich.matCosto(m);
    for (const p of serie) {
      const k = mesKey(p.mes);
      const y = Math.floor((k - 1) / 12);
      const mn = ((k - 1) % 12) + 1;
      if (y !== anio || p.imp <= 0) continue;
      impPorMes[mn] += p.imp;
      if (costo > 0) margenPorMes[mn] += p.imp - costo * p.cant;
      conDato[mn] = true;
    }
  });
  const mesesConDato = conDato.filter(Boolean).length;
  const promedioImpReal = mesesConDato ? impPorMes.reduce((s, v, i) => (conDato[i] ? s + v : s), 0) / mesesConDato : 0;
  const promedioMargenReal = mesesConDato ? margenPorMes.reduce((s, v, i) => (conDato[i] ? s + v : s), 0) / mesesConDato : 0;

  const anioActual = Math.floor((mesKey(rf.curmes) - 1) / 12);
  const mesActual = ((mesKey(rf.curmes) - 1) % 12) + 1;
  const esAnioEnCurso = anio === anioActual;
  const ultimoMesConDato = esAnioEnCurso ? mesActual : 12;

  const meses: MesAnual[] = [];
  for (let mn = 1; mn <= 12; mn++) {
    const enCurso = esAnioEnCurso && mn > ultimoMesConDato;
    meses.push({
      mesNum: mn,
      label: MES_ABREV[mn - 1],
      imp: enCurso ? (mesesConDato ? promedioImpReal : null) : (conDato[mn] ? impPorMes[mn] : (mn <= ultimoMesConDato ? 0 : null)),
      margen: enCurso ? (mesesConDato ? promedioMargenReal : null) : (conDato[mn] ? margenPorMes[mn] : (mn <= ultimoMesConDato ? 0 : null)),
      esProyeccion: enCurso,
    });
  }
  return { anio, meses, promedioImpReal, promedioMargenReal, esAnioEnCurso };
}

/** Serie mensual TOTAL (todo el historial) con todos los filtros aplicados —
 * la línea "Serie del filtro" de la tarjeta Facturación mensual. */
export function serieMensualFiltrada(rf: RFIndex, enrich: EnrichIndex, filters: AnalisisFilters): Serie {
  const { matPasa, clientePasa } = buildAnalisisPredicates(rf, enrich, filters);
  const acc = new Map<string, { mes: string; cant: number; imp: number }>();
  matSeriesFiltradas(rf, filters, matPasa, clientePasa).forEach((serie, m) => {
    if (!matPasa(m)) return;
    for (const p of serie) {
      const o = acc.get(p.mes) ?? { mes: p.mes, cant: 0, imp: 0 };
      o.cant += p.cant; o.imp += p.imp;
      acc.set(p.mes, o);
    }
  });
  return [...acc.values()].sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
}

export interface ClienteMesRow {
  razon: string;
  solic: string;
  dest: string;
  material: string;
  cant: number;
  imp: number;
}

/** Detalle de quién compró qué en un mes, con todos los filtros aplicados —
 * mismo formato que el panel `mesClientesFiltro` (drill de Consumo). Se arma
 * desde las filas crudas de Resumen_Fac para conservar el destinatario real. */
export function clientesDeMes(rf: RFIndex, enrich: EnrichIndex, filters: AnalisisFilters, mes: string): ClienteMesRow[] {
  const { matPasa, clientePasa } = buildAnalisisPredicates(rf, enrich, filters);
  const acc = new Map<string, ClienteMesRow>();
  for (const r of rf.rows) {
    if (norm(r.mesAno) !== mes) continue;
    const solic = norm(r.solicitante), dest = norm(r.destinatario), material = norm(r.material);
    if (!matPasa(material) || !clientePasa(solic)) continue;
    const key = `${solic}||${dest}||${material}`;
    const o = acc.get(key) ?? { razon: norm(r.razonSocial), solic, dest, material, cant: 0, imp: 0 };
    o.cant += Number(r.cantidadFacturada) || 0;
    o.imp += Number(r.importeFacturado) || 0;
    acc.set(key, o);
  }
  return [...acc.values()].filter((o) => o.cant || o.imp).sort((x, y) => y.imp - x.imp);
}

const pctDelta = (a: number, b: number): number => (a > 0 ? ((b - a) / a) * 100 : b > 0 ? 100 : 0);
const dirTxt = (p: number): string => (p > 0.5 ? 'subió' : p < -0.5 ? 'bajó' : 'se mantuvo');

/** Mejor y peor mover de una lista comparada {a,b}, por delta absoluto de
 * importe — null si no hay al menos 2 categorías distintas que comparar. */
function extremos<T extends { a: Totales; b: Totales }>(rows: T[]): { mejor: T; peor: T } | null {
  if (rows.length < 2) return null;
  const ordenAsc = [...rows].sort((x, y) => (x.b.imp - x.a.imp) - (y.b.imp - y.a.imp));
  return { peor: ordenAsc[0], mejor: ordenAsc[ordenAsc.length - 1] };
}

/** Narrativa (4-6 oraciones) para encabezar el módulo — texto armado con los
 * deltas ya calculados (no es IA generativa), cubriendo venta, margen,
 * sectores, GRUPOS DE CLIENTE, penetración y los tres bloques de clientes,
 * para que se pueda leer sola en una presentación sin tener que explicarla. */
export function narrativaDirectivo(r: AnalisisDirectivoResult): string {
  const ventaPct = pctDelta(r.totalA.imp, r.totalB.imp);
  const margenPct = pctDelta(r.totalA.margen, r.totalB.margen);
  const frases: string[] = [];

  frases.push(`La venta ${dirTxt(ventaPct)} ${Math.abs(ventaPct).toFixed(1)}% de ${r.periodoA.desde}–${r.periodoA.hasta} a ${r.periodoB.desde}–${r.periodoB.hasta}, y el rendimiento aproximado ${dirTxt(margenPct)} ${Math.abs(margenPct).toFixed(1)}%.`);

  const secExt = extremos(r.porSector);
  if (secExt && secExt.mejor.sector !== secExt.peor.sector) {
    frases.push(`Por sector, ${secExt.mejor.sector} lideró el crecimiento (${formatDeltaTxt(secExt.mejor)}) y ${secExt.peor.sector} el retroceso (${formatDeltaTxt(secExt.peor)}).`);
  }

  const grpExt = extremos(r.porGrupoCliente.filter((g) => g.grupo !== '(sin grupo)'));
  if (grpExt && grpExt.mejor.grupo !== grpExt.peor.grupo) {
    frases.push(`Por grupo de cliente, ${grpExt.mejor.grupo} fue el más dinámico (${formatDeltaTxt(grpExt.mejor)}) mientras ${grpExt.peor.grupo} retrocedió (${formatDeltaTxt(grpExt.peor)}).`);
  } else if (r.porGrupoCliente.length === 1) {
    frases.push(`Todo el análisis corresponde al grupo de cliente ${r.porGrupoCliente[0].grupo}.`);
  }

  const penetracionPct = r.penetracion.universo ? (r.penetracion.activosB / r.penetracion.universo) * 100 : 0;
  frases.push(`${r.penetracion.activosB} cliente(s) activo(s) de ${r.penetracion.universo} en el universo filtrado (${penetracionPct.toFixed(1)}% de penetración).`);

  const c = r.cartera;
  if (c.retencionPct != null) {
    frases.push(`Retención de cartera: ${c.retencionPct.toFixed(1)}% de los ${c.activosA} clientes activos del periodo A siguen comprando; ${c.bajas} dejaron de comprar (${formatMoneda(-r.puente.bajas)} que facturaban).`);
  }
  frases.push(`${r.altas.length} cliente(s) nuevo(s) aportaron ${formatMoneda(r.puente.altas)} y ${r.recuperados.length} recuperado(s) ${formatMoneda(r.puente.recuperados)}; ${r.deterioro.length} más están en riesgo de deterioro${r.deterioro[0] ? `, el de mayor base siendo ${r.deterioro[0].razon || r.deterioro[0].code}` : ''}.`);
  if (r.topClientes.length >= 3) {
    frases.push(`Los 10 principales clientes concentran ${r.concentracionTop10.toFixed(0)}% de la venta del periodo B.`);
  }

  return frases.join(' ');
}

const formatMoneda = (n: number): string => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

function formatDeltaTxt(row: { a: Totales; b: Totales }): string {
  const p = pctDelta(row.a.imp, row.b.imp);
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}
