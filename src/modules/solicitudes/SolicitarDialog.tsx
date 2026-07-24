import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { crear, type SolicitudDraft } from '@/services/solicitudService';
import { useSolicitudStore } from '@/store/solicitudStore';
import { toast } from '@/store/toastStore';
import type { LoteOption } from './useSolicitarDialog';

interface SolicitarDialogProps {
  draft: SolicitudDraft | null;
  loteOptions?: LoteOption[];
  onClose: () => void;
}

const FIELD_LABEL = 'block text-xs font-medium text-text-muted mb-1';

/** Shared "Solicitar" dialog used by Sugerencias/Inventario/Resumen Sin
 * Sug./Consumo. Lets the user pick a supply lote (when more than one exists),
 * adjust cantidad/comentarios, fill in whatever origin/destino fields the
 * source row didn't already know, and send the request straight to the
 * "DRP" Google Sheet tab (via solicitudService.crear). */
export function SolicitarDialog({ draft, loteOptions, onClose }: SolicitarDialogProps) {
  const [form, setForm] = useState<SolicitudDraft | null>(draft);
  const [loteKey, setLoteKey] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const addSolicitud = useSolicitudStore((s) => s.add);

  useEffect(() => {
    setForm(draft);
    setLoteKey('');
    setResult(null);
  }, [draft]);

  if (!draft || !form) return null;

  const set = <K extends keyof SolicitudDraft>(key: K, value: SolicitudDraft[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onPickLote = (key: string) => {
    setLoteKey(key);
    const opt = loteOptions?.find((o) => o.key === key);
    if (opt) setForm(opt.draft);
  };

  const enviar = async () => {
    if (!form.codigo || !form.codigo.trim()) { toast.warning('Falta el código del material'); return; }
    const cantidadNum = Number(form.cantidad);
    if (!form.cantidad || isNaN(cantidadNum) || cantidadNum <= 0) {
      toast.warning('La cantidad debe ser un número mayor a 0'); return;
    }
    if (!form.centroOrigen || !form.centroOrigen.trim()) { toast.warning('Falta el centro de origen'); return; }
    if (!form.centroDestino || !form.centroDestino.trim()) { toast.warning('Falta el centro de destino'); return; }
    if (form.fechaCaducidad) {
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(form.fechaCaducidad) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(form.fechaCaducidad);
      if (!ok) { toast.warning('Formato de fecha inválido (usa AAAA-MM-DD o DD/MM/AAAA)'); return; }
    }
    setSending(true);
    setResult(null);
    try {
      const solicitud = await crear(form);
      addSolicitud(solicitud);
      if (solicitud.sync === 'enviada') {
        setResult({ ok: true, message: 'Solicitud enviada al Sheet DRP.' });
        setTimeout(onClose, 900);
      } else if (solicitud.sync === 'error') {
        setResult({ ok: false, message: solicitud.error || 'No se pudo enviar. Revisa la conexión e intenta de nuevo (o reenvía desde Solicitudes DRP).' });
      } else {
        setResult({ ok: true, message: 'Solicitud guardada. Pégala en el Sheet DRP desde "Solicitudes DRP → Exportar a Excel".' });
        toast.success('Solicitud guardada');
        setTimeout(onClose, 1400);
      }
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar lote</DialogTitle>
          <DialogDescription>{form.codigo} — {form.descripcion || 'Sin descripción'}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {loteOptions && loteOptions.length > 0 && (
            <div>
              <label className={FIELD_LABEL}>Lote / fuente</label>
              <select
                value={loteKey}
                onChange={(e) => onPickLote(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-bg-elevated px-2 text-sm"
              >
                <option value="">Elegir…</option>
                {loteOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FIELD_LABEL}>Centro Origen</label>
              <Input value={form.centroOrigen} onChange={(e) => set('centroOrigen', e.target.value)} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Almacén Origen</label>
              <Input value={form.almacenOrigen} onChange={(e) => set('almacenOrigen', e.target.value)} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Centro Destino</label>
              <Input value={form.centroDestino} onChange={(e) => set('centroDestino', e.target.value)} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Almacén Destino</label>
              <Input value={form.almacenDestino} onChange={(e) => set('almacenDestino', e.target.value)} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Lote</label>
              <Input value={form.lote} onChange={(e) => set('lote', e.target.value)} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Fecha Caducidad</label>
              <Input value={form.fechaCaducidad} onChange={(e) => set('fechaCaducidad', e.target.value)} placeholder="AAAA-MM-DD" />
            </div>
            <div>
              <label className={FIELD_LABEL}>Cantidad</label>
              <Input type="number" value={form.cantidad} onChange={(e) => set('cantidad', Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className={FIELD_LABEL}>UM</label>
              <Input value={form.um} onChange={(e) => set('um', e.target.value)} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Pedidos</label>
              <Input value={form.pedidos} onChange={(e) => set('pedidos', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={FIELD_LABEL}>Comentarios</label>
            <Input value={form.comentarios} onChange={(e) => set('comentarios', e.target.value)} placeholder="Opcional" />
          </div>

          {result && (
            <p className={`text-sm ${result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger'}`}>{result.message}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
            <Button onClick={enviar} disabled={sending || !form.codigo || !form.cantidad}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              {sending ? 'Enviando…' : 'Solicitar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
