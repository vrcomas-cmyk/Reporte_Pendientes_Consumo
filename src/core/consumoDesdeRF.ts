// ---------------------------------------------------------------------------
// consumoDesdeRF.ts · Deriva las filas de Consumo (ConsumoRow) desde las filas
// de "Resumen_Fac", de modo que Resumen_Fac sea la ÚNICA fuente de facturación
// y ya no se descargue la pestaña "Reporte de Consumo". Puro: sin React/DOM.
// ---------------------------------------------------------------------------
import type { ConsumoRow, ResumenFacRow } from './types';
import { correrPorTramos, correrSincrono } from '@/lib/tramos';
import { esMesValido, mesCanon, mesKey, tendenciaTexto, type Serie, type SeriePoint } from './resumenFac';
import { norm, num } from '@/lib/text';

export type PromedioModo = 'historia' | '12m' | 'conCompra';

export const PROMEDIO_MODOS: { key: PromedioModo; label: string; title: string }[] = [
  { key: 'historia', label: 'Historia', title: 'Toda la historia (o el periodo filtrado)' },
  { key: '12m', label: '12 meses cerrados', title: 'Suma de los 12 meses cerrados previos al mes actual ÷ 12' },
  { key: 'conCompra', label: 'Solo con compra', title: 'Promedio solo de los meses con compra' },
];

export interface RangoMeses {
  /** Escala `mesKey` (año*12+mes). null/undefined = sin cota. */
  lo?: number | null;
  hi?: number | null;
  /** Selección de meses (periodos saltados): si viene, solo cuentan esos meses y el promedio se divide entre cuántos son. */
  meses?: ReadonlySet<number> | null;
}

const keyAMes = (k: number): string => {
  const yy = Math.floor((k - 1) / 12);
  const mm = ((k - 1) % 12) + 1;
  return String(mm).padStart(2, '0') + '/' + yy;
};

/** Promedio mensual de cantidad de una serie mensual.
 *  - `historia`: Σcant ÷ meses de la ventana. Ventana = rango del filtro de
 *    periodo si hay uno; si no, de la 1ª compra al mes actual (`curmes`).
 *  - `12m`: Σcant de los 12 meses cerrados previos a `curmes` ÷ 12 (ignora el rango).
 *  - `conCompra`: Σcant ÷ nº de meses con cantidad > 0 en la ventana de `historia`. */
export function promedioConsumo(serie: Serie, modo: PromedioModo, curmes: string, rango?: RangoMeses): number {
  if (!serie || !serie.length) return 0;
  const curK = mesKey(curmes);
  if (!curK) return 0;
  if (modo === '12m') {
    let sum = 0;
    for (const p of serie) {
      const k = mesKey(p.mes);
      if (k >= curK - 12 && k <= curK - 1) sum += p.cant;
    }
    return sum / 12;
  }
  const firstK = mesKey(serie[0].mes);
  const lo = rango?.lo ?? firstK;
  const hi = rango?.hi ?? curK;
  if (!lo || !hi || hi < lo) return 0;
  const meses = rango?.meses && rango.meses.size > 0 ? rango.meses : null;
  let sum = 0;
  let conCompra = 0;
  for (const p of serie) {
    const k = mesKey(p.mes);
    if (k < lo || k > hi) continue;
    if (meses && !meses.has(k)) continue;
    sum += p.cant;
    if (p.cant > 0) conCompra++;
  }
  if (modo === 'conCompra') return conCompra ? sum / conCompra : 0;
  return sum / (meses ? meses.size : hi - lo + 1);
}

interface Grupo {
  centro: string;
  solicitante: string;
  destinatario: string;
  razonSocial: string;
  material: string;
  textoMaterial: string;
  gpoVdor: string;
  gpoCte: string;
  porMes: Map<string, SeriePoint>;
  /** mes → centro → importe: para elegir el centro de la ÚLTIMA facturación cuando no se agrupa por centro. */
  centrosPorMes: Map<string, Map<string, number>>;
}

export interface OpcionesConsumo {
  /** true (por defecto): una fila por Centro + Destinatario + Material, como el reporte. false: una fila por
   * Solicitante + Destinatario + Material con TODOS los centros juntos (la serie, la última y la penúltima son del
   * conjunto) y `centro` = el último centro facturado. */
  agruparPorCentro?: boolean;
}

/** Centro de donde sale un cliente+material (Solicitante/Destinatario/Material), con los últimos 12 meses con facturación.
 *  Cada mes cuenta como UNA factura y su centro es el de mayor importe de ese mes. Regla:
 *   · Base: el centro con más meses en la ventana (empate → el más reciente).
 *   · Cambio: cuando un centro suma 3 facturas SEGUIDAS (en orden de mes) pasa a ser el centro, y se queda así aunque luego
 *     haya una factura suelta en otro centro; solo cambia cuando otro centro junta sus propias 3 seguidas.
 *  Sin meses en la ventana usa el centro de la última facturación. `centrosPorMes`: mes → centro → importe. */
const colador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const porCodigo = (a: string, b: string): number => colador.compare(a, b);

/** Orden por cliente: Solicitante → Destinatario → Material (códigos, orden numérico). */
export const compararClienteMaterial = (a: ConsumoRow, b: ConsumoRow): number =>
  porCodigo(a.solicitante, b.solicitante) || porCodigo(a.destinatario, b.destinatario) || porCodigo(a.material, b.material) || porCodigo(a.centro, b.centro);

export function centroDeFacturacion(centrosPorMes: Map<string, Map<string, number>>, curK: number): string {
  const meses = [...centrosPorMes.keys()].map((m) => ({ m, k: mesKey(m) })).filter((x) => x.k > 0).sort((a, b) => a.k - b.k);
  const elegir = (m: string): string => {
    const cs = [...(centrosPorMes.get(m) ?? [])].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]));
    return cs[0]?.[0] ?? '';
  };
  const ventana = meses.filter((x) => x.k >= curK - 11 && x.k <= curK);
  if (!ventana.length) {
    const ult = meses[meses.length - 1];
    return ult ? elegir(ult.m) : '';
  }
  const secuencia = ventana.map((x) => elegir(x.m)).filter(Boolean);
  // Base: el más frecuente; en empate, el que apareció más recientemente.
  const cuenta = new Map<string, { n: number; ultimo: number }>();
  secuencia.forEach((c, i) => { const e = cuenta.get(c) ?? { n: 0, ultimo: -1 }; e.n++; e.ultimo = i; cuenta.set(c, e); });
  let actual = [...cuenta].sort((a, b) => b[1].n - a[1].n || b[1].ultimo - a[1].ultimo)[0]?.[0] ?? '';
  // Cambio por 3 seguidas.
  let racha = 0;
  let centroRacha = '';
  for (const c of secuencia) {
    racha = c === centroRacha ? racha + 1 : 1;
    centroRacha = c;
    if (racha >= 3) actual = c;
  }
  return actual;
}

/** Ejecutivo de la última facturación de un destinatario (empate: mayor importe; luego el código menor, para ser determinista). */
function ejecutivoActual(v: { porVdor: Map<string, number> } | undefined): string {
  if (!v) return '';
  return [...v.porVdor].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
}

/** Una fila de Consumo por Centro + Destinatario + Material (o por Solicitante + Destinatario + Material, ver
 * `OpcionesConsumo`). `umDe` aporta la unidad de medida (Resumen_Fac no la trae) desde el catálogo. */
export function* consumoDesdeResumenFacGen(rows: ResumenFacRow[], umDe?: (material: string) => string, opciones: OpcionesConsumo = {}): Generator<number, ConsumoRow[]> {
  const porCentro = opciones.agruparPorCentro !== false;
  let paso = 0;
  let curK = 0;
  let curmes = '';
  for (const r of rows) {
    if ((++paso & 2047) === 0) yield paso / (2 * rows.length + 1);
    const mes = mesCanon(r.mesAno);
    if (!esMesValido(mes)) continue;
    const k = mesKey(mes);
    if (k > curK) { curK = k; curmes = mes; }
  }
  if (!curK) return [];

  const grupos = new Map<string, Grupo>();
  const ultMesDest = new Map<string, number>();
  // Ejecutivo (Gpo. Vdor.) por destinatario: el de su ÚLTIMA facturación (si ese mes lo facturaron varios, el de mayor importe).
  const vendedorDest = new Map<string, { k: number; porVdor: Map<string, number> }>();
  for (const r of rows) {
    if ((++paso & 2047) === 0) yield paso / (2 * rows.length + 1);
    const mes = mesCanon(r.mesAno);
    if (!esMesValido(mes)) continue;
    const material = norm(r.material);
    if (!material) continue;
    const dest = norm(r.destinatario);
    const centro = norm(r.centro);
    const key = porCentro ? centro + '||' + dest + '||' + material : norm(r.solicitante) + '||' + dest + '||' + material;
    let g = grupos.get(key);
    if (!g) {
      g = {
        centro, solicitante: '', destinatario: dest, razonSocial: '', material, textoMaterial: '',
        gpoVdor: '', gpoCte: '', porMes: new Map(), centrosPorMes: new Map(),
      };
      grupos.set(key, g);
    }
    if (!g.solicitante) g.solicitante = norm(r.solicitante);
    if (!g.razonSocial) g.razonSocial = norm(r.razonSocial);
    if (!g.textoMaterial) g.textoMaterial = norm(r.textoMaterial);
    if (!g.gpoVdor) g.gpoVdor = norm(r.gpoVdor);
    if (!g.gpoCte) g.gpoCte = norm(r.gpoCte);
    const cant = num(r.cantidadFacturada);
    const imp = num(r.importeFacturado);
    let p = g.porMes.get(mes);
    if (!p) { p = { mes, cant: 0, imp: 0 }; g.porMes.set(mes, p); }
    p.cant += cant;
    p.imp += imp;
    if (!porCentro) {
      let cs = g.centrosPorMes.get(mes);
      if (!cs) { cs = new Map<string, number>(); g.centrosPorMes.set(mes, cs); }
      cs.set(centro, (cs.get(centro) ?? 0) + imp);
    }
    if ((cant || imp) && mesKey(mes) > (ultMesDest.get(dest) ?? 0)) ultMesDest.set(dest, mesKey(mes));
    const vdor = norm(r.gpoVdor);
    if (vdor && (cant || imp)) {
      const kMes = mesKey(mes);
      let v = vendedorDest.get(dest);
      if (!v || kMes > v.k) { v = { k: kMes, porVdor: new Map() }; vendedorDest.set(dest, v); }
      if (kMes === v.k) v.porVdor.set(vdor, (v.porVdor.get(vdor) ?? 0) + Math.abs(imp));
    }
  }

  const out: ConsumoRow[] = [];
  let gi = 0;
  for (const g of grupos.values()) {
    if ((++gi & 255) === 0) yield 0.5 + gi / (2 * grupos.size + 1);
    const serie: Serie = [...g.porMes.values()].sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
    const activos = serie.filter((p) => p.cant || p.imp);
    const ult = activos[activos.length - 1];
    const pen = activos[activos.length - 2];
    const actual = serie.find((p) => mesKey(p.mes) === curK);

    // Precios unitarios mensuales (importe ÷ cantidad) de los últimos 12 meses.
    let pMin = 0;
    let pMax = 0;
    let sumImp = 0;
    let sumCant = 0;
    for (const p of serie) {
      const k = mesKey(p.mes);
      if (k < curK - 11 || k > curK || p.cant <= 0) continue;
      const u = p.imp / p.cant;
      if (u > 0) {
        pMin = pMin ? Math.min(pMin, u) : u;
        pMax = Math.max(pMax, u);
      }
      sumImp += p.imp;
      sumCant += p.cant;
    }
    const unit = (p?: SeriePoint) => (p && p.cant > 0 ? p.imp / p.cant : 0);
    // Sin agrupar por centro: el centro de donde sale el cliente+material según los últimos 12 meses (ver `centroDeFacturacion`).
    if (!porCentro) g.centro = centroDeFacturacion(g.centrosPorMes, curK) || g.centro;
    const ultDest = ultMesDest.get(g.destinatario);

    out.push({
      centro: g.centro,
      grpCliente: g.gpoCte,
      // Un destinatario tiene UN solo ejecutivo: el de su última facturación (si el cliente cambió de zona/ejecutivo, manda el más reciente).
      gpoVdor: ejecutivoActual(vendedorDest.get(g.destinatario)) || g.gpoVdor,
      solicitante: g.solicitante,
      destinatario: g.destinatario,
      razonSocial: g.razonSocial,
      material: g.material,
      textoMaterial: g.textoMaterial,
      consumoActual: actual?.cant ?? 0,
      consumoPromedioMensual: promedioConsumo(serie, 'historia', curmes),
      um: umDe?.(g.material) ?? '',
      tendencia: tendenciaTexto(serie).txt,
      ultimoMesFacturacion: ult?.mes ?? '',
      cantidadUltima: ult?.cant ?? 0,
      importeUltima: ult?.imp ?? 0,
      precioMin: pMin,
      precioMax: pMax,
      precioProm: sumCant > 0 ? sumImp / sumCant : 0,
      precioUnitarioUltima: unit(ult),
      penultimoMes: pen?.mes ?? '',
      cantidadPenultima: pen?.cant ?? 0,
      importePenultima: pen?.imp ?? 0,
      precioUnitarioPenultima: unit(pen),
      ultFacturacionDestinatario: ultDest ? keyAMes(ultDest) : '',
      raw: {},
    });
  }
  // Sin agrupar por centro (módulo Facturación) las filas salen ordenadas por cliente en vez de por orden de aparición en los libros.
  if (!porCentro) out.sort(compararClienteMaterial);
  return out;
}

/** Consumo derivado de Resumen_Fac, de golpe (mismo resultado que la versión por tramos). */
export function consumoDesdeResumenFac(rows: ResumenFacRow[], umDe?: (material: string) => string, opciones: OpcionesConsumo = {}): ConsumoRow[] {
  return correrSincrono(consumoDesdeResumenFacGen(rows, umDe, opciones));
}

/** Consumo derivado de Resumen_Fac por tramos cortos (la pantalla sigue respondiendo); `null` si se canceló. */
export function consumoDesdeResumenFacAsync(
  rows: ResumenFacRow[],
  umDe?: (material: string) => string,
  opciones: OpcionesConsumo = {},
  control?: { cancelado?: () => boolean; onProgreso?: (fraccion: number) => void },
): Promise<ConsumoRow[] | null> {
  return correrPorTramos(consumoDesdeResumenFacGen(rows, umDe, opciones), control);
}
