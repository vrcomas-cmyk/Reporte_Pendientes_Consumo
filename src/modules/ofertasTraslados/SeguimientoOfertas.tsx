import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { matchesQuery } from '@/modules/analytics/helpers';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { aceptacionesPrevias, pedidosPorMoverA1032, textoAceptacionPrevia } from '@/core/ofertasEjecutivo';
import { ESTATUS_OFERTA, estatusDeOferta, type EstatusOferta, type Oferta } from '@/core/types';

const CLASE: Record<EstatusOferta, string> = {
  ofertado: 'border-accent/40 bg-accent-soft text-accent',
  aceptado: 'border-success/40 bg-success/10 text-success',
  'aceptado-parcial': 'border-warning/40 bg-warning/10 text-warning',
  rechazado: 'border-danger/40 bg-danger/10 text-danger',
};
const etiqueta = (e: EstatusOferta) => ESTATUS_OFERTA.find((x) => x.key === e)?.label ?? e;

/** Pestaña «Seguimiento de ofertas»: estatus manual (Ofertado / Aceptado / Aceptado parcial / Rechazado) con historial y alerta de aceptaciones previas. */
export function SeguimientoOfertas({ onPrepararTraslado }: { onPrepararTraslado: (o: Oferta) => void }) {
  const a = useAnalytics();
  const ofertas = useConocimientoStore((s) => s.ofertas);
  const cambiar = useConocimientoStore((s) => s.cambiarEstatusOferta);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<'' | EstatusOferta>('');
  const [abierta, setAbierta] = useState<number | null>(null);
  const [aceptando, setAceptando] = useState<{ o: Oferta; estatus: 'aceptado' | 'aceptado-parcial' } | null>(null);

  const propias = useMemo(() => ofertas.filter((o) => o.pedido), [ofertas]);
  const filas = useMemo(() => propias.filter((o) => (!filtro || estatusDeOferta(o) === filtro)
    && (!q || matchesQuery(q, `${o.pedido} ${o.dest} ${o.razonSocial} ${o.material} ${o.materialSolicitado} ${o.ejecutivo} ${o.zona} ${o.lote ?? ''}`))), [propias, filtro, q]);
  const porMover = useMemo(() => pedidosPorMoverA1032(propias, a.boSeg.map((i) => i.bo)), [propias, a.boSeg]);

  const elegir = (o: Oferta, e: EstatusOferta) => {
    if (e === 'aceptado' || e === 'aceptado-parcial') setAceptando({ o, estatus: e });
    else if (o.id != null) void cambiar(o.id, e);
  };

  if (!propias.length) {
    return <EmptyState title="Aún no hay ofertas registradas" description="En «Generar ofertas» registra las líneas como Ofertado para darles seguimiento aquí." />;
  }

  return (
    <div className="flex flex-col gap-3 pt-3">
      {porMover.length > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {porMover.length} oferta(s) de corta caducidad aceptadas siguen con el pedido fuera del almacén 1032 ({[...new Set(porMover.map((o) => o.pedido))].slice(0, 6).join(', ')}): cámbialo en la siguiente actualización de Seg. de pedidos.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido, cliente, material, ejecutivo, lote…" className="max-w-xs" />
        <Select value={filtro} onChange={(e) => setFiltro(e.target.value as '' | EstatusOferta)} className="w-auto">
          <option value="">Estatus (todos)</option>
          {ESTATUS_OFERTA.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </Select>
        <span className="text-xs text-text-faint">{filas.length} de {propias.length}</span>
      </div>
      <Table wrapperClassName="max-h-[70vh] rounded-lg border border-border">
        <TableHeader>
          <TableRow>
            <TableHead></TableHead><TableHead>Pedido / Cliente</TableHead><TableHead>Ejecutivo / Zona</TableHead><TableHead>Solicitado</TableHead><TableHead>Ofertado</TableHead>
            <TableHead>Condición · Lote</TableHead><TableHead className="text-right">Cant. · Precio</TableHead><TableHead>Estatus</TableHead><TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((o) => {
            const e = estatusDeOferta(o);
            const previas = aceptacionesPrevias(ofertas.filter((x) => x.id !== o.id), o.dest, o.material);
            const isOpen = abierta === o.id;
            return (
              <Fragment key={o.id}>
                <TableRow className="align-top">
                  <TableCell><button type="button" aria-label="Historial" onClick={() => setAbierta(isOpen ? null : (o.id ?? null))}><ChevronDown className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button></TableCell>
                  <TableCell><span className="font-medium tabular-nums">{o.pedido}</span><div className="max-w-56 truncate text-xs text-text-muted" title={o.razonSocial}>{o.dest} · {o.razonSocial}</div></TableCell>
                  <TableCell>{o.ejecutivo || '—'}<div className="text-xs text-text-faint">{o.zona}</div></TableCell>
                  <TableCell className="tabular-nums">{o.materialSolicitado}</TableCell>
                  <TableCell className="tabular-nums">{o.material}</TableCell>
                  <TableCell>{o.condicionTexto || '—'}<div className="text-xs text-text-faint">{o.centroOrigen ? `${o.centroOrigen}/${o.almacenOrigen}` : ''}{o.lote ? ` · ${o.lote}` : ''}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(o.cantidadOfertada)}<div className="text-xs text-text-faint">{o.precioOfertado > 0 ? formatCurrency(o.precioOfertado) : '-'}</div></TableCell>
                  <TableCell>
                    <Select value={e} onChange={(ev) => elegir(o, ev.target.value as EstatusOferta)} className={`h-7 w-auto border text-xs ${CLASE[e]}`} aria-label="Estatus de la oferta">
                      {ESTATUS_OFERTA.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </Select>
                    {(e === 'aceptado' || e === 'aceptado-parcial') && <div className="mt-0.5 text-[11px] text-text-faint">{formatNumber(o.cantidadAceptada ?? 0)} pzas{o.loteAceptado ? ` · lote ${o.loteAceptado}` : ' · lote no registrado'}</div>}
                    {previas[0] && <div className="mt-0.5 max-w-56 text-[11px] text-warning" title="Aceptación anterior del mismo cliente y material">{textoAceptacionPrevia(previas[0])}</div>}
                  </TableCell>
                  <TableCell>
                    {(e === 'aceptado' || e === 'aceptado-parcial') && (
                      <Button size="sm" variant="outline" onClick={() => onPrepararTraslado(o)}><Truck className="size-4" /> Traslado</Button>
                    )}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-bg-inset/40">
                      <ul className="space-y-0.5 text-xs">
                        {(o.historial ?? []).length === 0 && <li className="text-text-faint">Sin cambios registrados.</li>}
                        {[...(o.historial ?? [])].reverse().map((h, i) => (
                          <li key={i}>
                            <span className="tabular-nums text-text-faint">{new Date(h.at).toLocaleString('es-MX')}</span> · <span className="font-medium">{etiqueta(h.estatus)}</span> · {h.por}
                            {h.cantidad != null && ` · ${formatNumber(h.cantidad)} pzas`}{h.lote && ` · lote ${h.lote}`}{h.comentario && ` · ${h.comentario}`}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      <DialogoAceptacion datos={aceptando} onClose={() => setAceptando(null)} onGuardar={(o, estatus, d) => { if (o.id != null) void cambiar(o.id, estatus, d); setAceptando(null); }} />
    </div>
  );
}

/** Al aceptar se pide la cantidad aceptada y el lote (puede ser distinto al ofertado, o desconocido). */
function DialogoAceptacion({ datos, onClose, onGuardar }: {
  datos: { o: Oferta; estatus: 'aceptado' | 'aceptado-parcial' } | null;
  onClose: () => void;
  onGuardar: (o: Oferta, e: EstatusOferta, d: { cantidad: number; lote: string; comentario: string }) => void;
}) {
  const [cant, setCant] = useState('');
  const [lote, setLote] = useState('');
  const [nota, setNota] = useState('');
  // Valores iniciales al abrir con otra oferta.
  const [clave, setClave] = useState<number | null>(null);
  if (datos && clave !== (datos.o.id ?? null)) {
    setClave(datos.o.id ?? null);
    setCant(String(datos.o.cantidadAceptada ?? datos.o.cantidadOfertada ?? ''));
    setLote(datos.o.loteAceptado ?? datos.o.lote ?? '');
    setNota('');
  }
  const n = Number(cant);
  return (
    <Dialog open={!!datos} onOpenChange={(v) => { if (!v) { setClave(null); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{datos?.estatus === 'aceptado' ? 'Aceptó la oferta' : 'Aceptó parcialmente'}</DialogTitle>
          <DialogDescription>{datos ? `Pedido ${datos.o.pedido} · ${datos.o.material}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">Cantidad aceptada
            <Input type="number" min={0} value={cant} onChange={(e) => setCant(e.target.value)} />
          </label>
          <label className="block text-sm">Lote aceptado <span className="text-text-faint">(déjalo vacío si no se conoce)</span>
            <Input value={lote} onChange={(e) => setLote(e.target.value)} />
          </label>
          <label className="block text-sm">Comentario
            <Input value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setClave(null); onClose(); }}>Cancelar</Button>
          <Button disabled={!(n > 0)} onClick={() => { if (datos) { onGuardar(datos.o, datos.estatus, { cantidad: n, lote: lote.trim(), comentario: nota.trim() }); setClave(null); } }}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
