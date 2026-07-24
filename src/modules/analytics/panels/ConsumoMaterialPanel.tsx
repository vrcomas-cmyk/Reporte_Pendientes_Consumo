import { Chip, StatTile, EvolChart, ComparativaDual } from '../ui';
import { Section, PrecioCondicionBox } from './_shared';
import { formatNumber } from '@/lib/utils';
import { consumoSerie, consumoStatus, consumoEnrich, norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Consumo de un material para un destinatario: stats, precios por condición, comparativo y evolución. */
export function ConsumoMaterialPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'consumoMaterial' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rf, enrich, result } = a;
  const r = result?.consumo.find((x) => norm(x.destinatario) === norm(panel.dest) && norm(x.material) === norm(panel.material));
  if (!r) return <p>Registro de consumo no encontrado.</p>;
  const serie = consumoSerie(rf, r);
  const st = consumoStatus(rf, r);
  const ce = consumoEnrich(enrich);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{r.razonSocial}</h2>
      <p className="mt-1 text-sm text-text-muted">
        Material {r.material} — {r.textoMaterial} ·{' '}
        <Chip onClick={() => push({ type: 'evol', kind: 'solic', key: r.solicitante })}>Solic {r.solicitante}</Chip> ·{' '}
        <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: r.destinatario })}>Dest {r.destinatario}</Chip>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Ejecutivo" value={ce.ejec(r) || '—'} />
        <StatTile label="Consumo actual" value={formatNumber(r.consumoActual)} />
        <StatTile label="Prom. mensual" value={formatNumber(r.consumoPromedioMensual)} />
        <StatTile label="Estado" value={st.label} />
      </div>
      <PrecioCondicionBox a={a} material={r.material} />
      <Section title="Comparativo anual"><ComparativaDual serie={serie} /></Section>
      <Section title="Evolución mensual — material + destinatario"><EvolChart serie={serie} onMonth={(mes) => push({ type: 'clientesMes', material: r.material, mes })} /></Section>
    </div>
  );
}
