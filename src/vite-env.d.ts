/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPSCRIPT_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** API que reemplaza Streamlit (Sugerencias_SQL/api.py) — ver reportGeneratorService.ts */
  readonly VITE_REPORT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
