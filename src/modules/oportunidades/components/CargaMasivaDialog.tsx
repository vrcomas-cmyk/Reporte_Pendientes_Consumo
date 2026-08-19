import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { toast } from '@/store/toastStore';
import { CondicionSelector } from './CondicionSelector';
import type { ClienteConocimiento, EstadoMaterialAceptado } from '@/core/types';

interface DestinatarioLite { dest: string; razonSocial: string; ejecutivo: string }

/** Importación por ejecutivo: los clientes de un mismo ejecutivo suelen
 * aceptar lo mismo, así que en vez de ficharlos uno a uno se trae su listado
 * preseleccionado, se descartan los que no aplican y se crean las FICHAS de
 * los marcados con la misma regla global (condiciones + estado + caducidad). */
export function CargaMasivaDialog({ open, onClose, destinatarios }: { open: boolean; onClose: () => void; destinatarios: DestinatarioLite[] }) {
  const upsertClientesBulk = useConocimientoStore((s) => s.upsertClientesBulk);
  const [ejecutivo, setEjecutivo] = useState('');
  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const [condiciones, setCondiciones] = useState<string[]>([]);
  const [estadoMaterial, setEstadoMaterial] = useState<EstadoMaterialAceptado>('indistinto');
  const [caducidad, setCaducidad] = useState('');
  const [saving, setSaving] = useState(false);

  const ejecutivos = useMemo(() => [...new Set(destinatarios.map((d) => d.ejecutivo).filter(Boolean))].sort(), [destinatarios]);
  const delEjecutivo = useMemo(() => destinatarios.filter((d) => d.ejecutivo === ejecutivo), [destinatarios, ejecutivo]);
  const incluidos = delEjecutivo.filter((d) => !descartados.has(d.dest));

  const toggleDescartado = (dest: string) => setDescartados((prev) => {
    const next = new Set(prev);
    if (next.has(dest)) next.delete(dest); else next.add(dest);
    return next;
  });

  const reset = () => { setEjecutivo(''); setDescartados(new Set()); setCondiciones([]); setEstadoMaterial('indistinto'); setCaducidad(''); };
  const close = () => { reset(); onClose(); };

  const aplicar = async () => {
    if (!incluidos.length) return;
    setSaving(true);
    const ahora = new Date().toISOString();
    const caducidadMinimaDias = caducidad.trim() ? Math.round(Number(caducidad) * 30) : null;
    const fichas: ClienteConocimiento[] = incluidos.map((d) => ({
      dest: d.dest, razonSocial: d.razonSocial, condicionesAceptadas: condiciones,
      estadoMaterial, caducidadMinimaDias, activa: true,
      descuentoHabitualPct: null, contactoNombre: '', contactoTelefono: '', contactoCorreo: '', canalPreferido: '',
      notasComerciales: `Importado del ejecutivo ${ejecutivo}.`, actualizadoEn: ahora, actualizadoPor: '',
    }));
    try {
      await upsertClientesBulk(fichas);
      toast.success(`Ficha creada/actualizada para ${incluidos.length} cliente(s) de ${ejecutivo}.`);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar clientes del ejecutivo</DialogTitle>
          <DialogDescription>Crea las fichas (regla global de aceptación) de los destinatarios del ejecutivo elegido, salvo los que descartes.</DialogDescription>
        </DialogHeader>

        <Select value={ejecutivo} onChange={(e) => { setEjecutivo(e.target.value); setDescartados(new Set()); }} className="w-full">
          <option value="">Elegir ejecutivo…</option>
          {ejecutivos.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>

        {ejecutivo && (
          <>
            <div className="mt-3 max-h-56 overflow-auto rounded-md border border-border">
              {delEjecutivo.map((d) => (
                <label key={d.dest} className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-sm last:border-0 hover:bg-bg-inset">
                  <input type="checkbox" checked={!descartados.has(d.dest)} onChange={() => toggleDescartado(d.dest)} />
                  <span className="min-w-0 flex-1 truncate">{d.razonSocial || d.dest}</span>
                  <span className="font-mono text-[11px] text-text-faint">{d.dest}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-text-faint">{incluidos.length} de {delEjecutivo.length} incluidos</p>

            <CondicionSelector value={condiciones} onChange={setCondiciones} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select value={estadoMaterial} onChange={(e) => setEstadoMaterial(e.target.value as EstadoMaterialAceptado)} className="w-44">
                <option value="indistinto">Indistinto</option>
                <option value="buen-estado">Solo buen estado</option>
                <option value="danado">Acepta dañado</option>
              </Select>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">Caducidad mín. (meses)</span>
                <Input type="number" min={0} value={caducidad} onChange={(e) => setCaducidad(e.target.value)} className="w-20" />
              </div>
            </div>

            {condiciones.length === 0 && estadoMaterial === 'indistinto' && !caducidad.trim() && (
              <p className="mt-2 text-xs text-warning">Sin ningún criterio marcado, estas fichas quedarán "sin configurar" y no aceptarán nada hasta que las edites.</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button onClick={() => void aplicar()} disabled={!incluidos.length || saving}>Importar a {incluidos.length}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}