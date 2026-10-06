import { Chip, EvolChart } from '../ui';
import { ClienteResumen360, ClienteDatosHeader } from './ClienteResumen360';
import { ConsumoMaterialCard, Section } from './_shared';
import { norm } from '../helpers';
import { serieMatDest, serieDest } from '@/core/resumenFac';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle por cliente (destinatario), entrada desde Consumo/Pedidos.
 * Arriba: datos del cliente. A la izquierda (panel lateral, ver `PanelHost`):
 * inventario del material. En el cuerpo: Facturación/Consumo con evolución
 * filtrable por periodo. El cuerpo de facturación es `ClienteResumen360`,
 * compartido con la pestaña "Resumen" de la ficha de Oportunidades — mismo
 * dato, sin importar desde dónde se entra. */
export function ClienteDetallePanel({ panel, a, push }: { panel: Extract<Panel, { type: 'clienteDetalle' }>; a: Analytics; push: (p: Panel) => void }) {
  const { bo, result, rf } = a;
  const destN = norm(panel.dest);
  const razon = (result?.consumo ?? []).find((x) => norm(x.destinatario) === destN)?.razonSocial
    || bo.find((it) => norm(it.bo.destinatario) === destN)?.bo.razonSocial
    || '';
  const serie = panel.material ? serieMatDest(rf, panel.dest, panel.material) : serieDest(rf, panel.dest);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{razon || panel.dest}</h2>
      <p className="mt-1 text-sm text-text-muted">
        Destinatario <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: panel.dest })}>{panel.dest}</Chip>
        {panel.material && <> · Material <Chip onClick={() => push({ type: 'material', material: panel.material! })}>{panel.material}</Chip></>}
        {' · '}
        <button className="text-xs text-accent hover:underline" onClick={() => push({ type: 'clienteConocimiento', dest: panel.dest, razonSocial: razon })}>
          Ver ficha comercial (Oportunidades) →
        </button>
      </p>
      <ClienteDatosHeader dest={panel.dest} a={a} />
      <h3 className="mt-4 font-display text-sm font-semibold uppercase tracking-wide text-text-muted">Facturación / Consumo</h3>
      {panel.material && <ConsumoMaterialCard a={a} dest={panel.dest} material={panel.material} />}
      <Section title={panel.material ? 'Evolución de facturación — material + destinatario' : 'Evolución de facturación — destinatario'}>
        <EvolChart serie={serie} filtroPeriodo onMonth={panel.material ? (mes) => push({ type: 'clientesMes', material: panel.material!, mes, dest: panel.dest }) : undefined} />
      </Section>
      <div className="mt-3">
        <ClienteResumen360 dest={panel.dest} a={a} push={push} sinDatos />
      </div>
    </div>
  );
}
