import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { formatCurrency, formatFechaCaducidad } from '@/lib/utils';
import { norm } from '../helpers';
import { Section, FuentesTable, precioPorCondicion, type FuentesSelection } from './_shared';
import { CentrosFiltroBar } from './CentrosFiltroBar';
import { opcionesDeOferta, condicionesDeMaterial, CONDICION_CORTA_CADUCIDAD, CONDICION_PNC, type OpcionOferta } from '@/core/invCondicionLibros';
import { centroPasaFiltro, useCentrosFiltroStore } from '@/store/centrosFiltroStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isDetailHidden } from '@/core/permissions';
import type { BOItem } from '@/core/buildBO';
import type { Sugerencia } from '@/core/types';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

const GENERAL = '1030+1031+1060';
/** Condiciones que se muestran por lote (con su centro/almacén de la hoja); el resto va en una fila general 1030+1031+1060. */
const POR_LOTE = new Set([CONDICION_CORTA_CADUCIDAD, CONDICION_PNC]);

/** Convierte las opciones en `Sugerencia`s para reutilizar EXACTAMENTE la tabla de "Fuentes / materiales ofertables"
 * (mismas columnas, filtros, vigencia, vista rápida del inventario por centro y selección). Sustituto / Status →
 * una fila con la suma general; Corta caducidad y PNC → una fila por lote con el centro, almacén, lote y caducidad de su hoja. */
function sugerenciasDeOpciones(material: string, opciones: OpcionOferta[], a: Analytics): Sugerencia[] {
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

/** Opciones de los libros (sustituto + el mismo material bajo otras condiciones) de `material`, como filas de la tabla de fuentes. */
function useOpciones(a: Analytics, material: string): { opciones: OpcionOferta[]; filas: Sugerencia[] } {
  const opciones = useMemo(() => opcionesDeOferta(material, a.invCondicionLibros, a.sustitucionesLibros), [material, a.invCondicionLibros, a.sustitucionesLibros]);
  const filas = useMemo(
    () => sugerenciasDeOpciones(material, opciones, a),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo los libros que usa
    [material, opciones, a.invCondicionLibros, a.lotesLibros, a.detalleLotesLibros, a.sustitucionesLibros, a.invRevisionLibros],
  );
  return { opciones, filas };
}

/** Materiales que se pueden ofrecer en cambio de `material` (sustituto + el mismo material bajo otras condiciones), solo desde los
 * libros — para pantallas sin pedido (p. ej. Consumo). Con pedido se usa `FuentesYOpcionesSection`. */
export function OpcionesOfertaSection({ a, material, push, selection }: { a: Analytics; material: string; push: (p: Panel) => void; selection?: FuentesSelection }) {
  const { opciones, filas } = useOpciones(a, material);
  if (!opciones.length) return null;
  return (
    <Section title={`Materiales que se pueden ofrecer en cambio (${opciones.length})`}>
      <FuentesTable fuentes={filas} push={push} selection={selection} />
    </Section>
  );
}

const MAX_LOTES_SELECCION = 2;
const llaveFila = (f: Sugerencia): string => `${f.lote}|${f.materialSugerido}|${f.centroSugerido}|${f.almacenSugerido}|${f.fechaCaducidad}|${f.fuente}`;

/** Filas de TODO lo que hay y se puede ofrecer de `material`: sus lotes (General), los lotes con condición (Corta caducidad, PNC),
 * el sustituto / Status de los libros y, si hay pedido, las fuentes de Todas las Sugerencias. Con el precio de cada una. */
function useFilasOfertables(a: Analytics, material: string, it?: BOItem): { filas: Sugerencia[]; precioDe: (f: Sugerencia) => number } {
  const { filas: opciones } = useOpciones(a, material);
  return useMemo(() => {
    const matN = norm(material);
    const precios = new Map<string, number>();
    const precioCond = (mat: string, cond: string) => {
      const ps = precioPorCondicion(a, mat);
      return ps.find((p) => cond.includes(p.condicion))?.precio || ps[0]?.precio || 0;
    };
    const lotesMat = a.lotes.filter((l) => norm(l.material) === matN);
    const precioLote = (f: Sugerencia) => lotesMat.find((l) => norm(l.centro) === norm(f.centroSugerido) && norm(l.almacen) === norm(f.almacenSugerido) && norm(l.lote) === norm(f.lote))?.precioOferta ?? 0;
    const filas: Sugerencia[] = [];
    for (const f of it?.fuentes ?? []) filas.push(f);
    for (const f of opciones) { filas.push(f); precios.set(llaveFila(f), precioLote(f) || precioCond(f.materialSugerido, f.fuente)); }
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
      precios.set(llaveFila(g), l.precioOferta ?? 0);
    }
    // Solo lo que tiene existencia: las filas en 0 no se muestran.
    return { filas: filas.filter((f) => f.disponible > 0), precioDe: (f: Sugerencia) => precios.get(llaveFila(f)) ?? 0 };
  }, [a, material, opciones, it]);
}

/** UNA sola tabla "Lotes, condiciones y materiales ofertables" con la MISMA estructura y acciones en todos los detalles: filtros de
 * centro/lote/material, "Considerar centros (+ centro)", casillas para seleccionar (hasta 2) y "Copiar datos de oferta".
 * Con `it` (renglón de pedido) suma las fuentes de Todas las Sugerencias y el centro del pedido. `selection` externa
 * (detalle de pedido, que arma su propia selección por material) reemplaza a la interna. */
export function LotesOfertablesSection({ a, material, it, centroPedido, cliente, push, selection }: {
  a: Analytics; material: string; it?: BOItem; centroPedido?: string; cliente?: string; push: (p: Panel) => void; selection?: FuentesSelection;
}) {
  const perms = usePermissionsStore((s) => s.perms);
  const fuenteOculta = isDetailHidden(perms, 'sugerencias', 'fuente');
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  const { copy } = useClipboard();
  const centro = centroPedido ?? it?.bo.centroPedido ?? '';
  const { filas, precioDe } = useFilasOfertables(a, material, it && !fuenteOculta ? it : undefined);
  const visibles = useMemo(
    () => (centrosElegidos.length ? filas.filter((f) => centroPasaFiltro(f.centroSugerido, centro, centrosElegidos)) : filas),
    [filas, centrosElegidos, centro],
  );
  const [sel, setSel] = useState<Map<string, Sugerencia>>(new Map());
  const interna: FuentesSelection = {
    isSelected: (f) => sel.has(llaveFila(f)),
    onToggle: (f) => setSel((m) => { const n = new Map(m); const k = llaveFila(f); if (n.has(k)) n.delete(k); else if (n.size < MAX_LOTES_SELECCION) n.set(k, f); return n; }),
    full: sel.size >= MAX_LOTES_SELECCION,
  };
  const copiar = () => {
    const lineas = [...sel.values()].map((f) => {
      const cad = f.fechaCaducidad ? formatFechaCaducidad(f.fechaCaducidad) : '—';
      const precio = precioDe(f);
      return `${f.materialSugerido}\t${f.descripcionSugerida}\tLote ${f.lote || '—'}\tcad. ${cad}\t${precio ? formatCurrency(precio) : '—'}`;
    });
    copy([`Material ${material}`, ...(cliente ? [`Cliente ${cliente}`] : []), ...lineas].join('\n'), 'Datos de oferta copiados');
  };
  return (
    <>
      <Section ancho tono="inv" origen="Inv_Condicion · Disponibilidad" title={`Lotes, condiciones y materiales ofertables (${visibles.length}${visibles.length !== filas.length ? ` de ${filas.length}` : ''})`}>
        <CentrosFiltroBar centroPedido={centro} />
        {visibles.length ? (
          <>
            <FuentesTable fuentes={visibles} push={push} selection={selection ?? interna} precioDe={precioDe} />
            {!selection && (
              <div className="mt-2 flex items-center gap-2">
                <button type="button" disabled={!sel.size} onClick={copiar} className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-40">
                  <Copy className="size-3.5" /> Copiar datos de oferta ({sel.size})
                </button>
                {sel.size > 0 && <button type="button" onClick={() => setSel(new Map())} className="text-xs text-text-faint hover:text-danger">Limpiar selección</button>}
              </div>
            )}
          </>
        ) : <p className="text-sm text-text-muted">{filas.length ? 'Ninguna fila coincide con los centros elegidos.' : 'Este material no tiene lotes, condiciones ni materiales que ofrecer en cambio.'}</p>}
      </Section>
    </>
  );
}
