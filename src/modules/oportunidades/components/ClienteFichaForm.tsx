import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useConocimientoStore } from '@/store/conocimientoStore';
import type { ClienteConocimiento, CondicionEspecial } from '@/core/types';

const CONDICIONES: { key: CondicionEspecial; label: string }[] = [
  { key: 'corta-caducidad', label: 'Corta caducidad' },
  { key: 'lento-movimiento', label: 'Lento movimiento' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'danado', label: 'Dañado' },
];

const textareaCls = 'flex w-full rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text placeholder:text-text-faint outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring';

function emptyFicha(dest: string, razonSocial: string): ClienteConocimiento {
  return {
    dest, razonSocial, condicionesAceptadas: [], caducidadMinimaDias: null, descuentoHabitualPct: null,
    contactoNombre: '', contactoTelefono: '', contactoCorreo: '', canalPreferido: '', notasComerciales: '',
    actualizadoEn: '', actualizadoPor: '',
  };
}

/** Formulario editable de la ficha de conocimiento del cliente (req. 3): todo
 * el mini-CRM cabe aquí — se guarda completo en cada "Guardar" (upsert por
 * `dest`), no campo por campo. */
export function ClienteFichaForm({ dest, razonSocial, existing }: { dest: string; razonSocial: string; existing: ClienteConocimiento | null }) {
  const upsertCliente = useConocimientoStore((s) => s.upsertCliente);
  const [draft, setDraft] = useState<ClienteConocimiento>(existing ?? emptyFicha(dest, razonSocial));
  const [saving, setSaving] = useState(false);

  function toggleCondicion(c: CondicionEspecial) {
    setDraft((d) => ({
      ...d,
      condicionesAceptadas: d.condicionesAceptadas.includes(c) ? d.condicionesAceptadas.filter((x) => x !== c) : [...d.condicionesAceptadas, c],
    }));
  }

  async function guardar() {
    setSaving(true);
    await upsertCliente(draft);
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-text-muted">Condiciones que acepta</label>
        <div className="flex flex-wrap gap-1.5">
          {CONDICIONES.map((c) => {
            const active = draft.condicionesAceptadas.includes(c.key);
            return (
              <button key={c.key} type="button" onClick={() => toggleCondicion(c.key)}>
                <Badge variant={active ? 'success' : 'outline'} className={cn('cursor-pointer', !active && 'opacity-60')}>{c.label}</Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Caducidad mínima (días)</label>
          <Input type="number" min={0} value={draft.caducidadMinimaDias ?? ''} onChange={(e) => setDraft((d) => ({ ...d, caducidadMinimaDias: e.target.value === '' ? null : Number(e.target.value) }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Descuento habitual (%)</label>
          <Input type="number" min={0} max={100} value={draft.descuentoHabitualPct ?? ''} onChange={(e) => setDraft((d) => ({ ...d, descuentoHabitualPct: e.target.value === '' ? null : Number(e.target.value) }))} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Contacto</label>
          <Input value={draft.contactoNombre} onChange={(e) => setDraft((d) => ({ ...d, contactoNombre: e.target.value }))} placeholder="Nombre" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Teléfono</label>
          <Input value={draft.contactoTelefono} onChange={(e) => setDraft((d) => ({ ...d, contactoTelefono: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Correo</label>
          <Input type="email" value={draft.contactoCorreo} onChange={(e) => setDraft((d) => ({ ...d, contactoCorreo: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Canal preferido</label>
          <Input value={draft.canalPreferido} onChange={(e) => setDraft((d) => ({ ...d, canalPreferido: e.target.value }))} placeholder="WhatsApp, correo, llamada…" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-muted">Notas comerciales</label>
        <textarea className={cn(textareaCls, 'min-h-20')} value={draft.notasComerciales} onChange={(e) => setDraft((d) => ({ ...d, notasComerciales: e.target.value }))} placeholder="Preferencias, condiciones especiales acordadas…" />
      </div>

      {existing?.actualizadoEn && (
        <p className="text-[11px] text-text-faint">Última actualización: {new Date(existing.actualizadoEn).toLocaleString('es-MX')}{existing.actualizadoPor ? ` · ${existing.actualizadoPor}` : ''}</p>
      )}

      <Button onClick={guardar} disabled={saving} className="self-start">{saving ? 'Guardando…' : 'Guardar ficha'}</Button>
    </div>
  );
}
