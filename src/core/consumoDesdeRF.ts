// ---------------------------------------------------------------------------
// consumoDesdeRF.ts · Deriva las filas de Consumo (ConsumoRow) desde las filas
// de "Resumen_Fac", de modo que Resumen_Fac sea la ÚNICA fuente de facturación
// y ya no se descargue la pestaña "Reporte de Consumo". Puro: sin React/DOM.
// ---------------------------------------------------------------------------
import type { ConsumoRow, ResumenFacRow } from './types';
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
  let sum = 0;
  let conCompra = 0;
  for (const p of serie) {
    const k = mesKey(p.mes);
    if (k < lo || k > hi) continue;
    sum += p.cant;
    if (p.cant > 0) conCompra++;
  }
  if (modo === 'conCompra') return conCompra ? sum / conCompra : 0;
  return sum / (hi - lo + 1);
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
}

/** Una fila de Consumo por Centro + Destinatario + Material. `umDe` aporta la
 * unidad de medida (Resumen_Fac no la trae) desde el catálogo. */
export function consumoDesdeResumenFac(rows: ResumenFacRow[], umDe?: (material: string) => string): ConsumoRow[] {
  let curK = 0;
  let curmes = '';
  for (const r of rows) {
    const mes = mesCanon(r.mesAno);
    if (!esMesValido(mes)) continue;
    const k = mesKey(mes);
    if (k > curK) { curK = k; curmes = mes; }
  }
  if (!curK) return [];

  const grupos = new Map<string, Grupo>();
  const ultMesDest = new Map<string, number>();
  for (const r of rows) {
    const mes = mesCanon(r.mesAno);
    if (!esMesValido(mes)) continue;
    const material = norm(r.material);
    if (!material) continue;
    const dest = norm(r.destinatario);
    const centro = norm(r.centro);
    const key = centro + '||' + dest + '||' + material;
    let g = grupos.get(key);
    if (!g) {
      g = {
        centro, solicitante: '', destinatario: dest, razonSocial: '', material, textoMaterial: '',
        gpoVdor: '', gpoCte: '', porMes: new Map(),
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
    const p = g.porMes.get(mes) ?? { mes, cant: 0, imp: 0 };
    p.cant += cant;
    p.imp += imp;
    g.porMes.set(mes, p);
    if ((cant || imp) && mesKey(mes) > (ultMesDest.get(dest) ?? 0)) ultMesDest.set(dest, mesKey(mes));
  }

  const out: ConsumoRow[] = [];
  for (const g of grupos.values()) {
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
    const ultDest = ultMesDest.get(g.destinatario);

    out.push({
      centro: g.centro,
      grpCliente: g.gpoCte,
      gpoVdor: g.gpoVdor,
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
  return out;
}
