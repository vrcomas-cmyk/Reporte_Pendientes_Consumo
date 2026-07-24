import { useMemo, useState } from 'react';
import { Inbox, Download, RefreshCw, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { StatePill } from '@/modules/analytics/ui';
import { formatNumber, formatDateTime } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { toDrpRow } from '@/lib/drpColumns';
import { reenviar, eliminar } from '@/services/solicitudService';
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

  const filtered = useMemo(() => (sync ? list.filter((s) => s.sync === sync) : list), [list, sync]);

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
  };

  const exportar = () => {
    const rows = filtered.map((s) => ({ Origen: ORIGEN_LABEL[s.origen], Estado: SYNC_LABEL[s.sync].label, ...toDrpRow(s) }));
    void exportXlsx(`solicitudes_drp_${stamp()}.xlsx`, rows, 'Solicitudes DRP');
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
        <select value={sync} onChange={(e) => setSync(e.target.value as SolicitudSync | '')} className="h-9 rounded-md border border-border bg-bg-elevated px-2 text-sm">
          <option value="">Estado (todos)</option>
          <option value="pendiente">Pendiente</option>
          <option value="enviada">Enviada</option>
          <option value="error">Error</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
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
                <TableRow key={s.id}>
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
