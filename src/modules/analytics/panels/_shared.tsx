import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { StatePill, Chip, TrendBadge, AbcBadge, DetailChevron, StatTile, SuggestInput, useColumnVisibility, ColumnVisibilityControl } from '../ui';
import { formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { matchesQuery, RC, pickField, num, norm, consumoSerie, consumoStatus, consumoTend, consumoEnrich, transitoFor, buildConsumoIndex, consumoKey } from '../helpers';
import { consumoDe } from '@/core/resumenFac';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { RFIndex } from '@/core/resumenFac';
import { preciosPorCondicion } from '@/core/enrich';
import type { BOItem } from '@/core/buildBO';
import type { ConsumoRow } from '@/core/types';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';
import { usePermissionsStore } from '@/store/permissionsStore';
import { isColumnHidden, isDetailHidden } from '@/core/permissions';
import { buildSugerenciasColsAgrupado } from '@/modules/sugerencias/columns';
import { COLS_CONSUMO } from '@/modules/consumo/columns';
import { buildFromSugerencia, buildFromConsumo } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';

/** Normaliza una fecha de caducidad y la convierte en un texto legible con clase de color (rojo/ámbar/verde) según los días restantes. */
export function vigenciaTxt(fecha: string): { txt: string; cls: string } | null {
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

/** Input de filtrado acotado para subtablas de los paneles de detalle. */
export function SubFilter({ value, onChange, placeholder = 'Filtrar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className="mb-2 h-8 w-full max-w-xs rounded-md border border-border bg-bg-elevated px-2 text-xs outline-none focus:border-accent"
    />
  );
}

/** Subtabla reutilizable de sugerencias (BO), con las MISMAS columnas y la
 * misma preferencia de visibilidad (`useColumnVisibility('sugerencias_columnas')`)
 * que la tabla completa de `/sugerencias` — así el panel de un material dice
 * literalmente lo mismo que el reporte, y ocultar una columna desde Ajustes o
 * desde la página se refleja aquí también. Sin selección en lote ni menú
 * contextual de "Solicitar" — eso sigue siendo exclusivo de la página
 * completa; aquí el drill-down (`Chip`/`DetailChevron`) es lo que importa. */
export function SugTable({ list, a, push }: { list: BOItem[]; a: Analytics; push: (p: Panel) => void }) {
  const [f, setF] = useState('');
  const perms = usePermissionsStore((s) => s.perms);
  const precioOculto = isColumnHidden(perms, 'sugerencias', 'precio');
  const fuenteOculto = isDetailHidden(perms, 'sugerencias', 'fuente');
  const colVis = useColumnVisibility('sugerencias_columnas');
  const vis = colVis.isVisible;
  const cols = useMemo(() => buildSugerenciasColsAgrupado({ precioOculto, unificarInv: false, fuenteOculto }), [precioOculto, fuenteOculto]);
  const consumoIdx = useMemo(() => buildConsumoIndex(a.result?.consumo ?? []), [a.result]);
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  // Sugerencias picks its lote inside the dialog (BOItem.fuentes may hold
  // several), así que el sourceKey completo no se conoce de antemano — hace
  // match por prefijo de BO key, igual que en `/sugerencias`.
  const sugSolicitadas = useMemo(() => {
    const set = new Set<string>();
    for (const s of solicitudesList) {
      if (s.origen !== 'sugerencias') continue;
      const parts = s.sourceKey.split('|');
      set.add(parts.slice(1, -1).join('|'));
    }
    return set;
  }, [solicitudesList]);
  if (!list.length) return <p className="text-sm text-text-muted">Sin sugerencias.</p>;
  const shown = f ? list.filter((it) => matchesQuery(f, `${it.bo.pedido} ${it.bo.razonSocial} ${it.bo.centroPedido}`)) : list;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SubFilter value={f} onChange={setF} placeholder="Filtrar pedido, cliente, centro…" />
        <ColumnVisibilityControl columns={cols} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
      </div>
      <div>
        <Table wrapperClassName="max-h-[32rem] rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              {vis('ejecutivo') && <TableHead>Ejecutivo / Grupo cli.</TableHead>}
              {vis('pedido') && <TableHead>Pedido/OC</TableHead>}
              {vis('fecha') && <TableHead>Fecha</TableHead>}
              {vis('cliente') && <TableHead>Cliente</TableHead>}
              {vis('centro') && <TableHead>Centro/Alm</TableHead>}
              {vis('material') && <TableHead>Material</TableHead>}
              {vis('sector') && <TableHead>Sector/Grupo</TableHead>}
              {vis('cantped') && <TableHead className="text-right">Cant.ped.</TableHead>}
              {vis('pend') && <TableHead className="text-right">Pend.</TableHead>}
              {!precioOculto && vis('precio') && <TableHead className="text-right">Precio</TableHead>}
              {vis('consumo') && <TableHead className="text-right">Consumo</TableHead>}
              {vis('inv1030') && <TableHead className="text-right">1030</TableHead>}
              {vis('inv1031') && <TableHead className="text-right">1031</TableHead>}
              {vis('inv1032') && <TableHead className="text-right">1032</TableHead>}
              {vis('inv1060') && <TableHead className="text-right">1060</TableHead>}
              {vis('bloq') && <TableHead>Bloq.</TableHead>}
              {vis('estado') && <TableHead>Estado</TableHead>}
              {vis('tendencia') && <TableHead>Tendencia</TableHead>}
              {!fuenteOculto && vis('fuentes') && <TableHead className="text-right">Fuentes</TableHead>}
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((it) => {
              const b = it.bo;
              const isBloqueado = !!b.bloqueado;
              const onSolicitar = () => solicitar.abrir(buildFromSugerencia(b, it.k, it.fuentes[0] ?? null, a.enrich));
              const copyItems = [
                { label: 'Material', value: b.materialBase },
                { label: 'Pedido', value: b.pedido },
                { label: 'Cliente', value: b.razonSocial },
                { label: 'Centro', value: b.centroPedido },
              ];
              return (
                <SolicitarContextMenu
                  key={it.k}
                  onSolicitar={onSolicitar}
                  solicitado={sugSolicitadas.has(it.k)}
                  label={b.materialBase}
                  onVerDetalle={() => push({ type: 'sugDetalle', boKey: it.k })}
                  copyItems={copyItems}
                >
                <TableRow className={`group ${isBloqueado ? 'bg-amber-400/20 hover:bg-amber-400/30' : ''}`}>
                  {vis('ejecutivo') && <TableCell>{a.enrich.ejecutivoNombre(b.gpoVdor) || '—'}<div className="text-[11px] text-text-faint">{a.enrich.grupoCliente(b.gpoCte) || '—'}</div></TableCell>}
                  {vis('pedido') && <TableCell><Chip onClick={() => push({ type: 'pedido', pedido: b.pedido })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>}
                  {vis('fecha') && <TableCell className="whitespace-nowrap text-xs">{b.fecha || '—'}</TableCell>}
                  {vis('cliente') && <TableCell className="max-w-64 truncate">{b.razonSocial}<div className="text-[11px]"><Chip onClick={() => push({ type: 'evol', kind: 'solic', key: b.solicitante })}>S {b.solicitante}</Chip> · <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: b.destinatario })}>D {b.destinatario}</Chip></div></TableCell>}
                  {vis('centro') && <TableCell>{b.centroPedido}{b.almacen ? ` / ${b.almacen}` : ''}</TableCell>}
                  {vis('material') && <TableCell><Chip onClick={() => push({ type: 'material', material: b.materialBase })}>{b.materialBase}</Chip><div className="text-[11px] text-text-faint max-w-48 truncate">{b.descripcionSolicitada}</div></TableCell>}
                  {vis('sector') && <TableCell>{a.enrich.matSector(b.materialBase) || '—'}<div className="text-[11px] text-text-faint">{a.enrich.matGrupo(b.materialBase)}</div></TableCell>}
                  {vis('cantped') && <TableCell className="text-right">{formatNumber(b.cantidadPedido)}</TableCell>}
                  {vis('pend') && <TableCell className="text-right">{formatNumber(b.cantidadPendiente)}</TableCell>}
                  {!precioOculto && vis('precio') && <TableCell className="text-right">{formatCurrency(b.precio)}</TableCell>}
                  {vis('consumo') && <TableCell className="text-right">{formatNumber(it.consumoProm)}<div className="text-[11px] text-text-faint">{consumoIdx.get(consumoKey(b.destinatario, b.materialBase))?.ultimoMesFacturacion || '—'}</div></TableCell>}
                  {(['1030', '1031', '1032', '1060'] as const).map((alm) => vis(`inv${alm}`) && (
                    <TableCell key={alm} className="text-right">
                      {formatNumber(num(b.invByCenter[alm] || 0))}
                      {transitoFor(a.rss, b.centroPedido, alm, b.materialBase) > 0 && <div className="text-[10px] text-emerald-500">↻+{formatNumber(transitoFor(a.rss, b.centroPedido, alm, b.materialBase))}</div>}
                    </TableCell>
                  ))}
                  {vis('bloq') && <TableCell>{b.bloqueado ? <StatePill label={b.bloqueado} cls="amb" /> : '—'}</TableCell>}
                  {vis('estado') && <TableCell><StatePill label={it.status.label} cls={it.status.cls} /></TableCell>}
                  {vis('tendencia') && <TableCell><TrendBadge t={it.tend} /></TableCell>}
                  {!fuenteOculto && vis('fuentes') && <TableCell className="text-right">{it.fuentes.length || '—'}</TableCell>}
                  <TableCell><DetailChevron onOpen={() => push({ type: 'sugDetalle', boKey: it.k })} /></TableCell>
                </TableRow>
                </SolicitarContextMenu>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}

/** Subtabla reutilizable de consumo (Resumen_Fac), con las mismas columnas y
 * la misma preferencia de visibilidad (`useColumnVisibility('consumo_columnas')`)
 * que la tabla completa de `/consumo` — ver comentario de `SugTable`. */
export function ConsumoTable({ list, a, push }: { list: ConsumoRow[]; a: Analytics; push: (p: Panel) => void }) {
  const ce = consumoEnrich(a.enrich);
  const [f, setF] = useState('');
  const colVis = useColumnVisibility('consumo_columnas');
  const vis = colVis.isVisible;
  const claseDe = (r: ConsumoRow) => a.abc.classByMaterial.get(norm(r.material)) || '';
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const solicitudSourceKeys = useMemo(() => new Set(solicitudesList.filter((s) => s.origen === 'consumo').map((s) => s.sourceKey)), [solicitudesList]);
  if (!list.length) return <p className="text-sm text-text-muted">Sin facturación de consumo.</p>;
  const shown = f ? list.filter((r) => matchesQuery(f, `${r.razonSocial} ${r.destinatario} ${r.centro}`)) : list;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente, centro…" />
        <ColumnVisibilityControl columns={COLS_CONSUMO} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
      </div>
      <div>
        <Table wrapperClassName="max-h-[32rem] rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              {vis('cliente') && <TableHead>Cliente</TableHead>}
              {vis('ejecutivo') && <TableHead>Ejecutivo / Grupo cli.</TableHead>}
              {vis('centro') && <TableHead>Centro</TableHead>}
              {vis('material') && <TableHead>Material</TableHead>}
              {vis('abc') && <TableHead>ABC</TableHead>}
              {vis('sector') && <TableHead>Sector/Grupo</TableHead>}
              {vis('consumo') && <TableHead className="text-right">Consumo/prom</TableHead>}
              {vis('ultima') && <TableHead className="text-right">Última</TableHead>}
              {vis('penultima') && <TableHead className="text-right">Penúltima</TableHead>}
              {vis('impultima') && <TableHead className="text-right">Imp. última</TableHead>}
              {vis('estado') && <TableHead>Estado</TableHead>}
              {vis('tendencia') && <TableHead>Tendencia</TableHead>}
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, i) => {
              const onSolicitar = () => solicitar.abrir(buildFromConsumo(r));
              const copyItems = [
                { label: 'Material', value: r.material },
                { label: 'Cliente', value: r.razonSocial },
                { label: 'Centro', value: r.centro },
              ];
              return (
              <SolicitarContextMenu
                key={i}
                onSolicitar={onSolicitar}
                solicitado={solicitudSourceKeys.has(`con|${norm(r.material)}|${norm(r.centro)}`)}
                label={r.material}
                onVerDetalle={() => push({ type: 'consumoMaterial', dest: r.destinatario, material: r.material })}
                copyItems={copyItems}
              >
              <TableRow className="group">
                {vis('cliente') && <TableCell className="max-w-64 truncate">{r.razonSocial}<div className="text-[11px]"><Chip onClick={() => push({ type: 'evol', kind: 'solic', key: r.solicitante })}>S {r.solicitante}</Chip> · <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: r.destinatario })}>D {r.destinatario}</Chip></div></TableCell>}
                {vis('ejecutivo') && <TableCell>{ce.ejec(r) || '—'}<div className="text-[11px] text-text-faint">{ce.grupoCli(r) || '—'}</div></TableCell>}
                {vis('centro') && <TableCell>{r.centro || ce.grupoCli(r) || '—'}</TableCell>}
                {vis('material') && <TableCell><Chip onClick={() => push({ type: 'material', material: r.material })}>{r.material}</Chip><div className="text-[11px] text-text-faint max-w-48 truncate">{r.textoMaterial}</div></TableCell>}
                {vis('abc') && <TableCell><AbcBadge clase={claseDe(r) || undefined} /></TableCell>}
                {vis('sector') && <TableCell>{ce.sector(r) || '—'}<div className="text-[11px] text-text-faint">{ce.grupoArt(r)}</div></TableCell>}
                {vis('consumo') && <TableCell className="text-right">{formatNumber(r.consumoActual)}/{formatNumber(r.consumoPromedioMensual)}</TableCell>}
                {vis('ultima') && <TableCell className="text-right">{formatNumber(r.cantidadUltima)}<div className="text-[11px] text-text-faint">{r.ultimoMesFacturacion || '—'}</div></TableCell>}
                {vis('penultima') && <TableCell className="text-right">{formatNumber(num(r.raw[RC.cantPen]))}<div className="text-[11px] text-text-faint">{pickField(r.raw, [RC.penFecha]) || '—'}</div></TableCell>}
                {vis('impultima') && <TableCell className="text-right">{formatCurrency(r.importeUltima)}</TableCell>}
                {vis('estado') && <TableCell><StatePill label={consumoStatus(a.rf, r).label} cls={consumoStatus(a.rf, r).cls} /></TableCell>}
                {vis('tendencia') && <TableCell><TrendBadge t={consumoTend(a.rf, r)} /></TableCell>}
                <TableCell><DetailChevron onOpen={() => push({ type: 'consumoMaterial', dest: r.destinatario, material: r.material })} /></TableCell>
              </TableRow>
              </SolicitarContextMenu>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <SolicitarDialog draft={solicitar.dialogDraft} loteOptions={solicitar.dialogLoteOptions} onClose={solicitar.cerrar} />
    </div>
  );
}

/** Subtabla de historial de consumo por material para un cliente (panel clienteDetalle). */
export function ClienteConsumoTable({ rows, rf, push }: {
  rows: ConsumoRow[];
  rf: RFIndex | null;
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
              <TableHead>Tendencia</TableHead><TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, i) => (
              <TableRow key={i} className="group">
                <TableCell><span className="text-accent">{r.material}</span><div className="text-[11px] text-text-faint max-w-64 truncate">{r.textoMaterial}</div></TableCell>
                <TableCell className="text-right">{formatNumber(r.cantidadUltima)}<div className="text-[11px] text-text-faint">{r.ultimoMesFacturacion || '—'}</div></TableCell>
                <TableCell className="text-right">{formatNumber(num(r.raw[RC.cantPen]))}<div className="text-[11px] text-text-faint">{pickField(r.raw, [RC.penFecha]) || '—'}</div></TableCell>
                <TableCell className="text-right">{formatCurrency(r.precioProm)}</TableCell>
                <TableCell><TrendBadge t={consumoTend(rf, r)} /></TableCell>
                <TableCell><DetailChevron onOpen={() => push({ type: 'material', material: r.material })} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Tarjeta de contexto de consumo de UN material para UN cliente: material +
 * descripción, último/penúltimo mes de compra (cant. + importe), precio de
 * la última venta y tendencia — lo que un analista busca justo después de
 * ver una fila de Consumo o de seleccionar un material dentro de un pedido.
 * Reutilizada desde `ClienteDetallePanel` (doble clic en Consumo) y
 * `PedidoPanel` (columna izquierda, se actualiza al cambiar de material). */
export function ConsumoMaterialCard({ a, dest, material }: { a: Analytics; dest: string; material: string }) {
  const destN = norm(dest);
  const matN = norm(material);
  const row = (a.result?.consumo ?? []).find((r) => norm(r.destinatario) === destN && norm(r.material) === matN);
  if (!row) {
    return (
      <Section title="Consumo del material">
        <p className="text-sm text-text-muted">Sin historial de compra de {material} para este cliente.</p>
      </Section>
    );
  }
  const serie = consumoSerie(a.rf, row);
  const info = consumoDe(serie, a.curmes);
  const ultimo = info.tipo === 'actual' ? { mes: info.mes!, cant: info.cant!, imp: info.imp! } : info.ultimo;
  const penultimo = info.tipo === 'actual' ? serie[serie.length - 2] || null : info.penultimo;
  const precioPenultimo = num(row.raw[RC.precioPenUni]);
  return (
    <Section title="Consumo del material">
      <div className="rounded-lg border border-border bg-bg-elevated p-2.5">
        <p className="font-mono text-xs font-medium">{row.material}</p>
        <p className="truncate text-[11px] text-text-faint">{row.textoMaterial}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <StatTile compact label="Última compra" value={ultimo ? formatNumber(ultimo.cant) : '—'} sub={ultimo?.mes || '—'} />
          <StatTile compact label="Importe última" value={ultimo ? formatCurrency(ultimo.imp) : '—'} />
          <StatTile compact label="Penúltima compra" value={penultimo ? formatNumber(penultimo.cant) : '—'} sub={penultimo?.mes || '—'} />
          <StatTile compact label="Precio última" value={row.precioUnitarioUltima ? formatCurrency(row.precioUnitarioUltima) : '—'} sub={precioPenultimo ? `Penúlt. ${formatCurrency(precioPenultimo)}` : undefined} />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          Tendencia <TrendBadge t={consumoTend(a.rf, row)} />
        </div>
      </div>
    </Section>
  );
}

/** Selección de hasta `maxSelect` fuentes (lotes) para armar el mensaje de
 * oferta al ejecutivo (ver `PedidoPanel`) — opcional; sin esta prop la tabla
 * no muestra casillas. */
export interface FuentesSelection {
  isSelected: (f: BOItem['fuentes'][number]) => boolean;
  onToggle: (f: BOItem['fuentes'][number]) => void;
  full: boolean;
}

/** Subtabla de fuentes/materiales ofertables para un BO, con caducidad y drill hacia material.
 * Filtros independientes con autosugerencias por Centro, Lote y Material —
 * combinables con AND — en vez de un único texto libre. */
export function FuentesTable({ fuentes, push, selection }: { fuentes: BOItem['fuentes']; push: (p: Panel) => void; selection?: FuentesSelection }) {
  const [fCentro, setFCentro] = useState('');
  const [fLote, setFLote] = useState('');
  const [fMaterial, setFMaterial] = useState('');
  const centros = useMemo(() => [...new Set(fuentes.map((x) => x.centroSugerido).filter(Boolean))].sort(), [fuentes]);
  const lotes = useMemo(() => [...new Set(fuentes.map((x) => x.lote).filter(Boolean))].sort(), [fuentes]);
  const materiales = useMemo(() => [...new Set(fuentes.map((x) => x.materialSugerido).filter(Boolean))].sort(), [fuentes]);
  const shown = fuentes.filter((x) =>
    (!fCentro || matchesQuery(fCentro, x.centroSugerido)) &&
    (!fLote || matchesQuery(fLote, x.lote)) &&
    (!fMaterial || matchesQuery(fMaterial, `${x.materialSugerido} ${x.descripcionSugerida}`)),
  );
  return (
    <div>
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SuggestInput value={fCentro} onChange={setFCentro} options={centros} placeholder="Centro…" />
        <SuggestInput value={fLote} onChange={setFLote} options={lotes} placeholder="Lote…" />
        <SuggestInput value={fMaterial} onChange={setFMaterial} options={materiales} placeholder="Material…" />
      </div>
      <div>
        <Table wrapperClassName="max-h-72 rounded-lg border border-border">
          <TableHeader><TableRow>{selection && <TableHead className="w-8" />}<TableHead>Fuente</TableHead><TableHead>Material sug.</TableHead><TableHead>Centro/Alm</TableHead><TableHead className="text-right">Disp.</TableHead><TableHead>Lote</TableHead><TableHead>Caducidad</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((f2, i) => {
              const vg = vigenciaTxt(f2.fechaCaducidad);
              const sel = selection?.isSelected(f2) ?? false;
              return (
                <TableRow key={i} className={sel ? 'bg-emerald-500/10' : undefined}>
                  {selection && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={sel}
                        disabled={!sel && selection.full}
                        onChange={() => selection.onToggle(f2)}
                        title={!sel && selection.full ? 'Máximo 2 lotes seleccionados para este material' : 'Seleccionar para la oferta'}
                        className="size-3.5 accent-emerald-600"
                      />
                    </TableCell>
                  )}
                  <TableCell><StatePill label={f2.fuente} cls={/corta/i.test(f2.fuente) ? 'rojo' : 'azul'} /></TableCell>
                  <TableCell><Chip onClick={() => push({ type: 'material', material: f2.materialSugerido })}>{f2.materialSugerido}</Chip><div className="text-[11px] text-text-faint">{f2.descripcionSugerida}</div></TableCell>
                  <TableCell>{f2.centroSugerido}{f2.almacenSugerido ? ` / ${f2.almacenSugerido}` : ''}</TableCell>
                  <TableCell className="text-right">{formatNumber(f2.disponible)}</TableCell>
                  <TableCell>{f2.lote}</TableCell>
                  <TableCell>{formatFechaCaducidad(f2.fechaCaducidad)}{vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Subtabla de lotes (Resumen_Sin / InvDetalle) con precio(s) por condición por lote. */
export function LotesTable({ lotes, a, material }: { lotes: Analytics['lotes']; a: Analytics; material: string }) {
  const [f, setF] = useState('');
  const shown = f ? lotes.filter((l) => matchesQuery(f, `${l.centro} ${l.almacen} ${l.lote}`)) : lotes;
  const precios = useMemo(() => precioPorCondicion(a, material), [a, material]);
  return (
    <div>
      <SubFilter value={f} onChange={setF} placeholder="Filtrar centro, almacén, lote…" />
      <div>
        <Table wrapperClassName="max-h-64 rounded-lg border border-border">
          <TableHeader><TableRow><TableHead>Centro</TableHead><TableHead>Almacén</TableHead><TableHead>Lote</TableHead><TableHead>Caducidad</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Precio(s) por condición</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((l, i) => {
              const vg = vigenciaTxt(l.fechaCaducidad || '');
              const lotePrecio = l.precioOferta && l.precioOferta > 0 ? l.precioOferta : 0;
              return (
                <TableRow key={i}>
                  <TableCell>{l.centro}</TableCell><TableCell>{l.almacen}</TableCell><TableCell>{l.lote}</TableCell>
                  <TableCell>{formatFechaCaducidad(l.fechaCaducidad)}{vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}</TableCell>
                  <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                  <TableCell className="text-right align-top">
                    {lotePrecio > 0 && (
                      <div className="mb-1 font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(lotePrecio)}<div className="text-[10px] text-text-faint">del lote</div></div>
                    )}
                    {precios.length > 0 ? (
                      <div className="inline-flex flex-col gap-0.5">
                        {precios.map((p, j) => (
                          <div key={j} className="flex items-center justify-end gap-1.5">
                            <StatePill label={p.condicion} cls={/corta/i.test(p.condicion) ? 'rojo' : 'gris'} />
                            <span className="font-mono">{p.precio ? formatCurrency(p.precio) : '—'}</span>
                          </div>
                        ))}
                      </div>
                    ) : !lotePrecio ? '—' : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Sección con título opcional dentro de un panel de detalle. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold text-text">{title}</h3>
      {children}
    </div>
  );
}

/** Recolecta cada par distinto (condición, precio oferta) para `material` desde InvConsolidado/Inventario por condición. */
export function precioPorCondicion(a: Analytics, material: string) {
  return preciosPorCondicion(material, a.invConsolidadoCatalog, a.invCondicion);
}

/** Renderiza un recuadro por condición para `material` (Material / Descripción / Condición / Precio Oferta). */
export function PrecioCondicionBox({ a, material }: { a: Analytics; material: string }) {
  const precios = useMemo(() => precioPorCondicion(a, material), [a, material]);
  if (!precios.length) return null;
  const descripcion = a.enrich.matTexto(material);
  return (
    <Section title="Precio oferta por condición">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {precios.map((p, i) => (
          <div key={i} className="rounded-lg border border-border bg-bg-elevated p-2.5">
            <div className="font-mono text-xs font-medium">{material}</div>
            <div className="truncate text-[11px] text-text-faint">{descripcion || '—'}</div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <StatePill label={p.condicion} cls={/corta/i.test(p.condicion) ? 'rojo' : 'gris'} />
              <div className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">{p.precio ? formatCurrency(p.precio) : '—'}</div>
            </div>
            {p.inv > 0 && <div className="mt-1 text-[11px] text-text-faint">inv {formatNumber(p.inv)}</div>}
          </div>
        ))}
      </div>
    </Section>
  );
}
