import { Chip, StatTile } from '../ui';
import { Section, SugTable, ClienteConsumoTable } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { consumoEnrich, norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Panel — Detalle por cliente (destinatario): órdenes pendientes (BO) + historial de consumo por material. */
export function ClienteDetallePanel({ panel, a, push }: { panel: Extract<Panel, { type: 'clienteDetalle' }>; a: Analytics; push: (p: Panel) => void }) {
  const { rf, bo, enrich, result } = a;
  const destN = norm(panel.dest);
  const consRows = (result?.consumo ?? []).filter((x) => norm(x.destinatario) === destN);
  const boRows = bo.filter((it) => norm(it.bo.destinatario) === destN);
  const ce = consumoEnrich(enrich);
  const razon = consRows[0]?.razonSocial || boRows[0]?.bo.razonSocial || '';
  const totalImp = consRows.reduce((s, r) => s + r.importeUltima, 0);
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{razon || panel.dest}</h2>
      <p className="mt-1 text-sm text-text-muted">
        Destinatario <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: panel.dest })}>{panel.dest}</Chip>
        {consRows[0] && <> · Solic <Chip onClick={() => push({ type: 'evol', kind: 'solic', key: consRows[0].solicitante })}>{consRows[0].solicitante}</Chip></>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Ejecutivo" value={(consRows[0] ? ce.ejec(consRows[0]) : enrich.ejecutivoNombre(boRows[0]?.bo.gpoVdor || '')) || '—'} />
        <StatTile label="Grupo cliente" value={consRows[0] ? ce.grupoCli(consRows[0]) || '—' : (boRows[0] ? enrich.grupoCliente(boRows[0].bo.gpoCte) || boRows[0].bo.gpoCte : '—')} />
        <StatTile label="Materiales facturados" value={formatNumber(consRows.length)} />
        <StatTile label="Importe última fact. (suma)" value={formatCurrency(totalImp)} />
      </div>
      <Section title={`Órdenes pendientes (Sugerencias) · ${boRows.length}`}>
        <SugTable list={boRows} push={push} />
      </Section>
      <Section title={`Historial de consumo · ${consRows.length} material(es)`}>
        <ClienteConsumoTable rows={consRows} rf={rf} push={push} />
      </Section>
    </div>
  );
}
