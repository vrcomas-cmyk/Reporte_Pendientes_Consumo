/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPSCRIPT_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** API que reemplaza Streamlit (Sugerencias_SQL/api.py) — ver reportGeneratorService.ts */
  readonly VITE_REPORT_API_URL?: string;
  /** Apps Script `doPost` webhook (write side) + shared token — ver drpService.ts */
  readonly VITE_DRP_WEBHOOK_URL?: string;
  readonly VITE_DRP_TOKEN?: string;
  /** Google Sheet id the DRP webhook writes into — ver drpService.ts. Kept env so
   *  rotating the target sheet doesn't require a redeploy. */
  readonly VITE_DRP_SHEET_ID?: string;
  /** Skip Google login (AuthGate). Defaults to true while the post-login Vercel
   *  regression is being diagnosed; set to "false" in production. */
  readonly VITE_AUTH_DISABLED?: string;
  /** hard-coded GitHub release URL for the SugeridorAPI .exe launcher card.
   *  Optional — defaults to the maintainers' published release. */
  readonly VITE_SUGERIDOR_EXE_URL?: string;
  readonly VITE_SUGERIDOR_ENV_URL?: string;
  /** Custom shell command shown in the launcher card. Defaults to a
   *  portable `cd Sugerencias_SQL && uvicorn ...` snippet. */
  readonly VITE_SUGERIDOR_LAUNCH_CMD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
