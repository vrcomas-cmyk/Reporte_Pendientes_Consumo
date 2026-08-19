import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { matchesQuery } from '@/modules/analytics/helpers';
import { CondicionSelector } from './CondicionSelector';
import type { EstadoMaterialAceptado, ReglaAceptacion } from '@/core/types';

const ESTADOS: { key: EstadoMaterialAceptado; label: string }[] = [
  { key: 'indistinto', label: 'Indistinto' },
  { key: 'buen-estado', label: 'Solo buen estado' },
  { key: 'danado', label: 'Acepta dañado' },
];

interface FormState {
  condiciones: string[];
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

/** Formulario de una excepción de aceptación por material (override). La
 * regla global del cliente vive en su ficha — esto solo la sobrescribe para
 * `material`. Ver `core/matchingOfertas.ts` para la precedencia. */
export function ReglaMaterialForm({ dest, material, existing, onSaved }: { dest: string; material: string; existing?: ReglaAceptacion; onSaved?: () => void }) {
  const upsertRegla = useConocimientoStore((s) => s.upsertRegla);
  const [form, setForm] = useState<FormState>(() => formFromRegla(existing));

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
      <CondicionSelector value={form.condiciones} onChange={(v) => setForm((f) => ({ ...f, condiciones: v }))} />
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
      <Input value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} placeholder="Notas (opcional) — p. ej. 'solo si la oferta es atractiva'" className="mt-2" />
      <div className="mt-2 flex justify-end"><Button size="sm" onClick={save}>Guardar</Button></div>
    </div>
  );
}

/** Buscador de material por código o descripción, desde el índice de consumo
 * ya cargado — sin duplicar catálogo. */
export function MaterialPicker({ onPick }: { onPick: (material: string) => void }) {
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