import { EvolChart, ComparativaDual } from '../ui';
import { Section } from './_shared';
import { norm } from '../helpers';
import { type Serie } from '@/core/resumenFac';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Evolución de un material facturado por un Solicitante/Destinatario específico (drill desde EvolPanel). */
export function CodigoEvolPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'codigoEvol' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rf } = a;
  if (!rf) return <p>Sin datos.</p>;
  const serie: Serie = panel.kind === 'solic'
    ? (rf.solicMats.get(norm(panel.key))?.get(norm(panel.material)) || [])
    : (rf.destMats.get(norm(panel.key))?.get(norm(panel.material)) || []);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{panel.material}</h2>
      <p className="mt-1 text-sm text-text-muted">{rf.matTexto.get(norm(panel.material)) || ''} · {panel.kind === 'solic' ? 'Solicitante' : 'Destinatario'} {panel.key}</p>
      <Section title="Comparativo anual"><ComparativaDual serie={serie} /></Section>
      <Section title="Evolución mensual"><EvolChart serie={serie} onMonth={(mes) => push({ type: 'clientesMes', material: panel.material, mes })} /></Section>
    </div>
  );
}
