import { useMemo } from 'react';
import { InvGrid } from '../ui';
import { Section } from './_shared';
import { formatNumber } from '@/lib/utils';
import { norm } from '../helpers';
import { CENTERS } from '@/core/types';
import { invGen } from '@/core/resumenSin';
import { buildFromInventarioMaterial } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useCentrosFiltroStore, centroPasaFiltro } from '@/store/centrosFiltroStore';
import { useNombresStore, useVistaCentrosStore } from '@/store/nombresStore';
import { etiquetaCentro, etiquetaAlmacen } from '@/lib/nombres';
import type { Analytics } from '../AnalyticsContext';

const PRINCIPALES = ['1030', '1031', '1032', '1060'] as const;

/** Cálculo compartido de inventario de UN material: principales
 * (1030/1031/1032/1060), otros centros, tránsito y los puntos de "Solicitar
 * desde inventario". */
function useMaterialInventario(a: Analytics, material: string) {
  const { enrich } = a;
  const mat = norm(material);

  const { principales, otros, transito } = useMemo(() => {
    let filas = a.invCondicion.filter((r) => norm(r.material) === mat);
    if (!filas.length) filas = a.invConsolidadoCatalog.filter((r) => norm(r.material) === mat);
    const otros: Record<string, number> = {};
    const transito: Record<string, number> = {};
    for (const c of CENTERS) {
      otros[c] = filas.reduce((s, r) => s + (r.invByCenter[c] || 0), 0);
      transito[c] = filas.reduce((s, r) => s + (r.transitoByCenter?.[c] || 0), 0);
    }
    // Los almacenes 1030/1031/1032/1060 viven en Resumen Sin Sugerencias
    // (repetidos en cada centro): se toma el máximo, no la suma.
    const mo = a.rss?.mats.get(mat);
    const principales: Record<string, number> = {};
    for (const alm of PRINCIPALES) {
      principales[alm] = mo ? Math.max(0, ...[...mo.centros.values()].map((co) => co.invAlm[alm] || 0)) : 0;
    }
    if (!mo) {
      principales['1030'] = filas.reduce((s, r) => s + (r.disponible31_30 || 0), 0);
      principales['1032'] = filas.reduce((s, r) => s + (r.disponible31_32 || 0), 0);
    }
    return { principales, otros, transito };
  }, [a.invCondicion, a.invConsolidadoCatalog, a.rss, mat]);

  const esSuturas = enrich.matSector(material) === 'Suturas';
  const condiciones = enrich.matCondiciones(material).join(', ');
  const puntos = [
    { titulo: 'Centro 1031 / Alm 1030', centro: '1031', almacen: '1030', cantidad: principales['1030'] || 0 },
    { titulo: 'Centro 1031 / Alm 1032', centro: '1031', almacen: '1032', cantidad: principales['1032'] || 0 },
    ...(esSuturas ? [{ titulo: 'Centro 1018 (Suturas)', centro: '1018', almacen: '', cantidad: otros['1018'] || 0 }] : []),
  ];
  return { mat, principales, otros, transito, condiciones, puntos };
}

export interface PuntoSolicitar { titulo: string; centro: string; almacen: string; cantidad: number; nota?: string }

/** "Solicitar desde inventario (click derecho)": grid de puntos con menú
 * contextual. `tituloDe` permite pintar nombres de centro/almacén. */
export function SolicitarGrid({ a, material, mat, puntos, condiciones, tituloDe }: {
  a: Analytics; material: string; mat: string; puntos: PuntoSolicitar[]; condiciones: string; tituloDe: (p: PuntoSolicitar) => string;
}) {
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const key = (c: string, al: string) => `inv|${mat}|inv-${c}-${al || c}`;
  const yaSolicitado = (c: string, al: string) => solicitudesList.some((s) => s.origen === 'inventario' && s.sourceKey === key(c, al));
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {puntos.map((p) => (
          <SolicitarContextMenu
            key={p.titulo}
            label={material}
            solicitado={yaSolicitado(p.centro, p.almacen)}
            onSolicitar={() => solicitar.abrir(buildFromInventarioMaterial(material, p.centro, p.almacen || p.centro, p.cantidad, a.enrich))}
          >
            <div className="cursor-context-menu rounded-md border border-border px-2.5 py-1.5">
              <p className="text-[11px] text-text-faint">{tituloDe(p)}</p>
              <p className="font-mono text-sm">{formatNumber(p.cantidad)}</p>
              {p.nota && <p className="text-[10px] text-warning">{p.nota}</p>}
              {condiciones && <p className="text-[10px] text-text-faint">{condiciones}</p>}
            </div>
          </SolicitarContextMenu>
        ))}
      </div>
      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </>
  );
}

/** Inventario de UN material sin depender de un pedido: "Inventario
 * principales", "Otros centros (1001–1036)" y "Solicitar desde inventario".
 * Suma TODAS las filas del material en Inv Condición (o, si no hay, en el
 * catálogo) — con o sin condición — para poder consultarlo desde cualquier
 * detalle (Consumo, Inventario, Inv Condición, fuentes de un pedido). Respeta
 * el filtro "Considerar centros" (solo afecta a "Otros centros"). */
export function MaterialInventarioSection({ a, material }: { a: Analytics; material: string }) {
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
  const { mat, principales, otros, transito, condiciones, puntos } = useMaterialInventario(a, material);

  const invPrin: [string, number][] = PRINCIPALES.map((c) => [c, principales[c] || 0]);
  const invOtros: [string, number, number?][] = CENTERS
    .filter((c) => centroPasaFiltro(c, '', centrosElegidos))
    .map((c) => [c, otros[c] || 0, transito[c] || 0]);

  return (
    <>
      <Section title="Inventario principales"><InvGrid items={invPrin} /></Section>
      <Section title={`Otros centros (1001–1036)${centrosElegidos.length ? ' · filtrado' : ''}`}>
        {invOtros.length ? <InvGrid items={invOtros} /> : <p className="text-sm text-text-muted">Ningún centro elegido en el filtro.</p>}
      </Section>
      <Section title="Solicitar desde inventario (click derecho)">
        <SolicitarGrid a={a} material={material} mat={mat} puntos={puntos} condiciones={condiciones} tituloDe={(p) => p.titulo} />
      </Section>
    </>
  );
}

/** Contenido del panel lateral izquierdo del detalle de celda abierto desde
 * Inventario (Resumen Sin): "Otros centros" + "Solicitar desde inventario",
 * sin "Inventario principales". NO usa el filtro global "Considerar centros"
 * del detalle de pedido — muestra todos los centros salvo que la tabla de
 * Inventario tenga un filtro de centro (`centrosVisibles`). Usa los nombres
 * de centro según la preferencia del usuario; los de almacén, siempre. */
export function MaterialInventarioLateral({ a, material, centrosVisibles, centroActivo, onSelectCentro }: {
  a: Analytics; material: string; centrosVisibles?: string[];
  /** Centro mostrado en el detalle de la derecha (se resalta) y callback al elegir otro. */
  centroActivo?: string; onSelectCentro?: (centro: string) => void;
}) {
  const nombresCentros = useNombresStore((s) => s.centros);
  const nombresAlm = useNombresStore((s) => s.almacenes);
  const mostrarNombres = useVistaCentrosStore((s) => s.mostrarNombres);
  const { mat, otros, transito, condiciones, puntos } = useMaterialInventario(a, material);

  const rssMat = a.rss?.mats.get(mat);
  const filtrado = !!centrosVisibles;
  const centrosLista = CENTERS.filter((c) => !centrosVisibles || centrosVisibles.includes(c));
  const invOtros: [string, number, number?][] = centrosLista
    .map((c) => {
      // Inventario general del centro = almacenes 1030 + 1031 + 1060 (`invGen`,
      // Resumen Sin). Sin Resumen Sin cargado, cae al inventario de Inv Condición.
      const co = rssMat?.centros.get(c);
      const inv = rssMat ? invGen(co) : otros[c] || 0;
      const trans = rssMat ? co?.transito || 0 : transito[c] || 0;
      return [etiquetaCentro(c, nombresCentros, mostrarNombres), inv, trans] as [string, number, number];
    });

  const tituloDe = (p: PuntoSolicitar) => {
    const centro = `Centro ${etiquetaCentro(p.centro, nombresCentros, mostrarNombres)}`;
    if (!p.almacen) return `${centro}${p.titulo.includes('(Suturas)') ? ' (Suturas)' : ''}`;
    return `${centro} / Alm ${etiquetaAlmacen(p.almacen, nombresAlm)}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-sm font-semibold">Inventario · {material}</h3>
      <Section title={`Otros centros (1001–1036 · alm. 1030+1031+1060)${filtrado ? ' · filtrado' : ''}`}>
        {invOtros.length ? <InvGrid items={invOtros} cols={2} onSelect={onSelectCentro ? (i) => onSelectCentro(centrosLista[i]) : undefined} activeIndex={centroActivo ? centrosLista.indexOf(centroActivo as (typeof CENTERS)[number]) : undefined} /> : <p className="text-sm text-text-muted">Ningún centro en el filtro.</p>}
      </Section>
      <Section title="Solicitar desde inventario (click derecho)">
        <SolicitarGrid a={a} material={material} mat={mat} puntos={puntos} condiciones={condiciones} tituloDe={tituloDe} />
      </Section>
    </div>
  );
}
