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
import { mesKey } from './resumenFac';
import type { EnrichIndex } from './enrich';
import { buildAnalisisPredicates, analisisVentas, type AnalisisFilters, type ClienteAna } from './comercial';
import type { BOItem } from './buildBO';
import { buildPeriodo, type PeriodoAnalisis } from './incremento';

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

/** Venta + margen aproximado de un material en un periodo, sumando TODOS los
 * clientes (`rf.mat`, ya agregado). Finanzas solo respeta el filtro por
 * material (sector/grupo de artículo/gerente) — el filtro por
 * ejecutivo/grupo de cliente se aplica a nivel cliente en la sección
 * Clientes, más abajo, donde sí importa quién compró. */
function totalesMaterial(rf: RFIndex, material: string, periodo: PeriodoAnalisis): { imp: number; cant: number } {
  const serie = rf.mat.get(material);
  return serie ? sumaSerieEnRango(serie, periodo) : { imp: 0, cant: 0 };
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
  impB: number;
}

export interface AnalisisDirectivoResult {
  periodoA: PeriodoAnalisis;
  periodoB: PeriodoAnalisis;
  totalA: Totales;
  totalB: Totales;
  porSector: SectorComparado[];
  porGerente: GerenteComparado[];
  porGrupoCliente: GrupoClienteComparado[];
  /** Top 12 por importe en B, cada bloque. */
  altas: ClienteMovimiento[];
  recuperados: ClienteMovimiento[];
  /** Universo = clientes con al menos una compra histórica en `rf`; activos = con compra en el periodo. */
  penetracion: { activosA: number; activosB: number; universo: number };
  /** Clientes con caída/sin compra reciente — mismo criterio de `analisisVentas().riesgo`, ya filtrado por `filters`. */
  deterioro: ReturnType<typeof analisisVentas> extends infer R ? (R extends { riesgo: infer Rg } ? Rg : never) : never;
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
  bo: BOItem[],
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

  rf.mat.forEach((_serie, m) => {
    if (!matPasa(m)) return;
    const costo = enrich.matCosto(m);
    const sumA = totalesMaterial(rf, m, periodoA);
    const sumB = totalesMaterial(rf, m, periodoB);
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
  const grpA = new Map<string, Totales>(), grpB = new Map<string, Totales>();
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

    if (!activoEnB) return;
    const primeraCompra = Math.min(...keys);
    const movimiento: ClienteMovimiento = {
      code, razon: rf.solicRazon.get(code) || '',
      ejec: enrich.ejecutivoNombre(rf.solicGpoV.get(code) || '') || '',
      grupo,
      impB: totB.imp,
    };
    if (primeraCompra >= periodoB.kIni) {
      altas.push(movimiento);
    } else if (!activoEnA) {
      recuperados.push(movimiento);
    }
  });
  altas.sort((x, y) => y.impB - x.impB);
  recuperados.sort((x, y) => y.impB - x.impB);
  const porGrupoCliente: GrupoClienteComparado[] = [...new Set([...grpA.keys(), ...grpB.keys()])]
    .map((grupo) => ({ grupo, a: grpA.get(grupo) || ZERO, b: grpB.get(grupo) || ZERO }))
    .sort((x, y) => y.b.imp - x.b.imp);

  const ventas = analisisVentas(rf, bo, enrich, filters);
  const deterioro = ventas?.riesgo ?? [];

  return {
    periodoA, periodoB, totalA, totalB, porSector, porGerente, porGrupoCliente,
    altas: altas.slice(0, 12), recuperados: recuperados.slice(0, 12),
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
export function serieAnualComparada(rf: RFIndex, enrich: EnrichIndex, filters: AnisisFiltersOnlyMaterial, anio: number): AnioComparado {
  const { matPasa } = buildAnalisisPredicates(rf, enrich, filters);
  const impPorMes = new Array(13).fill(0) as number[]; // índice 1-12
  const margenPorMes = new Array(13).fill(0) as number[];
  const conDato = new Array(13).fill(false) as boolean[];
  rf.mat.forEach((serie, m) => {
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

type AnisisFiltersOnlyMaterial = Pick<AnalisisFilters, 'sector' | 'grupoArticulo' | 'gerente'>;

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

  frases.push(`La venta ${dirTxt(ventaPct)} ${Math.abs(ventaPct).toFixed(1)}% de ${r.periodoA.desde}–${r.periodoA.hasta} a ${r.periodoB.desde}–${r.periodoB.hasta}, y el margen aproximado ${dirTxt(margenPct)} ${Math.abs(margenPct).toFixed(1)}%.`);

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

  frases.push(`${r.altas.length} cliente(s) nuevo(s), ${r.recuperados.length} recuperado(s) y ${r.deterioro.length} en riesgo de deterioro${r.deterioro[0] ? `, el de mayor base siendo ${r.deterioro[0].razon || r.deterioro[0].code}` : ''}.`);

  return frases.join(' ');
}

function formatDeltaTxt(row: { a: Totales; b: Totales }): string {
  const p = pctDelta(row.a.imp, row.b.imp);
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}
