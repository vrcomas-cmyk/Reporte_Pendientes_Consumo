import { promedioPeriodo, periodo12Cerrados } from '@/core/facMensual';
import { mesKey } from '@/core/resumenFac';
import { norm } from './helpers';
import type { Analytics } from './AnalyticsContext';

export interface Promedio12 {
  promedio: number;
  /** Ventana usada ('mm/aaaa'); vacía si el promedio salió de Resumen Sin. */
  desde: string;
  hasta: string;
  fuente: 'cam' | 'rss' | 'ninguna';
  /** Meses de la ventana con alguna facturación (solo `cam`). */
  mesesConDato: number;
  /** Último mes que trae Fac_Mensual_CAM (solo `cam`) — para avisar si no llega al fin de la ventana. */
  ultimoMesCam: string;
}

/** Consumo promedio mensual de los últimos 12 meses CERRADOS de un material en
 * un centro (y opcionalmente un almacén): cantidad facturada de
 * "Fac_Mensual_CAM" ÷ 12 (meses sin venta cuentan 0; el mes en curso no
 * entra). Si la hoja está cargada es la ÚNICA fuente — aunque el par no tenga
 * ventas (0 real); mezclar con el `Promedio_Consumo_12M` de Resumen Sin daba
 * números distintos entre pantallas. Solo sin Fac_Mensual_CAM cae a Resumen Sin. */
export function detalle12Cerrados(a: Pick<Analytics, 'facMensual' | 'rss'>, material: string, centro: string, almacen?: string): Promedio12 {
  const per = periodo12Cerrados(a.facMensual);
  if (per) {
    const pp = promedioPeriodo(a.facMensual, { material, centro, almacen }, per.desde, per.hasta);
    return { promedio: pp.promedio, desde: per.desde, hasta: per.hasta, fuente: 'cam', mesesConDato: pp.mesesConDato, ultimoMesCam: per.ultimoMes };
  }
  const co = a.rss?.mats.get(norm(material))?.centros.get(norm(centro));
  const vacio = { desde: '', hasta: '', mesesConDato: 0, ultimoMesCam: '' };
  if (!co) return { promedio: 0, fuente: 'ninguna', ...vacio };
  let s = 0;
  if (almacen) s = co.alm.get(almacen)?.prom ?? 0;
  else co.alm.forEach((al) => { s += al.prom; });
  return { promedio: s, fuente: 'rss', ...vacio };
}

export const promedio12Cerrados = (a: Pick<Analytics, 'facMensual' | 'rss'>, material: string, centro: string, almacen?: string): number =>
  detalle12Cerrados(a, material, centro, almacen).promedio;

/** Texto de ayuda: de qué ventana y fuente sale el promedio. */
export function ayudaPromedio12(d: Promedio12): string {
  if (d.fuente === 'rss') return 'Promedio_Consumo_12M de Resumen Sin (sin Fac_Mensual_CAM cargada)';
  if (d.fuente === 'ninguna') return 'Sin datos de consumo';
  const corta = d.ultimoMesCam && mesKey(d.ultimoMesCam) < mesKey(d.hasta);
  return `Fac_Mensual_CAM · ${d.desde} a ${d.hasta} (12 meses cerrados) ÷ 12 · ${d.mesesConDato} mes(es) con venta${corta ? ` · la hoja llega hasta ${d.ultimoMesCam}` : ''}`;
}
