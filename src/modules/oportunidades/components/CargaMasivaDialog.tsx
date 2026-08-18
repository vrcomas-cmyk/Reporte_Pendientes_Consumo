import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { toast } from '@/store/toastStore';
import type { CondicionEspecial, EstadoMaterialAceptado } from '@/core/types';

const CONDICIONES: { key: CondicionEspecial; label: string }[] = [
  { key: 'corta-caducidad', label: 'Corta caducidad' },
  { key: 'lento-movimiento', label: 'Lento movimiento' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'danado', label: 'Dañado' },
  { key: 'normal', label: 'Normal' },
];

interface DestinatarioLite { dest: string; razonSocial: string; ejecutivo: string }

/** Carga masiva por ejecutivo (punto 1.2 del pedido): la mayoría de los
 * clientes de un mismo ejecutivo aceptan la misma condición, así que en vez
 * de ir cliente por cliente, se trae todo el listado de ese ejecutivo
 * preseleccionado, se descartan los que no aplican, y se guarda UNA regla
 * global para todos los que quedan marcados en una sola llamada. */
export function CargaMasivaDialog({ open, onClose, destinatarios }: { open: boolean; onClose: () => void; destinatarios: DestinatarioLite[] }) {
  const upsertReglasBulk = useConocimientoStore((s) => s.upsertReglasBulk);
  const [ejecutivo, setEjecutivo] = useState('');
  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const [condiciones, setCondiciones] = useState<CondicionEspecial[]>([]);
  const [estadoMaterial, setEstadoMaterial] = useState<EstadoMaterialAceptado>('indistinto');
  const [caducidad, setCaducidad] = useState('');
  const [saving, setSaving] = useState(false);

  const ejecutivos = useMemo(() => [...new Set(destinatarios.map((d) => d.ejecutivo).filter(Boolean))].sort(), [destinatarios]);
  const delEjecutivo = useMemo(() => destinatarios.filter((d) => d.ejecutivo === ejecutivo), [destinatarios, ejecutivo]);
  const incluidos = delEjecutivo.filter((d) => !descartados.has(d.dest));

  const toggleCondicion = (c: CondicionEspecial) => setCondiciones((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
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
    try {
      await upsertReglasBulk(incluidos.map((d) => d.dest), {
        material: null, condiciones, estadoMaterial,
        caducidadMinimaMeses: caducidad.trim() ? Number(caducidad) : null,
        activa: true, notas: `Carga masiva por ejecutivo (${ejecutivo}).`,
        actualizadoEn: new Date().toISOString(), actualizadoPor: '',
      });
      toast.success(`Regla global aplicada a ${incluidos.length} destinatario(s) de ${ejecutivo}.`);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Traer clientes del ejecutivo</DialogTitle>
          <DialogDescription>Aplica una regla global (condiciones que acepta) a todos los destinatarios del ejecutivo elegido, salvo los que descartes.</DialogDescription>
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

            <div className="mt-3 flex flex-wrap gap-1.5">
              {CONDICIONES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCondicion(c.key)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${condiciones.includes(c.key) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-muted hover:border-accent/50'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
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

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button onClick={() => void aplicar()} disabled={!incluidos.length || saving}>Aplicar a {incluidos.length}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
