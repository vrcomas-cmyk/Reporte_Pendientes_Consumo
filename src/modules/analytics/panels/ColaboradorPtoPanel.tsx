import { useMemo } from 'react';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';
import { DetalleColaboradorPto } from '@/modules/consumo/DetalleColaboradorPto';

/** Panel — Presupuesto y venta de un colaborador (gpo. vendedor) mes a mes, por sector o por grupo de artículo. Mismo contenido que la sección «Cumplimiento por». */
export function ColaboradorPtoPanel({ panel, a }: { panel: Extract<Panel, { type: 'colaboradorPto' }>; a: Analytics }) {
  const meses = useMemo(() => (panel.meses ? new Set(panel.meses) : null), [panel.meses]);
  return (
    <div className="pt-2">
      <DetalleColaboradorPto a={a} gpoVdor={panel.gpoVdor} lo={panel.lo} hi={panel.hi} meses={meses} filtros={panel.filtros} />
    </div>
  );
}
