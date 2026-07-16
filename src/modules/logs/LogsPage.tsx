import { useEffect, useState } from 'react';
import { ScrollText, Info, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { reportRepository } from '@/repositories';
import type { LogEntry } from '@/core/types';
import { formatDateTime } from '@/lib/utils';

const ICONS = { info: Info, warn: AlertTriangle, error: XCircle } as const;
const VARIANTS = { info: 'default', warn: 'warning', error: 'danger' } as const;

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportRepository
      .listLogs()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 p-8">
      <div>
        <h2 className="font-display text-2xl font-semibold">Registros del sistema</h2>
        <p className="text-sm text-text-muted">Carga de catálogo, inicio/fin de análisis y errores.</p>
      </div>
      <Card className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          {!loading && logs.length === 0 ? (
            <CardContent className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-faint">
              <ScrollText className="size-6" />
              <p className="text-sm">Sin eventos registrados todavía.</p>
            </CardContent>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {logs.map((l) => {
                const Icon = ICONS[l.level];
                return (
                  <div key={l.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <Icon className="mt-0.5 size-4 shrink-0 text-text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.event}</span>
                        <Badge variant={VARIANTS[l.level]}>{l.level}</Badge>
                      </div>
                      {l.detail && <p className="mt-0.5 truncate text-xs text-text-faint">{l.detail}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-xs text-text-faint">{formatDateTime(l.at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
