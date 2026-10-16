import type { AnalysisResult } from '@/core/types';
import type { Analytics } from './AnalyticsContext';

/** Mismo `Analytics`, pero con el consumo, la facturación (`rf`), el ABC y los meses armados con los libros de Drive del
 * módulo Facturación, para que la tabla y todos los paneles de detalle lean exactamente lo mismo. */
export function conFacturacion(a: Analytics): Analytics {
  const f = a.facturacion;
  const base = (a.result ?? {}) as AnalysisResult;
  return {
    ...a,
    rf: f.rf,
    abc: f.abc,
    mesesDisponibles: f.meses,
    curmes: f.rf?.curmes ?? '',
    result: { ...base, consumo: f.consumo, resumenFac: f.resumenFac },
  };
}
