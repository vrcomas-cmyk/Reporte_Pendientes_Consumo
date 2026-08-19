import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { StatePill, StatTile, TrendBadge } from '@/modules/analytics/ui';
import { vigenciaTxt } from '@/modules/analytics/panels/_shared';
import { consumoTend, ejecutivoDeCliente, matchesQuery, norm } from '@/modules/analytics/helpers';
import { cn, formatCurrency, formatFechaCaducidad, formatNumber } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { usePanelStore } from '@/store/panelStore';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { reglaAplicable, evaluarAceptacion, type ContextoMaterial, type LoteOfertable } from '@/core/matchingOfertas';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';

const CONDICION_LABEL: Record<string, string> = {
  'corta-caducidad': 'Corta caducidad', 'lento-movimiento': 'Lento movimiento', calidad: 'Calidad', danado: 'Dañado', normal: 'Normal',
};

function ctxDeLote(l: LoteOfertable): ContextoMaterial {
  return { condicion: l.condicion, condicionTexto: l.condicionTexto ?? null, diasCaducidad: l.diasCaducidad, danado: l.condicion === 'danado' };
}

function keyDeLote(l: LoteOfertable): string {
  return `${l.lote}-${l.centro}-${l.diasCaducidad}-${l.cantidadDisponible}`;
}

/** Enfoque por material: "código A tiene N lotes, M clientes califican" — en
 * vez de una fila por cliente en la bandeja, aquí se ve todo lo necesario
 * para decidir a quién llamar primero: los lotes reales que se están
 * ofertando (condición/caducidad/precio) y, por cliente, ejecutivo, última
 * compra y precio de ESE material, tendencia, y pedidos pendientes —
 * agrupados por quién ya lo consume/tiene pedido de él vs. quién no. */
export function MaterialColocacionPanel({ panel, a }: { panel: Extract<Panel, { type: 'materialColocacion' }>; a: Analytics }) {
  const { material, descripcion, clientes, lotes } = panel;
  const openPanel = usePanelStore((s) => s.open);
  const clientesFichas = useConocimientoStore((s) => s.clientes);
  const reglas = useConocimientoStore((s) => s.reglas);
  const matN = norm(material);

  const filas = useMemo(() => clientes.map((cl) => {
    const destN = norm(cl.dest);
    const consumoRow = (a.result?.consumo ?? []).find((r) => norm(r.destinatario) === destN && norm(r.material) === matN);
    const pedidosDest = a.bo.filter((it) => norm(it.bo.destinatario) === destN);
    const ejecutivo = ejecutivoDeCliente(destN, matN, a.result?.consumo ?? [], a.bo, a.enrich);
    return {
      cl, consumoRow, ejecutivo,
      pendientesTotal: pedidosDest.length,
      pendientesEsteMaterial: pedidosDest.filter((it) => norm(it.bo.materialBase) === matN).length,
    };
  }), [clientes, a.result, a.bo, a.enrich, matN]);

  // Lote → clientes (en vez de material por material): al elegir un lote
  // concreto de la tabla de abajo, las listas de clientes se reducen a solo
  // los que SU regla acepta ESE lote específico — no "cualquier lote del
  // material" como antes.
  const [loteSeleccionado, setLoteSeleccionado] = useState<LoteOfertable | null>(null);

  // Búsqueda por cliente + filtro por ejecutivo, para poder exportar/mandar
  // solo lo relevante a un cliente o a un ejecutivo puntual.
  const [busqueda, setBusqueda] = useState('');
  const [ejecutivoFiltro, setEjecutivoFiltro] = useState('');
  const ejecutivosDisponibles = useMemo(
    () => [...new Set(filas.map((f) => f.ejecutivo).filter(Boolean))].sort(),
    [filas],
  );
  const filasVisibles = useMemo(() => filas.filter((f) => {
    if (loteSeleccionado) {
      const regla = reglaAplicable(clientesFichas, reglas, f.cl.dest, material);
      if (!evaluarAceptacion(regla, ctxDeLote(loteSeleccionado)).acepta) return false;
    }
    if (ejecutivoFiltro && f.ejecutivo !== ejecutivoFiltro) return false;
    if (busqueda.trim() && !matchesQuery(busqueda, `${f.cl.razonSocial} ${f.cl.dest}`)) return false;
    return true;
  }), [filas, loteSeleccionado, ejecutivoFiltro, busqueda, clientesFichas, reglas, material]);

  // "Ya compran" incluye a quien tiene pedido pendiente de ESTE material
  // aunque nunca lo haya facturado — sigue siendo demanda real, no solo
  // historial.
  const yaConsumen = filasVisibles.filter((f) => f.consumoRow || f.pendientesEsteMaterial > 0);
  const noConsumen = filasVisibles.filter((f) => !f.consumoRow && f.pendientesEsteMaterial === 0);
  const porPrioridad = (x: (typeof filas)[number], y: (typeof filas)[number]) =>
    (y.pendientesEsteMaterial > 0 ? 1 : 0) - (x.pendientesEsteMaterial > 0 ? 1 : 0)
    || (y.pendientesTotal > 0 ? 1 : 0) - (x.pendientesTotal > 0 ? 1 : 0)
    || y.cl.consumoHistorico - x.cl.consumoHistorico;
  yaConsumen.sort(porPrioridad);
  noConsumen.sort(porPrioridad);

  function exportar() {
    const rows = filasVisibles.map((f) => ({
      Cliente: f.cl.razonSocial || f.cl.dest,
      Destinatario: f.cl.dest,
      Ejecutivo: f.ejecutivo || '',
      'Última compra': f.consumoRow ? formatNumber(f.consumoRow.cantidadUltima) : '',
      'Mes última compra': f.consumoRow?.ultimoMesFacturacion || '',
      'Últ. precio': f.consumoRow ? f.consumoRow.precioProm : '',
      'Pedidos pendientes': f.pendientesTotal,
      'Pedidos de este material': f.pendientesEsteMaterial,
      'Disponible p/cliente': f.cl.cantidadDisponible,
      Motivos: f.cl.motivos.join(' · '),
    }));
    void exportXlsx(`materiales_por_colocar_${norm(material)}_${stamp()}.xlsx`, rows, 'Clientes');
  }

  // Filtro de caducidad por cliente: en vez de mostrar los lotes "porque sí",
  // al elegir un cliente se marca cuáles SÍ le cumplen su regla (caducidad
  // mínima, condición, estado) — el resto queda visible pero marcado como
  // que no aplica, sin desaparecer (sigue siendo inventario real).
  const [clienteFiltroDest, setClienteFiltroDest] = useState('');
  const reglaClienteFiltro = clienteFiltroDest ? reglaAplicable(clientesFichas, reglas, clienteFiltroDest, material) : null;

  function ofertarA(dest: string, razonSocial: string) {
    const regla = reglaAplicable(clientesFichas, reglas, dest, material);
    const califican = lotes.filter((l) => evaluarAceptacion(regla, ctxDeLote(l)).acepta);
    const elegido = [...califican].sort((x, y) => (x.diasCaducidad ?? Infinity) - (y.diasCaducidad ?? Infinity))[0] ?? lotes[0];
    openPanel({
      type: 'clienteConocimiento', dest, razonSocial, tab: 'ofertas', prefillMaterial: material,
      prefillLote: elegido?.lote, prefillCondicion: elegido?.condicion, prefillCondicionTexto: elegido?.condicionTexto ?? undefined,
      prefillFechaCaducidad: elegido?.fechaCaducidad ?? null,
    });
  }

  function FilaRow({ f }: { f: (typeof filas)[number] }) {
    const { cl, consumoRow, ejecutivo, pendientesTotal, pendientesEsteMaterial } = f;
    return (
      <TableRow className="group">
        <TableCell className="max-w-48">
          <button className="block truncate text-left text-text hover:text-accent hover:underline" onClick={() => openPanel({ type: 'clienteConocimiento', dest: cl.dest, razonSocial: cl.razonSocial })}>{cl.razonSocial || cl.dest}</button>
          <div className="truncate text-[11px] text-text-faint">{cl.motivos.join(' · ')}</div>
        </TableCell>
        <TableCell className="max-w-32 truncate">{ejecutivo || '—'}</TableCell>
        <TableCell className="text-right">
          {consumoRow ? formatNumber(consumoRow.cantidadUltima) : '—'}
          <div className="text-[11px] text-text-faint">{consumoRow?.ultimoMesFacturacion || ''}</div>
        </TableCell>
        <TableCell className="text-right">{consumoRow ? formatCurrency(consumoRow.precioProm) : '—'}</TableCell>
        <TableCell>{consumoRow ? <TrendBadge t={consumoTend(a.rf, consumoRow)} /> : '—'}</TableCell>
        <TableCell>
          {pendientesEsteMaterial > 0
            ? <StatePill label={`${pendientesEsteMaterial} de este material`} cls="verde" />
            : pendientesTotal > 0
              ? <StatePill label={`${pendientesTotal} pendiente(s)`} cls="azul" />
              : <span className="text-text-faint">—</span>}
        </TableCell>
        <TableCell className="text-right">
          {formatNumber(cl.cantidadDisponible)}
          {cl.lotesCount > 1 && <div className="text-[11px] text-text-faint">{cl.lotesCount} lotes</div>}
        </TableCell>
        <TableCell>
          <Button size="sm" onClick={() => ofertarA(cl.dest, cl.razonSocial)}>Ofertar</Button>
        </TableCell>
      </TableRow>
    );
  }

  function GrupoClientes({ titulo, rows }: { titulo: string; rows: typeof filas }) {
    if (!rows.length) return null;
    return (
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-text">{titulo} ({rows.length})</h3>
        <Table wrapperClassName="max-h-72 rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Ejecutivo</TableHead>
              <TableHead className="text-right">Última compra</TableHead>
              <TableHead className="text-right">Últ. precio</TableHead>
              <TableHead>Tendencia</TableHead>
              <TableHead>Pedidos</TableHead>
              <TableHead className="text-right">Disponible p/cliente</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => <FilaRow key={f.cl.dest} f={f} />)}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div>
      <span className="font-mono text-xs text-accent">{material}</span>
      <h2 className="font-display text-lg font-semibold">{descripcion || material}</h2>
      <p className="mt-1 text-sm text-text-muted">{clientes.length} cliente(s) aceptarían este material bajo su regla ya configurada.</p>

      <div className="mt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">Lotes que se están ofertando ({lotes.length})</h3>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted">Ver lotes para:</span>
            <Select value={clienteFiltroDest} onChange={(e) => setClienteFiltroDest(e.target.value)} className="h-7 w-48 text-xs">
              <option value="">— Ninguno —</option>
              {clientes.map((cl) => <option key={cl.dest} value={cl.dest}>{cl.razonSocial || cl.dest}</option>)}
            </Select>
          </div>
        </div>
        <Table wrapperClassName="max-h-56 rounded-lg border border-border">
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Centro</TableHead>
              <TableHead>Condición</TableHead>
              <TableHead>Caducidad</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              {clienteFiltroDest && <TableHead>Cumple</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotes.map((l) => {
              const vg = l.fechaCaducidad ? vigenciaTxt(l.fechaCaducidad) : null;
              const cumple = clienteFiltroDest ? evaluarAceptacion(reglaClienteFiltro, ctxDeLote(l)) : null;
              const seleccionado = loteSeleccionado != null && keyDeLote(loteSeleccionado) === keyDeLote(l);
              return (
                <TableRow
                  key={keyDeLote(l)}
                  onClick={() => setLoteSeleccionado(seleccionado ? null : l)}
                  className={cn(
                    'cursor-pointer hover:bg-bg-inset',
                    seleccionado ? 'bg-accent-soft' : cumple && !cumple.acepta ? 'opacity-50' : undefined,
                  )}
                  title="Clic para ver solo los clientes que aceptan este lote"
                >
                  <TableCell className="font-mono text-xs">{l.lote || '—'}</TableCell>
                  <TableCell>{l.centro || '—'}{l.almacen ? ` / ${l.almacen}` : ''}</TableCell>
                  <TableCell>
                    <StatePill label={l.condicionTexto || CONDICION_LABEL[l.condicion] || l.condicion} cls={l.condicion === 'corta-caducidad' ? 'rojo' : l.condicion === 'danado' ? 'amb' : 'azul'} />
                  </TableCell>
                  <TableCell>
                    {l.fechaCaducidad ? formatFechaCaducidad(l.fechaCaducidad) : '—'}
                    {vg && <div className="text-[11px]"><StatePill label={vg.txt} cls={vg.cls} /></div>}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(l.cantidadDisponible)}</TableCell>
                  <TableCell className="text-right">{l.precioOferta ? formatCurrency(l.precioOferta) : '—'}</TableCell>
                  {clienteFiltroDest && (
                    <TableCell>
                      {cumple?.acepta
                        ? <StatePill label="Cumple" cls="verde" />
                        : <StatePill label={cumple?.motivos.join(' · ') || 'No cumple'} cls="rojo" />}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {loteSeleccionado && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-accent/40 bg-accent-soft/40 px-3 py-1.5 text-xs">
          <span className="text-text">Mostrando solo los clientes que aceptan el lote <span className="font-mono text-accent">{loteSeleccionado.lote || '—'}</span></span>
          <button onClick={() => setLoteSeleccionado(null)} className="ml-auto flex items-center gap-1 text-text-muted hover:text-text"><X className="size-3" /> Ver todos</button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <StatTile label="Ya compran este material" value={String(yaConsumen.length)} tone="text-accent" />
        <StatTile label="No lo compran aún" value={String(noConsumen.length)} />
        <StatTile label="Con pedido de este material" value={String(filas.filter((f) => f.pendientesEsteMaterial > 0).length)} tone="text-emerald-600" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente…" className="h-8 w-52 text-xs" />
        <Select value={ejecutivoFiltro} onChange={(e) => setEjecutivoFiltro(e.target.value)} className="h-8 w-44 text-xs">
          <option value="">Todos los ejecutivos</option>
          {ejecutivosDisponibles.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
        <Button size="sm" variant="outline" onClick={exportar} disabled={!filasVisibles.length}>Exportar a Excel</Button>
      </div>

      <GrupoClientes titulo="Ya compran este material" rows={yaConsumen} />
      <GrupoClientes titulo="No lo compran aún" rows={noConsumen} />
    </div>
  );
}
