import { Moon, Sun, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useDataStore } from '@/store/dataStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';

const TITLES: Record<string, string> = {
  '/': 'Panel general',
  '/carga': 'Carga de archivos',
  '/procesamiento': 'Procesamiento',
  '/resultados': 'Resultados del análisis',
  '/historial': 'Historial de análisis',
  '/registros': 'Registros del sistema',
  '/ajustes': 'Ajustes',
};

export function Topbar({ path }: { path: string }) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const catalog = useDataStore((s) => s.catalog);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg-elevated/80 px-6 backdrop-blur">
      <div>
        <h1 className="font-display text-[15px] font-semibold text-text">{TITLES[path] ?? 'DEGASA'}</h1>
      </div>
      <div className="flex items-center gap-3">
        {catalog ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3" /> Catálogo sincronizado · {formatDateTime(catalog.loadedAt)}
          </Badge>
        ) : (
          <Badge variant="warning" className="gap-1">
            <AlertCircle className="size-3" /> Catálogo no cargado
          </Badge>
        )}
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
