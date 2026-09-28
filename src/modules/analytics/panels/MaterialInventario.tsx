import { useMemo } from 'react';
import { InvGrid } from '../ui';
import { Section } from './_shared';
import { formatNumber } from '@/lib/utils';
import { norm } from '../helpers';
import { CENTERS } from '@/core/types';
import { buildFromInventarioMaterial } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { useCentrosFiltroStore, centroPasaFiltro } from '@/store/centrosFiltroStore';
import type { Analytics } from '../AnalyticsContext';

const PRINCIPALES = ['1030', '1031', '1032', '1060'] as const;

/** Inventario de UN material sin depender de un pedido: "Inventario
 * principales", "Otros centros (1001–1036)" y "Solicitar desde inventario".
 * Suma TODAS las filas del material en Inv Condición (o, si no hay, en el
 * catálogo) — con o sin condición — para poder consultarlo desde cualquier
 * detalle (Consumo, Inventario, Inv Condición, fuentes de un pedido). Respeta
 * el filtro "Considerar centros" (solo afecta a "Otros centros"). */
export function MaterialInventarioSection({ a, material }: { a: Analytics; material: string }) {
  const { enrich } = a;
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const centrosElegidos = useCentrosFiltroStore((s) => s.centros);
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

  const invPrin: [string, number][] = PRINCIPALES.map((c) => [c, principales[c] || 0]);
  const invOtros: [string, number, number?][] = CENTERS
    .filter((c) => centroPasaFiltro(c, '', centrosElegidos))
    .map((c) => [c, otros[c] || 0, transito[c] || 0]);
  const esSuturas = enrich.matSector(material) === 'Suturas';
  const condiciones = enrich.matCondiciones(material).join(', ');
  const puntos = [
    { titulo: 'Centro 1031 / Alm 1030', centro: '1031', almacen: '1030', cantidad: principales['1030'] || 0 },
    { titulo: 'Centro 1031 / Alm 1032', centro: '1031', almacen: '1032', cantidad: principales['1032'] || 0 },
    ...(esSuturas ? [{ titulo: 'Centro 1018 (Suturas)', centro: '1018', almacen: '', cantidad: otros['1018'] || 0 }] : []),
  ];
  const key = (c: string, al: string) => `inv|${mat}|inv-${c}-${al || c}`;
  const yaSolicitado = (c: string, al: string) => solicitudesList.some((s) => s.origen === 'inventario' && s.sourceKey === key(c, al));

  return (
    <>
      <Section title="Inventario principales"><InvGrid items={invPrin} /></Section>
      <Section title={`Otros centros (1001–1036)${centrosElegidos.length ? ' · filtrado' : ''}`}>
        {invOtros.length ? <InvGrid items={invOtros} /> : <p className="text-sm text-text-muted">Ningún centro elegido en el filtro.</p>}
      </Section>
      <Section title="Solicitar desde inventario (click derecho)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {puntos.map((p) => (
            <SolicitarContextMenu
              key={p.titulo}
              label={material}
              solicitado={yaSolicitado(p.centro, p.almacen)}
              onSolicitar={() => solicitar.abrir(buildFromInventarioMaterial(material, p.centro, p.almacen || p.centro, p.cantidad, enrich))}
            >
              <div className="cursor-context-menu rounded-md border border-border px-2.5 py-1.5">
                <p className="text-[11px] text-text-faint">{p.titulo}</p>
                <p className="font-mono text-sm">{formatNumber(p.cantidad)}</p>
                {condiciones && <p className="text-[10px] text-text-faint">{condiciones}</p>}
              </div>
            </SolicitarContextMenu>
          ))}
        </div>
      </Section>
      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </>
  );
}
