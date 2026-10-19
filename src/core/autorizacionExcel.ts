// ---------------------------------------------------------------------------
// autorizacionExcel.ts · Autorización de precios por Excel: se EXPORTA lo pendiente para el director, él regresa el mismo archivo con la columna
// «Precio autorizado» llena, y se CARGA comparando contra lo que se mandó.
//
//   · «Precio autorizado» vacío (o «NO», «-», 0) → NO autorizado.
//   · igual al propuesto → aceptado; distinto → modificado a mano por el director.
//   · todo precio autorizado debe ser > costo (regla del módulo): si no, el renglón es un error y no se aplica.
//
// Puro: sin React, sin red, sin disco (la lectura/escritura del .xlsx vive en `lib/autorizacionXlsx.ts`).
// ---------------------------------------------------------------------------
import { analisisPrecio } from './politicaPrecios';

/** Lo que este módulo necesita de una propuesta de precio (la `Propuesta` del servicio la cumple). */
export interface PropuestaExcel {
  id: string;
  material: string;
  concepto: 'base' | 'oferta';
  /** Combinación de condiciones ('CC', 'CC + Lento mov', …); '' en la base. */
  condicion: string;
  costoAlEnviar: number;
  baseAlEnviar: number | null;
  precioCalculado: number;
  /** El precio que se mandó a autorizar. */
  precioPropuesto: number;
}

/** Encabezados del archivo (la primera hoja). Los que llena el director son «Precio autorizado» y «Comentario del director». */
export const COL = {
  id: 'ID propuesta',
  material: 'Material',
  descripcion: 'Descripción',
  sector: 'Sector',
  grupo: 'Grupo',
  concepto: 'Concepto',
  condicion: 'Condición',
  costo: 'Costo',
  base: 'Base',
  propuesto: 'Precio propuesto',
  descuento: 'Descuento %',
  cede: 'Cede del margen %',
  margen: 'Margen %',
  autorizado: 'Precio autorizado',
  comentario: 'Comentario del director',
} as const;

export const TEXTO_INSTRUCCIONES: readonly string[] = [
  'Cómo llenar este archivo',
  '',
  '1. En la columna «Precio autorizado» escribe el precio que AUTORIZAS para cada renglón.',
  '   • Si aceptas el precio propuesto, repite ese mismo precio.',
  '   • Si lo cambias, escribe el precio que autorizas (siempre mayor al costo).',
  '   • Si NO lo autorizas, déjala vacía (o escribe NO).',
  '2. «Comentario del director» es opcional.',
  '3. No modifiques la columna «ID propuesta» ni agregues o borres renglones: con ese ID se vuelve a ligar cada precio.',
  '4. Devuelve el mismo archivo.',
];

const redondea = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface DatosDirector {
  descripcion: (material: string) => string;
  sector: (material: string) => string;
  grupo: (material: string) => string;
  /** Etiqueta visible de la condición ('CC + PNC' → 'Corta caducidad + PNC'). */
  condicionTxt: (condicion: string) => string;
  /** El rol puede ver costos: sin permiso la columna Costo no se manda. */
  mostrarCosto: boolean;
}

/** Filas del archivo para el director, en el orden de las columnas de `COL`. «Precio autorizado» y «Comentario» salen vacías. */
export function filasParaDirector(propuestas: readonly PropuestaExcel[], d: DatosDirector): Record<string, unknown>[] {
  return propuestas.map((p) => {
    const an = p.baseAlEnviar ? analisisPrecio(p.precioPropuesto, p.baseAlEnviar, p.costoAlEnviar) : null;
    const margen = p.precioPropuesto > 0 ? (p.precioPropuesto - p.costoAlEnviar) / p.precioPropuesto : null;
    return {
      [COL.id]: p.id,
      [COL.material]: p.material,
      [COL.descripcion]: d.descripcion(p.material),
      [COL.sector]: d.sector(p.material),
      [COL.grupo]: d.grupo(p.material),
      [COL.concepto]: p.concepto === 'base' ? 'Base' : 'Oferta',
      [COL.condicion]: p.condicion ? d.condicionTxt(p.condicion) : '',
      ...(d.mostrarCosto ? { [COL.costo]: p.costoAlEnviar } : {}),
      [COL.base]: p.baseAlEnviar ?? '',
      [COL.propuesto]: p.precioPropuesto,
      [COL.descuento]: an ? redondea(an.descuento * 100) : '',
      [COL.cede]: an ? redondea(an.cede * 100) : '',
      [COL.margen]: margen == null ? '' : redondea(margen * 100),
      [COL.autorizado]: '',
      [COL.comentario]: '',
    };
  });
}

/** Orden de las columnas al escribir el archivo (sin Costo si el rol no lo ve). */
export const columnasDirector = (mostrarCosto: boolean): string[] =>
  Object.values(COL).filter((c) => mostrarCosto || c !== COL.costo);

// --------------------------------------------------------------------------------------------------------------- lectura

/** Lo que el director dejó en «Precio autorizado». */
export type CeldaAutorizado =
  | { tipo: 'vacio' }
  | { tipo: 'no' }
  | { tipo: 'precio'; valor: number }
  | { tipo: 'invalido'; texto: string };

export interface FilaArchivo {
  /** Número de renglón en el Excel (el primero de datos es el 2). */
  fila: number;
  id: string;
  material: string;
  concepto: string;
  condicion: string;
  autorizado: CeldaAutorizado;
  comentario: string;
}

const ALIAS: Record<'id' | 'material' | 'concepto' | 'condicion' | 'autorizado' | 'comentario', string[]> = {
  id: ['id propuesta', 'id'],
  material: ['material', 'codigo'],
  concepto: ['concepto'],
  condicion: ['condicion'],
  autorizado: ['precio autorizado', 'autorizado'],
  comentario: ['comentario del director', 'comentario'],
};

const NO_AUTORIZA = /^(no|n\/a|na|ninguno|-|—|–|x|rechazado|no autorizado|no autoriza)$/i;

/** Número de una celda del Excel: acepta `85`, `"$1,234.50"`, `"1.234,50"` no (formato MX), `"85,5"`. NaN si no es un precio. */
export function numeroCelda(v: unknown): number {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/mxn|usd|\$|\s/gi, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  return s === '' ? Number.NaN : Number(s);
}

export function leerCeldaAutorizado(v: unknown): CeldaAutorizado {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return { tipo: 'vacio' };
  if (typeof v === 'string' && NO_AUTORIZA.test(v.trim())) return { tipo: 'no' };
  const n = numeroCelda(v);
  if (!Number.isFinite(n)) return { tipo: 'invalido', texto: String(v) };
  return n === 0 ? { tipo: 'no' } : { tipo: 'precio', valor: n };
}

/** Filas del archivo (`sheet_to_json`) → `FilaArchivo`. Los encabezados se reconocen sin acentos ni mayúsculas. Lanza si no hay columna de precio. */
export function leerArchivo(rows: readonly Record<string, unknown>[]): FilaArchivo[] {
  if (!rows.length) return [];
  const claves = Object.keys(rows[0] ?? {});
  const llave = (alias: string[]) => claves.find((k) => alias.includes(sinAcentos(k).replace(/\s*%$/, ''))) ?? '';
  const k = {
    id: llave(ALIAS.id), material: llave(ALIAS.material), concepto: llave(ALIAS.concepto), condicion: llave(ALIAS.condicion),
    autorizado: llave(ALIAS.autorizado), comentario: llave(ALIAS.comentario),
  };
  if (!k.autorizado) throw new Error('El archivo no tiene la columna «Precio autorizado».');
  if (!k.id && !k.material) throw new Error('El archivo no tiene la columna «ID propuesta» ni «Material».');
  const t = (r: Record<string, unknown>, c: string) => (c ? String(r[c] ?? '').trim() : '');
  return rows
    .map((r, i): FilaArchivo => ({
      fila: i + 2, id: t(r, k.id), material: t(r, k.material), concepto: t(r, k.concepto), condicion: t(r, k.condicion),
      autorizado: leerCeldaAutorizado(k.autorizado ? r[k.autorizado] : null), comentario: t(r, k.comentario),
    }))
    // Renglones totalmente vacíos (colas de Excel) no cuentan.
    .filter((f) => f.id || f.material || f.autorizado.tipo !== 'vacio');
}

// ----------------------------------------------------------------------------------------------------------- evaluación

export type EstadoRenglon = 'aceptado' | 'modificado' | 'no-autorizado' | 'error';

export interface Renglon {
  fila: number;
  estado: EstadoRenglon;
  propuesta?: PropuestaExcel;
  /** Precio que autoriza el director (aceptado / modificado). */
  autorizado?: number;
  comentario: string;
  error?: string;
  /** autorizado − propuesto. */
  diferencia?: number;
  descuento?: number;
  cede?: number;
  margen?: number;
}

export interface ResumenAutorizacion {
  aceptados: number;
  modificados: number;
  noAutorizados: number;
  errores: number;
  /** Pendientes de la app que no venían en el archivo (siguen pendientes). */
  noVinieron: number;
}

export interface ResultadoAutorizacion {
  renglones: Renglon[];
  noVinieron: PropuestaExcel[];
  resumen: ResumenAutorizacion;
}

const TOLERANCIA = 0.005;
const normMat = (m: string) => m.trim().replace(/\.0+$/, '');
const claveMatCond = (material: string, concepto: string, condicion: string) =>
  `${normMat(material)}|${concepto === 'base' || /^base$/i.test(concepto) ? 'base' : 'oferta'}|${sinAcentos(condicion)}`;

/**
 * Compara el archivo que regresó el director contra las propuestas pendientes (`enviado`).
 * Empareja por ID; sin ID, por (material, concepto, condición) siempre que haya UNA sola candidata.
 */
export function evaluarAutorizacion(
  filas: readonly FilaArchivo[],
  pendientes: readonly PropuestaExcel[],
  /** Etiqueta visible de la condición, para emparejar sin ID (la que se exportó). */
  condicionTxt: (condicion: string) => string = (c) => c,
): ResultadoAutorizacion {
  const porId = new Map(pendientes.map((p) => [p.id, p]));
  const porClave = new Map<string, PropuestaExcel[]>();
  for (const p of pendientes) {
    const k = claveMatCond(p.material, p.concepto, p.condicion ? condicionTxt(p.condicion) : '');
    porClave.set(k, [...(porClave.get(k) ?? []), p]);
  }
  const usadas = new Set<string>();
  const renglones: Renglon[] = filas.map((f): Renglon => {
    const base = { fila: f.fila, comentario: f.comentario };
    let p: PropuestaExcel | undefined;
    if (f.id) {
      p = porId.get(f.id);
      if (!p) return { ...base, estado: 'error', error: 'El ID no corresponde a una propuesta pendiente (ya se resolvió o no es de este sistema).' };
    } else {
      const cands = porClave.get(claveMatCond(f.material, f.concepto, f.condicion)) ?? [];
      if (cands.length !== 1) return { ...base, estado: 'error', error: cands.length ? 'Sin ID y hay varias propuestas para ese material y condición.' : 'Sin ID y no se encontró propuesta pendiente para ese material y condición.' };
      p = cands[0];
    }
    if (!p) return { ...base, estado: 'error', error: 'Propuesta no encontrada.' };
    if (usadas.has(p.id)) return { ...base, propuesta: p, estado: 'error', error: 'La propuesta viene repetida en el archivo.' };
    usadas.add(p.id);
    const a = f.autorizado;
    if (a.tipo === 'vacio' || a.tipo === 'no') return { ...base, propuesta: p, estado: 'no-autorizado' };
    if (a.tipo === 'invalido') return { ...base, propuesta: p, estado: 'error', error: `«${a.texto}» no es un precio.` };
    if (!(a.valor > p.costoAlEnviar)) return { ...base, propuesta: p, autorizado: a.valor, estado: 'error', error: 'El precio autorizado debe ser mayor al costo.' };
    const an = p.baseAlEnviar ? analisisPrecio(a.valor, p.baseAlEnviar, p.costoAlEnviar) : null;
    const diferencia = a.valor - p.precioPropuesto;
    return {
      ...base, propuesta: p, autorizado: a.valor, diferencia,
      estado: Math.abs(diferencia) < TOLERANCIA ? 'aceptado' : 'modificado',
      ...(an ? { descuento: an.descuento, cede: an.cede, margen: an.margen } : { margen: (a.valor - p.costoAlEnviar) / a.valor }),
    };
  });
  const noVinieron = pendientes.filter((p) => !usadas.has(p.id));
  const cuenta = (e: EstadoRenglon) => renglones.filter((r) => r.estado === e).length;
  return {
    renglones, noVinieron,
    resumen: { aceptados: cuenta('aceptado'), modificados: cuenta('modificado'), noAutorizados: cuenta('no-autorizado'), errores: cuenta('error'), noVinieron: noVinieron.length },
  };
}
