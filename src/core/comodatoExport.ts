// ---------------------------------------------------------------------------
// comodatoExport.ts · Hojas de Excel del módulo "Comodato (libros)": encabezados en español legible (sin los nombres con "_" de las vistas SQL),
// importes y números redondeados, fechas como dd/mm/aaaa. Puro.
// ---------------------------------------------------------------------------
import { diaISO, mesISO, num, tipoEq, sinComodato, type Fila } from './comodatoTablero';

type Tipo = 'texto' | 'moneda' | 'numero' | 'decimal' | 'fecha' | 'periodo';
type Columna = readonly [clave: string, etiqueta: string, tipo: Tipo];

/** v_seguimiento_360, en el orden en que se leen. */
const COLUMNAS_SEGUIMIENTO: readonly Columna[] = [
  ['cliente', 'Solicitante', 'texto'], ['razon_social', 'Cliente (razón social)', 'texto'], ['Zona', 'Zona', 'texto'], ['Ejecutivo', 'Ejecutivo', 'texto'], ['Grupo de cliente', 'Grupo de cliente', 'texto'],
  ['material_comodato', 'Código del equipo', 'texto'], ['descripcion_comodato', 'Equipo', 'texto'],
  ['status_actividad', 'Estado', 'texto'], ['tendencia', 'Tendencia', 'texto'], ['rentable', 'Rentabilidad', 'texto'], ['recuperable', 'Recuperable', 'texto'], ['accion_sugerida', 'Acción sugerida', 'texto'],
  ['cantidad_comodato', 'Piezas en comodato', 'numero'], ['inversion_comodato', 'Inversión en comodato', 'moneda'],
  ['bolsas_facturadas', 'Bolsas facturadas', 'numero'], ['facturacion_total', 'Facturación total', 'moneda'], ['margen_total', 'Margen total', 'moneda'], ['roi', 'ROI (x)', 'decimal'],
  ['bolsas_por_canister', 'Bolsas por canister', 'decimal'], ['margen_por_canister', 'Margen por canister', 'moneda'],
  ['ticket_prom_mensual', 'Ticket promedio mensual', 'moneda'], ['margen_prom_mensual', 'Margen promedio mensual', 'moneda'], ['importe_mes_actual', 'Importe del mes actual', 'moneda'],
  ['ultima_factura', 'Última facturación', 'fecha'], ['dias_sin_compra', 'Días sin compra', 'numero'],
  ['Ultimo mes de facturación', 'Último mes facturado', 'texto'], ['Cantidad ultimo mes de facturación', 'Bolsas del último mes', 'numero'], ['Importe facturación ultimo mes', 'Importe del último mes', 'moneda'],
  ['Penultimo mes de facturación', 'Penúltimo mes facturado', 'texto'], ['Cantidad penultimo mes de facturación', 'Bolsas del penúltimo mes', 'numero'], ['Importe facturación Penultimo mes', 'Importe del penúltimo mes', 'moneda'],
  ['Cada cuantos meses se le factura', 'Frecuencia de facturación (meses)', 'decimal'],
  ['Ultima fecha de entrega de comodato', 'Última entrega de comodato', 'texto'], ['Cantidad ultima comodato', 'Piezas de la última entrega', 'numero'],
  ['Penultima fecha de entrega de comodato', 'Penúltima entrega de comodato', 'texto'], ['Cantidad penultima comodato', 'Piezas de la penúltima entrega', 'numero'],
  ['Cada cuantos días se le entrega comodato', 'Frecuencia de entrega (días)', 'numero'], ['Cada cuantos meses se le entrega comodato', 'Frecuencia de entrega (meses)', 'decimal'],
  ['Crecimiento facturación %', 'Crecimiento de facturación (%)', 'decimal'], ['Nivel crecimiento facturación', 'Nivel de crecimiento de facturación', 'texto'],
  ['Crecimiento entrega comodato %', 'Crecimiento de entregas de comodato (%)', 'decimal'], ['Nivel crecimiento comodato', 'Nivel de crecimiento de comodato', 'texto'],
  ['Balance factura vs equipo', 'Balance factura vs equipo', 'texto'], ['Pendiente facturación (tendencia)', 'Pendiente de facturación (tendencia)', 'decimal'],
  ['Sin comodato asignado', 'Sin comodato asignado', 'texto'],
];

const COLUMNAS_SERIE: readonly Columna[] = [
  ['cliente', 'Solicitante', 'texto'], ['codigo_equipo', 'Código del equipo', 'texto'], ['descripcion_equipo', 'Equipo', 'texto'], ['periodo', 'Mes', 'periodo'],
  ['piezas_netas_mes', 'Piezas de comodato (netas del mes)', 'numero'], ['bolsas_mes', 'Bolsas facturadas', 'numero'], ['importe_mes', 'Importe facturado', 'moneda'], ['margen_mes', 'Margen', 'moneda'],
];

const COLUMNAS_BOLSAS: readonly Columna[] = [
  ['codigo_consumible', 'Código de la bolsa', 'texto'], ['descripcion_consumible', 'Bolsa', 'texto'], ['codigo_equipo', 'Código del equipo', 'texto'], ['descripcion_equipo', 'Equipo', 'texto'],
  ['num_clientes', 'Clientes', 'numero'], ['bolsas_facturadas', 'Bolsas facturadas', 'numero'], ['importe_vendido', 'Importe vendido', 'moneda'], ['costo_total', 'Costo total', 'moneda'],
  ['margen_total', 'Margen total', 'moneda'], ['pct_margen', '% de margen', 'decimal'], ['precio_prom_bolsa', 'Precio promedio por bolsa', 'moneda'],
];

const redondea = (n: number, dec: number): number => Math.round(n * 10 ** dec) / 10 ** dec;

/** "descripcion_comodato" → "Descripcion comodato" (para columnas que no estén en la lista). */
export function nombreLegible(clave: string): string {
  const t = clave.replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : clave;
}

const dmy = (iso: string): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function valor(v: unknown, tipo: Tipo): unknown {
  if (v == null || v === '') return '';
  switch (tipo) {
    case 'moneda': return redondea(num(v), 2);
    case 'decimal': return redondea(num(v), 2);
    case 'numero': return redondea(num(v), 2);
    case 'fecha': return dmy(diaISO(v));
    case 'periodo': { const m = mesISO(v); return m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : ''; }
    default: return String(v);
  }
}

function aHoja(rows: readonly Fila[], columnas: readonly Columna[], extra?: (d: Fila) => Record<string, unknown>): Record<string, unknown>[] {
  const conocidas = new Set(columnas.map((c) => c[0]));
  return rows.map((d) => {
    const o: Record<string, unknown> = {};
    for (const [k, etiqueta, tipo] of columnas) if (k in d || tipo === 'texto') o[etiqueta] = valor(d[k], tipo);
    Object.assign(o, extra?.(d));
    // Cualquier columna nueva del SQL que no esté en la lista sale igual, con nombre legible.
    for (const k of Object.keys(d)) if (!conocidas.has(k) && !k.startsWith('__')) o[nombreLegible(k)] = d[k] == null ? '' : d[k];
    return o;
  });
}

export interface EntradaExcel {
  /** Filas de v_seguimiento_360 (ya filtradas, si se quiere exportar lo que se ve). */
  seguimiento: readonly Fila[];
  /** v_direccion_tendencia tal cual la devuelve el SQL. */
  serie: readonly Fila[];
  bolsas: readonly Fila[];
  /** Razón social de un solicitante, para la hoja de la serie mensual. */
  razonDe: (cliente: string) => string;
}

/** Hojas listas para `exportXlsxMultiSheet`. */
export function hojasExcel(e: EntradaExcel): { name: string; rows: Record<string, unknown>[] }[] {
  return [
    {
      name: 'Seguimiento por cliente',
      rows: aHoja(e.seguimiento, COLUMNAS_SEGUIMIENTO, (d) => ({ 'Tipo de equipo': tipoEq(d), 'Con comodato': sinComodato(d) ? 'No' : 'Sí' })),
    },
    {
      name: 'Evolución mensual',
      rows: aHoja(e.serie, COLUMNAS_SERIE, (d) => ({ 'Cliente (razón social)': e.razonDe(String(d.cliente ?? '')) })),
    },
    { name: 'Facturación por bolsa', rows: aHoja(e.bolsas, COLUMNAS_BOLSAS) },
  ];
}
