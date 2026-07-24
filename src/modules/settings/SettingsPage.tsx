import { useEffect, useState } from 'react';
import { Save, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { reportRepository } from '@/repositories';
import { useDataStore } from '@/store/dataStore';
import { toast } from '@/store/toastStore';
import type { AppSettings } from '@/core/types';

export function SettingsPage() {
  const settings = useDataStore((s) => s.settings);
  const setSettings = useDataStore((s) => s.setSettings);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  async function handleSave() {
    // Lo que realmente hace efecto (computeKpis) lee de useDataStore en
    // memoria, no de Supabase — si guardar remoto falla (sin sesión activa,
    // red caída), el ajuste igual debe aplicar en esta sesión.
    const { shortExpiryDays, lowStockThreshold } = draft;
    if (shortExpiryDays <= 0 || shortExpiryDays > 365) {
      toast.warning('Días de caducidad corta: 1–365');
      return;
    }
    if (lowStockThreshold < 0 || lowStockThreshold > 10000) {
      toast.warning('Umbral stock bajo: 0–10000');
      return;
    }
    setSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    try {
      await reportRepository.saveSettings(draft);
      toast.success('Ajustes guardados');
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col gap-6 p-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Ajustes</h2>
        <p className="text-sm text-text-muted">Umbrales usados al calcular los KPIs del panel.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Umbrales de análisis</CardTitle>
          <CardDescription>Se guardan localmente y aplican al próximo cálculo de KPIs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-text-muted">Días para considerar "corta caducidad"</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={draft.shortExpiryDays}
              onChange={(e) => setDraft((d) => ({ ...d, shortExpiryDays: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-text-muted">Umbral de consumo mensual para "lento movimiento"</span>
            <Input
              type="number"
              min={0}
              max={10000}
              value={draft.lowStockThreshold}
              onChange={(e) => setDraft((d) => ({ ...d, lowStockThreshold: Number(e.target.value) || 0 }))}
            />
          </label>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave}>
              <Save className="size-4" /> Guardar
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="size-3.5" /> Guardado
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
