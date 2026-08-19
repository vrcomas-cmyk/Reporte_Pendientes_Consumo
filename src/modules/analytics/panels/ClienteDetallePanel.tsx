import { Chip } from '../ui';
import { ClienteResumen360 } from './ClienteResumen360';
import { norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle por cliente (destinatario), entrada desde Consumo/Pedidos.
 * El cuerpo (ejecutivo, pendientes, consumo histórico) es `ClienteResumen360`,
 * compartido con la pestaña "Resumen" de la ficha de Oportunidades — mismo
 * dato, sin importar desde dónde se entra. */
export function ClienteDetallePanel({ panel, a, push }: { panel: Extract<Panel, { type: 'clienteDetalle' }>; a: Analytics; push: (p: Panel) => void }) {
  const { bo, result } = a;
  const destN = norm(panel.dest);
  const razon = (result?.consumo ?? []).find((x) => norm(x.destinatario) === destN)?.razonSocial
    || bo.find((it) => norm(it.bo.destinatario) === destN)?.bo.razonSocial
    || '';
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{razon || panel.dest}</h2>
      <p className="mt-1 text-sm text-text-muted">
        Destinatario <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: panel.dest })}>{panel.dest}</Chip>
      </p>
      <p className="mt-2">
        <button className="text-xs text-accent hover:underline" onClick={() => push({ type: 'clienteConocimiento', dest: panel.dest, razonSocial: razon })}>
          Ver ficha comercial (Oportunidades) →
        </button>
      </p>
      <div className="mt-3">
        <ClienteResumen360 dest={panel.dest} a={a} push={push} />
      </div>
    </div>
  );
}
