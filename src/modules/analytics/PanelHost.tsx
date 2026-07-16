import { ArrowLeft } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { usePanelStore, type Panel } from '@/store/panelStore';
import { useAnalytics, type Analytics } from './AnalyticsContext';
import { StatePill, TrendBadge, Chip, EvolChart, ComparativaDual, InvGrid, StatTile } from './ui';
import { useMemo, useState } from 'react';
import {
  materialesDe, serieSolic, serieDest, serieMaterial, mesLabel, clasificarEstado, tendenciaTexto,
  clientesPorMesMaterial, mesKey, mesRefQAnterior, type Serie,
} from '@/core/resumenFac';
import { invGen } from '@/core/resumenSin';
import { sugFor, consFor, consumoSerie, consumoStatus, consumoTend, consumoEnrich, norm, num, matchesQuery, RC, pickField } from './helpers';
import type { BOItem } from '@/core/buildBO';
import type { ConsumoRow } from '@/core/types';

function vigenciaTxt(fecha: string): { txt: string; cls: string } | null {
  if (!fecha) return null;
  let d: Date | null = null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(fecha);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; d = new Date(y, +m[2] - 1, +m[1]); }
  else { m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(fecha); if (m) d = new Date(+m[1], +m[2] - 1, +m[3]); else { const dd = new Date(fecha); d = isNaN(dd.getTime()) ? null : dd; } }
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  const dias = Math.round((d.getTime() - now.getTime()) / 86400000);
  const meses = dias / 30.44;
  if (dias < 0) return { txt: 'Vencido', cls: 'rojo' };
  if (dias <= 31) return { txt: `${dias} d`, cls: 'rojo' };
  if (dias <= 182) return { txt: `${meses.toFixed(1)} meses`, cls: 'amb' };
  return { txt: `${meses.toFixed(1)} meses`, cls: 'verde' };
}

// #4: scoped filter/search input for a detail-panel subtable (like legacy <input class="mff" data-mf>).
function SubFilter({ value, onChange, placeholder = 'Filtrar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mb-2 h-8 w-full max-w-xs rounded-md border border-border bg-bg-elevated px-2 text-xs outline-none focus:border-accent"
    />
  );
}

// --- reusable sub-tables ----------------------------------------------------
function SugTable({ list, push }: { list: BOItem[]; push: (p: Panel) => void }) {
  const [f, setF] = useState('');
  if (!list.length) return <p className="text-sm text-text-muted">Sin sugerencias.</p>;
  const shown = f ? list.filter((it) => matchesQuery(f, `${it.bo.pedido} ${it.bo.razonSocial} ${it.bo.centroPedido}`)) : list;
  return (
    <div>
      <SubFilter value={f} onChange={setF} placeholder="Filtrar pedido, cliente, centro…" />
      <div>
        <Table wrapperClassName="max-h-80 rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Centro</TableHead>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Pendiente</TableHead><TableHead className="text-right">Precio</TableHead>
              <TableHead>Estado</TableHead><TableHead className="text-right">Fuentes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((it) => {
              const isBloqueado = !!it.bo.bloqueado;
              return (
                <TableRow key={it.k} title="Doble clic para ver detalle" className={`cursor-pointer ${isBloqueado ? 'bg-amber-400/20 hover:bg-amber-400/30' : ''}`} onDoubleClick={() => push({ type: 'sugDetalle', boKey: it.k })}>
                  <TableCell>{it.bo.pedido}</TableCell>
                  <TableCell className="max-w-64 truncate">{it.bo.razonSocial}</TableCell>
                  <TableCell>{it.bo.centroPedido}</TableCell>
                  <TableCell>{it.bo.materialBase}<div className="text-[11px] text-text-faint max-w-48 truncate">{it.bo.descripcionSolicitada}</div></TableCell>
                  <TableCell className="text-right">{formatNumber(it.bo.cantidadPendiente)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(it.bo.precio)}</TableCell>
                  <TableCell><StatePill label={it.status.label} cls={it.status.cls} /></TableCell>
                  <TableCell className="text-right">{it.fuentes.length || '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ConsumoTable({ list, a, push }: { list: ConsumoRow[]; a: Analytics; push: (p: Panel) => void }) {
  const ce = consumoEnrich(a.enrich);
  const [f, setF] = useState('');
  if (!list.length) return <p className="text-sm text-text-muted">Sin facturación de consumo.</p>;
  const shown = f ? list.filter((r) => matchesQuery(f, `${r.razonSocial} ${r.destinatario} ${r.centro}`)) : list;
  return (
    <div>
      <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente, centro…" />
      <div>
        <Table wrapperClassName="max-h-80 rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead><TableHead>Centro</TableHead>
              <TableHead className="text-right">Consumo/prom</TableHead><TableHead className="text-right">Imp. última</TableHead>
              <TableHead>Estado</TableHead><TableHead>Tendencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, i) => (
              <TableRow key={i} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => push({ type: 'consumoMaterial', dest: r.destinatario, material: r.material })}>
                <TableCell className="max-w-64 truncate">{r.razonSocial}<div className="text-[11px] text-text-faint">D {r.destinatario}</div></TableCell>
                <TableCell>{r.centro || ce.grupoCli(r) || '—'}</TableCell>
                <TableCell className="text-right">{formatNumber(r.consumoActual)}/{formatNumber(r.consumoPromedioMensual)}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.importeUltima)}</TableCell>
                <TableCell><StatePill label={consumoStatus(a.rf, r).label} cls={consumoStatus(a.rf, r).cls} /></TableCell>
                <TableCell><TrendBadge t={consumoTend(a.rf, r)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Material-level consumption breakdown for one client (clienteDetalle panel): material,
// descripción, última (combined date+qty), penúltima (combined date+qty), last price, trend.
function ClienteConsumoTable({ rows, rf, push }: {
  rows: ConsumoRow[];
  rf: Analytics['rf'];
  push: (p: Panel) => void;
}) {
  const [f, setF] = useState('');
  if (!rows.length) return <p className="text-sm text-text-muted">Sin historial de consumo.</p>;
  const shown = f ? rows.filter((r) => matchesQuery(f, `${r.material} ${r.textoMaterial}`)) : rows;
  return (
    <div>
      <SubFilter value={f} onChange={setF} placeholder="Filtrar material…" />
      <div>
        <Table wrapperClassName="max-h-80 rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead><TableHead className="text-right">Última</TableHead>
              <TableHead className="text-right">Penúltima</TableHead><TableHead className="text-right">Últ. precio</TableHead>
              <TableHead>Tendencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, i) => (
              <TableRow key={i} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => push({ type: 'material', material: r.material })}>
                <TableCell><span className="text-accent">{r.material}</span><div className="text-[11px] text-text-faint max-w-64 truncate">{r.textoMaterial}</div></TableCell>
                <TableCell className="text-right">{formatNumber(r.cantidadUltima)}<div className="text-[11px] text-text-faint">{r.ultimoMesFacturacion || '—'}</div></TableCell>
                <TableCell className="text-right">{formatNumber(num(r.raw[RC.cantPen]))}<div className="text-[11px] text-text-faint">{pickField(r.raw, [RC.penFecha]) || '—'}</div></TableCell>
                <TableCell className="text-right">{formatCurrency(r.precioProm)}</TableCell>
                <TableCell><TrendBadge t={consumoTend(rf, r)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FuentesTable({ fuentes, push }: { fuentes: BOItem['fuentes']; push: (p: Panel) => void }) {
  const [f, setF] = useState('');
  const shown = f ? fuentes.filter((x) => matchesQuery(f, `${x.fuente} ${x.materialSugerido} ${x.descripcionSugerida} ${x.centroSugerido} ${x.lote}`)) : fuentes;
  return (
    <div>
      <SubFilter value={f} onChange={setF} placeholder="Filtrar fuente, material, lote…" />
      <div>
        <Table wrapperClassName="max-h-72 rounded-lg border border-border">
          <TableHeader><TableRow><TableHead>Fuente</TableHead><TableHead>Material sug.</TableHead><TableHead>Centro/Alm</TableHead><TableHead className="text-right">Disp.</TableHead><TableHead>Lote</TableHead><TableHead>Caducidad</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((f2, i) => {
              const vg = vigenciaTxt(f2.fechaCaducidad);
              return (
                <TableRow key={i}>
                  <TableCell><StatePill label={f2.fuente} cls={/corta/i.test(f2.fuente) ? 'rojo' : 'azul'} /></TableCell>
                  <TableCell><Chip onClick={() => push({ type: 'material', material: f2.materialSugerido })}>{f2.materialSugerido}</Chip><div className="text-[11px] text-text-faint">{f2.descripcionSugerida}</div></TableCell>
                  <TableCell>{f2.centroSugerido}{f2.almacenSugerido ? ` / ${f2.almacenSugerido}` : ''}</TableCell>
                  <TableCell className="text-right">{formatNumber(f2.disponible)}</TableCell>
                  <TableCell>{f2.lote}</TableCell>
                  <TableCell>{f2.fechaCaducidad || '—'}{vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LotesTable({ lotes }: { lotes: Analytics['lotes'] }) {
  const [f, setF] = useState('');
  const shown = f ? lotes.filter((l) => matchesQuery(f, `${l.centro} ${l.almacen} ${l.lote}`)) : lotes;
  return (
    <div>
      <SubFilter value={f} onChange={setF} placeholder="Filtrar centro, almacén, lote…" />
      <div>
        <Table wrapperClassName="max-h-64 rounded-lg border border-border">
          <TableHeader><TableRow><TableHead>Centro</TableHead><TableHead>Almacén</TableHead><TableHead>Lote</TableHead><TableHead>Caducidad</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Precio oferta</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((l, i) => {
              const vg = vigenciaTxt(l.fechaCaducidad || '');
              return (
                <TableRow key={i}>
                  <TableCell>{l.centro}</TableCell><TableCell>{l.almacen}</TableCell><TableCell>{l.lote}</TableCell>
                  <TableCell>{l.fechaCaducidad || '—'}{vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}</TableCell>
                  <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                  <TableCell className="text-right">{l.precioOferta ? formatCurrency(l.precioOferta) : '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold text-text">{title}</h3>
      {children}
    </div>
  );
}

// --- individual panels ------------------------------------------------------
function PanelBody({ panel, a, push }: { panel: Panel; a: Analytics; push: (p: Panel) => void }) {
  const { rf, bo, boByKey, rss, enrich, result } = a;

  if (panel.type === 'sugDetalle') {
    const it = boByKey.get(panel.boKey);
    if (!it) return <p>Sugerencia no encontrada.</p>;
    const b = it.bo;
    const invPrin: [string, number][] = [['1030', b.invByCenter['1030']], ['1031', b.invByCenter['1031']], ['1032', b.invByCenter['1032']], ['1060', b.invByCenter['1060']]];
    const invOtros: [string, number][] = ['1001', '1003', '1004', '1017', '1018', '1022', '1036'].map((c) => [c, b.invByCenter[c] || 0]);
    return (
      <div>
        <p className="text-xs text-text-faint">Detalle de sugerencia / BO</p>
        <h2 className="font-display text-lg font-semibold">
          <Chip onClick={() => push({ type: 'evol', kind: 'solic', key: b.solicitante })}>{b.solicitante}</Chip> ›{' '}
          {b.razonSocial} › <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: b.destinatario })}>{b.destinatario}</Chip>
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Pedido <Chip onClick={() => push({ type: 'pedido', pedido: b.pedido })}>{b.pedido}</Chip> · OC {b.oc || '—'} · Material{' '}
          <Chip onClick={() => push({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip> — {b.descripcionSolicitada}
          {b.bloqueado && <> · <StatePill label={b.bloqueado} cls="amb" /></>}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Pendiente" value={formatNumber(b.cantidadPendiente)} />
          <StatTile label="Precio" value={formatCurrency(b.precio)} />
          <StatTile label="Estado" value={it.status.label} />
          <StatTile label="Ejecutivo" value={enrich.ejecutivoNombre(b.gpoVdor) || '—'} />
        </div>
        <Section title="Evolución mensual — material + destinatario"><EvolChart serie={it.serie} onMonth={(mes) => push({ type: 'clientesMes', material: b.materialBase, mes })} /></Section>
        {rf && <Section title="Comparativo anual"><ComparativaDual serie={it.serie} /></Section>}
        <Section title={`Fuentes / materiales ofertables (${it.fuentes.length})`}>
          {it.fuentes.length ? (
            <FuentesTable fuentes={it.fuentes} push={push} />
          ) : <p className="text-sm text-text-muted">Este BO no tiene fuentes asociadas.</p>}
        </Section>
        <Section title="Inventario principales"><InvGrid items={invPrin} /></Section>
        <Section title="Otros centros (1001–1036)"><InvGrid items={invOtros} /></Section>
      </div>
    );
  }

  if (panel.type === 'pedido') {
    const items = bo.filter((it) => norm(it.bo.pedido) === norm(panel.pedido));
    if (!items.length) return <p>Pedido sin materiales.</p>;
    const b0 = items[0].bo;
    const pendTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente), 0);
    const impTot = items.reduce((s, it) => s + num(it.bo.cantidadPendiente) * num(it.bo.precio), 0);
    return (
      <div>
        <p className="text-xs text-text-faint">Detalle del pedido</p>
        <h2 className="font-display text-lg font-semibold">Pedido {panel.pedido}</h2>
        <p className="mt-1 text-sm text-text-muted">{b0.razonSocial} · OC {b0.oc || '—'} · {items.length} material(es)</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile label="Materiales" value={String(items.length)} />
          <StatTile label="Cant. pendiente" value={formatNumber(pendTot)} />
          <StatTile label="Importe pendiente" value={formatCurrency(impTot)} />
        </div>
        <Section title="Materiales del pedido"><SugTable list={items} push={push} /></Section>
      </div>
    );
  }

  if (panel.type === 'evol') {
    if (!rf) return <p>No hay Resumen_Fac cargado.</p>;
    const serie = panel.kind === 'solic' ? serieSolic(rf, panel.key) : serieDest(rf, panel.key);
    const mats = materialesDe(rf, panel.kind, panel.key).map((m) => ({ ...m, sector: enrich.matSector(m.material), grupo: enrich.matGrupo(m.material) }));
    const titulo = panel.kind === 'solic' ? 'Facturación general del Solicitante' : 'Facturación general del Destinatario';
    return (
      <div>
        <h2 className="font-display text-lg font-semibold">{titulo}</h2>
        <p className="mt-1 text-sm text-text-muted">{panel.kind === 'solic' ? 'Solicitante' : 'Destinatario'}: {panel.key} · {mats.length} material(es)</p>
        <Section title="Comparativo anual"><ComparativaDual serie={serie} /></Section>
        <Section title="Evolución mensual — Importe facturado"><EvolChart serie={serie} /></Section>
        <Section title="Códigos facturados y su tendencia">
          <div>
            <Table wrapperClassName="max-h-80 rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Sector/Grupo</TableHead><TableHead>Último mes</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Tendencia</TableHead></TableRow></TableHeader>
              <TableBody>
                {mats.map((m) => (
                  <TableRow key={m.material} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => push({ type: 'codigoEvol', kind: panel.kind, key: panel.key, material: m.material })}>
                    <TableCell><span className="text-accent">{m.material}</span><div className="text-[11px] text-text-faint max-w-72 truncate">{m.texto}</div></TableCell>
                    <TableCell>{m.sector || '—'}<div className="text-[11px] text-text-faint">{m.grupo}</div></TableCell>
                    <TableCell>{m.ultimo ? mesLabel(m.ultimo.mes) : '—'}</TableCell>
                    <TableCell className="text-right">{m.ultimo ? formatCurrency(m.ultimo.imp) : '—'}</TableCell>
                    <TableCell><TrendBadge t={m.tend} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </div>
    );
  }

  if (panel.type === 'codigoEvol') {
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

  if (panel.type === 'clientesMes') {
    if (!rf) return <p>Sin datos.</p>;
    const list = clientesPorMesMaterial(rf, panel.material, panel.mes);
    return (
      <ClientesMesPanel
        title={`${panel.material} · ${mesLabel(panel.mes)}`}
        subtitle="Clientes que facturaron este material en el mes"
        list={list.map((c) => ({ dest: c.dest, razon: c.razon, solic: '', material: panel.material, cant: c.cant, imp: c.imp }))}
        push={push}
      />
    );
  }

  if (panel.type === 'mesClientesFiltro') {
    // #18: generalized month-click detail — rows were pre-computed against the currently
    // active Consumo filters at click time (see ConsumoPage's EvolChart onMonth handler).
    return (
      <ClientesMesPanel
        title={`Facturación · ${mesLabel(panel.mes)}`}
        subtitle="Clientes que facturaron ese mes, respetando los filtros activos"
        list={panel.rows.map((r) => ({ dest: r.dest, razon: r.razon, solic: r.solic, material: r.material, cant: r.cant, imp: r.imp }))}
        push={push}
      />
    );
  }

  if (panel.type === 'consumoMaterial') {
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
        <Section title="Comparativo anual"><ComparativaDual serie={serie} /></Section>
        <Section title="Evolución mensual — material + destinatario"><EvolChart serie={serie} onMonth={(mes) => push({ type: 'clientesMes', material: r.material, mes })} /></Section>
      </div>
    );
  }

  if (panel.type === 'clienteDetalle') {
    // Client-centric detail (as opposed to the material-centric 'material'/'consumoMaterial'
    // panels): open orders (BO/Sugerencias) + consumption history for one destinatario.
    const destN = norm(panel.dest);
    const consRows = (result?.consumo ?? []).filter((x) => norm(x.destinatario) === destN);
    const boRows = bo.filter((it) => norm(it.bo.destinatario) === destN);
    const ce = consumoEnrich(enrich);
    const first = consRows[0] || boRows[0]?.bo;
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
          <StatTile label="Ejecutivo" value={(first && consRows[0] ? ce.ejec(consRows[0]) : enrich.ejecutivoNombre(boRows[0]?.bo.gpoVdor || '')) || '—'} />
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

  if (panel.type === 'material') {
    const mat = panel.material;
    const lotes = a.lotes.filter((l) => norm(l.material) === norm(mat));
    const totalUni = lotes.reduce((s, l) => s + l.cantidadDisp, 0);
    const sug = sugFor(bo, mat);
    const cons = consFor(result?.consumo ?? [], mat);
    const serie = serieMaterial(rf, mat);
    // When the material appears in "Inventario por Condición", show a box with
    // each condición and its Precio oferta. The condición comes from that sheet;
    // the price is the catalog's InvConsolidado precioOferta (synced from
    // AppScript), back-filled per (material, condición) by applyCatalogPriceFallback.
    const invCondRows = a.invCondicion.filter((r) => norm(r.material) === norm(mat));
    const precioMap = new Map<string, { condicion: string; precio: number; inv: number }>();
    for (const r of invCondRows) {
      const key = `${r.condicion}|${r.precioOferta}`;
      const cur = precioMap.get(key) || { condicion: r.condicion || '(sin condición)', precio: r.precioOferta, inv: 0 };
      cur.inv += r.invSuma;
      precioMap.set(key, cur);
    }
    const precios = [...precioMap.values()].sort((x, y) => y.precio - x.precio);
    return (
      <div>
        <h2 className="font-display text-lg font-semibold">{mat}</h2>
        <p className="mt-1 text-sm text-text-muted">{lotes.length} lote(s) · {formatNumber(totalUni)} unidades</p>
        {precios.length > 0 && (
          <Section title="Precio oferta por condición">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {precios.map((p, i) => (
                <div key={i} className="rounded-lg border border-border bg-bg-elevated p-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-text-faint">{p.condicion}</div>
                  <div className="font-mono text-sm font-medium">{p.precio ? formatCurrency(p.precio) : '—'}</div>
                  {p.inv > 0 && <div className="text-[11px] text-text-faint">inv {formatNumber(p.inv)}</div>}
                </div>
              ))}
            </div>
          </Section>
        )}
        <Section title="Tendencia del material">
          <div className="mb-2"><TrendBadge t={tendenciaTexto(serie)} /></div>
          <EvolChart serie={serie} onMonth={(mes) => push({ type: 'clientesMes', material: mat, mes })} />
        </Section>
        {lotes.length > 0 && (
          <Section title="Lotes">
            <LotesTable lotes={lotes} />
          </Section>
        )}
        <Section title="Sugerencias / Consumo">
          <Tabs defaultValue="sug">
            <TabsList><TabsTrigger value="sug">Sugerencias ({sug.length})</TabsTrigger><TabsTrigger value="cons">Consumo ({cons.length})</TabsTrigger></TabsList>
            <TabsContent value="sug"><SugTable list={sug} push={push} /></TabsContent>
            <TabsContent value="cons"><ConsumoTable list={cons} a={a} push={push} /></TabsContent>
          </Tabs>
        </Section>
      </div>
    );
  }

  if (panel.type === 'celda') {
    if (!rss) return <p>Sin datos.</p>;
    const mo = rss.mats.get(norm(panel.material));
    const co = mo?.centros.get(norm(panel.centro));
    if (!mo || !co) return <p>Celda no encontrada.</p>;
    const alms = [...co.alm.values()].sort((x, y) => String(x.alm).localeCompare(String(y.alm)));
    const sug = sugFor(bo, panel.material, panel.centro);
    const cons = consFor(result?.consumo ?? [], panel.material, panel.centro);
    return (
      <div>
        <h2 className="font-display text-lg font-semibold">{panel.material} · Centro {panel.centro}</h2>
        <p className="mt-1 text-sm text-text-muted">{mo.desc}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Inv. general" value={formatNumber(invGen(co))} />
          <StatTile label="Pendiente" value={formatNumber(co.pend)} tone="text-danger" />
          <StatTile label="En tránsito" value={formatNumber(co.transito)} tone="text-warning" />
          <StatTile label="Importe pend." value={formatCurrency(co.impPend)} />
          {a.enrich.matPrecioOferta(panel.material) > 0 && <StatTile label="Precio oferta" value={formatCurrency(a.enrich.matPrecioOferta(panel.material))} tone="text-emerald-500" />}
        </div>
        <Section title="Desglose por almacén">
          <div>
            <Table wrapperClassName="max-h-64 rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>Almacén</TableHead><TableHead className="text-right">Inv.</TableHead><TableHead className="text-right">Pend.</TableHead><TableHead className="text-right">Tránsito</TableHead><TableHead className="text-right">Prom.</TableHead><TableHead>Último</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {alms.map((al, i) => (
                  <TableRow key={i}>
                    <TableCell>{al.alm}</TableCell><TableCell className="text-right">{formatNumber(al.inv)}</TableCell>
                    <TableCell className="text-right">{al.pend ? formatNumber(al.pend) : '—'}</TableCell>
                    <TableCell className="text-right">{al.transito ? formatNumber(al.transito) : '—'}</TableCell>
                    <TableCell className="text-right">{formatNumber(al.prom)}</TableCell>
                    <TableCell>{al.ultMes || '—'}</TableCell>
                    <TableCell>{al.status ? <StatePill label={al.status} cls="amb" /> : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
        <Section title="Tendencia del material"><EvolChart serie={serieMaterial(rf, panel.material)} height={180} /></Section>
        <Section title="Sugerencias / Consumo en este centro">
          <Tabs defaultValue="sug">
            <TabsList><TabsTrigger value="sug">Sugerencias ({sug.length})</TabsTrigger><TabsTrigger value="cons">Consumo ({cons.length})</TabsTrigger></TabsList>
            <TabsContent value="sug"><SugTable list={sug} push={push} /></TabsContent>
            <TabsContent value="cons"><ConsumoTable list={cons} a={a} push={push} /></TabsContent>
          </Tabs>
        </Section>
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => push({ type: 'materialTotales', material: panel.material })}>Ver totales del material</Button>
        </div>
      </div>
    );
  }

  if (panel.type === 'materialTotales') {
    if (!rss) return <p>Sin datos.</p>;
    const mo = rss.mats.get(norm(panel.material));
    if (!mo) return <p>Material no encontrado.</p>;
    const sug = sugFor(bo, panel.material);
    const cons = consFor(result?.consumo ?? [], panel.material);
    return (
      <div>
        <h2 className="font-display text-lg font-semibold">{panel.material} · Totales</h2>
        <p className="mt-1 text-sm text-text-muted">{mo.desc}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Inventario global" value={formatNumber(mo.sumaInv)} />
          <StatTile label="Pendiente global" value={formatNumber(mo.sumaPend)} tone="text-danger" />
          <StatTile label="Sugerencias" value={String(sug.length)} />
          <StatTile label="Clientes consumo" value={String(cons.length)} />
          {a.enrich.matPrecioOferta(panel.material) > 0 && <StatTile label="Precio oferta" value={formatCurrency(a.enrich.matPrecioOferta(panel.material))} tone="text-emerald-500" />}
        </div>
        <Section title="Sugerencias / Consumo del material">
          <Tabs defaultValue="sug">
            <TabsList><TabsTrigger value="sug">Sugerencias ({sug.length})</TabsTrigger><TabsTrigger value="cons">Consumo ({cons.length})</TabsTrigger></TabsList>
            <TabsContent value="sug"><SugTable list={sug} push={push} /></TabsContent>
            <TabsContent value="cons"><ConsumoTable list={cons} a={a} push={push} /></TabsContent>
          </Tabs>
        </Section>
      </div>
    );
  }

  if (panel.type === 'sector') {
    // Recompute grupos for the sector from RF series.
    if (!rf) return <p>Sin datos.</p>;
    const grupos = new Map<string, { grupo: string; i12: number }>();
    rf.mat.forEach((serie, m) => {
      if (enrich.matSector(m) !== panel.sector && !(panel.sector === '(sin sector)' && !enrich.matSector(m))) return;
      const gru = enrich.matGrupo(m) || '(sin grupo)';
      const i12 = serie.reduce((s, x) => s + x.imp, 0);
      const g = grupos.get(gru) || { grupo: gru, i12: 0 };
      g.i12 += i12;
      grupos.set(gru, g);
    });
    const list = [...grupos.values()].sort((x, y) => y.i12 - x.i12);
    return (
      <div>
        <h2 className="font-display text-lg font-semibold">Sector · {panel.sector}</h2>
        <p className="mt-1 text-sm text-text-muted">Grupos de artículo del sector</p>
        <Section title={`${list.length} grupo(s)`}>
          <div>
            <Table wrapperClassName="max-h-96 rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>Grupo de artículo</TableHead><TableHead className="text-right">Importe (histórico)</TableHead></TableRow></TableHeader>
              <TableBody>
                {list.map((g) => (
                  <TableRow key={g.grupo}><TableCell>{g.grupo}</TableCell><TableCell className="text-right">{formatCurrency(g.i12)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </div>
    );
  }

  if (panel.type === 'grupo') {
    // Solicitantes with new/reactivation for the article group. #19: also compute each
    // client's PREVIOUS-quarter classification (using mesRefQAnterior as the reference
    // month for clasificarEstado) alongside the current-quarter one.
    if (!rf) return <p>Sin datos.</p>;
    const g = panel.grupo;
    const rows: { solic: string; razon: string; st: ReturnType<typeof clasificarEstado>; stPrev: ReturnType<typeof clasificarEstado>; imp: number; ult: string }[] = [];
    const gbucket = new Map<string, { imp: number; cant: number; mes: string }>();
    const refPrev = mesRefQAnterior(rf.curmes);
    rf.solicMats.forEach((mats, s) => {
      const bucket = new Map<string, { imp: number; cant: number; mes: string }>();
      mats.forEach((serie, mat) => {
        if ((enrich.matGrupo(mat) || '(sin grupo)') !== g) return;
        serie.forEach((p) => {
          const c = bucket.get(p.mes) || { imp: 0, cant: 0, mes: p.mes };
          c.imp += p.imp; c.cant += p.cant; bucket.set(p.mes, c);
          const gb = gbucket.get(p.mes) || { imp: 0, cant: 0, mes: p.mes };
          gb.imp += p.imp; gbucket.set(p.mes, gb);
        });
      });
      if (!bucket.size) return;
      const serie = [...bucket.values()].map((v) => ({ mes: v.mes, cant: v.cant, imp: v.imp })).sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
      const st = clasificarEstado(serie, false);
      const stPrev = clasificarEstado(serie, false, refPrev);
      const imp = serie.reduce((acc, x) => acc + x.imp, 0);
      rows.push({ solic: s, razon: rf.solicRazon.get(s) || '', st, stPrev, imp, ult: serie[serie.length - 1]?.mes || '' });
    });
    rows.sort((x, y) => y.imp - x.imp);
    const serie = [...gbucket.values()].map((v) => ({ mes: v.mes, cant: v.cant, imp: v.imp })).sort((x, y) => mesKey(x.mes) - mesKey(y.mes));
    return <GrupoPanelBody g={g} rows={rows} serie={serie} push={push} />;
  }
  return null;
}

// #18 + #4: shared client-list panel (month-click / group-click origin) with its own scoped filter.
// #14: two-level drill — Destinatario-level summary first; clicking a destinatario expands
// it in place to show the material breakdown for that month+destinatario.
function ClientesMesPanel({ title, subtitle, list, push }: {
  title: string;
  subtitle: string;
  list: { dest: string; razon: string; solic: string; material: string; cant: number; imp: number }[];
  push: (p: Panel) => void;
}) {
  const [f, setF] = useState('');
  const [openDest, setOpenDest] = useState<string | null>(null);
  const byDest = useMemoDest(list);
  const shown = f ? byDest.filter((d) => matchesQuery(f, `${d.dest} ${d.razon}`)) : byDest;
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      <Section title={`${shown.length} de ${byDest.length} cliente(s)`}>
        <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente…" />
        <div>
          <Table wrapperClassName="max-h-96 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead></TableHead><TableHead>Destinatario</TableHead><TableHead>Razón social</TableHead><TableHead className="text-right">Materiales</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader>
            <TableBody>
              {shown.map((d) => {
                const isOpen = openDest === d.dest;
                return (
                  <>
                    <TableRow key={d.dest} className="cursor-pointer" onClick={() => setOpenDest(isOpen ? null : d.dest)}>
                      <TableCell><ChevronDownIcon open={isOpen} /></TableCell>
                      <TableCell><span className="text-accent">{d.dest}</span></TableCell>
                      <TableCell className="max-w-72 truncate">{d.razon}</TableCell>
                      <TableCell className="text-right">{d.items.length}</TableCell>
                      <TableCell className="text-right">{formatNumber(d.cant)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(d.imp)}</TableCell>
                    </TableRow>
                    {isOpen && d.items.map((it, i) => (
                      <TableRow key={d.dest + it.material + i} className="bg-bg-inset/40 text-xs">
                        <TableCell></TableCell>
                        <TableCell colSpan={2} className="text-text-faint">
                          <Chip onClick={() => push({ type: 'material', material: it.material })}>{it.material}</Chip>
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">{formatNumber(it.cant)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(it.imp)}</TableCell>
                      </TableRow>
                    ))}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return <span className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>;
}

function useMemoDest(list: { dest: string; razon: string; solic: string; material: string; cant: number; imp: number }[]) {
  return useMemo(() => {
    const map = new Map<string, { dest: string; razon: string; cant: number; imp: number; items: { material: string; cant: number; imp: number }[] }>();
    for (const c of list) {
      let d = map.get(c.dest);
      if (!d) { d = { dest: c.dest, razon: c.razon, cant: 0, imp: 0, items: [] }; map.set(c.dest, d); }
      d.cant += c.cant; d.imp += c.imp;
      d.items.push({ material: c.material, cant: c.cant, imp: c.imp });
    }
    return [...map.values()].sort((x, y) => y.imp - x.imp);
  }, [list]);
}

// #19 + #4: Grupo-de-artículo detail with previous-quarter classification alongside current, and a scoped filter.
function GrupoPanelBody({ g, rows, serie, push }: {
  g: string;
  rows: { solic: string; razon: string; st: ReturnType<typeof clasificarEstado>; stPrev: ReturnType<typeof clasificarEstado>; imp: number; ult: string }[];
  serie: Serie;
  push: (p: Panel) => void;
}) {
  const [f, setF] = useState('');
  const shown = f ? rows.filter((x) => matchesQuery(f, `${x.razon} ${x.solic}`)) : rows;
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">Grupo de artículo · {g}</h2>
      <p className="mt-1 text-sm text-text-muted">{rows.length} solicitante(s) · {tendenciaTexto(serie).txt}</p>
      <Section title="Evolución mensual del grupo"><EvolChart serie={serie} /></Section>
      <Section title="Solicitantes (estado actual y del trimestre anterior)">
        <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente…" />
        <div>
          <Table wrapperClassName="max-h-80 rounded-lg border border-border">
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Estado actual</TableHead><TableHead>Estado trim. anterior</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Última</TableHead></TableRow></TableHeader>
            <TableBody>
              {shown.map((x) => (
                <TableRow key={x.solic} className="cursor-pointer" title="Doble clic para ver detalle" onDoubleClick={() => push({ type: 'evol', kind: 'solic', key: x.solic })}>
                  <TableCell className="max-w-72 truncate">{x.razon || '—'}<div className="text-[11px] text-text-faint">Solic {x.solic}</div></TableCell>
                  <TableCell><StatePill label={x.st.label} cls={x.st.cls} /></TableCell>
                  <TableCell><StatePill label={x.stPrev.label} cls={x.stPrev.cls} /></TableCell>
                  <TableCell className="text-right">{formatCurrency(x.imp)}</TableCell>
                  <TableCell>{x.ult ? mesLabel(x.ult) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}

export function PanelHost() {
  const stack = usePanelStore((s) => s.stack);
  const back = usePanelStore((s) => s.back);
  const close = usePanelStore((s) => s.close);
  const push = usePanelStore((s) => s.push);
  const a = useAnalytics();
  const panel = stack[stack.length - 1];

  return (
    <Sheet open={!!panel} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full max-w-4xl sm:max-w-4xl">
        {stack.length > 1 && (
          <button onClick={back} className="mb-3 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
            <ArrowLeft className="size-4" /> Atrás
          </button>
        )}
        {panel && <PanelBody panel={panel} a={a} push={push} />}
      </SheetContent>
    </Sheet>
  );
}
