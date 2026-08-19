import { useMemo } from 'react';
import { StatTile } from '../ui';
import { Section, SugTable, ClienteConsumoTable } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { consumoEnrich, norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Resumen 360 de un cliente: ejecutivo/grupo, pedidos pendientes y consumo
 * histórico (última compra, precio, tendencia) por material — todo lo que
 * hace falta para decidir si ofertarle, en un solo lugar. Compartido entre
 * `ClienteDetallePanel` (drill desde Consumo/Pedidos) y la pestaña "Resumen"
 * de `ClienteConocimientoPanel` (el panel de Oportunidades), para no tener
 * que saltar de uno a otro cuando ya se sabe que el cliente acepta algo. */
export function ClienteResumen360({ dest, a, push }: { dest: string; a: Analytics; push: (p: Panel) => void }) {
  const { rf, bo, enrich, result } = a;
  const destN = norm(dest);
  const { consRows, boRows } = useMemo(() => ({
    consRows: (result?.consumo ?? []).filter((x) => norm(x.destinatario) === destN),
    boRows: bo.filter((it) => norm(it.bo.destinatario) === destN),
  }), [result, bo, destN]);
  const ce = consumoEnrich(enrich);
  const totalImp = consRows.reduce((s, r) => s + r.importeUltima, 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Ejecutivo" value={(consRows[0] ? ce.ejec(consRows[0]) : enrich.ejecutivoNombre(boRows[0]?.bo.gpoVdor || '')) || '—'} />
        <StatTile label="Grupo cliente" value={consRows[0] ? ce.grupoCli(consRows[0]) || '—' : (boRows[0] ? enrich.grupoCliente(boRows[0].bo.gpoCte) || boRows[0].bo.gpoCte : '—')} />
        <StatTile label="Materiales facturados" value={formatNumber(consRows.length)} />
        <StatTile label="Importe última fact. (suma)" value={formatCurrency(totalImp)} />
      </div>
      <Section title={`Pedidos pendientes · ${boRows.length}`}>
        {boRows.length === 0 ? <p className="text-sm text-text-muted">Sin pedidos pendientes.</p> : <SugTable list={boRows} a={a} push={push} />}
      </Section>
      <Section title={`Consumo histórico · ${consRows.length} material(es)`}>
        <ClienteConsumoTable rows={consRows} rf={rf} push={push} />
      </Section>
    </div>
  );
}
