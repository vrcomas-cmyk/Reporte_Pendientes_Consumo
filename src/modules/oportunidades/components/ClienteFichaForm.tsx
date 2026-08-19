import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { fichaConfigurada } from '@/core/matchingOfertas';
import { ESTADOS_MATERIAL_ACEPTADO, type ClienteConocimiento } from '@/core/types';
import { CondicionSelector } from './CondicionSelector';

const textareaCls = 'flex w-full rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text placeholder:text-text-faint outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring';

function emptyFicha(dest: string, razonSocial: string): ClienteConocimiento {
  return {
    dest, razonSocial, condicionesAceptadas: [], estadoMaterial: 'indistinto', caducidadMinimaDias: null,
    activa: true, descuentoHabitualPct: null, contactoNombre: '', contactoTelefono: '', contactoCorreo: '',
    canalPreferido: '', notasComerciales: '', actualizadoEn: '', actualizadoPor: '',
  };
}

/** Formulario editable de la ficha de conocimiento del cliente (req. 3): todo
 * el mini-CRM cabe aquí — se guarda completo en cada "Guardar" (upsert por
 * `dest`), no campo por campo. */
export function ClienteFichaForm({ dest, razonSocial, existing }: { dest: string; razonSocial: string; existing: ClienteConocimiento | null }) {
  const upsertCliente = useConocimientoStore((s) => s.upsertCliente);
  const [draft, setDraft] = useState<ClienteConocimiento>(() => existing
    ? { ...emptyFicha(dest, razonSocial), ...existing, estadoMaterial: existing.estadoMaterial ?? 'indistinto', activa: existing.activa !== false }
    : emptyFicha(dest, razonSocial));
  const [saving, setSaving] = useState(false);
  const [caducidadMeses, setCaducidadMeses] = useState(() => (existing?.caducidadMinimaDias != null ? String(Math.round(existing.caducidadMinimaDias / 30)) : ''));

  async function guardar() {
    setSaving(true);
    const caducidadMinimaDias = caducidadMeses.trim() ? Math.round(Number(caducidadMeses) * 30) : null;
    await upsertCliente({ ...draft, caducidadMinimaDias });
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-text-muted">Regla global — qué acepta</label>
        <CondicionSelector value={draft.condicionesAceptadas} onChange={(v) => setDraft((d) => ({ ...d, condicionesAceptadas: v }))} />
        <p className="mt-1 text-[11px] text-text-faint">Aplica a cualquier material; por debajo puedes añadir excepciones por material.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Estado de material</label>
          <Select value={draft.estadoMaterial} onChange={(e) => setDraft((d) => ({ ...d, estadoMaterial: e.target.value as ClienteConocimiento['estadoMaterial'] }))}>
            {ESTADOS_MATERIAL_ACEPTADO.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Caducidad mínima (meses)</label>
          <Input type="number" min={0} value={caducidadMeses} onChange={(e) => setCaducidadMeses(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Descuento habitual (%)</label>
          <Input type="number" min={0} max={100} value={draft.descuentoHabitualPct ?? ''} onChange={(e) => setDraft((d) => ({ ...d, descuentoHabitualPct: e.target.value === '' ? null : Number(e.target.value) }))} />
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        <input type="checkbox" checked={draft.activa} onChange={(e) => setDraft((d) => ({ ...d, activa: e.target.checked }))} />
        Cliente activo — considerar al ofrecer material
      </label>

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

      {!fichaConfigurada({ ...draft, caducidadMinimaDias: caducidadMeses.trim() ? 1 : null }) && (
        <p className="text-xs text-warning">Sin ninguna condición, estado o caducidad mínima marcados, este cliente no aceptará nada — no aparecerá como candidato al ofertar.</p>
      )}
      <Button onClick={guardar} disabled={saving} className="self-start">{saving ? 'Guardando…' : 'Guardar ficha'}</Button>
    </div>
  );
}
