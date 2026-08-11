import { useMemo, useState } from 'react';
import { Inbox, Download, RefreshCw, Trash2, CheckCheck, Undo2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { StatePill, DateRangeFilter, ClearFiltersButton } from '@/modules/analytics/ui';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { enRango } from '@/lib/fechas';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { toDrpRow } from '@/lib/drpColumns';
import { reenviar, eliminar, marcarEstado } from '@/services/solicitudService';
import { useSolicitudStore } from '@/store/solicitudStore';
import type { SolicitudDRP, SolicitudSync } from '@/core/types';

// El envío directo al Sheet DRP está pausado (ver solicitudService.ts,
// DRP_AUTO_SEND) — todo cae en "pendiente" hasta que se pegue manualmente.
const SYNC_LABEL: Record<SolicitudSync, { label: string; cls: string }> = {
  pendiente: { label: 'Por pegar en Sheet', cls: 'amb' },
  enviada: { label: 'Enviada', cls: 'verde' },
  error: { label: 'Error', cls: 'rojo' },
};

const ORIGEN_LABEL: Record<SolicitudDRP['origen'], string> = {
  sugerencias: 'Sugerencias',
  inventario: 'Inventario',
  resumenSin: 'Resumen Sin Sug.',
  consumo: 'Consumo',
};

export function SolicitudesPage() {
  const list = useSolicitudStore((s) => s.list);
  const update = useSolicitudStore((s) => s.update);
  const remove = useSolicitudStore((s) => s.remove);
  const [sync, setSync] = useState<SolicitudSync | ''>('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [marking, setMarking] = useState(false);
  const [rango, setRango] = useState<{ desde: string; hasta: string }>({ desde: '', hasta: '' });
  const clearFilters = () => { setSync(''); setRango({ desde: '', hasta: '' }); };

  const filtered = useMemo(() => list.filter((s) => (!sync || s.sync === sync) && enRango(s.fechaSolicitud, rango.desde, rango.hasta)), [list, sync, rango]);
  const filteredIds = useMemo(() => filtered.map((s) => s.id).filter((id): id is number => id != null), [filtered]);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  const toggleOne = (id: number) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => setSelected((s) => {
    if (allSelected) return new Set([...s].filter((id) => !filteredIds.includes(id)));
    return new Set([...s, ...filteredIds]);
  });

  if (!list.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Inbox className="size-8 text-text-faint" />
        <p className="text-sm text-text-muted">
          Aún no has solicitado ningún lote. Marca una fila en Sugerencias, Inventario, Resumen Sin Sug. o Consumo para empezar.
        </p>
      </div>
    );
  }

  const onReenviar = async (sol: SolicitudDRP) => {
    if (sol.id == null) return;
    setBusyId(sol.id);
    const result = await reenviar(sol);
    update(sol.id, result);
    setBusyId(null);
  };

  const onEliminar = async (id?: number) => {
    if (id == null) return;
    await eliminar(id);
    remove(id);
    setSelected((s) => { if (!s.has(id)) return s; const next = new Set(s); next.delete(id); return next; });
  };

  const exportar = () => {
    const rows = filtered.map((s) => ({ Origen: ORIGEN_LABEL[s.origen], Estado: SYNC_LABEL[s.sync].label, ...toDrpRow(s) }));
    void exportXlsx(`solicitudes_drp_${stamp()}.xlsx`, rows, 'Solicitudes DRP');
  };

  const onMarcar = async (nuevoSync: SolicitudSync) => {
    const ids = [...selected];
    if (!ids.length) return;
    setMarking(true);
    await marcarEstado(ids, nuevoSync);
    const patch: Partial<SolicitudDRP> = nuevoSync === 'enviada'
      ? { sync: nuevoSync, sentAt: new Date().toISOString(), error: undefined }
      : { sync: nuevoSync, error: undefined };
    ids.forEach((id) => update(id, patch));
    setSelected(new Set());
    setMarking(false);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Solicitudes DRP</h2>
          <p className="text-sm text-text-muted">Lotes marcados para surtir · {formatNumber(filtered.length)} renglones</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportar}><Download className="mr-1 size-3.5" />Exportar a Excel</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={sync} onChange={(e) => setSync(e.target.value as SolicitudSync | '')} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm" autoComplete="off">
          <option value="">Estado (todos)</option>
          <option value="pendiente">Pendiente</option>
          <option value="enviada">Enviada</option>
          <option value="error">Error</option>
        </select>
        <DateRangeFilter desde={rango.desde} hasta={rango.hasta} onChange={setRango} />
        <ClearFiltersButton onClear={clearFilters} />
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-accent-soft px-2 py-1">
            <span className="text-xs text-accent">{formatNumber(selected.size)} seleccionadas</span>
            <Button variant="outline" size="sm" disabled={marking} onClick={() => onMarcar('enviada')}>
              <CheckCheck className="mr-1 size-3.5" />Marcar como enviada
            </Button>
            <Button variant="outline" size="sm" disabled={marking} onClick={() => onMarcar('pendiente')}>
              <Undo2 className="mr-1 size-3.5" />Marcar como pendiente
            </Button>
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <Table resizableKey="solicitudes.cols">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todo" />
                </TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Centro/Alm. Origen</TableHead>
                <TableHead>Centro/Alm. Destino</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} data-state={s.id != null && selected.has(s.id) ? 'selected' : undefined}>
                  <TableCell>
                    {s.id != null && (
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id as number)} aria-label="Seleccionar renglón" />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(s.fechaSolicitud)}</TableCell>
                  <TableCell>{ORIGEN_LABEL[s.origen]}</TableCell>
                  <TableCell>{s.centroOrigen}{s.almacenOrigen ? ` / ${s.almacenOrigen}` : ''}</TableCell>
                  <TableCell>{s.centroDestino}{s.almacenDestino ? ` / ${s.almacenDestino}` : ''}</TableCell>
                  <TableCell>{s.codigo}</TableCell>
                  <TableCell className="max-w-64 truncate">{s.descripcion}</TableCell>
                  <TableCell className="text-right">{formatNumber(s.cantidad)}</TableCell>
                  <TableCell>{s.lote || '—'}</TableCell>
                  <TableCell>
                    <StatePill label={SYNC_LABEL[s.sync].label} cls={SYNC_LABEL[s.sync].cls} />
                    {s.error && <div className="mt-0.5 max-w-56 truncate text-[11px] text-danger" title={s.error}>{s.error}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {s.sync === 'error' && (
                        <Button variant="outline" size="sm" disabled={busyId === s.id} onClick={() => onReenviar(s)}>
                          <RefreshCw className={busyId === s.id ? 'size-3.5 animate-spin' : 'size-3.5'} />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => onEliminar(s.id)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
