import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Download, RefreshCcw, ServerCog } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { checkApiHealth } from '@/services/reportApiHealth';

// Default command for running the Python API locally. The legacy Windows
// path ("C:\Users\Admin\...") is intentionally NOT baked into the bundle so
// the card doesn't advertise someone's specific home folder — env override
// available for shops that want to ship a tailored command.
const COMANDO = import.meta.env.VITE_SUGERIDOR_LAUNCH_CMD
  ?? [
      '# Requiere Python 3.11+ y `pip install -r requirements.txt` una sola vez.',
      '# Después, cada vez que lo necesites:',
      'cd Sugerencias_SQL',
      'uvicorn api:app --port 8000',
    ].join('\n');

// URL fija al último Release de GitHub — puede sobreescribirse con env.
// Está separada del repo del front para no acoplar este card a una ruta
// que puede moverse; los releases pueden ser propios o un fork.
const EXE_URL = import.meta.env.VITE_SUGERIDOR_EXE_URL
  ?? 'https://github.com/vrcomas-cmyk/Sugerencias_SQL/releases/latest/download/SugeridorAPI.exe';
const ENV_EXAMPLE_URL = import.meta.env.VITE_SUGERIDOR_ENV_URL
  ?? 'https://raw.githubusercontent.com/vrcomas-cmyk/Sugerencias_SQL/main/.env.example';

/** Un navegador no puede arrancar procesos en la máquina del usuario (es una
 * restricción de seguridad de todos los navegadores, no algo que se pueda
 * evitar desde código) — así que en vez de un botón que "prenda" la API, hay
 * dos caminos reales: descargar un .exe portable (sin Python, sin carpeta,
 * sin instalar nada, doble clic cada vez) o copiar el comando para quien
 * prefiera correrlo desde código. Un semáforo confirma si ya está corriendo. */
export function ApiLauncherCard() {
  const [status, setStatus] = useState<'checking' | 'up' | 'down'>('checking');
  const [copied, setCopied] = useState(false);

  const check = useCallback(async () => {
    setStatus('checking');
    setStatus((await checkApiHealth()) ? 'up' : 'down');
  }, []);

  useEffect(() => { check(); }, [check]);

  const handleCopiar = useCallback(async () => {
    await navigator.clipboard.writeText(COMANDO);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  if (status === 'up') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
        <span className="size-2 rounded-full bg-success" /> API de generación de reportes conectada.
        <button onClick={check} className="ml-auto text-text-faint hover:text-text"><RefreshCcw className="size-3.5" /></button>
      </div>
    );
  }

  return (
    <Card className="border-warning/30">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ServerCog className="size-4 text-warning" />
          <div>
            <CardTitle className="text-sm">API de reportes no conectada</CardTitle>
            <CardDescription>Levántala (en tu máquina o en la de quien vaya a generar el reporte) y reintenta.</CardDescription>
          </div>
        </div>
        <button onClick={check} className="text-text-faint hover:text-text" title="Reintentar">
          <RefreshCcw className={`size-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
        </button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-text">Opción 1 · descargar el ejecutable (sin instalar nada)</p>
          <div className="flex flex-wrap gap-2">
            <a href={EXE_URL} className="flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-xs text-text hover:bg-bg-inset">
              <Download className="size-3.5" /> SugeridorAPI.exe
            </a>
            <a href={ENV_EXAMPLE_URL} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-inset">
              <Download className="size-3.5" /> .env.example
            </a>
          </div>
          <p className="mt-1.5 text-[11px] text-text-faint">
            Deja los dos archivos en la misma carpeta, renombra <code>.env.example</code> a <code>.env</code> y pon tus
            credenciales reales (una sola vez). Doble clic en <code>SugeridorAPI.exe</code> cada vez que lo necesites —
            no requiere Python ni permisos de administrador. Windows puede avisar que es de un editor desconocido
            (el .exe no está firmado) — dale "Más información" → "Ejecutar de todas formas".
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-text">Opción 2 · correrlo desde código</p>
          <div className="flex items-start gap-2 rounded-md border border-border bg-bg-inset p-3">
            <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-text">{COMANDO}</pre>
            <button
              onClick={handleCopiar}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:bg-bg-elevated"
            >
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-text-faint">
            Requiere Python y las dependencias instaladas una vez (<code>pip install -r requirements.txt</code>) y el archivo
            <code> .env</code> con las credenciales — ver <code>README.md</code> del proyecto.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
