import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { formatCurrency, formatFechaCaducidad } from '@/lib/utils';
import { disponibleEnCentros, esSustituto, textoCambioCodigo } from '@/core/ofertaSustituto';
import type { LotesOfertados } from './MensajeEjecutivo';
import { Section, FuentesTable, type FuentesSelection } from './_shared';
import { filasOfertablesDe, sugerenciasDeOpciones, llaveFila } from '../filasOfertables';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { aceptacionesPrevias, textoAceptacionPrevia } from '@/core/ofertasEjecutivo';
import { CentrosFiltroBar } from './CentrosFiltroBar';
import { opcionesDeOferta, type OpcionOferta } from '@/core/invCondicionLibros';
import { centroPasaFiltro, useCentrosFiltroStore } from '@/store/centrosFiltroStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isDetailHidden } from '@/core/permissions';
import type { BOItem } from '@/core/buildBO';
import type { Sugerencia } from '@/core/types';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

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

function useFilasOfertables(a: Analytics, material: string, it?: BOItem): { filas: Sugerencia[]; precioDe: (f: Sugerencia) => number } {
  return useMemo(() => filasOfertablesDe(a, material, it), [a, material, it]);
}

/** UNA sola tabla "Lotes, condiciones y materiales ofertables" con la MISMA estructura y acciones en todos los detalles: filtros de
 * centro/lote/material, "Considerar centros (+ centro)", casillas para seleccionar (hasta 2) y "Copiar datos de oferta".
 * Con `it` (renglón de pedido) suma las fuentes de Todas las Sugerencias y el centro del pedido. `selection` externa
 * (detalle de pedido, que arma su propia selección por material) reemplaza a la interna. */
export function LotesOfertablesSection({ a, material, it, centroPedido, cliente, push, selection, onCambio }: {
  a: Analytics; material: string; it?: BOItem; centroPedido?: string; cliente?: string; push: (p: Panel) => void; selection?: FuentesSelection;
  /** Avisa a quien lo pida qué lotes se ven y cuáles están marcados (p. ej. para armar el mensaje al ejecutivo). */
  onCambio?: (info: LotesOfertados) => void;
}) {
  const perms = usePermissionsStore((s) => s.perms);
  const fuenteOculta = isDetailHidden(perms, 'sugerencias', 'fuente');
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  const { copy } = useClipboard();
  const centro = centroPedido ?? it?.bo.centroPedido ?? '';
  const { filas, precioDe } = useFilasOfertables(a, material, it && !fuenteOculta ? it : undefined);
  const visibles = useMemo(() => {
    if (!centrosElegidos.length) return filas;
    return filas.flatMap((f) => {
      // Lotes con centro: pasan o no el filtro «Considerar centros».
      if (f.centroSugerido) return centroPasaFiltro(f.centroSugerido, centro, centrosElegidos) ? [f] : [];
      // Existencia general del sustituto / Status (sin centro): solo cuenta el inventario de los centros que pasan el filtro.
      const disp = disponibleEnCentros(f.invByCenter, (c) => centroPasaFiltro(c, centro, centrosElegidos));
      return disp > 0 ? [{ ...f, disponible: disp }] : [];
    });
  }, [filas, centrosElegidos, centro]);
  // Alerta: el mismo destinatario ya aceptó antes alguno de estos materiales (con su lote si se conoce).
  const ofertasRegistradas = useConocimientoStore((s) => s.ofertas);
  const destinatario = it?.bo.destinatario ?? '';
  const previas = useMemo(() => {
    if (!destinatario) return [];
    const vistos = new Set<string>();
    return visibles.flatMap((f) => {
      if (vistos.has(f.materialSugerido)) return [];
      vistos.add(f.materialSugerido);
      const p = aceptacionesPrevias(ofertasRegistradas, destinatario, f.materialSugerido)[0];
      return p ? [{ material: f.materialSugerido, texto: textoAceptacionPrevia(p) }] : [];
    });
  }, [destinatario, visibles, ofertasRegistradas]);
  const [sel, setSel] = useState<Map<string, Sugerencia>>(new Map());
  // Lo marcado que sigue visible, con la existencia ya filtrada por centros (lo que se copia y se manda al ejecutivo).
  const marcados = useMemo(() => visibles.filter((f) => sel.has(llaveFila(f))), [visibles, sel]);
  const interna: FuentesSelection = {
    isSelected: (f) => sel.has(llaveFila(f)),
    onToggle: (f) => setSel((m) => { const n = new Map(m); const k = llaveFila(f); if (n.has(k)) n.delete(k); else if (n.size < MAX_LOTES_SELECCION) n.set(k, f); return n; }),
    full: sel.size >= MAX_LOTES_SELECCION,
  };
  useEffect(() => {
    onCambio?.({ visibles, seleccion: marcados, precioDe });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `precioDe` cambia en cada render; basta con que cambien los lotes o la selección
  }, [visibles, marcados]);
  const copiar = () => {
    // Un sustituto (otro código que el del pedido) lleva delante la instrucción de qué código cambiar por cuál.
    const lineas = marcados.flatMap((f) => {
      const precio = precioDe(f);
      // Solo lo que existe: sin «—» ni «sin precio» cuando falta un dato.
      const partes = [`${f.materialSugerido}${f.descripcionSugerida ? `	${f.descripcionSugerida}` : ''}`];
      if (f.lote) partes.push(`Lote ${f.lote}`);
      if (f.fechaCaducidad) partes.push(`cad. ${formatFechaCaducidad(f.fechaCaducidad)}`);
      if (precio) partes.push(formatCurrency(precio));
      const dato = partes.join('	');
      return esSustituto(material, f.materialSugerido) ? [textoCambioCodigo(material, f.materialSugerido), dato] : [dato];
    });
    copy([`Material ${material}`, ...(cliente ? [`Cliente ${cliente}`] : []), ...lineas].join('\n'), 'Datos de oferta copiados');
  };
  return (
    <>
      <Section ancho tono="inv" origen="Inv_Condicion · Disponibilidad" title={`Lotes, condiciones y materiales ofertables (${visibles.length}${visibles.length !== filas.length ? ` de ${filas.length}` : ''})`}>
        <CentrosFiltroBar centroPedido={centro} />
        {previas.length > 0 && (
          <ul className="mt-2 space-y-0.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            {previas.map((p) => <li key={p.material}><span className="font-medium tabular-nums">{p.material}</span>: {p.texto}</li>)}
          </ul>
        )}
        {visibles.length ? (
          <>
            <FuentesTable fuentes={visibles} push={push} selection={selection ?? interna} precioDe={precioDe} centroPedido={centro} />
            {!selection && (
              <div className="mt-2 flex items-center gap-2">
                <button type="button" disabled={!marcados.length} onClick={copiar} className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-40">
                  <Copy className="size-3.5" /> Copiar datos de oferta ({marcados.length})
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
