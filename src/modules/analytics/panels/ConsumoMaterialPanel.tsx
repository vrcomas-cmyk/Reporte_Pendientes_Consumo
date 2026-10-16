import { useMemo } from 'react';
import { Chip } from '../ui';
import { KpiBand } from '@/components/layout/report';
import { DetalleLayout, InventarioColumna, HistorialConsumo, TabsSugConsumo, AccionTotalesMaterial } from './DetalleLayout';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { consumoSerie, consumoStatus, consumoEnrich, norm } from '../helpers';
import { usePromedioModo, useRangoPeriodo } from '@/modules/consumo/usePromedioModo';
import { promedioConsumo } from '@/core/consumoDesdeRF';
import { mesKey } from '@/core/resumenFac';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';
import { LotesOfertablesSection } from './OpcionesOferta';

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
  const sugPar = a.bo.filter((it) => norm(it.bo.destinatario) === norm(r.destinatario) && norm(it.bo.materialBase) === norm(r.material));
  const consPar = (result?.consumo ?? []).filter((x) => norm(x.destinatario) === norm(r.destinatario) && norm(x.material) === norm(r.material));
  return (
    <DetalleLayout
      acciones={<AccionTotalesMaterial material={r.material} push={push} />}
      encabezado={(
        <>
          <h2 className="font-display text-lg font-semibold">{r.razonSocial}</h2>
          <p className="mt-1 text-sm text-text-muted">
            Material <Chip onClick={() => push({ type: 'material', material: r.material })}>{r.material}</Chip> — {r.textoMaterial} ·{' '}
            <Chip onClick={() => push({ type: 'evol', kind: 'solic', key: r.solicitante })}>Solic {r.solicitante}</Chip> ·{' '}
            <Chip onClick={() => push({ type: 'clienteDetalle', dest: r.destinatario, material: r.material })}>Dest {r.destinatario}</Chip>
          </p>
        </>
      )}
      datos={[
        { etiqueta: 'Ejecutivo', valor: ce.ejec(r) },
        { etiqueta: 'Grupo cliente', valor: ce.grupoCli(r) },
        { etiqueta: 'Sector', valor: ce.sector(r) },
        { etiqueta: 'Grupo art.', valor: ce.grupoArt(r) },
        { etiqueta: 'Centro', valor: r.centro },
      ]}
      banda={(
        <KpiBand
          titulo="Consumo del par destinatario + material"
          principal={{ etiqueta: 'Prom. mensual', valor: formatNumber(promedio), sub: `Consumo actual: ${formatNumber(actual)}` }}
          metricas={[
            { etiqueta: 'Estado', valor: st.label },
            { etiqueta: 'Importe última fact.', valor: formatCurrency(r.importeUltima) },
            { etiqueta: 'Pedidos pendientes', valor: formatNumber(sugPar.length), tono: sugPar.length ? 'danger' : undefined },
          ]}
        />
      )}
      izquierda={<InventarioColumna a={a} material={r.material} centro={r.centro || undefined} push={push} />}
      centro={<HistorialConsumo a={a} serie={serie} costosMaterial={r.material} titulo="Historial de facturación — material + destinatario" onMonth={(mes) => push({ type: 'clientesMes', material: r.material, mes, dest: r.destinatario })} />}
      abajo={(
        <>
          <TabsSugConsumo sug={sugPar} cons={consPar} a={a} push={push} titulo="Pedidos pendientes / Consumo de este cliente" />
          <LotesOfertablesSection a={a} material={r.material} cliente={`${r.destinatario} — ${r.razonSocial}`} push={push} />
        </>
      )}
    />
  );
}
