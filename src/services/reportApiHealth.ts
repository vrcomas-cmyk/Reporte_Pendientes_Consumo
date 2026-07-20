import { requireApiUrl } from './reportGeneratorService';

/** /health no requiere auth — solo confirma que el proceso está arriba. */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const base = requireApiUrl();
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
