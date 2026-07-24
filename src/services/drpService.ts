import { toDrpRow } from '@/lib/drpColumns';
import type { SolicitudDRP } from '@/core/types';

/** Apps Script Web App endpoint that appends a row to the "DRP" tab of the
 * shared Google Sheet. Separate from VITE_APPSCRIPT_URL (the read-only
 * catalog sync endpoint) since this one writes — falls back to it only if
 * the dedicated URL isn't set, in case both are served by the same
 * deployment. Configure in .env.local (see .env.example). */
const DRP_WEBHOOK_URL = (import.meta.env.VITE_DRP_WEBHOOK_URL || import.meta.env.VITE_APPSCRIPT_URL) as string | undefined;
const DRP_TOKEN = import.meta.env.VITE_DRP_TOKEN as string | undefined;
const DRP_SHEET_ID = import.meta.env.VITE_DRP_SHEET_ID as string | undefined;
const DRP_TAB = 'DRP';

/**
 * Sends one request row to the "DRP" tab via the Apps Script `doPost`
 * webhook (see docs/apps-script-drp.md for the script to deploy). Uses
 * `text/plain` as the content type so the browser sends it as a "simple
 * request" and skips the CORS preflight — Apps Script Web Apps can't answer
 * OPTIONS requests.
 */
export async function enviarSolicitudDRP(sol: SolicitudDRP): Promise<void> {
  if (!DRP_WEBHOOK_URL) {
    throw new Error('Falta configurar VITE_DRP_WEBHOOK_URL (o VITE_APPSCRIPT_URL) en .env.local.');
  }
  if (!DRP_SHEET_ID) {
    throw new Error('Falta configurar VITE_DRP_SHEET_ID en .env.local.');
  }
  const res = await fetch(DRP_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      token: DRP_TOKEN,
      sheetId: DRP_SHEET_ID,
      tab: DRP_TAB,
      row: toDrpRow(sol),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al enviar la solicitud al Sheet DRP.`);
  const data = await res.json().catch(() => null);
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
}
