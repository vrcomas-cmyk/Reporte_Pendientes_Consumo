// ---------------------------------------------------------------------------
// estatusPrecios.ts · Estatus de autorización de cada renglón de la Calculadora de Precios y avisos de lo NUEVO (material / condición / lote que
// nunca se mandó a autorizar, o cuyo cálculo cambió desde que se mandó). Puro: sin React, sin red.
//
// La clave de un renglón es material + combinación de condiciones (la misma de las propuestas `concepto = oferta`).
// ---------------------------------------------------------------------------
import { precioValido } from './politicaPrecios';

/** Lo que este módulo necesita de una propuesta (la `Propuesta` del servicio la cumple). */
export interface PropuestaEstatus {
  id: string;
  material: string;
  concepto: 'base' | 'oferta';
  condicion: string;
  estado: 'borrador' | 'enviado' | 'autorizado' | 'rechazado';
  costoAlEnviar: number;
  /** Precio que calculó el sistema al mandarla. */
  precioCalculado: number;
  /** Mandado (enviado) o AUTORIZADO (autorizado). */
  precioPropuesto: number;
  solicitadoEn: string;
  autorizadoEn: string | null;
  /** Lotes (centro|almacén|lote) que tenía el renglón al mandarla; null = no se guardaron (propuestas anteriores). */
  lotesEnviados: readonly string[] | null;
}

export type Estatus = 'sin-enviar' | 'pendiente' | 'autorizado' | 'rechazado' | 'reenviar';
export type Aviso = 'nuevo' | 'lote-nuevo' | 'calculo-distinto' | 'invalido';

export interface FilaEstatusEntrada {
  material: string;
  /** Combinación canónica de condiciones del renglón. */
  combinacion: string;
  /** Costo vigente hoy. */
  costo: number;
  /** Precio que calcula hoy el sistema (null si no se puede calcular). */
  precioCalculado: number | null;
  /** Lotes (centro|almacén|lote) del renglón hoy. */
  lotes: readonly string[];
}

export interface EstatusFila {
  estatus: Estatus;
  /** Precio AUTORIZADO vigente y válido (> costo hoy); null = «-». */
  autorizado: number | null;
  avisos: Aviso[];
  /** Lotes que hoy están en el renglón y no estaban cuando se mandó. */
  lotesNuevos: string[];
  /** La propuesta más reciente de ese renglón. */
  propuesta: PropuestaEstatus | null;
}

const TOLERANCIA = 0.005;
const normMat = (m: string) => m.trim().replace(/\.0+$/, '');
const fecha = (p: PropuestaEstatus) => p.autorizadoEn ?? p.solicitadoEn;

/** Propuestas de oferta de un renglón, de la más reciente a la más antigua (los borradores no cuentan). */
function delRenglon(propuestas: readonly PropuestaEstatus[], material: string, combinacion: string): PropuestaEstatus[] {
  const m = normMat(material);
  return propuestas
    .filter((p) => p.concepto === 'oferta' && p.estado !== 'borrador' && p.condicion === combinacion && normMat(p.material) === m)
    .sort((a, b) => (fecha(b) < fecha(a) ? -1 : fecha(b) > fecha(a) ? 1 : 0));
}

/** Estatus de un renglón frente a todas las propuestas, con sus avisos. */
export function estatusDeFila(f: FilaEstatusEntrada, propuestas: readonly PropuestaEstatus[]): EstatusFila {
  const hist = delRenglon(propuestas, f.material, f.combinacion);
  const ultima = hist[0] ?? null;
  if (!ultima) return { estatus: 'sin-enviar', autorizado: null, avisos: ['nuevo'], lotesNuevos: [], propuesta: null };

  // Último precio autorizado y que sigue siendo válido (> costo vigente): es el que se propaga a los demás reportes.
  const vigente = hist.find((p) => p.estado === 'autorizado') ?? null;
  const vigenteValido = vigente && (f.costo > 0 ? precioValido(vigente.precioPropuesto, f.costo) : true) ? vigente : null;
  const autorizado = vigenteValido ? vigenteValido.precioPropuesto : null;

  let estatus: Estatus;
  if (ultima.estado === 'enviado') estatus = 'pendiente';
  else if (ultima.estado === 'rechazado') estatus = 'rechazado';
  else estatus = vigenteValido ? 'autorizado' : 'reenviar';

  const avisos: Aviso[] = [];
  let lotesNuevos: string[] = [];
  if (estatus === 'reenviar') avisos.push('invalido');
  // Referencia de lo que se mandó/autorizó por última vez (un rechazo no cuenta como referencia).
  const ref = hist.find((p) => p.estado === 'enviado' || p.estado === 'autorizado');
  if (ref) {
    if (f.precioCalculado != null && Math.abs(f.precioCalculado - ref.precioCalculado) >= TOLERANCIA) avisos.push('calculo-distinto');
    if (ref.lotesEnviados) {
      const conocidos = new Set(ref.lotesEnviados);
      lotesNuevos = f.lotes.filter((l) => !conocidos.has(l));
      if (lotesNuevos.length) avisos.push('lote-nuevo');
    }
  }
  return { estatus, autorizado, avisos, lotesNuevos, propuesta: ultima };
}

export interface ResumenAvisos {
  sinEnviar: number;
  pendientes: number;
  autorizados: number;
  rechazados: number;
  reenviar: number;
  /** Renglones con cada aviso. */
  nuevos: number;
  loteNuevo: number;
  calculoDistinto: number;
  invalidos: number;
  /** Renglones con al menos un aviso. */
  conAviso: number;
}

export function resumenAvisos(filas: readonly Pick<EstatusFila, 'estatus' | 'avisos'>[]): ResumenAvisos {
  const cuenta = (e: Estatus) => filas.filter((x) => x.estatus === e).length;
  const aviso = (a: Aviso) => filas.filter((x) => x.avisos.includes(a)).length;
  return {
    sinEnviar: cuenta('sin-enviar'), pendientes: cuenta('pendiente'), autorizados: cuenta('autorizado'), rechazados: cuenta('rechazado'), reenviar: cuenta('reenviar'),
    nuevos: aviso('nuevo'), loteNuevo: aviso('lote-nuevo'), calculoDistinto: aviso('calculo-distinto'), invalidos: aviso('invalido'),
    conAviso: filas.filter((x) => x.avisos.length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Preparación del envío a autorización: nunca se manda algo sin condición ni se duplica una solicitud.
// ---------------------------------------------------------------------------

export interface ClaveEnvio { material: string; concepto: 'base' | 'oferta'; condicion: string }

export type MotivoOmitido = 'sin-condicion' | 'repetido-en-el-envio' | 'ya-pendiente';

export interface ResultadoEnvio<T extends ClaveEnvio> {
  /** Lo que sí se manda. */
  enviar: T[];
  omitidos: { item: T; motivo: MotivoOmitido }[];
}

const claveEnvio = (c: ClaveEnvio) => `${normMat(c.material)}|${c.concepto}|${c.condicion}`;

/**
 * De lo que se quiere mandar deja solo las ofertas CON condición, una vez cada una y que no estén ya pendientes (`enviado`) de respuesta.
 * (La «base» del material no se autoriza: no lleva condición y no se publica a ningún reporte.)
 */
export function prepararEnvio<T extends ClaveEnvio>(items: readonly T[], pendientes: readonly ClaveEnvio[]): ResultadoEnvio<T> {
  const yaPendientes = new Set(pendientes.map(claveEnvio));
  const vistos = new Set<string>();
  const enviar: T[] = [];
  const omitidos: ResultadoEnvio<T>['omitidos'] = [];
  for (const item of items) {
    if (item.concepto !== 'oferta' || !item.condicion.trim()) { omitidos.push({ item, motivo: 'sin-condicion' }); continue; }
    const k = claveEnvio(item);
    if (vistos.has(k)) { omitidos.push({ item, motivo: 'repetido-en-el-envio' }); continue; }
    vistos.add(k);
    if (yaPendientes.has(k)) { omitidos.push({ item, motivo: 'ya-pendiente' }); continue; }
    enviar.push(item);
  }
  return { enviar, omitidos };
}
