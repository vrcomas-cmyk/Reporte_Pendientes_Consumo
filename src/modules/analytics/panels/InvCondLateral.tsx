import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { InvGrid } from '../ui';
import { Section } from './_shared';
import { SolicitarGrid, type PuntoSolicitar } from './MaterialInventario';
import { cn, formatNumber } from '@/lib/utils';
import { pendPorCondicion, transitoPorCondicion, esLentoPorCondicion } from '@/core/resumenSin';
import { CENTERS } from '@/core/types';
import { norm } from '../helpers';
import { useNombresStore, useVistaCentrosStore } from '@/store/nombresStore';
import { etiquetaCentro, etiquetaAlmacen } from '@/lib/nombres';
import type { Analytics } from '../AnalyticsContext';

const ALMACENES_PRINCIPALES = ['1030', '1031', '1032', '1060'] as const;

/** Panel lateral izquierdo del detalle de "Inv Condición" (mismo patrón que
 * `MaterialInventarioLateral` en Inventario): inventario principales del centro
 * visto, todos los centros (el visto va resaltado; clic = cambiar de centro) y
 * "Solicitar desde inventario". */
export function InvCondLateral({ a, material, centro, onSelectCentro }: {
  a: Analytics; material: string; centro: string; onSelectCentro: (centro: string) => void;
}) {
  const nombresCentros = useNombresStore((s) => s.centros);
  const nombresAlm = useNombresStore((s) => s.almacenes);
  const mostrarNombres = useVistaCentrosStore((s) => s.mostrarNombres);

  const mat = norm(material);
  const invRow = useMemo(() => a.invCondicion.find((r) => norm(r.material) === mat), [a.invCondicion, mat]);
  const condicionMat = invRow?.condicion || '';
  const mo = a.rss?.mats.get(mat);
  const lotesMaterial = useMemo(() => a.lotes.filter((l) => norm(l.material) === mat), [a.lotes, mat]);

  // Inventario de un almacén en un centro: Resumen Sin (`invAlm`) o, si no hay,
  // la suma de los lotes de InvDetalle de ese centro y almacén.
  const invDeAlmacen = (c: string, alm: string): number => {
    const coC = mo?.centros.get(norm(c));
    if (coC) return coC.invAlm[alm] || 0;
    return lotesMaterial.filter((l) => norm(l.centro) === norm(c) && norm(l.almacen) === alm).reduce((s, l) => s + l.cantidadDisp, 0);
  };
  const invPrincipales: [string, number][] = ALMACENES_PRINCIPALES.map((alm) => [etiquetaAlmacen(alm, nombresAlm), invDeAlmacen(centro, alm)]);

  // Solicitar desde inventario: siempre centro 1031, alm 1030 (general) y alm
  // 1032 (corta caducidad), cada uno con el inventario de su almacén.
  const puntosSolicitar: PuntoSolicitar[] = [
    { titulo: 'Centro 1031 / Alm 1030', centro: '1031', almacen: '1030', cantidad: invDeAlmacen('1031', '1030') },
    { titulo: 'Centro 1031 / Alm 1032', centro: '1031', almacen: '1032', cantidad: invDeAlmacen('1031', '1032'), nota: 'Corta caducidad' },
  ];
  const tituloPunto = (p: PuntoSolicitar) => `Centro ${etiquetaCentro(p.centro, nombresCentros, mostrarNombres)} / Alm ${etiquetaAlmacen(p.almacen, nombresAlm)}`;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-sm font-semibold">Inventario · {material}</h3>
      <Section title={`Inventario principales · Centro ${etiquetaCentro(centro, nombresCentros, mostrarNombres)}`}>
        <InvGrid items={invPrincipales} cols={2} />
      </Section>
      <Section title="Otros centros (según condición)">
        <div className="grid grid-cols-2 gap-2">
          {CENTERS.map((c) => {
            const coC = mo?.centros.get(c);
            const transito = transitoPorCondicion(coC, condicionMat);
            const pend = pendPorCondicion(coC, condicionMat);
            const lento = a.rss ? esLentoPorCondicion(coC, condicionMat, a.rss.curMes) : false;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onSelectCentro(c)}
                title="Ver el detalle de este centro"
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-left hover:border-accent',
                  norm(c) === norm(centro) ? 'border-accent bg-accent-soft' : 'border-border',
                )}
              >
                <p className="text-[11px] text-text-faint">Inv {etiquetaCentro(c, nombresCentros, mostrarNombres)}</p>
                <p className="font-mono text-sm">
                  {formatNumber(invRow?.invByCenter[c] || 0)}
                  {transito > 0 && <span className="text-success"> +{formatNumber(transito)}</span>}
                  {lento && <AlertTriangle className="ml-1 inline size-3 text-warning" />}
                </p>
                {pend > 0 && <p className="text-[11px] text-danger">Pend {formatNumber(pend)}</p>}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Solicitar desde inventario (click derecho)">
        {/* Sin `condiciones`: la nota "Corta caducidad" del punto 1032 ya lo dice. */}
        <SolicitarGrid a={a} material={material} mat={mat} puntos={puntosSolicitar} condiciones="" tituloDe={tituloPunto} />
      </Section>
    </div>
  );
}
