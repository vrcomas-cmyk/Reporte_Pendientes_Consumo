import { useMemo } from 'react';
import { Chip, StatTile, EvolChart, ComparativaDual } from '../ui';
import { Section, PrecioCondicionBox } from './_shared';
import { formatNumber } from '@/lib/utils';
import { consumoSerie, consumoStatus, consumoEnrich, norm } from '../helpers';
import { usePromedioModo, useRangoPeriodo } from '@/modules/consumo/usePromedioModo';
import { promedioConsumo } from '@/core/consumoDesdeRF';
import { mesKey } from '@/core/resumenFac';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Consumo de un material para un destinatario: stats, precios por condición, comparativo y evolución. */
export function ConsumoMaterialPanel({ panel, a, push }: { panel: Extract<Panel, { type: 'consumoMaterial' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rf, enrich, result } = a;
  const [promedioModo] = usePromedioModo();
  const rangoPromedio = useRangoPeriodo();
  const r = useMemo(
    () => result?.consumo.find((x) => norm(x.destinatario) === norm(panel.dest) && norm(x.material) === norm(panel.material)),
    [result, panel.dest, panel.material],
  );
  if (!r) return <p>Registro de consumo no encontrado.</p>;
  const serie = consumoSerie(rf, r);
  const st = consumoStatus(rf, r);
  const ce = consumoEnrich(enrich);
  // Todos los centros del par destinatario+material (la fila `r` es solo uno de ellos).
  const curK = mesKey(rf?.curmes ?? '');
  const actual = serie.find((p) => mesKey(p.mes) === curK)?.cant ?? r.consumoActual;
  const promedio = rf ? promedioConsumo(serie, promedioModo, rf.curmes, rangoPromedio) : r.consumoPromedioMensual;
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
        <StatTile label="Consumo actual" value={formatNumber(actual)} />
        <StatTile label="Prom. mensual" value={formatNumber(promedio)} />
        <StatTile label="Estado" value={st.label} />
      </div>
      <PrecioCondicionBox a={a} material={r.material} />
      <Section title="Comparativo anual"><ComparativaDual serie={serie} /></Section>
      <Section title="Evolución mensual — material + destinatario"><EvolChart serie={serie} filtroPeriodo onMonth={(mes) => push({ type: 'clientesMes', material: r.material, mes, dest: r.destinatario })} /></Section>
    </div>
  );
}
