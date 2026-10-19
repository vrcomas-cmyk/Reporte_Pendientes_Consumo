import { useMemo, useState } from 'react';
import { KpiBand } from '@/components/layout/report';
import type { ReactNode } from 'react';
import { ChevronDown, EyeOff } from 'lucide-react';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu';
import { useTilesOcultosStore } from '@/store/tilesOcultosStore';
import { useCostoMetrica } from './CostoMaterial';
import { usePersistedState } from '@/hooks/usePersistedState';
import { StatePill, Chip, TrendBadge, AbcBadge, DetailChevron, SuggestInput, useColumnVisibility, ColumnVisibilityControl, ColumnFilterBar, ColumnFilterMenuMulti, passesFilters, type ActiveFilter, type FilterColumn } from '../ui';
import { formatCurrency, formatNumber, formatFechaCaducidad } from '@/lib/utils';
import { matchesQuery, num, norm, consumoSerie, consumoStatus, consumoTend, consumoEnrich, transitoFor, buildConsumoIndex, consumoKey } from '../helpers';
import { consumoDe, mesLabel } from '@/core/resumenFac';
import { promedioConsumo } from '@/core/consumoDesdeRF';
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
import { usePromedioModo, useRangoPeriodo, promedioDeFila } from '@/modules/consumo/usePromedioModo';
import { buildFromSugerencia, buildFromConsumo } from '@/services/solicitudService';
import { useSolicitarDialog } from '@/modules/solicitudes/useSolicitarDialog';
import { SolicitarDialog } from '@/modules/solicitudes/SolicitarDialog';
import { SolicitarContextMenu } from '@/modules/solicitudes/SolicitarContextMenu';
import { useSolicitudStore } from '@/store/solicitudStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAnalytics } from '../AnalyticsContext';
import { MaterialInventarioSection } from './MaterialInventario';
import { CondicionesMaterialSection } from './CondicionesMaterial';
import { ComparaCostoSustituto } from './ComparaCostoSustituto';

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

/** Selección de filas (casillas) de las subtablas de Sugerencias / Consumo. Sin ella no hay columna de casillas. */
export interface SeleccionFilas {
  isSelected: (key: string) => boolean;
  onToggle: (key: string) => void;
  /** Marca o desmarca todas las filas que pasan los filtros. */
  onToggleAll: (keys: string[], on: boolean) => void;
}

/** Qué columnas de filtro cuelgan del embudo de cada encabezado de la subtabla de Sugerencias (igual que Seg. de pedidos). */
const COL_FILTRO_SUG: Record<string, string[]> = {
  ejecutivo: ['ejecutivo', 'grupocli'], pedido: ['pedido', 'oc'], fecha: ['fecha'], cliente: ['cliente', 'solicitante', 'destinatario'],
  centro: ['centro', 'almacen'], material: ['material'], sector: ['sector', 'grupoart', 'gerente'], cantped: ['cantped'], pend: ['pend'], precio: ['precio'],
  consumo: ['consumo'], inv1030: ['inv1030'], inv1031: ['inv1031'], inv1032: ['inv1032'], inv1060: ['inv1060'], bloq: ['bloq'], estado: ['estado'],
  tendencia: ['tendencia'], fuentes: ['fuente', 'matsug', 'centrosug', 'almacensug', 'lote'],
};
/** Ídem para la subtabla de Consumo. */
const COL_FILTRO_CONS: Record<string, string[]> = {
  cliente: ['cliente', 'solicitante', 'destinatario'], ejecutivo: ['ejecutivo', 'grupocli'], centro: ['centro'], material: ['material'], abc: ['abc'],
  sector: ['sector', 'grupo'], consumo: ['consumo'], ultima: ['ultima'], penultima: ['penultima'], impultima: ['impultima'], estado: ['estado'], tendencia: ['tendencia'],
};

/** Clave estable de una fila de Consumo (cliente × centro × material). */
export const claveConsumo = (r: ConsumoRow): string => `${r.destinatario}|${r.centro}|${r.material}`;

function CasillaTodas({ keys, seleccion }: { keys: string[]; seleccion: SeleccionFilas }) {
  const todas = keys.length > 0 && keys.every((k) => seleccion.isSelected(k));
  return (
    <input type="checkbox" aria-label="Seleccionar todas las filas filtradas" title="Seleccionar todas las filas filtradas" checked={todas} disabled={!keys.length}
      onChange={() => seleccion.onToggleAll(keys, !todas)} className="size-3.5 accent-success" />
  );
}

/** Subtabla reutilizable de sugerencias (BO), con las MISMAS columnas y la
 * misma preferencia de visibilidad (`useColumnVisibility('sugerencias_columnas')`)
 * que la tabla completa de `/sugerencias` — así el panel de un material dice
 * literalmente lo mismo que el reporte, y ocultar una columna desde Ajustes o
 * desde la página se refleja aquí también. Sin selección en lote ni menú
 * contextual de "Solicitar" — eso sigue siendo exclusivo de la página
 * completa; aquí el drill-down (`Chip`/`DetailChevron`) es lo que importa. */
export function SugTable({ list, a, push, selection }: { list: BOItem[]; a: Analytics; push: (p: Panel) => void; /** Con ella aparece la columna de casillas. */ selection?: SeleccionFilas }) {
  const [f, setF] = useState('');
  const [quick, setQuick] = useState<ActiveFilter[]>([]);
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
  // Filtros por CUALQUIER columna, las mismas que Seg. de pedidos (incluidas las que comparten celda: OC, almacén, solicitante, destinatario…).
  const filterCols = useMemo<FilterColumn<BOItem>[]>(() => {
    const gerenteDe = (mat: string) => a.enrich.gerentes.find((g) => a.enrich.sectorDeGerente(a.enrich.matSector(mat), g)) ?? '';
    const n = (v: unknown) => formatNumber(num(v));
    return [
      { key: 'ejecutivo', label: 'Ejecutivo', get: (it) => a.enrich.ejecutivoNombre(it.bo.gpoVdor) || 'Sin ejecutivo' },
      { key: 'grupocli', label: 'Grupo cliente', get: (it) => a.enrich.grupoCliente(it.bo.gpoCte) || 'Sin grupo' },
      { key: 'pedido', label: 'Pedido', get: (it) => it.bo.pedido },
      { key: 'oc', label: 'OC', get: (it) => it.bo.oc },
      { key: 'fecha', label: 'Fecha', get: (it) => it.bo.fecha },
      { key: 'cliente', label: 'Cliente (razón social)', get: (it) => it.bo.razonSocial },
      { key: 'solicitante', label: 'Solicitante', get: (it) => it.bo.solicitante },
      { key: 'destinatario', label: 'Destinatario', get: (it) => it.bo.destinatario },
      { key: 'centro', label: 'Centro', get: (it) => it.bo.centroPedido },
      { key: 'almacen', label: 'Almacén', get: (it) => it.bo.almacen },
      { key: 'material', label: 'Material', get: (it) => it.bo.materialBase },
      { key: 'sector', label: 'Sector', get: (it) => a.enrich.matSector(it.bo.materialBase) || 'Sin sector' },
      { key: 'grupoart', label: 'Grupo de artículo', get: (it) => a.enrich.matGrupo(it.bo.materialBase) || 'Sin grupo' },
      { key: 'gerente', label: 'Gerente (marca)', get: (it) => gerenteDe(it.bo.materialBase) || 'Sin gerente' },
      { key: 'cantped', label: 'Cant. pedida', get: (it) => n(it.bo.cantidadPedido) },
      { key: 'pend', label: 'Pendiente', get: (it) => n(it.bo.cantidadPendiente) },
      ...(precioOculto ? [] : [{ key: 'precio', label: 'Precio', get: (it: BOItem) => formatCurrency(num(it.bo.precio)) }]),
      { key: 'consumo', label: 'Consumo', get: (it) => n(it.consumoProm) },
      { key: 'inv1030', label: 'Inv. 1030', get: (it) => n(it.bo.invByCenter['1030'] || 0) },
      { key: 'inv1031', label: 'Inv. 1031', get: (it) => n(it.bo.invByCenter['1031'] || 0) },
      { key: 'inv1032', label: 'Inv. 1032', get: (it) => n(it.bo.invByCenter['1032'] || 0) },
      { key: 'inv1060', label: 'Inv. 1060', get: (it) => n(it.bo.invByCenter['1060'] || 0) },
      { key: 'bloq', label: 'Bloqueado', get: (it) => it.bo.bloqueado || 'Sin bloqueo' },
      { key: 'estado', label: 'Estado', get: (it) => it.status.label },
      { key: 'tendencia', label: 'Tendencia', get: (it) => it.tend.txt },
      ...(fuenteOculto ? [] : [
        { key: 'fuente', label: 'Fuente', getMany: (it: BOItem) => it.fuentes.map((f) => f.fuente).filter(Boolean) },
        { key: 'matsug', label: 'Material sugerido', getMany: (it: BOItem) => it.fuentes.map((f) => f.materialSugerido).filter(Boolean) },
        { key: 'centrosug', label: 'Centro sugerido', getMany: (it: BOItem) => it.fuentes.map((f) => f.centroSugerido).filter(Boolean) },
        { key: 'almacensug', label: 'Almacén sugerido', getMany: (it: BOItem) => it.fuentes.map((f) => f.almacenSugerido).filter(Boolean) },
        { key: 'lote', label: 'Lote', getMany: (it: BOItem) => it.fuentes.map((f) => f.lote).filter(Boolean) },
      ]),
    ];
  }, [a.enrich, precioOculto, fuenteOculto]);
  // Embudo de cada encabezado: reúne las columnas de filtro que le corresponden (p. ej. "Pedido/OC" → pedido y OC), como en Seg. de pedidos.
  const filtroDe = (k: string) => {
    const claves = COL_FILTRO_SUG[k];
    const cols = claves ? filterCols.filter((c) => claves.includes(c.key)) : [];
    return cols.length ? <ColumnFilterMenuMulti columns={cols} rows={list} active={quick} onChange={setQuick} /> : undefined;
  };
  const th = (k: string, etiqueta: string, derecha = false) => (
    <TableHead className={derecha ? 'text-right' : undefined}>
      <span className={`inline-flex items-center gap-1 ${derecha ? 'justify-end' : ''}`}>{etiqueta}{filtroDe(k)}</span>
    </TableHead>
  );
  if (!list.length) return <p className="text-sm text-text-muted">Sin sugerencias.</p>;
  const shown = list.filter((it) => (!f || matchesQuery(f, `${it.bo.pedido} ${it.bo.razonSocial} ${it.bo.centroPedido}`)) && passesFilters(it, filterCols, quick));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SubFilter value={f} onChange={setF} placeholder="Filtrar pedido, cliente, centro…" />
        <ColumnVisibilityControl columns={cols} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
      </div>
      <div className="mb-2"><ColumnFilterBar columns={filterCols} rows={list} active={quick} onChange={setQuick} /></div>
      {shown.length !== list.length && <p className="mb-1 text-[11px] text-text-faint">Mostrando {shown.length} de {list.length}.</p>}
      <div>
        <Table wrapperClassName="max-h-[32rem] rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              {selection && <TableHead className="w-8"><CasillaTodas keys={shown.map((it) => it.k)} seleccion={selection} /></TableHead>}
              {vis('ejecutivo') && th('ejecutivo', 'Ejecutivo / Grupo cli.')}
              {vis('pedido') && th('pedido', 'Pedido/OC')}
              {vis('fecha') && th('fecha', 'Fecha')}
              {vis('cliente') && th('cliente', 'Cliente')}
              {vis('centro') && th('centro', 'Centro/Alm')}
              {vis('material') && th('material', 'Material')}
              {vis('sector') && th('sector', 'Sector/Grupo')}
              {vis('cantped') && th('cantped', 'Cant.ped.', true)}
              {vis('pend') && th('pend', 'Pend.', true)}
              {!precioOculto && vis('precio') && th('precio', 'Precio', true)}
              {vis('consumo') && th('consumo', 'Consumo', true)}
              {vis('inv1030') && th('inv1030', '1030', true)}
              {vis('inv1031') && th('inv1031', '1031', true)}
              {vis('inv1032') && th('inv1032', '1032', true)}
              {vis('inv1060') && th('inv1060', '1060', true)}
              {vis('bloq') && th('bloq', 'Bloq.')}
              {vis('estado') && th('estado', 'Estado')}
              {vis('tendencia') && th('tendencia', 'Tendencia')}
              {!fuenteOculto && vis('fuentes') && th('fuentes', 'Fuentes', true)}
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
                <TableRow className={`group ${isBloqueado ? 'bg-danger/10 hover:bg-danger/15 [&>td:first-child]:shadow-[inset_3px_0_0_var(--danger)]' : ''} ${selection?.isSelected(it.k) ? 'bg-success/10' : ''}`}>
                  {selection && <TableCell><input type="checkbox" aria-label={`Seleccionar pedido ${b.pedido}`} checked={selection.isSelected(it.k)} onChange={() => selection.onToggle(it.k)} className="size-3.5 accent-success" /></TableCell>}
                  {vis('ejecutivo') && <TableCell>{a.enrich.ejecutivoNombre(b.gpoVdor) || '—'}<div className="text-[11px] text-text-faint">{a.enrich.grupoCliente(b.gpoCte) || '—'}</div></TableCell>}
                  {vis('pedido') && <TableCell><Chip onClick={() => push({ type: 'pedido', pedido: b.pedido, boKey: it.k })}>{b.pedido}</Chip><div className="text-[11px] text-text-faint">OC {b.oc || '—'}</div></TableCell>}
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
                      {transitoFor(a.rss, b.centroPedido, alm, b.materialBase) > 0 && <div className="text-[10px] text-success">↻+{formatNumber(transitoFor(a.rss, b.centroPedido, alm, b.materialBase))}</div>}
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
export function ConsumoTable({ list, a, push, selection }: { list: ConsumoRow[]; a: Analytics; push: (p: Panel) => void; /** Con ella aparece la columna de casillas. */ selection?: SeleccionFilas }) {
  const ce = consumoEnrich(a.enrich);
  const [quick, setQuick] = useState<ActiveFilter[]>([]);
  const [promedioModo] = usePromedioModo();
  const rangoPromedio = useRangoPeriodo();
  const [f, setF] = useState('');
  const colVis = useColumnVisibility('consumo_columnas');
  const vis = colVis.isVisible;
  const claseDe = (r: ConsumoRow) => a.abc.classByMaterial.get(norm(r.material)) || '';
  const solicitar = useSolicitarDialog();
  const solicitudesList = useSolicitudStore((s) => s.list);
  const solicitudSourceKeys = useMemo(() => new Set(solicitudesList.filter((s) => s.origen === 'consumo').map((s) => s.sourceKey)), [solicitudesList]);
  // Filtros por CUALQUIER columna, las mismas que la página de Consumo.
  const filterCols = useMemo<FilterColumn<ConsumoRow>[]>(() => [
    { key: 'cliente', label: 'Cliente (razón social)', get: (r) => r.razonSocial },
    { key: 'solicitante', label: 'Solicitante', get: (r) => r.solicitante },
    { key: 'destinatario', label: 'Destinatario', get: (r) => r.destinatario },
    { key: 'ejecutivo', label: 'Ejecutivo', get: (r) => ce.ejec(r) || 'Sin ejecutivo' },
    { key: 'grupocli', label: 'Grupo cliente', get: (r) => ce.grupoCli(r) || 'Sin grupo' },
    { key: 'centro', label: 'Centro', get: (r) => r.centro || 'Sin centro' },
    { key: 'material', label: 'Material', get: (r) => r.material },
    { key: 'abc', label: 'Clase ABC', get: (r) => claseDe(r) || 'Sin clase' },
    { key: 'sector', label: 'Sector', get: (r) => ce.sector(r) || 'Sin sector' },
    { key: 'grupo', label: 'Grupo de artículo', get: (r) => ce.grupoArt(r) || 'Sin grupo' },
    { key: 'consumo', label: 'Consumo actual', get: (r) => formatNumber(r.consumoActual) },
    { key: 'ultima', label: 'Última (cant.)', get: (r) => formatNumber(r.cantidadUltima) },
    { key: 'penultima', label: 'Penúltima (cant.)', get: (r) => formatNumber(num(r.cantidadPenultima)) },
    { key: 'impultima', label: 'Importe última', get: (r) => formatCurrency(r.importeUltima) },
    { key: 'estado', label: 'Estado', get: (r) => consumoStatus(a.rf, r).label },
    { key: 'tendencia', label: 'Tendencia', get: (r) => consumoTend(a.rf, r).txt },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [a.enrich, a.rf, a.abc]);
  const filtroDe = (k: string) => {
    const claves = COL_FILTRO_CONS[k];
    const cols = claves ? filterCols.filter((c) => claves.includes(c.key)) : [];
    return cols.length ? <ColumnFilterMenuMulti columns={cols} rows={list} active={quick} onChange={setQuick} /> : undefined;
  };
  const th = (k: string, etiqueta: string, derecha = false) => (
    <TableHead className={derecha ? 'text-right' : undefined}>
      <span className={`inline-flex items-center gap-1 ${derecha ? 'justify-end' : ''}`}>{etiqueta}{filtroDe(k)}</span>
    </TableHead>
  );
  if (!list.length) return <p className="text-sm text-text-muted">Sin facturación de consumo.</p>;
  const shown = list.filter((r) => (!f || matchesQuery(f, `${r.razonSocial} ${r.destinatario} ${r.centro}`)) && passesFilters(r, filterCols, quick));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SubFilter value={f} onChange={setF} placeholder="Filtrar cliente, centro…" />
        <ColumnVisibilityControl columns={COLS_CONSUMO} hidden={colVis.hidden} toggle={colVis.toggle} reset={colVis.reset} />
      </div>
      <div className="mb-2"><ColumnFilterBar columns={filterCols} rows={list} active={quick} onChange={setQuick} /></div>
      {shown.length !== list.length && <p className="mb-1 text-[11px] text-text-faint">Mostrando {shown.length} de {list.length}.</p>}
      <div>
        <Table wrapperClassName="max-h-[32rem] rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              {selection && <TableHead className="w-8"><CasillaTodas keys={shown.map(claveConsumo)} seleccion={selection} /></TableHead>}
              {vis('cliente') && th('cliente', 'Cliente')}
              {vis('ejecutivo') && th('ejecutivo', 'Ejecutivo / Grupo cli.')}
              {vis('centro') && th('centro', 'Centro')}
              {vis('material') && th('material', 'Material')}
              {vis('abc') && th('abc', 'ABC')}
              {vis('sector') && th('sector', 'Sector/Grupo')}
              {vis('consumo') && th('consumo', 'Consumo/prom', true)}
              {vis('ultima') && th('ultima', 'Última', true)}
              {vis('penultima') && th('penultima', 'Penúltima', true)}
              {vis('impultima') && th('impultima', 'Imp. última', true)}
              {vis('estado') && th('estado', 'Estado')}
              {vis('tendencia') && th('tendencia', 'Tendencia')}
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
              <TableRow className={`group ${selection?.isSelected(claveConsumo(r)) ? 'bg-success/10' : ''}`}>
                {selection && <TableCell><input type="checkbox" aria-label={`Seleccionar ${r.razonSocial}`} checked={selection.isSelected(claveConsumo(r))} onChange={() => selection.onToggle(claveConsumo(r))} className="size-3.5 accent-success" /></TableCell>}
                {vis('cliente') && <TableCell className="max-w-64 truncate">{r.razonSocial}<div className="text-[11px]"><Chip onClick={() => push({ type: 'evol', kind: 'solic', key: r.solicitante })}>S {r.solicitante}</Chip> · <Chip onClick={() => push({ type: 'evol', kind: 'dest', key: r.destinatario })}>D {r.destinatario}</Chip></div></TableCell>}
                {vis('ejecutivo') && <TableCell>{ce.ejec(r) || '—'}<div className="text-[11px] text-text-faint">{ce.grupoCli(r) || '—'}</div></TableCell>}
                {vis('centro') && <TableCell>{r.centro || ce.grupoCli(r) || '—'}</TableCell>}
                {vis('material') && <TableCell><Chip onClick={() => push({ type: 'material', material: r.material })}>{r.material}</Chip><div className="text-[11px] text-text-faint max-w-48 truncate">{r.textoMaterial}</div></TableCell>}
                {vis('abc') && <TableCell><AbcBadge clase={claseDe(r) || undefined} /></TableCell>}
                {vis('sector') && <TableCell>{ce.sector(r) || '—'}<div className="text-[11px] text-text-faint">{ce.grupoArt(r)}</div></TableCell>}
                {vis('consumo') && <TableCell className="text-right">{formatNumber(r.consumoActual)}/{formatNumber(promedioDeFila(a.rf, r, promedioModo, rangoPromedio))}</TableCell>}
                {vis('ultima') && <TableCell className="text-right">{formatNumber(r.cantidadUltima)}<div className="text-[11px] text-text-faint">{r.ultimoMesFacturacion || '—'}</div></TableCell>}
                {vis('penultima') && <TableCell className="text-right">{formatNumber(num(r.cantidadPenultima))}<div className="text-[11px] text-text-faint">{r.penultimoMes || '—'}</div></TableCell>}
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
  // Mismo contenido que la tarjeta "Consumo del material" (última, penúltima, precio, tendencia + promedio de 12 meses cerrados)
  // pero en una fila: dos líneas por celda y sin columnas de relleno, para no ocupar más espacio.
  const mes = (m?: string) => (m ? mesLabel(m) : '—');
  return (
    <div>
      <SubFilter value={f} onChange={setF} placeholder="Filtrar material…" />
      <div>
        <Table wrapperClassName="max-h-80 rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Última compra</TableHead>
              <TableHead className="text-right">Penúltima</TableHead>
              <TableHead className="text-right">Precio última</TableHead>
              <TableHead className="text-right" title="Suma de los 12 meses cerrados ÷ 12">Prom. 12m</TableHead>
              <TableHead>Tendencia</TableHead><TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, i) => {
              // Precio de la última compra (importe ÷ cantidad); si ese mes no tiene importe, el precio promedio histórico.
              const precioUlt = r.precioUnitarioUltima || r.precioProm;
              const precioPen = num(r.precioUnitarioPenultima);
              const prom12 = rf && rf.curmes ? promedioConsumo(consumoSerie(rf, r), '12m', rf.curmes) : 0;
              return (
                <TableRow key={i} className="group">
                  <TableCell><span className="text-text">{r.material}</span><div className="max-w-56 truncate text-[11px] text-text-faint">{r.textoMaterial}</div></TableCell>
                  <TableCell className="text-right">{formatNumber(r.cantidadUltima)}<div className="text-[11px] text-text-faint">{mes(r.ultimoMesFacturacion)}{r.importeUltima ? ` · ${formatCurrency(r.importeUltima)}` : ''}</div></TableCell>
                  <TableCell className="text-right">{formatNumber(num(r.cantidadPenultima))}<div className="text-[11px] text-text-faint">{mes(r.penultimoMes)}{num(r.importePenultima) ? ` · ${formatCurrency(num(r.importePenultima))}` : ''}</div></TableCell>
                  <TableCell className="text-right">{precioUlt ? formatCurrency(precioUlt) : '—'}<div className="text-[11px] text-text-faint">{precioPen ? `Penúlt. ${formatCurrency(precioPen)}` : ''}</div></TableCell>
                  <TableCell className="text-right">{formatNumber(Math.round(prom12))}</TableCell>
                  <TableCell><TrendBadge t={consumoTend(rf, r)} /></TableCell>
                  <TableCell><DetailChevron onOpen={() => push({ type: 'material', material: r.material })} /></TableCell>
                </TableRow>
              );
            })}
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
export function ConsumoMaterialCard({ a, dest, material, promedioMensual }: { a: Analytics; dest?: string; material: string; /** Con valor (o null = sin histórico) reemplaza al costo en la banda por el "Prom. mensual · 12m cerrados". */ promedioMensual?: number | null }) {
  const costo = useCostoMetrica(a, material);
  const ocultos = useTilesOcultosStore((s) => s.ocultos);
  const ocultar = useTilesOcultosStore((s) => s.ocultar);
  // Costo integrado a la banda; ocultable como el resto de tarjetas (clic derecho) y por permiso de rol.
  const costoVisible = !!costo[0] && costo[0].valor !== '—' && !ocultos.includes('Costo');
  const metricaCosto = costoVisible
    ? [{
      etiqueta: costo[0].etiqueta,
      title: 'Clic derecho para ocultar',
      valor: (
        <ContextMenu>
          <ContextMenuTrigger asChild><span className="cursor-context-menu">{costo[0].valor}</span></ContextMenuTrigger>
          <ContextMenuContent><ContextMenuItem onSelect={() => ocultar('Costo')}><EyeOff className="size-3.5" /> Ocultar “Costo”</ContextMenuItem></ContextMenuContent>
        </ContextMenu>
      ),
    }]
    : [];
  const metricaProm = promedioMensual === undefined ? [] : [{ etiqueta: 'Prom. mensual · 12m cerrados', valor: promedioMensual === null ? '—' : formatNumber(promedioMensual) }];
  const metricaExtra = promedioMensual === undefined ? metricaCosto : metricaProm;
  const row = dest ? (a.result?.consumo ?? []).find((r) => norm(r.destinatario) === norm(dest) && norm(r.material) === norm(material)) : undefined;
  if (!row) {
    // Sin cliente no hay "consumo del material" (el costo vive en la banda "Material · resumen", ocultable).
    if (!dest) return null;
    return (
      <Section tono="fac" origen="Resumen_Fac" title="Consumo del material">
        <p className="text-sm text-text-muted">Sin historial de compra de {material} para este cliente.</p>
      </Section>
    );
  }
  const serie = consumoSerie(a.rf, row);
  const info = consumoDe(serie, a.curmes);
  const ultimo = info.tipo === 'actual' ? { mes: info.mes!, cant: info.cant!, imp: info.imp! } : info.ultimo;
  const penultimo = info.tipo === 'actual' ? serie[serie.length - 2] || null : info.penultimo;
  const precioPenultimo = num(row.precioUnitarioPenultima);
  return (
    <Section tono="fac" origen="Resumen_Fac" title="Consumo del material">
      <KpiBand
        titulo={<span title={row.textoMaterial}><span className="font-mono">{row.material}</span> · {row.textoMaterial}</span>}
        principal={{ etiqueta: `Última compra · ${ultimo ? mesLabel(ultimo.mes) : '—'}`, valor: ultimo ? formatNumber(ultimo.cant) : '—', sub: ultimo ? formatCurrency(ultimo.imp) : undefined }}
        metricas={[
          { etiqueta: `Penúltima · ${penultimo ? mesLabel(penultimo.mes) : '—'}`, valor: penultimo ? formatNumber(penultimo.cant) : '—', sub: penultimo ? formatCurrency(penultimo.imp) : undefined },
          { etiqueta: 'Precio última', valor: row.precioUnitarioUltima ? formatCurrency(row.precioUnitarioUltima) : '—', sub: precioPenultimo ? `Penúlt. ${formatCurrency(precioPenultimo)}` : undefined },
          ...metricaExtra,
          { etiqueta: 'Tendencia', valor: <TrendBadge t={consumoTend(a.rf, row)} /> },
        ]}
      />
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
export function FuentesTable({ fuentes, push, selection, precioDe }: { fuentes: BOItem['fuentes']; push: (p: Panel) => void; selection?: FuentesSelection; /** Con esta función se agrega la columna Precio. */ precioDe?: (f: BOItem['fuentes'][number]) => number }) {
  const [fCentro, setFCentro] = useState('');
  const [fLote, setFLote] = useState('');
  const [fMaterial, setFMaterial] = useState('');
  // Vista rápida: clic en el material de una fuente abre su inventario en un
  // diálogo encima del detalle (sin navegar), para revisar y volver.
  const analytics = useAnalytics();
  const [vistaRapida, setVistaRapida] = useState<string | null>(null);
  // Código que viene en el pedido de la fila abierta: si es otro (un sustituto) la ventana permite comparar costo.
  const [vistaOriginal, setVistaOriginal] = useState('');
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
          <TableHeader><TableRow>{selection && <TableHead className="w-8" />}<TableHead>Fuente</TableHead><TableHead>Material sug.</TableHead><TableHead>Centro/Alm</TableHead><TableHead className="text-right">Disp.</TableHead>{precioDe && <TableHead className="text-right">Precio</TableHead>}<TableHead>Lote</TableHead><TableHead>Caducidad</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((f2, i) => {
              const vg = vigenciaTxt(f2.fechaCaducidad);
              const sel = selection?.isSelected(f2) ?? false;
              return (
                <TableRow key={i} className={sel ? 'bg-success/10' : undefined}>
                  {selection && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={sel}
                        disabled={!sel && selection.full}
                        onChange={() => selection.onToggle(f2)}
                        title={!sel && selection.full ? 'Máximo 2 lotes seleccionados para este material' : 'Seleccionar para la oferta'}
                        className="size-3.5 accent-success"
                      />
                    </TableCell>
                  )}
                  <TableCell><StatePill label={f2.fuente} cls={/corta/i.test(f2.fuente) ? 'rojo' : 'azul'} /></TableCell>
                  <TableCell><Chip title="Ver inventario de este material sin salir del detalle" onClick={() => { setVistaOriginal(f2.materialBase || f2.materialSolicitado); setVistaRapida(f2.materialSugerido); }}>{f2.materialSugerido}</Chip><div className="text-[11px] text-text-faint">{f2.descripcionSugerida}</div></TableCell>
                  <TableCell>{f2.centroSugerido}{f2.almacenSugerido ? ` / ${f2.almacenSugerido}` : ''}</TableCell>
                  <TableCell className="text-right">{formatNumber(f2.disponible)}</TableCell>
                  {precioDe && <TableCell className="text-right font-mono">{precioDe(f2) ? formatCurrency(precioDe(f2)) : '—'}</TableCell>}
                  <TableCell>{f2.lote ? <Chip title="Ver el detalle del lote" onClick={() => push({ type: 'lote', material: f2.materialSugerido, lote: f2.lote })}>{f2.lote}</Chip> : '—'}</TableCell>
                  <TableCell>{formatFechaCaducidad(f2.fechaCaducidad)}{vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!vistaRapida} onOpenChange={(o) => !o && setVistaRapida(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{vistaRapida}</DialogTitle>
            <DialogDescription>{vistaRapida ? analytics.enrich.matTexto(vistaRapida) : ''}</DialogDescription>
          </DialogHeader>
          {vistaRapida && <ComparaCostoSustituto a={analytics} original={vistaOriginal} sustituto={vistaRapida} />}
          {vistaRapida && <MaterialInventarioSection a={analytics} material={vistaRapida} />}
          {vistaRapida && <CondicionesMaterialSection a={analytics} material={vistaRapida} push={push} />}
          {vistaRapida && (
            <button type="button" className="mt-3 text-xs text-accent hover:underline" onClick={() => { const m = vistaRapida; setVistaRapida(null); push({ type: 'material', material: m }); }}>
              Abrir detalle completo del material →
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Subtabla de lotes (Resumen_Sin / InvDetalle) con precio(s) por condición por lote. */
export function LotesTable({ lotes, a, material, push }: { lotes: Analytics['lotes']; a: Analytics; material: string; /** Con `push`, el lote abre su detalle. */ push?: (p: Panel) => void }) {
  const [f, setF] = useState('');
  const conExistencia = lotes.filter((l) => l.cantidadDisp > 0);
  const shown = f ? conExistencia.filter((l) => matchesQuery(f, `${l.centro} ${l.almacen} ${l.lote}`)) : conExistencia;
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
                  <TableCell>{l.centro}</TableCell><TableCell>{l.almacen}</TableCell><TableCell>{push && l.lote ? <Chip title="Ver el detalle del lote" onClick={() => push({ type: 'lote', material, lote: l.lote })}>{l.lote}</Chip> : l.lote}</TableCell>
                  <TableCell>{formatFechaCaducidad(l.fechaCaducidad)}{vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}</TableCell>
                  <TableCell className="text-right">{formatNumber(l.cantidadDisp)}</TableCell>
                  <TableCell className="text-right align-top">
                    {lotePrecio > 0 && (
                      <div className="mb-1 font-mono text-text">{formatCurrency(lotePrecio)}<div className="text-[10px] text-text-faint">del lote</div></div>
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
/** Archivo de origen de un bloque: da el color del encabezado (Facturación azul, Inventario verde, Pedidos ámbar, Costos violeta). */
export type TonoArchivo = 'fac' | 'inv' | 'ped' | 'cst';
const TONO_CLS: Record<TonoArchivo, string> = {
  fac: 'bg-accent-soft text-accent',
  inv: 'bg-success/10 text-success',
  ped: 'bg-warning/10 text-warning',
  cst: 'bg-info/10 text-info',
};

export function Section({ title, children, collapsible = false, storageKey, tono, origen, ancho = false, defaultOpen = true }: {
  /** Con `collapsible`: estado inicial (la primera vez); después recuerda lo que el usuario eligió. */
  defaultOpen?: boolean;
  /** En el collage de un detalle ocupa las dos columnas (tablas y gráficas anchas). */
  ancho?: boolean;
  title: string;
  children: ReactNode;
  /** Encabezado clicable que colapsa/expande el contenido (abierto por defecto, estado persistido). */
  collapsible?: boolean;
  /** Clave de persistencia del estado abierto/cerrado — requerida con `collapsible` (el título puede cambiar). */
  storageKey?: string;
  /** Con `tono` el bloque se dibuja como tarjeta con el color de su archivo de origen. */
  tono?: TonoArchivo;
  /** Nombre del archivo/libro de origen (se muestra a la derecha del encabezado). */
  origen?: string;
}) {
  const [open, setOpen] = usePersistedState<boolean>(`panel.sec.${storageKey ?? title}`, defaultOpen);
  const abierto = !collapsible || open;
  if (tono) {
    const cab = (
      <>
        <span>{title}</span>
        <span className="flex items-center gap-2">
          {origen && <span className="text-[11px] font-normal opacity-80">{origen}</span>}
          {collapsible && <ChevronDown className={`size-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />}
        </span>
      </>
    );
    const clsCab = `flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-semibold ${TONO_CLS[tono]}`;
    return (
      <div className={`mt-4 min-w-0 overflow-hidden rounded-lg border border-border bg-bg-elevated ${ancho ? 'col-span-full' : ''}`}>
        {collapsible
          ? <button type="button" onClick={() => setOpen(!open)} aria-expanded={abierto} className={clsCab}>{cab}</button>
          : <h3 className={clsCab}>{cab}</h3>}
        {abierto && <div className="p-3">{children}</div>}
      </div>
    );
  }
  return (
    <div className={`mt-4 min-w-0 ${ancho ? 'col-span-full' : ''}`}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={abierto}
          className={`flex w-full items-center justify-between text-left text-sm font-semibold text-text ${abierto ? 'mb-2' : ''}`}
        >
          <span>{title}</span>
          <ChevronDown className={`size-4 shrink-0 text-text-faint transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <h3 className="mb-2 text-sm font-semibold text-text">{title}</h3>
      )}
      {abierto && children}
    </div>
  );
}

/** Recolecta cada par distinto (condición, precio oferta) para `material` desde InvConsolidado/Inventario por condición. */
export function precioPorCondicion(a: Analytics, material: string) {
  return preciosPorCondicion(material, a.invConsolidadoCatalog, a.invCondicion, a.preciosAutorizados);
}

/** Renderiza un recuadro por condición para `material` (Material / Descripción / Condición / Precio Oferta). */
export function PrecioCondicionBox({ a, material }: { a: Analytics; material: string }) {
  const precios = useMemo(() => precioPorCondicion(a, material).filter((p) => p.precio > 0), [a, material]);
  if (!precios.length) return null;
  const descripcion = a.enrich.matTexto(material);
  return (
    <Section tono="cst" origen="Catálogo · Inv_Condicion" title="Precio oferta por condición">
      <div className="grid grid-cols-1 gap-2">
        {precios.map((p, i) => (
          <div key={i} className="rounded-lg border border-border bg-bg-elevated p-2.5">
            <div className="font-mono text-xs font-medium">{material}</div>
            <div className="truncate text-[11px] text-text-faint">{descripcion || '—'}</div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <StatePill label={p.condicion} cls={/corta/i.test(p.condicion) ? 'rojo' : 'gris'} />
              <div className="font-mono text-sm font-semibold text-text">{p.precio ? formatCurrency(p.precio) : '—'}</div>
            </div>
            {p.inv > 0 && <div className="mt-1 text-[11px] text-text-faint">inv {formatNumber(p.inv)}</div>}
          </div>
        ))}
      </div>
    </Section>
  );
}
