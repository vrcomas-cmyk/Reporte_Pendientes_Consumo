import { norm } from './helpers';
import { condicionDeLote } from '@/core/precioAutorizado';
import { opcionesDeOferta, condicionesDeMaterial, CONDICION_CORTA_CADUCIDAD, CONDICION_PNC, type OpcionOferta } from '@/core/invCondicionLibros';
import type { BOItem } from '@/core/buildBO';
import type { Sugerencia } from '@/core/types';
import type { Analytics } from './AnalyticsContext';

// Lo ofertable de un material (lotes con condición, sustituto / Status, lotes generales) con su precio autorizado, como funciones puras:
// las usan la tabla de «Lotes, condiciones y materiales ofertables» de los detalles y el generador de ofertas por ejecutivo.

const GENERAL = '1030+1031+1060';
/** Condiciones que se muestran por lote (con su centro/almacén de la hoja); el resto va en una fila general 1030+1031+1060. */
export const POR_LOTE = new Set([CONDICION_CORTA_CADUCIDAD, CONDICION_PNC]);

/** Convierte las opciones en `Sugerencia`s para reutilizar EXACTAMENTE la tabla de "Fuentes / materiales ofertables"
 * (mismas columnas, filtros, vigencia, vista rápida del inventario por centro y selección). Sustituto / Status →
 * una fila con la suma general; Corta caducidad y PNC → una fila por lote con el centro, almacén, lote y caducidad de su hoja. */
export function sugerenciasDeOpciones(material: string, opciones: OpcionOferta[], a: Analytics): Sugerencia[] {
  const base = (o: OpcionOferta): Sugerencia => ({
    gpoCte: '', fecha: '', oc: '', pedido: '', gpoVdor: '', solicitante: '', destinatario: '', razonSocial: '', centroPedido: '', almacen: '',
    materialSolicitado: material, materialBase: material, descripcionSolicitada: '', cantidadPedido: 0, cantidadPendiente: 0, cantidadOfertar: 0,
    precio: 0, consumoPromedio: 0, fuente: o.tipo, materialSugerido: o.material, descripcionSugerida: o.textoBreve, centroSugerido: '',
    almacenSugerido: '', disponible: 0, lote: '', fechaCaducidad: '', mesesVigenciaLote: 0, centroInv: '', mesesInventario: 0,
    promedioConsumo12M: 0, cantTransito: 0, bloqueado: '', invByCenter: {}, raw: {},
  });
  const out: Sugerencia[] = [];
  for (const o of opciones) {
    const general = o.fuentes.filter((f) => !POR_LOTE.has(f.tipo));
    const tipoGeneral = general.map((f) => f.tipo).join('/');
    if (general.length) {
      out.push({ ...base(o), fuente: tipoGeneral, almacenSugerido: GENERAL, disponible: general.reduce((s, f) => s + f.invSuma, 0), invByCenter: o.fuentes[0]?.invByCenter ?? {} });
    }
    const porLote = condicionesDeMaterial(o.material, {
      filas: a.invCondicionLibros, lotes: a.lotesLibros, detalle: a.detalleLotesLibros, sustituciones: a.sustitucionesLibros, invRevision: a.invRevisionLibros,
    }).filter((f) => POR_LOTE.has(f.condicion));
    for (const f of porLote) {
      const fuente = general.length ? `${tipoGeneral}/${f.condicion}` : f.condicion;
      out.push({ ...base(o), fuente, centroSugerido: f.centro, almacenSugerido: f.almacen, disponible: f.cantidad, lote: f.lote, fechaCaducidad: f.caducidad, ...(f.detalle ? { descripcionSugerida: `${o.textoBreve} · ${f.detalle}` } : {}) });
    }
  }
  return out;
}

export const llaveFila = (f: Sugerencia): string => `${f.lote}|${f.materialSugerido}|${f.centroSugerido}|${f.almacenSugerido}|${f.fechaCaducidad}|${f.fuente}`;

/** Filas de TODO lo que hay y se puede ofrecer de `material`: sus lotes (General), los lotes con condición (Corta caducidad, PNC),
 * el sustituto / Status de los libros y, si hay pedido, las fuentes de Todas las Sugerencias. Con el precio de cada una. */
export function filasOfertablesDe(a: Analytics, material: string, it?: BOItem): { filas: Sugerencia[]; precioDe: (f: Sugerencia) => number } {
  const opciones = sugerenciasDeOpciones(material, opcionesDeOferta(material, a.invCondicionLibros, a.sustitucionesLibros), a);
  {
    const matN = norm(material);
    const precios = new Map<string, number>();
    // El precio de cada fila es el AUTORIZADO en Precios para SU condición exacta (misma regla que allá): un lote de corta caducidad (almacén 1032 o
    // ≤ 12 meses), un PNC (que con ≤ 12 meses es «CC + PNC»), la existencia de buena caducidad de un material lento («Lento mov»)… Sin precio
    // autorizado para esa combinación = 0 («-»): nunca se toma el de otra condición del material ni el precio viejo de la hoja.
    const autorizado = (mat: string, fuente: string, caducidad?: string) => a.preciosAutorizados.precio(mat, condicionDeLote(fuente, caducidad)) ?? 0;
    const lotesMat = a.lotes.filter((l) => norm(l.material) === matN);
    const filas: Sugerencia[] = [];
    for (const f of it?.fuentes ?? []) filas.push(f);
    for (const f of opciones) { filas.push(f); precios.set(llaveFila(f), autorizado(f.materialSugerido, f.fuente, f.fechaCaducidad)); }
    const cubiertos = new Set(filas.filter((f) => f.lote).map((f) => `${norm(f.centroSugerido)}|${norm(f.almacenSugerido)}|${norm(f.lote)}`));
    for (const l of lotesMat) {
      if (cubiertos.has(`${norm(l.centro)}|${norm(l.almacen)}|${norm(l.lote)}`)) continue;
      const g: Sugerencia = {
        gpoCte: '', fecha: '', oc: '', pedido: '', gpoVdor: '', solicitante: '', destinatario: '', razonSocial: '', centroPedido: '', almacen: '',
        materialSolicitado: material, materialBase: material, descripcionSolicitada: '', cantidadPedido: 0, cantidadPendiente: 0, cantidadOfertar: 0,
        precio: 0, consumoPromedio: 0, fuente: 'General', materialSugerido: material, descripcionSugerida: a.enrich.matTexto(material) || l.textoBreve,
        centroSugerido: l.centro, almacenSugerido: l.almacen, disponible: l.cantidadDisp, lote: l.lote, fechaCaducidad: l.fechaCaducidad ?? '',
        mesesVigenciaLote: 0, centroInv: '', mesesInventario: 0, promedioConsumo12M: 0, cantTransito: 0, bloqueado: '', invByCenter: {}, raw: {},
      };
      filas.push(g);
      precios.set(llaveFila(g), autorizado(material, 'General'));
    }
    // Solo lo que tiene existencia: las filas en 0 no se muestran.
    return { filas: filas.filter((f) => f.disponible > 0), precioDe: (f: Sugerencia) => precios.get(llaveFila(f)) ?? 0 };
  }
}

