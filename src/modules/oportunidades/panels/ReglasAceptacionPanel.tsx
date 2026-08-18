import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Chip } from '@/modules/analytics/ui';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { norm, matchesQuery } from '@/modules/analytics/helpers';
import type { CondicionEspecial, EstadoMaterialAceptado, ReglaAceptacion, MotivoRechazo } from '@/core/types';
import { MOTIVOS_RECHAZO } from '@/core/types';
import type { Panel } from '@/store/panelStore';

const CONDICIONES: { key: CondicionEspecial; label: string }[] = [
  { key: 'corta-caducidad', label: 'Corta caducidad' },
  { key: 'lento-movimiento', label: 'Lento movimiento' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'danado', label: 'Dañado' },
  { key: 'normal', label: 'Normal' },
];
const ESTADOS: { key: EstadoMaterialAceptado; label: string }[] = [
  { key: 'indistinto', label: 'Indistinto' },
  { key: 'buen-estado', label: 'Solo buen estado' },
  { key: 'danado', label: 'Acepta dañado' },
];

interface FormState {
  condiciones: CondicionEspecial[];
  estadoMaterial: EstadoMaterialAceptado;
  caducidadMinimaMeses: string;
  activa: boolean;
  notas: string;
}

function formFromRegla(r: ReglaAceptacion | undefined): FormState {
  return {
    condiciones: r?.condiciones ?? [],
    estadoMaterial: r?.estadoMaterial ?? 'indistinto',
    caducidadMinimaMeses: r?.caducidadMinimaMeses != null ? String(r.caducidadMinimaMeses) : '',
    activa: r?.activa ?? true,
    notas: r?.notas ?? '',
  };
}

function ReglaForm({ dest, material, existing, onSaved }: { dest: string; material: string | null; existing?: ReglaAceptacion; onSaved?: () => void }) {
  const upsertRegla = useConocimientoStore((s) => s.upsertRegla);
  const [form, setForm] = useState<FormState>(() => formFromRegla(existing));

  const toggleCondicion = (c: CondicionEspecial) => setForm((f) => ({
    ...f, condiciones: f.condiciones.includes(c) ? f.condiciones.filter((x) => x !== c) : [...f.condiciones, c],
  }));

  const save = () => {
    const regla: ReglaAceptacion = {
      id: existing?.id, dest, material,
      condiciones: form.condiciones, estadoMaterial: form.estadoMaterial,
      caducidadMinimaMeses: form.caducidadMinimaMeses.trim() ? Number(form.caducidadMinimaMeses) : null,
      activa: form.activa, notas: form.notas,
      actualizadoEn: new Date().toISOString(), actualizadoPor: existing?.actualizadoPor ?? '',
    };
    void upsertRegla(regla);
    onSaved?.();
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="flex flex-wrap gap-1.5">
        {CONDICIONES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => toggleCondicion(c.key)}
            className={`rounded-full border px-2.5 py-1 text-xs ${form.condiciones.includes(c.key) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-muted hover:border-accent/50'}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select value={form.estadoMaterial} onChange={(e) => setForm((f) => ({ ...f, estadoMaterial: e.target.value as EstadoMaterialAceptado }))} className="w-44">
          {ESTADOS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Caducidad mín. (meses)</span>
          <Input type="number" min={0} value={form.caducidadMinimaMeses} onChange={(e) => setForm((f) => ({ ...f, caducidadMinimaMeses: e.target.value }))} className="w-20" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <input type="checkbox" checked={form.activa} onChange={(e) => setForm((f) => ({ ...f, activa: e.target.checked }))} /> Activa
        </label>
      </div>
      <Input value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} placeholder="Notas (opcional)" className="mt-2" />
      <div className="mt-2 flex justify-end"><Button size="sm" onClick={save}>Guardar</Button></div>
    </div>
  );
}

function MaterialPicker({ onPick }: { onPick: (material: string) => void }) {
  const { result, enrich } = useAnalytics();
  const [q, setQ] = useState('');
  const materiales = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of result?.consumo ?? []) if (r.material && !set.has(r.material)) set.set(r.material, r.textoMaterial || enrich.matTexto(r.material));
    return [...set.entries()];
  }, [result, enrich]);
  const shown = q.trim() ? materiales.filter(([mat, texto]) => matchesQuery(q, `${mat} ${texto}`)).slice(0, 10) : [];

  return (
    <div className="relative">
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material por código o descripción…" />
      {shown.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-bg-elevated shadow-lg">
          {shown.map(([mat, texto]) => (
            <button key={mat} type="button" className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-bg-inset" onClick={() => onPick(mat)}>
              <span className="font-mono text-xs text-accent">{mat}</span>
              <span className="truncate text-text-muted">{texto || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sección de aprendizaje del historial: rechazos de este destinatario
 * agrupados por motivo — sugiere ajustar la regla global cuando hay patrón,
 * pero nunca lo aplica solo (siempre lo confirma el usuario). */
function HistorialRechazos({ dest }: { dest: string }) {
  const ofertas = useConocimientoStore((s) => s.ofertas);
  const upsertRegla = useConocimientoStore((s) => s.upsertRegla);
  const reglas = useConocimientoStore((s) => s.reglas);
  const rechazadas = useMemo(() => ofertas.filter((o) => norm(o.dest) === norm(dest) && o.resultado === 'rechazada' && o.motivoRechazo), [ofertas, dest]);
  const porMotivo = useMemo(() => {
    const m = new Map<MotivoRechazo, number>();
    rechazadas.forEach((o) => { if (o.motivoRechazo) m.set(o.motivoRechazo, (m.get(o.motivoRechazo) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rechazadas]);
  const global = useMemo(() => reglas.find((r) => norm(r.dest) === norm(dest) && r.material == null), [reglas, dest]);

  if (porMotivo.length === 0) return null;
  const [topMotivo, topCount] = porMotivo[0];
  const sugerenciaCaducidad = topMotivo === 'caducidad' && topCount >= 3;

  return (
    <div className="mt-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-text-muted">Historial de rechazos</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {porMotivo.map(([motivo, count]) => (
          <span key={motivo} className="rounded-full bg-bg-inset px-2 py-0.5 text-[11px] text-text-muted">
            {MOTIVOS_RECHAZO.find((m) => m.key === motivo)?.label ?? motivo} ({count})
          </span>
        ))}
      </div>
      {sugerenciaCaducidad && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-accent-soft px-2.5 py-1.5 text-xs text-accent">
          <span>{topCount} rechazos por caducidad — ¿subir la caducidad mínima de la regla global?</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const actual = global?.caducidadMinimaMeses ?? 0;
              void upsertRegla({
                id: global?.id, dest, material: null,
                condiciones: global?.condiciones ?? [], estadoMaterial: global?.estadoMaterial ?? 'indistinto',
                caducidadMinimaMeses: Math.max(actual + 1, 3), activa: global?.activa ?? true, notas: global?.notas ?? '',
                actualizadoEn: new Date().toISOString(), actualizadoPor: global?.actualizadoPor ?? '',
              });
            }}
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}

/** Panel de edición de reglas de aceptación de un Destinatario — regla
 * global arriba, overrides por material abajo. Ver `matchingOfertas.ts` para
 * la precedencia usada al ofertar. */
export function ReglasAceptacionPanel({ panel }: { panel: Extract<Panel, { type: 'reglasAceptacion' }> }) {
  const { dest, razonSocial } = panel;
  const reglas = useConocimientoStore((s) => s.reglas);
  const removeRegla = useConocimientoStore((s) => s.removeRegla);
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [nuevoMaterial, setNuevoMaterial] = useState<string | null>(null);

  const propias = useMemo(() => reglas.filter((r) => norm(r.dest) === norm(dest)), [reglas, dest]);
  const global = propias.find((r) => r.material == null);
  const overrides = propias.filter((r) => r.material != null);

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{razonSocial || dest}</h2>
      <p className="mt-1 text-sm text-text-muted">Destinatario <Chip>{dest}</Chip></p>

      <h3 className="mb-2 mt-4 text-sm font-semibold text-text">Regla global</h3>
      <p className="mb-2 text-xs text-text-muted">Aplica a cualquier material sin una regla específica propia.</p>
      <ReglaForm dest={dest} material={null} existing={global} />
      <HistorialRechazos dest={dest} />

      <h3 className="mb-2 mt-5 text-sm font-semibold text-text">Reglas por material ({overrides.length})</h3>
      <div className="flex flex-col gap-2">
        {overrides.map((r) => (
          <div key={r.id ?? r.material} className="rounded-lg border border-border bg-bg-elevated">
            <div className="flex items-center justify-between px-3 pt-2">
              <span className="font-mono text-xs text-accent">{r.material}</span>
              <button type="button" onClick={() => r.id != null && removeRegla(r.id)} className="text-text-faint hover:text-red-500"><Trash2 className="size-3.5" /></button>
            </div>
            <div className="p-3 pt-1"><ReglaForm dest={dest} material={r.material} existing={r} /></div>
          </div>
        ))}
      </div>

      {addingMaterial ? (
        <div className="mt-2">
          {!nuevoMaterial ? (
            <MaterialPicker onPick={setNuevoMaterial} />
          ) : (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-xs text-accent">{nuevoMaterial}</span>
                <button type="button" className="text-xs text-text-faint hover:text-text" onClick={() => setNuevoMaterial(null)}>Cambiar</button>
              </div>
              <ReglaForm dest={dest} material={nuevoMaterial} onSaved={() => { setAddingMaterial(false); setNuevoMaterial(null); }} />
            </div>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setAddingMaterial(true)}>+ Agregar material</Button>
      )}
    </div>
  );
}
