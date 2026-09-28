import { useMemo, useState } from 'react';
import { StatTile } from '../ui';
import { Section, SugTable, ClienteConsumoTable, SubFilter } from './_shared';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { consumoEnrich, matchesQuery, norm } from '../helpers';
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

  // Filtro único para "Pedidos pendientes" y "Consumo histórico": texto libre
  // sobre código/descripción/sector/grupo. Varios códigos o términos separados
  // por coma = cualquiera de ellos ("1001, 2050, gasa"). Los totales de arriba
  // siguen siendo del cliente completo — solo se acotan las dos listas.
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const terms = useMemo(() => q.split(',').map((t) => t.trim()).filter(Boolean), [q]);
  const pasa = (material: string, desc: string) => {
    const sec = enrich.matSector(material);
    if (sector && sec !== sector) return false;
    if (!terms.length) return true;
    const hay = `${material} ${desc} ${sec} ${enrich.matGrupo(material)}`;
    return terms.some((t) => matchesQuery(t, hay));
  };
  const sectorOptions = useMemo(
    () => [...new Set([...consRows.map((r) => enrich.matSector(r.material)), ...boRows.map((it) => enrich.matSector(it.bo.materialBase))].filter(Boolean))].sort(),
    [consRows, boRows, enrich],
  );
  const consShown = useMemo(() => consRows.filter((r) => pasa(r.material, r.textoMaterial)), [consRows, terms, sector, enrich]); // eslint-disable-line react-hooks/exhaustive-deps
  const boShown = useMemo(() => boRows.filter((it) => pasa(it.bo.materialBase, it.bo.descripcionSolicitada)), [boRows, terms, sector, enrich]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtrando = terms.length > 0 || !!sector;
  const totalImp = consRows.reduce((s, r) => s + r.importeUltima, 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Ejecutivo" value={(consRows[0] ? ce.ejec(consRows[0]) : enrich.ejecutivoNombre(boRows[0]?.bo.gpoVdor || '')) || '—'} />
        <StatTile label="Grupo cliente" value={consRows[0] ? ce.grupoCli(consRows[0]) || '—' : (boRows[0] ? enrich.grupoCliente(boRows[0].bo.gpoCte) || boRows[0].bo.gpoCte : '—')} />
        <StatTile label="Materiales facturados" value={formatNumber(consRows.length)} />
        <StatTile label="Importe última fact. (suma)" value={formatCurrency(totalImp)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SubFilter value={q} onChange={setQ} placeholder="Filtrar materiales (código, texto; separa varios con coma)…" />
        {sectorOptions.length > 1 && (
          <select value={sector} onChange={(e) => setSector(e.target.value)} className="mb-2 h-8 rounded-md border border-border bg-bg-elevated px-2 text-xs">
            <option value="">Sector (todos)</option>{sectorOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {filtrando && <button type="button" onClick={() => { setQ(''); setSector(''); }} className="mb-2 text-xs text-accent hover:underline">Limpiar</button>}
      </div>
      <Section title={`Pedidos pendientes · ${filtrando ? `${boShown.length} de ${boRows.length}` : boRows.length}`}>
        {boRows.length === 0 ? <p className="text-sm text-text-muted">Sin pedidos pendientes.</p> : boShown.length === 0 ? <p className="text-sm text-text-muted">Ningún pedido coincide con el filtro.</p> : <SugTable list={boShown} a={a} push={push} />}
      </Section>
      <Section title={`Consumo histórico · ${filtrando ? `${consShown.length} de ${consRows.length}` : consRows.length} material(es)`}>
        <ClienteConsumoTable rows={consShown} rf={rf} push={push} />
      </Section>
    </div>
  );
}
