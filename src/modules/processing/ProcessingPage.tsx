import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, FileWarning } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/store/dataStore';
import { useUiStore } from '@/store/uiStore';
import { runAnalysis } from '@/services/reportService';
import type { ProcessingProgress } from '@/core/types';
import { formatDuration } from '@/lib/utils';

const PHASE_LABEL: Record<string, string> = {
  idle: 'En espera',
  parsing: 'Leyendo archivo',
  detecting: 'Detectando hojas',
  crossing: 'Cruzando contra catálogo',
  kpis: 'Calculando KPIs',
  done: 'Completado',
  error: 'Error',
  cancelled: 'Cancelado',
};

const PHASES = ['parsing', 'detecting', 'crossing', 'kpis', 'done'];

export function ProcessingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { file?: File; selectedRoles?: import('@/core/types').SheetRole[] } | null;
  const file = navState?.file ?? null;
  const selectedRoles = navState?.selectedRoles;

  const catalog = useDataStore((s) => s.catalog);
  const settings = useDataStore((s) => s.settings);
  const setActiveAnalysis = useDataStore((s) => s.setActiveAnalysis);

  const [progress, setProgress] = useState<ProcessingProgress>({ phase: 'idle', percent: 0, message: '' });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!file) return;
    startRef.current = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startRef.current), 200);

    const { promise, cancel } = runAnalysis(file, catalog, settings, setProgress, selectedRoles);
    cancelRef.current = cancel;

    promise
      .then((result) => {
        setActiveAnalysis(result);
        clearInterval(timer);
        // Return the user to the view they were on before starting a reprocess,
        // instead of always bouncing to the Dashboard. Read directly from the
        // store (not the reactive hook) since this only needs the latest value
        // at this one instant, not a subscription.
        const lvp = useUiStore.getState().lastViewPath;
        const dest = lvp && lvp !== '/procesamiento' && lvp !== '/carga' ? lvp : '/';
        setTimeout(() => navigate(dest), 600);
      })
      .catch((e: Error) => {
        clearInterval(timer);
        if (e.message === 'cancelled') {
          setProgress({ phase: 'cancelled', percent: 0, message: 'Procesamiento cancelado.' });
        } else {
          setError(e.message);
          setProgress((p) => ({ ...p, phase: 'error' }));
        }
      });

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <FileWarning className="size-8 text-text-faint" />
        <p className="text-sm text-text-muted">No hay ningún archivo en proceso.</p>
        <Button onClick={() => navigate('/carga')}>Ir a Carga</Button>
      </div>
    );
  }

  const phaseIndex = PHASES.indexOf(progress.phase);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <Card>
        <CardHeader>
          <CardTitle>Procesando reporte</CardTitle>
          <CardDescription>{file.name}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
              <span>{progress.message || PHASE_LABEL[progress.phase]}</span>
              <span className="font-mono">{progress.percent}%</span>
            </div>
            <Progress value={progress.percent} />
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex gap-1.5">
              {PHASES.map((p, i) => (
                <span
                  key={p}
                  className={`h-1.5 w-8 rounded-full transition-colors ${
                    i <= phaseIndex && progress.phase !== 'error' ? 'bg-accent' : 'bg-bg-inset'
                  }`}
                />
              ))}
            </div>
            <span className="font-mono text-text-faint">{formatDuration(elapsedMs)}</span>
          </div>

          {progress.phase === 'error' && (
            <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              <XCircle className="size-4 shrink-0" /> {error}
            </div>
          )}
          {progress.phase === 'done' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
            >
              <CheckCircle2 className="size-4 shrink-0" /> Análisis completado, redirigiendo al panel…
            </motion.div>
          )}
          {progress.phase !== 'done' && progress.phase !== 'error' && progress.phase !== 'cancelled' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-text-faint">
                <Loader2 className="size-3.5 animate-spin" /> Trabajando en segundo plano…
              </div>
              <Button variant="outline" size="sm" onClick={() => cancelRef.current?.()}>
                Cancelar
              </Button>
            </div>
          )}
          {(progress.phase === 'error' || progress.phase === 'cancelled') && (
            <Button variant="outline" onClick={() => navigate('/carga')}>
              Volver a Carga
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
